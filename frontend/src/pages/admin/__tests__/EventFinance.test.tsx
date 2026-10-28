/**
 * EventFinance ページのテスト
 *
 * 1. `computeFinances` 関数の計算ロジックを直接テストする
 *    - 輸送費・WS売上・WS資材費・収支・支払い金額の計算を確認する
 * 2. EventFinance ページのレンダリングテスト
 *    - API モックを使って収支情報が画面に表示されることを確認する
 * 3. 保存時の管理情報との同期
 *    - 保存の直前に管理情報を読み直し、その最新の内容（出店要項など）を引き継いで出店料・宿泊費だけ上書きする
 *      （画面を開いた後に管理情報ページで保存された搬入などを古い内容で消さない）
 *    - 保存時の管理情報の読み直しに失敗したときはエラーを出して画面に留まる
 *    - 読み込み（イベント・収支・予約・管理情報のどれか）に失敗したときは保存ボタンを押せず、
 *      saveFinances / saveAdminInfo のどちらも呼ばない（初期値で既存データを上書きして消さない）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import EventFinance from '../EventFinance'
import { api } from '../../../lib/api'
// 収支の計算は lib/finance.ts に移ったので、移動先から直接読み込む
import { computeFinances } from '../../../lib/finance'
import type { Event, EventFinances, EventAdminInfo } from '../../../lib/api'

// api モジュールの関数をモックしつつ、computeFinances などの実装は保持する
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual, // computeFinances・fiscalYear などの実装を保持する
    api: {
      events: {
        get: vi.fn(),
        getFinances: vi.fn(),
        getAdminInfo: vi.fn(),
        saveAdminInfo: vi.fn(),
        // 収支の保存（保存時の管理情報との同期テストで使う）
        saveFinances: vi.fn(),
      },
      reserve: {
        list: vi.fn(),
      },
    },
  }
})

// ---- computeFinances 計算ロジックのテスト ----

/**
 * テスト用のデフォルト EventFinances データ
 * すべてゼロ・未設定の状態
 */
const BASE_FINANCES: EventFinances = {
  event_id: 'ev-test',
  sales: 0,
  booth_fee: 0,
  distance: 0,
  gas_price: 160,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

describe('computeFinances 収支計算', () => {
  it('全ゼロのとき全て 0 になる', () => {
    // 入力がすべてゼロのとき全フィールドが 0 になることを確認する
    const result = computeFinances(BASE_FINANCES, false)
    expect(result.transport).toBe(0)
    expect(result.totalExpense).toBe(0)
    expect(result.wsSales).toBe(0)
    expect(result.wsCost).toBe(0)
    expect(result.net).toBe(0)
    expect(result.paymentAmount).toBe(0)
  })

  it('輸送費: 距離 × 2 ÷ 10 × ガス代で計算される', () => {
    // 距離 50km、ガス代 160円/L → transport = 50×2÷10×160 = 1600 円
    const result = computeFinances(
      { ...BASE_FINANCES, distance: 50, gas_price: 160 },
      false
    )
    expect(result.transport).toBe(1600)
  })

  it('支出合計: booth_fee + transport + expressway_toll + accommodation + other_expenses', () => {
    // 各支出フィールドが totalExpense に加算されることを確認する
    const result = computeFinances(
      {
        ...BASE_FINANCES,
        booth_fee: 10000,
        distance: 50,   // transport = 1600
        gas_price: 160,
        expressway_toll: 3000,
        accommodation: 5000,
        other_expenses: 2000,
      },
      false
    )
    // totalExpense = 10000 + 1600 + 3000 + 5000 + 2000 = 21600
    expect(result.transport).toBe(1600)
    expect(result.totalExpense).toBe(21600)
  })

  it('ワークショップなしのとき wsSales と wsCost は 0', () => {
    // hasWorkshop=false のとき WS 関連は計算されない
    const result = computeFinances(
      { ...BASE_FINANCES, ws_participants: 10 },
      false  // hasWorkshop = false
    )
    expect(result.wsSales).toBe(0)
    expect(result.wsCost).toBe(0)
  })

  it('ワークショップあり: ws_participants × 1000 が wsSales になる', () => {
    // 5人参加 → wsSales = 5000 円
    const result = computeFinances(
      { ...BASE_FINANCES, ws_participants: 5 },
      true  // hasWorkshop = true
    )
    expect(result.wsSales).toBe(5000)
  })

  it('ワークショップあり: ws_participants × 700 が wsCost（資材費）になる', () => {
    // 5人参加 → wsCost = 3500 円
    const result = computeFinances(
      { ...BASE_FINANCES, ws_participants: 5 },
      true
    )
    expect(result.wsCost).toBe(3500)
  })

  it('収支（net）= 売上 - 支出合計 - WS資材費', () => {
    // 売上 100000, 出店料 10000, WS5人(資材費3500) → net = 100000 - 10000 - 3500 = 86500
    const result = computeFinances(
      {
        ...BASE_FINANCES,
        sales: 100000,
        booth_fee: 10000,
        ws_participants: 5,
      },
      true
    )
    expect(result.net).toBe(86500)
  })

  it('赤字の場合は net がマイナスになる', () => {
    // 売上 5000 円、出店料 20000 円 → net = -15000
    const result = computeFinances(
      { ...BASE_FINANCES, sales: 5000, booth_fee: 20000 },
      false
    )
    expect(result.net).toBe(-15000)
  })

  it('payment_flag=false のとき paymentAmount・salesShare・wsShare はすべて 0', () => {
    // 支払フラグ OFF では手伝い支払い金額は計算されない
    const result = computeFinances(
      { ...BASE_FINANCES, sales: 100000, booth_fee: 10000, payment_flag: false },
      false
    )
    expect(result.paymentAmount).toBe(0)
    expect(result.salesShare).toBe(0)
    expect(result.wsShare).toBe(0)
  })

  it('payment_flag=true: salesShare = (売上 - WS売上 - 支出) × 20%', () => {
    // 売上100000, WS売上5000(5人), 出店料10000
    // salesShare = (100000 - 5000 - 10000) × 0.2 = 17000
    const result = computeFinances(
      {
        ...BASE_FINANCES,
        sales: 100000,
        booth_fee: 10000,
        ws_participants: 5,
        payment_flag: true,
      },
      true
    )
    expect(result.salesShare).toBe(17000)
  })

  it('payment_flag=true: wsShare = WS売上 × 70%', () => {
    // WS売上 5000 → wsShare = 3500
    const result = computeFinances(
      { ...BASE_FINANCES, ws_participants: 5, payment_flag: true },
      true
    )
    expect(result.wsShare).toBe(3500)
  })

  it('payment_flag=true: 赤字のとき salesShare がマイナスになる', () => {
    // 売上 10000, 支出 20000 → (10000 - 20000) × 0.2 = -2000
    const result = computeFinances(
      { ...BASE_FINANCES, sales: 10000, booth_fee: 20000, payment_flag: true },
      false
    )
    expect(result.salesShare).toBe(-2000)
  })
})

// ---- EventFinance ページのレンダリングテスト ----

/**
 * テスト用のイベントデータ
 */
const MOCK_EVENT: Event = {
  id: 'ev-finance-1',
  slug: 'finance-event',
  name: '収支テストイベント',
  start_date: '2099-11-01',
  end_date: null,
  time: '10:00〜17:00',
  location: 'テスト会場',
  booth_number: null,
  address: null,
  official_url: null,
  brands: [],
  has_workshop: false,
  ws_requires_reservation: false,
  is_past: false,
  display_order: 1,
  images: [],
  page_content: null,
  daily_times: null,
}

/**
 * テスト用の EventFinances データ
 */
const MOCK_FINANCES: EventFinances = {
  id: 'fin-1',
  event_id: 'ev-finance-1',
  sales: 50000,
  booth_fee: 10000,
  distance: 100,
  gas_price: 160,
  expressway_toll: 2000,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

/**
 * EventFinance ページを Routes/MemoryRouter でラップしてレンダリングするヘルパー
 * @param eventId - URL パラメータとして渡すイベントID
 * @returns 処理結果。
 */
function renderFinancePage(eventId: string = 'ev-finance-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/events/${eventId}/finance`]}>
      <Routes>
        <Route path="/admin/events/:id/finance" element={<EventFinance />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('EventFinance ページ', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセットしてデフォルトの解決値を設定する
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.reserve.list).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.reserve.list).mockResolvedValue([])
    // 管理情報は未入力の空オブジェクトを返す
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({} as unknown as EventAdminInfo)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
  })

  it('データ読み込み後に「収支管理」見出しが表示される', async () => {
    // ローディング完了後に "収支管理" が表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByText('収支管理')).toBeDefined()
    })
  })

  it('イベント名と開催日が表示される', async () => {
    // イベントのメタ情報（名前・日付）が表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByText(/収支テストイベント/)).toBeDefined()
    })
  })

  it('収入セクションが表示される（「収入」ラベル）', async () => {
    // 収入セクションのラベルが表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByText('収入')).toBeDefined()
    })
  })

  it('支出セクションが表示される（「支出」ラベル）', async () => {
    // 支出セクションのラベルが表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByText('支出')).toBeDefined()
    })
  })

  it('保存ボタンが表示される', async () => {
    // 収支データを保存するボタンが表示されることを確認する
    renderFinancePage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).toBeDefined()
    })
  })

  it('ローディング中は「読み込み中...」が表示される', () => {
    // データ取得が完了する前はローディングメッセージが表示される
    vi.mocked(api.events.get).mockReturnValue(new Promise(() => {})) // 永遠に保留
    renderFinancePage()
    expect(screen.getByText('読み込み中...')).toBeDefined()
  })
})

// ---- 保存時の管理情報との同期 ----

/** 出店要項などを含む既存の管理情報 */
const EXISTING_ADMIN_INFO: EventAdminInfo = {
  carry_in_time: '2099-11-01T08:30',
  carry_out_time: '2099-11-01T18:00',
  hotel_name: 'テストホテル',
  hotel_fee: 7000,
  booth_fee: 9000,
  booth_fee_pay_method: '事前振込',
  booth_fee_due: '2099-10-01',
  booth_fee_paid: true,
  notes: '既存メモ',
  guidelines_text: '出店要項の本文',
  guidelines_image_urls: ['https://ex.com/gl-1.png', 'https://ex.com/gl-2.png'],
}

/**
 * 収支ページと、保存後の遷移先（イベント一覧）を用意してレンダリングする
 * @returns 処理結果。
 */
function renderFinancePageWithBack() {
  return render(
    <MemoryRouter initialEntries={['/admin/events/ev-finance-1/finance']}>
      <Routes>
        <Route path="/admin/events/:id/finance" element={<EventFinance />} />
        <Route path="/admin/events" element={<p>イベント一覧ページ</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('EventFinance ページ — 保存時の管理情報との同期', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.reserve.list).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()
    vi.mocked(api.events.saveFinances).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.reserve.list).mockResolvedValue([])
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
    vi.mocked(api.events.saveFinances).mockResolvedValue(MOCK_FINANCES)
  })

  it('管理情報を読み込めたときは、出店要項などの既存値を引き継ぎ出店料・宿泊費だけ収支の値で上書きして saveAdminInfo に渡す', async () => {
    // 読み込み時と保存時の読み直しで同じ管理情報が返る場合（getAdminInfo は毎回 EXISTING_ADMIN_INFO を返す）
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EXISTING_ADMIN_INFO)
    renderFinancePageWithBack()
    await userEvent.click(await screen.findByRole('button', { name: '保存' }))

    // 1. 収支 → 管理情報の順に保存され、保存後はイベント一覧へ戻る
    await waitFor(() => expect(api.events.saveAdminInfo).toHaveBeenCalledTimes(1))
    expect(api.events.saveFinances).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('イベント一覧ページ')).toBeInTheDocument()

    // 2. 出店料は収支の 10000、宿泊費は収支が 0 なので管理情報の 7000 が初期値として入り、そのまま送られる
    const [savedId, body] = vi.mocked(api.events.saveAdminInfo).mock.calls[0]
    expect(savedId).toBe('ev-finance-1')
    expect(body).toEqual({ ...EXISTING_ADMIN_INFO, booth_fee: 10000, hotel_fee: 7000 })
    // 出店要項が消えずに引き継がれる
    expect(body.guidelines_text).toBe('出店要項の本文')
    expect(body.guidelines_image_urls).toEqual(['https://ex.com/gl-1.png', 'https://ex.com/gl-2.png'])
  })

  it.each([
    ['管理情報（getAdminInfo）', () => vi.mocked(api.events.getAdminInfo).mockRejectedValue(new Error('500'))],
    ['収支（getFinances）', () => vi.mocked(api.events.getFinances).mockRejectedValue(new Error('500'))],
    ['イベント（get）', () => vi.mocked(api.events.get).mockRejectedValue(new Error('404'))],
    ['予約一覧（reserve.list）', () => vi.mocked(api.reserve.list).mockRejectedValue(new Error('401'))],
  ])('%s の読み込みに失敗すると保存ボタンが押せず、フォームを送信しても saveFinances・saveAdminInfo は呼ばれない', async (_label, makeFail) => {
    // 1. 既定は管理情報あり。指定した API だけ失敗させる
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EXISTING_ADMIN_INFO)
    makeFail()
    renderFinancePageWithBack()

    // 2. 読み込みエラーが出て、保存ボタンは disabled
    expect(await screen.findByText('データの読み込みに失敗しました。ページを再読み込みしてください。')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: '保存' })
    expect(button).toBeDisabled()

    // 3. ボタンを押しても、フォームを直接 submit しても何も保存されず、画面に留まる
    await userEvent.click(button)
    fireEvent.submit(button.closest('form')!)
    await new Promise((r) => setTimeout(r, 50))
    expect(api.events.saveFinances).not.toHaveBeenCalled()
    expect(api.events.saveAdminInfo).not.toHaveBeenCalled()
    expect(screen.queryByText('イベント一覧ページ')).not.toBeInTheDocument()
  })

  it('読み込みに成功したときは保存ボタンが押せ、フォーム送信で saveFinances と saveAdminInfo が呼ばれる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EXISTING_ADMIN_INFO)
    renderFinancePageWithBack()
    const button = await screen.findByRole('button', { name: '保存' })
    expect(button).toBeEnabled()
    expect(screen.queryByText('データの読み込みに失敗しました。ページを再読み込みしてください。')).not.toBeInTheDocument()

    fireEvent.submit(button.closest('form')!)
    await waitFor(() => expect(api.events.saveAdminInfo).toHaveBeenCalledTimes(1))
    expect(api.events.saveFinances).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('イベント一覧ページ')).toBeInTheDocument()
  })

  it('管理情報が空（{}）でも読み込めていれば saveAdminInfo は呼ばれる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({} as EventAdminInfo)
    renderFinancePageWithBack()
    await userEvent.click(await screen.findByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.events.saveAdminInfo).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.events.saveAdminInfo).mock.calls[0][1]).toEqual({ booth_fee: 10000, hotel_fee: 0 })
  })

  it('saveAdminInfo が失敗すると保存エラーが出て画面に留まる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EXISTING_ADMIN_INFO)
    vi.mocked(api.events.saveAdminInfo).mockRejectedValue(new Error('500'))
    renderFinancePageWithBack()
    await userEvent.click(await screen.findByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeInTheDocument()
    expect(screen.queryByText('イベント一覧ページ')).not.toBeInTheDocument()
  })

  it('画面を開いた後に管理情報が更新されていたときは、保存時に読み直した最新の管理情報を引き継ぎ、出店料・宿泊費だけ収支の値になる', async () => {
    // 1. 画面を開いたとき（1回目）は搬入・出店要項が未入力。宿泊料金 7000 だけ入っている
    const OLD_INFO: EventAdminInfo = { hotel_fee: 7000 } as EventAdminInfo
    // 2. 保存時の読み直し（2回目）では、別の画面で保存された搬入・出店要項が入っている（宿泊料金は 3000 に変わっている）
    const LATEST_INFO: EventAdminInfo = {
      ...EXISTING_ADMIN_INFO,
      carry_in_time: '2099-11-01T07:45',
      guidelines_text: '後から保存した出店要項',
      hotel_fee: 3000,
      booth_fee: 4000,
    }
    vi.mocked(api.events.getAdminInfo)
      .mockResolvedValueOnce(OLD_INFO)
      .mockResolvedValueOnce(LATEST_INFO)
    renderFinancePageWithBack()
    await userEvent.click(await screen.findByRole('button', { name: '保存' }))

    // 3. 保存が終わって一覧へ戻る
    await waitFor(() => expect(api.events.saveAdminInfo).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('イベント一覧ページ')).toBeInTheDocument()

    // 4. getAdminInfo は読み込み時と保存時の2回呼ばれ、保存時の読み直しは収支の保存の後
    expect(api.events.getAdminInfo).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.events.getAdminInfo).mock.calls[1][0]).toBe('ev-finance-1')
    expect(vi.mocked(api.events.saveFinances).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.events.getAdminInfo).mock.invocationCallOrder[1])

    // 5. saveAdminInfo には最新の内容がそのまま使われ、出店料は収支の 10000・宿泊費は画面の値（読み込み時の 7000）になる
    const body = vi.mocked(api.events.saveAdminInfo).mock.calls[0][1]
    expect(body).toEqual({ ...LATEST_INFO, booth_fee: 10000, hotel_fee: 7000 })
    expect(body.carry_in_time).toBe('2099-11-01T07:45')
    expect(body.guidelines_text).toBe('後から保存した出店要項')
  })

  it('保存時の管理情報の読み直し（getAdminInfo）に失敗すると「保存に失敗しました」が出て画面に留まり、saveAdminInfo は呼ばれない', async () => {
    // 1. 読み込み時は成功し、保存時の読み直しだけ失敗させる
    vi.mocked(api.events.getAdminInfo)
      .mockResolvedValueOnce(EXISTING_ADMIN_INFO)
      .mockRejectedValueOnce(new Error('500'))
    renderFinancePageWithBack()
    await userEvent.click(await screen.findByRole('button', { name: '保存' }))

    // 2. エラーが出て一覧へは戻らない
    expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeInTheDocument()
    expect(screen.queryByText('イベント一覧ページ')).not.toBeInTheDocument()
    // 3. 収支は保存済み、管理情報は古い内容で上書きしない（保存しない）
    expect(api.events.saveFinances).toHaveBeenCalledTimes(1)
    expect(api.events.saveAdminInfo).not.toHaveBeenCalled()
    // 4. 保存ボタンはもう一度押せる
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })
})

// ---- 書きかけ保護: 読み込みが null の項目（null と '' を同じに扱う） ----
describe('EventFinance ページ — null の項目を入力して消しても書きかけにならない', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset().mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getFinances).mockReset().mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.reserve.list).mockReset().mockResolvedValue([])
    vi.mocked(api.events.getAdminInfo).mockReset().mockResolvedValue({} as unknown as EventAdminInfo)
  })

  it('その他支出の内容・メモ（読み込みは null）を入力して消すと、「← イベント管理」で確認なしに移れる', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderFinancePageWithBack()
    const note = await screen.findByPlaceholderText('内容（任意）')
    const memo = screen.getByPlaceholderText('備考・メモ（任意）')
    // 1. 入力して消す
    fireEvent.change(note, { target: { value: '駐車場代' } })
    fireEvent.change(note, { target: { value: '' } })
    fireEvent.change(memo, { target: { value: 'メモ' } })
    fireEvent.change(memo, { target: { value: '' } })
    // 2. 戻るリンクで確認が出ずに移る
    fireEvent.click(screen.getByRole('link', { name: /イベント管理/ }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByText('イベント一覧ページ')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('入力を残したまま「← イベント管理」を押すと確認が出て、キャンセルなら留まる', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderFinancePageWithBack()
    fireEvent.change(await screen.findByPlaceholderText('内容（任意）'), { target: { value: '駐車場代' } })
    fireEvent.click(screen.getByRole('link', { name: /イベント管理/ }))
    expect(confirmSpy).toHaveBeenCalledWith('保存していない変更があります。破棄して移動しますか？')
    expect(screen.queryByText('イベント一覧ページ')).toBeNull()
    confirmSpy.mockRestore()
  })
})
