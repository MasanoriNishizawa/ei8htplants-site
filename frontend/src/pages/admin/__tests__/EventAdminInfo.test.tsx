/**
 * EventAdminInfo ページのテスト
 *
 * 1. 搬入・搬出セクションのラベルが表示されること
 * 2. 時の選択肢（HOUR_OPTIONS）に「06」が含まれること
 * 3. 分の選択肢（MINUTE_OPTIONS）に「05」が含まれること
 * 4. ローディング中の表示
 * 5. 保存ボタンが表示されること
 * 6. 出店要項セクション（文章・画像のアップロード／削除／拡大表示・保存時の送信内容）
 * 7. 読み込みに失敗したときは保存ボタンが押せず、送信しても保存されない
 * 8. 保存時の収支との同期（保存の直前に収支を読み直し、最新の内容に出店料・宿泊費だけ反映する）
 * 9. 確認画面との行き来（保存成功で確認画面へ state { from, saved } を渡して移る・「← 戻る」は確認画面へ・未保存なら confirm）
 * 10. 保存後の遷移と「← 戻る」は replace（履歴の編集画面が確認画面に置き換わり、ブラウザの戻るで一覧へ戻る）
 * 11. 未保存の判定（全項目が対象。「未保存の変更があります」・戻るときの confirm・beforeunload）
 *
 * 編集画面の URL は /admin/events/:id/admin-info/edit。確認画面（/admin-info）はスタブに置き換えて遷移と state を確かめる
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import EventAdminInfoPage from '../EventAdminInfo'
import { api } from '../../../lib/api'
import type { Event, EventFinances, EventAdminInfo } from '../../../lib/api'

// このファイルのテストは時・分の select（選択肢が多い）や画像の操作を含み、単独でも 1〜3 秒かかるものがある。
// 全テストをまとめて実行したときやマシンが混んでいるときに既定の 5 秒で打ち切られないよう、1 テストあたり 20 秒まで待つ
vi.setConfig({ testTimeout: 20000 })

// api モジュールのモック。実装は保持せず api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: {
        get: vi.fn(),
        getAdminInfo: vi.fn(),
        getFinances: vi.fn(),
        saveAdminInfo: vi.fn(),
        saveFinances: vi.fn(),
      },
      // 出店要項画像のアップロード（画像 URL を返す）
      upload: vi.fn(),
    },
  }
})

// ---- テスト用モックデータ ----

/**
 * テスト用のイベントデータ
 */
const MOCK_EVENT: Event = {
  id: 'event-admin-info-1',
  slug: 'admin-info-test',
  name: '管理情報入力テストイベント',
  start_date: '2099-07-15',
  end_date: null,
  time: '10:00〜17:00',
  location: 'テスト展示会場',
  booth_number: 'B-3',
  address: null,
  official_url: null,
  brands: ['ei8ht plants'],
  has_workshop: false,
  ws_requires_reservation: false,
  is_past: false,
  display_order: 1,
  images: [],
  page_content: null,
  daily_times: null,
}

/**
 * テスト用の収支データ（全フィールドをデフォルト値で初期化）
 */
const MOCK_FINANCES: EventFinances = {
  id: 'fin-admin-1',
  event_id: 'event-admin-info-1',
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

/**
 * 確認画面（/admin/events/:id/admin-info）の代わりに置くスタブ。
 * 保存後・「← 戻る」で遷移してきたことと、受け取った location.state を画面に出して確かめられるようにする
 * @returns location.state を表示し、戻る操作を提供する確認画面スタブ
 */
function ViewStub() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <p>確認画面スタブ</p>
      {/* ブラウザの「戻る」と同じく履歴を1つ戻る（replace になっているかを確かめる） */}
      <button type="button" onClick={() => navigate(-1)}>履歴を戻る</button>
      {/* 受け取った state（from・saved）を JSON で表示する */}
      <p data-testid="view-state">{JSON.stringify(location.state ?? null)}</p>
    </div>
  )
}

/**
 * EventAdminInfo（編集画面）を Routes/MemoryRouter でラップしてレンダリングするヘルパー
 * 編集画面は /admin/events/:id/admin-info/edit。保存後の遷移先として確認画面のスタブも置く
 * @param eventId - URL パラメータとして渡すイベントID
 * @param from - 確認画面から引き継いだ遷移元（location.state.from）。省略時は state なし
 * @returns 編集画面と確認画面スタブを描画した Testing Library の結果
 */
function renderAdminInfoPage(eventId: string = 'event-admin-info-1', from?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/admin/events/${eventId}/admin-info/edit`, state: from ? { from } : null }]}>
      <Routes>
        <Route path="/admin/events/:id/admin-info/edit" element={<EventAdminInfoPage />} />
        <Route path="/admin/events/:id/admin-info" element={<ViewStub />} />
      </Routes>
    </MemoryRouter>
  )
}

// ---- テストスイート ----

describe('EventAdminInfo ページ — 搬入・搬出時間プルダウン', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセットしてデフォルトの解決値を設定する
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()
    vi.mocked(api.events.saveFinances).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    // 管理情報は未入力の空オブジェクトを返す
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({} as EventAdminInfo)
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
    vi.mocked(api.events.saveFinances).mockResolvedValue(MOCK_FINANCES)
  })

  it('データ読み込み後に「搬入日時」ラベルが表示される', async () => {
    // 搬入日時の入力ラベルが表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByText('搬入日時')).toBeDefined()
    })
  })

  it('データ読み込み後に「搬出日時」ラベルが表示される', async () => {
    // 搬出日時の入力ラベルが表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByText('搬出日時')).toBeDefined()
    })
  })

  it('時の選択肢に「06」が存在する（HOUR_OPTIONS の先頭）', async () => {
    // 06 時のオプションが存在することを確認する（HOUR_OPTIONS は 06〜22）
    renderAdminInfoPage()
    await waitFor(() => {
      // getAllByRole で全 option を取得し、値 "06" のものが含まれることを確認する
      const options = screen.getAllByRole('option', { name: '06' })
      expect(options.length).toBeGreaterThan(0)
    })
  })

  it('分の選択肢に「05」が存在する（MINUTE_OPTIONS の2番目）', async () => {
    // 05 分のオプションが存在することを確認する（MINUTE_OPTIONS は 00, 05, 10, ...）
    renderAdminInfoPage()
    await waitFor(() => {
      // getAllByRole で全 option を取得し、値 "05" のものが含まれることを確認する
      const options = screen.getAllByRole('option', { name: '05' })
      expect(options.length).toBeGreaterThan(0)
    })
  })

  it('ローディング中は「読み込み中...」が表示される', () => {
    // データ取得が完了する前はローディングメッセージが表示されることを確認する
    vi.mocked(api.events.get).mockReturnValue(new Promise(() => {})) // 永遠に保留
    renderAdminInfoPage()
    expect(screen.getByText('読み込み中...')).toBeDefined()
  })

  it('データ読み込み後に「保存する」ボタンが表示される', async () => {
    // 保存ボタンが表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存する' })).toBeDefined()
    })
  })

  it('イベント名がページに表示される', async () => {
    // イベント名がページ見出し付近に表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByText(/管理情報入力テストイベント/)).toBeDefined()
    })
  })

  it('「搬入・搬出」セクション見出しが表示される', async () => {
    // 搬入・搬出セクションのラベルが表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByText('搬入・搬出')).toBeDefined()
    })
  })

  it('既存の carry_in_time を読み込んだとき時・分が正しく分割される', async () => {
    // carry_in_time が "2099-07-15T08:30" の場合、時 select に "08"・分 select に "30" が選択される
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({
      carry_in_time: '2099-07-15T08:30',
      carry_out_time: null,
      hotel_name: null,
      hotel_fee: null,
      booth_fee: null,
      booth_fee_pay_method: null,
      booth_fee_due: null,
      booth_fee_paid: false,
      notes: null,
    } as EventAdminInfo)
    renderAdminInfoPage()
    // 時 select が "08" を表示していることを確認する
    await waitFor(() => {
      expect(screen.getByDisplayValue('08')).toBeDefined()
    })
    // 分 select が "30" を表示していることを確認する
    expect(screen.getByDisplayValue('30')).toBeDefined()
  })

  it('minute が "00" のとき null にならず保存される（分 select が "00" を表示する）', async () => {
    // carry_in_time が "2099-07-15T09:00" の場合、分 select に "00" が選択された状態で表示される
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({
      carry_in_time: '2099-07-15T09:00',
      carry_out_time: null,
      hotel_name: null,
      hotel_fee: null,
      booth_fee: null,
      booth_fee_pay_method: null,
      booth_fee_due: null,
      booth_fee_paid: false,
      notes: null,
    } as EventAdminInfo)
    renderAdminInfoPage()
    // 分 select が "00" を表示していることを確認する（"00" は falsy になりがちなため特に重要）
    await waitFor(() => {
      expect(screen.getByDisplayValue('00')).toBeDefined()
    })
  })
})

// ---- 出店要項セクション ----

/** 出店要項（文章と画像2枚）が入った管理情報 */
const INFO_WITH_GUIDELINES: EventAdminInfo = {
  carry_in_time: null,
  carry_out_time: null,
  hotel_name: null,
  hotel_fee: null,
  booth_fee: null,
  booth_fee_pay_method: null,
  booth_fee_due: null,
  booth_fee_paid: false,
  notes: null,
  guidelines_text: '出店要項の本文です\n搬入は9時まで',
  guidelines_image_urls: ['https://ex.com/gl-1.png', 'https://ex.com/gl-2.png'],
}

/**
 * 隠しファイル input を取り出す（「画像を追加」ボタンから開く input[type=file]）
 * @param container - render の戻り値の container
 * @returns フォーム内のファイル選択 input 要素
 */
function getFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]')
  if (!input) throw new Error('file input が見つからない')
  return input as HTMLInputElement
}

/**
 * テスト用の画像ファイルを作る
 * @param name - ファイル名
 * @returns PNG 形式のテスト用画像ファイル
 */
function imageFile(name: string): File {
  return new File(['x'], name, { type: 'image/png' })
}

describe('EventAdminInfo ページ — 出店要項', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()
    vi.mocked(api.events.saveFinances).mockReset()
    vi.mocked(api.upload).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(INFO_WITH_GUIDELINES)
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
    vi.mocked(api.events.saveFinances).mockResolvedValue(MOCK_FINANCES)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('「出店要項」セクションが「メモ」セクションより前に表示される', async () => {
    renderAdminInfoPage()
    const guide = await screen.findByText('出店要項')
    const memo = screen.getByText('メモ')
    // guide が memo より文書順で前にある
    expect(guide.compareDocumentPosition(memo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('既存の guidelines_text が「要項の文章」欄に、画像がサムネイルと枚数で表示される', async () => {
    renderAdminInfoPage()
    const textarea = await screen.findByLabelText('要項の文章')
    expect(textarea).toHaveValue('出店要項の本文です\n搬入は9時まで')
    expect(screen.getByText('要項の画像（2 枚）')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '出店要項の画像 1' })).toHaveAttribute('src', 'https://ex.com/gl-1.png')
    expect(screen.getByRole('img', { name: '出店要項の画像 2' })).toHaveAttribute('src', 'https://ex.com/gl-2.png')
    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(2)
    // 読み込んだ直後は未保存表示が出ない
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
  })

  it('guidelines_* が無い既存データでも表示でき、文章は空・サムネイルなし・枚数表記なしになる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ notes: '既存メモ' } as EventAdminInfo)
    renderAdminInfoPage()
    expect(await screen.findByLabelText('要項の文章')).toHaveValue('')
    expect(screen.getByText('要項の画像')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '画像を追加' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('既存メモ')).toBeInTheDocument()
  })

  it('複数の画像をアップロードすると選んだ順で末尾に追加され「未保存の変更があります」が出る', async () => {
    vi.mocked(api.upload)
      .mockResolvedValueOnce('https://ex.com/new-1.png')
      .mockResolvedValueOnce('https://ex.com/new-2.png')
    const { container } = renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')

    await userEvent.upload(getFileInput(container), [imageFile('a.png'), imageFile('b.png')])

    // 1枚ずつ順に api.upload が呼ばれる
    await waitFor(() => expect(screen.getByText('要項の画像（4 枚）')).toBeInTheDocument())
    expect(api.upload).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.upload).mock.calls.map((c) => (c[0] as File).name)).toEqual(['a.png', 'b.png'])
    expect(screen.getByRole('img', { name: '出店要項の画像 3' })).toHaveAttribute('src', 'https://ex.com/new-1.png')
    expect(screen.getByRole('img', { name: '出店要項の画像 4' })).toHaveAttribute('src', 'https://ex.com/new-2.png')
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
    // アップロードが終わるとボタン表示が戻る
    expect(screen.getByRole('button', { name: '画像を追加' })).toBeEnabled()
  })

  it('アップロード完了後に同じファイルを同じ input から再選択すると、2回とも追加される', async () => {
    // 同じ File オブジェクトを再選択し、ファイル input の value がクリアされる動作を確かめる
    const file = imageFile('same.png')
    vi.mocked(api.upload)
      .mockResolvedValueOnce('https://ex.com/same-1.png')
      .mockResolvedValueOnce('https://ex.com/same-2.png')
    const { container } = renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    const input = getFileInput(container)

    // 1. 同じ input から1回目を選び、アップロード完了と画像追加を待つ
    await userEvent.upload(input, file)
    await waitFor(() => {
      expect(api.upload).toHaveBeenCalledTimes(1)
      expect(screen.getByText('要項の画像（3 枚）')).toBeInTheDocument()
    })

    // 2. 同じ File を同じ input からもう一度選び、2枚目も末尾に追加されることを確かめる
    await userEvent.upload(input, file)
    await waitFor(() => {
      expect(api.upload).toHaveBeenCalledTimes(2)
      expect(screen.getByText('要項の画像（4 枚）')).toBeInTheDocument()
    })
    expect(vi.mocked(api.upload).mock.calls[0][0]).toBe(file)
    expect(vi.mocked(api.upload).mock.calls[1][0]).toBe(file)
    expect(screen.getByRole('img', { name: '出店要項の画像 3' })).toHaveAttribute('src', 'https://ex.com/same-1.png')
    expect(screen.getByRole('img', { name: '出店要項の画像 4' })).toHaveAttribute('src', 'https://ex.com/same-2.png')
  })

  it('アップロード中は「アップロード中...（n/m）」が出て、保存ボタンと追加ボタンが押せない', async () => {
    /**
     *  1枚目のアップロードを外から完了させるための resolve
     * @returns 戻り値なし。
     */
    let resolveFirst: (url: string) => void = () => {}
    vi.mocked(api.upload)
      .mockImplementationOnce(() => new Promise<string>((r) => { resolveFirst = r }))
      .mockResolvedValueOnce('https://ex.com/new-2.png')
    const { container } = renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')

    await userEvent.upload(getFileInput(container), [imageFile('a.png'), imageFile('b.png')])

    const progress = await screen.findByRole('button', { name: 'アップロード中...（1/2）' })
    expect(progress).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存する' })).toBeDisabled()

    resolveFirst('https://ex.com/new-1.png')
    await waitFor(() => expect(screen.getByRole('button', { name: '画像を追加' })).toBeEnabled())
    expect(screen.getByRole('button', { name: '保存する' })).toBeEnabled()
  })

  it('一部のアップロードが失敗すると成功分は追加され、失敗したファイル名つきのエラーが出る', async () => {
    vi.mocked(api.upload)
      .mockResolvedValueOnce('https://ex.com/ok-1.png')
      .mockRejectedValueOnce(new Error('413'))
      .mockRejectedValueOnce(new Error('415'))
    const { container } = renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')

    await userEvent.upload(getFileInput(container), [imageFile('ok.png'), imageFile('big.png'), imageFile('bad.png')])

    expect(await screen.findByText(/次の画像をアップロードできませんでした: big\.png、bad\.png/)).toBeInTheDocument()
    expect(screen.getByText('要項の画像（3 枚）')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '出店要項の画像 3' })).toHaveAttribute('src', 'https://ex.com/ok-1.png')
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
  })

  it('全部のアップロードが失敗すると画像は増えず、未保存表示も出ない', async () => {
    vi.mocked(api.upload).mockRejectedValue(new Error('500'))
    const { container } = renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')

    await userEvent.upload(getFileInput(container), [imageFile('x.png')])

    expect(await screen.findByText(/次の画像をアップロードできませんでした: x\.png/)).toBeInTheDocument()
    expect(screen.getByText('要項の画像（2 枚）')).toBeInTheDocument()
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
  })

  it('削除で confirm を OK にすると、その画像が外れて「未保存の変更があります」が出る', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')

    await userEvent.click(screen.getAllByRole('button', { name: '削除' })[0])

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByText('要項の画像（1 枚）')).toBeInTheDocument()
    // 残った1枚は2枚目だったもの
    expect(screen.getByRole('img', { name: '出店要項の画像 1' })).toHaveAttribute('src', 'https://ex.com/gl-2.png')
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
  })

  it('削除で confirm をキャンセルすると画像は残り、未保存表示も出ない', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')

    await userEvent.click(screen.getAllByRole('button', { name: '削除' })[1])

    expect(screen.getByText('要項の画像（2 枚）')).toBeInTheDocument()
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
  })

  it('保存すると saveAdminInfo に編集後の guidelines_text と guidelines_image_urls が含まれ、未保存表示が消える', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.upload).mockResolvedValueOnce('https://ex.com/new-1.png')
    const { container } = renderAdminInfoPage()
    const textarea = await screen.findByLabelText('要項の文章')

    // 1. 文章を書き換える・1枚目を削除・1枚追加
    await userEvent.clear(textarea)
    await userEvent.type(textarea, '新しい要項')
    await userEvent.click(screen.getAllByRole('button', { name: '削除' })[0])
    await userEvent.upload(getFileInput(container), [imageFile('n.png')])
    await waitFor(() => expect(screen.getByText('要項の画像（2 枚）')).toBeInTheDocument())

    // 2. 保存する
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() => expect(api.events.saveAdminInfo).toHaveBeenCalledTimes(1))
    const [savedId, body] = vi.mocked(api.events.saveAdminInfo).mock.calls[0]
    expect(savedId).toBe('event-admin-info-1')
    expect(body.guidelines_text).toBe('新しい要項')
    expect(body.guidelines_image_urls).toEqual(['https://ex.com/gl-2.png', 'https://ex.com/new-1.png'])
    // 3. 保存に成功すると確認画面へ移り、saved: true が渡る（編集画面の「未保存の変更があります」も消える）
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('view-state').textContent ?? 'null')).toMatchObject({ saved: true })
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
  })

  it('guidelines_* が無い既存データをそのまま保存すると guidelines_text は null・guidelines_image_urls は [] で送られる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({} as EventAdminInfo)
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    await waitFor(() => expect(api.events.saveAdminInfo).toHaveBeenCalledTimes(1))
    const body = vi.mocked(api.events.saveAdminInfo).mock.calls[0][1]
    expect(body.guidelines_text).toBeNull()
    expect(body.guidelines_image_urls).toEqual([])
  })

  it('文章を空にして保存すると guidelines_text は null で送られる', async () => {
    renderAdminInfoPage()
    const textarea = await screen.findByLabelText('要項の文章')
    await userEvent.clear(textarea)
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    await waitFor(() => expect(api.events.saveAdminInfo).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.events.saveAdminInfo).mock.calls[0][1].guidelines_text).toBeNull()
  })

  it('保存に失敗するとエラーが出て、未保存表示は残る', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.events.saveAdminInfo).mockRejectedValue(new Error('500'))
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    await userEvent.click(screen.getAllByRole('button', { name: '削除' })[0])
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeInTheDocument()
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
  })

  it('サムネイルを押すと拡大表示が開き「1 / 2」と前へ・次へで切り替えられ、閉じるで閉じる', async () => {
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')

    // 1. 1枚目のサムネイルで開く
    await userEvent.click(screen.getByRole('button', { name: '出店要項の画像 1 を拡大表示' }))
    const dialog = screen.getByRole('dialog', { name: '出店要項の画像の拡大表示' })
    expect(within(dialog).getByText('1 / 2')).toBeInTheDocument()
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://ex.com/gl-1.png')
    // 先頭では前へが無効扱い、次へは有効
    expect(within(dialog).getByRole('button', { name: /前へ/ })).toHaveAttribute('aria-disabled', 'true')
    expect(within(dialog).getByRole('button', { name: /次へ/ })).toHaveAttribute('aria-disabled', 'false')
    // 表示中は後ろのページのスクロールを止める
    expect(document.body.style.overflow).toBe('hidden')

    // 2. 次へで2枚目、末尾では次へが無効扱いで押しても変わらない
    await userEvent.click(within(dialog).getByRole('button', { name: /次へ/ }))
    expect(within(dialog).getByText('2 / 2')).toBeInTheDocument()
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://ex.com/gl-2.png')
    await userEvent.click(within(dialog).getByRole('button', { name: /次へ/ }))
    expect(within(dialog).getByText('2 / 2')).toBeInTheDocument()
    // 無効の次へを押しても閉じない（背景クリック扱いにならない）
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // 3. 前へで1枚目に戻る
    await userEvent.click(within(dialog).getByRole('button', { name: /前へ/ }))
    expect(within(dialog).getByText('1 / 2')).toBeInTheDocument()

    // 4. 閉じるで閉じ、body のスクロールが戻る
    await userEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })

  it('拡大表示は左右キーで切り替わり、Esc で閉じる', async () => {
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    await userEvent.click(screen.getByRole('button', { name: '出店要項の画像 2 を拡大表示' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    // 先頭で左キーを押しても変わらない
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('拡大表示は背景を押すと閉じ、画像そのものを押しても閉じない', async () => {
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    await userEvent.click(screen.getByRole('button', { name: '出店要項の画像 1 を拡大表示' }))
    const dialog = screen.getByRole('dialog')

    await userEvent.click(within(dialog).getByRole('img'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.click(dialog)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('画像が1枚だけのとき拡大表示に「n / m」と前へ・次へは出ない', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...INFO_WITH_GUIDELINES, guidelines_image_urls: ['https://ex.com/only.png'] })
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    await userEvent.click(screen.getByRole('button', { name: '出店要項の画像 1 を拡大表示' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /前へ|次へ/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '閉じる' })).toBeInTheDocument()
  })
})

// ---- 読み込みに失敗したときの保存の停止 ----

describe('EventAdminInfo ページ — 読み込み失敗時は保存できない', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()
    vi.mocked(api.events.saveFinances).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(INFO_WITH_GUIDELINES)
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
    vi.mocked(api.events.saveFinances).mockResolvedValue(MOCK_FINANCES)
  })

  it.each([
    ['管理情報（getAdminInfo）', () => vi.mocked(api.events.getAdminInfo).mockRejectedValue(new Error('500'))],
    ['収支（getFinances）', () => vi.mocked(api.events.getFinances).mockRejectedValue(new Error('500'))],
    ['イベント（get）', () => vi.mocked(api.events.get).mockRejectedValue(new Error('404'))],
  ])('%s の読み込みに失敗すると保存ボタンが押せず、フォームを送信しても saveAdminInfo・saveFinances は呼ばれない', async (_label, makeFail) => {
    makeFail()
    renderAdminInfoPage()

    // 1. 読み込みエラーが出て、保存ボタンは disabled
    expect(await screen.findByText('データの読み込みに失敗しました。ページを再読み込みしてください。')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: '保存する' })
    expect(button).toBeDisabled()

    // 2. ボタンを押しても、フォームを直接 submit しても保存されない
    await userEvent.click(button)
    fireEvent.submit(button.closest('form')!)
    await new Promise((r) => setTimeout(r, 50))
    expect(api.events.saveAdminInfo).not.toHaveBeenCalled()
    expect(api.events.saveFinances).not.toHaveBeenCalled()
    // 確認画面へも移らない
    expect(screen.queryByText('確認画面スタブ')).not.toBeInTheDocument()
  })

  it('読み込みに失敗した後に要項の文章を入力しても保存ボタンは押せないまま', async () => {
    vi.mocked(api.events.getAdminInfo).mockRejectedValue(new Error('500'))
    renderAdminInfoPage()
    const textarea = await screen.findByLabelText('要項の文章')
    await userEvent.type(textarea, '入力')
    expect(screen.getByRole('button', { name: '保存する' })).toBeDisabled()
  })

  it('読み込みに成功したときは保存ボタンが押せ、フォーム送信で saveAdminInfo と saveFinances が呼ばれる', async () => {
    renderAdminInfoPage()
    const button = await screen.findByRole('button', { name: '保存する' })
    expect(button).toBeEnabled()
    fireEvent.submit(button.closest('form')!)
    await waitFor(() => expect(api.events.saveFinances).toHaveBeenCalledTimes(1))
    expect(api.events.saveAdminInfo).toHaveBeenCalledTimes(1)
    // 出店要項は読み込んだ値のまま送られる
    expect(vi.mocked(api.events.saveAdminInfo).mock.calls[0][1].guidelines_image_urls).toEqual(INFO_WITH_GUIDELINES.guidelines_image_urls)
    // 保存に成功すると確認画面へ移る
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
  })
})

// ---- 保存時の収支との同期 ----

/**
 * ラベルの文字から、同じ欄の入力 input を取り出す（ラベルと input が for で結ばれていないため親要素からたどる）
 * @param text - ラベルの文字（完全一致）
 * @returns ラベルの親要素の中にある input
 */
function getInputByLabelText(text: string): HTMLInputElement {
  const label = screen.getAllByText(text, { selector: 'label' })[0]
  const input = label.parentElement?.querySelector('input')
  if (!input) throw new Error(`${text} の input が見つからない`)
  return input as HTMLInputElement
}

describe('EventAdminInfo ページ — 保存時の収支との同期', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()
    vi.mocked(api.events.saveFinances).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(INFO_WITH_GUIDELINES)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
    vi.mocked(api.events.saveFinances).mockResolvedValue(MOCK_FINANCES)
  })

  it('画面を開いた後に収支が更新されていたときは、保存時に読み直した最新の収支を使い、出店料・宿泊費だけ管理情報の値になる', async () => {
    // 1. 画面を開いたとき（1回目）は売上 0 の収支、保存時の読み直し（2回目）では別の画面で売上などが保存されている
    const LATEST_FIN: EventFinances = {
      ...MOCK_FINANCES,
      sales: 88000,
      booth_fee: 1000,
      accommodation: 2000,
      expressway_toll: 1500,
      other_expenses: 300,
      other_expenses_note: '後から入力した備品代',
      notes: '収支メモ',
      payment_flag: true,
      updated_at: '2099-07-16T10:00:00Z',
    }
    vi.mocked(api.events.getFinances)
      .mockResolvedValueOnce(MOCK_FINANCES)
      .mockResolvedValueOnce(LATEST_FIN)
    renderAdminInfoPage()
    await screen.findByRole('button', { name: '保存する' })

    // 2. 管理情報の出店料・宿泊料金を入力して保存する
    await userEvent.type(getInputByLabelText('出店料'), '15000')
    await userEvent.type(getInputByLabelText('宿泊料金'), '6000')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    // 保存に成功すると確認画面へ移る
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()

    // 3. getFinances は読み込み時と保存時の2回呼ばれ、保存時の読み直しは管理情報の保存の後
    expect(api.events.getFinances).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.events.saveAdminInfo).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.events.getFinances).mock.invocationCallOrder[1])

    // 4. saveFinances には最新の収支の入力項目がそのまま使われ、出店料・宿泊費だけ管理情報の値になる
    expect(api.events.saveFinances).toHaveBeenCalledTimes(1)
    const [savedId, body] = vi.mocked(api.events.saveFinances).mock.calls[0]
    expect(savedId).toBe('event-admin-info-1')
    expect(body).toEqual({
      sales: 88000,
      booth_fee: 15000,
      distance: 0,
      gas_price: 160,
      expressway_toll: 1500,
      accommodation: 6000,
      ws_participants: 0,
      payment_flag: true,
      ws_payment_done: false,
      other_expenses: 300,
      other_expenses_note: '後から入力した備品代',
      notes: '収支メモ',
    })
    // 5. 保存用でない項目（id・event_id・updated_at）は送らない
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('event_id')
    expect(body).not.toHaveProperty('updated_at')
  })

  it('管理情報の出店料・宿泊料金が空のまま保存すると、収支の出店料・宿泊費は 0 で送られ、ほかは最新の収支のまま', async () => {
    // 1. 読み込み時の収支は 0 なので、出店料・宿泊料金の欄は空のまま
    vi.mocked(api.events.getFinances)
      .mockResolvedValueOnce(MOCK_FINANCES)
      .mockResolvedValueOnce({ ...MOCK_FINANCES, sales: 5000, booth_fee: 9999, accommodation: 8888 })
    renderAdminInfoPage()
    await screen.findByRole('button', { name: '保存する' })
    expect(getInputByLabelText('出店料')).toHaveValue(null)
    expect(getInputByLabelText('宿泊料金')).toHaveValue(null)

    // 2. 保存すると、出店料・宿泊費は管理情報の空（0）で上書きされ、売上は最新の 5000 のまま
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    await waitFor(() => expect(api.events.saveFinances).toHaveBeenCalledTimes(1))
    const body = vi.mocked(api.events.saveFinances).mock.calls[0][1]
    expect(body.booth_fee).toBe(0)
    expect(body.accommodation).toBe(0)
    expect(body.sales).toBe(5000)
  })

  it('保存時の収支の読み直し（getFinances）に失敗すると「保存に失敗しました」が出て、saveFinances は呼ばれず「保存しました」も出ない', async () => {
    // 1. 読み込み時は成功し、保存時の読み直しだけ失敗させる
    vi.mocked(api.events.getFinances)
      .mockResolvedValueOnce(MOCK_FINANCES)
      .mockRejectedValueOnce(new Error('500'))
    renderAdminInfoPage()
    await userEvent.click(await screen.findByRole('button', { name: '保存する' }))

    // 2. エラーが出る
    expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeInTheDocument()
    // 3. 管理情報は保存済み、収支は古い内容で上書きしない（保存しない）
    expect(api.events.saveAdminInfo).toHaveBeenCalledTimes(1)
    expect(api.events.saveFinances).not.toHaveBeenCalled()
    // 確認画面へは移らず、編集画面に留まる
    expect(screen.queryByText('確認画面スタブ')).not.toBeInTheDocument()
    // 4. 保存ボタンはもう一度押せる
    expect(screen.getByRole('button', { name: '保存する' })).toBeEnabled()
  })
})

// ---- 確認画面との行き来 ----

describe('EventAdminInfo ページ — 確認画面との行き来', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()
    vi.mocked(api.events.saveFinances).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(INFO_WITH_GUIDELINES)
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
    vi.mocked(api.events.saveFinances).mockResolvedValue(MOCK_FINANCES)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('保存に成功すると確認画面へ移り、state に受け取った from と saved: true が渡り、編集画面に「保存しました」は出ない', async () => {
    renderAdminInfoPage('event-admin-info-1', '/admin/events')
    await userEvent.click(await screen.findByRole('button', { name: '保存する' }))

    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('view-state').textContent ?? 'null')).toEqual({ from: '/admin/events', saved: true })
    // 編集画面は閉じている（保存ボタンが無い）
    expect(screen.queryByRole('button', { name: '保存する' })).not.toBeInTheDocument()
  })

  it('from を受け取っていないときは保存後の state に from が無く saved: true だけ渡る', async () => {
    renderAdminInfoPage()
    await userEvent.click(await screen.findByRole('button', { name: '保存する' }))

    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
    const state = JSON.parse(screen.getByTestId('view-state').textContent ?? 'null')
    expect(state.saved).toBe(true)
    expect(state.from).toBeUndefined()
  })

  it('管理情報の保存（saveAdminInfo）に失敗すると確認画面へ移らずエラーが出る', async () => {
    vi.mocked(api.events.saveAdminInfo).mockRejectedValue(new Error('500'))
    renderAdminInfoPage('event-admin-info-1', '/admin/events')
    await userEvent.click(await screen.findByRole('button', { name: '保存する' }))

    expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeInTheDocument()
    expect(screen.queryByText('確認画面スタブ')).not.toBeInTheDocument()
  })

  it('「← 戻る」は確認画面（/admin-info）を指し、押すと確認画面へ from を引き継いで戻る', async () => {
    renderAdminInfoPage('event-admin-info-1', '/admin/events')
    const back = await screen.findByRole('link', { name: /戻る/ })
    expect(back).toHaveAttribute('href', '/admin/events/event-admin-info-1/admin-info')

    await userEvent.click(back)
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('view-state').textContent ?? 'null')).toEqual({ from: '/admin/events' })
  })

  it('画像の変更が無いときは「← 戻る」で confirm を出さずに確認画面へ戻る', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderAdminInfoPage()
    await userEvent.click(await screen.findByRole('link', { name: /戻る/ }))
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('画像を削除して未保存のまま「← 戻る」で confirm をキャンセルすると編集画面に留まる', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    // 1. 画像の削除（confirm OK）で未保存にする
    await userEvent.click(screen.getAllByRole('button', { name: '削除' })[0])
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()

    // 2. 戻るときの confirm はキャンセル
    confirmSpy.mockReturnValue(false)
    await userEvent.click(screen.getByRole('link', { name: /戻る/ }))
    expect(confirmSpy).toHaveBeenLastCalledWith('保存していない変更があります。破棄して移動しますか？')
    expect(screen.queryByText('確認画面スタブ')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存する' })).toBeInTheDocument()
  })

  it('画像を削除して未保存のまま「← 戻る」で confirm を OK にすると確認画面へ戻る', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    await userEvent.click(screen.getAllByRole('button', { name: '削除' })[0])

    await userEvent.click(screen.getByRole('link', { name: /戻る/ }))
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
  })
})

// ---- 保存後の遷移と「← 戻る」の replace ----

/**
 * 一覧 → 確認画面 → 編集画面 の順に開いた履歴で編集画面を表示する（今いるのは編集画面）
 * 保存後・「← 戻る」の遷移が replace なら履歴は 一覧 → 確認画面 → 確認画面 になり、
 * 1つ戻ると最初の確認画面（state に entry: 'first' の目印あり）、2つ戻ると一覧に着く。
 * push だと 一覧 → 確認 → 編集 → 確認 になり、1つ戻ると編集画面に戻ってしまう
 * @returns 遷移履歴を含む編集画面を描画した Testing Library の結果
 */
function renderWithHistory() {
  return render(
    <MemoryRouter
      initialEntries={[
        '/admin/events',
        { pathname: '/admin/events/event-admin-info-1/admin-info', state: { from: '/admin/events', entry: 'first' } },
        { pathname: '/admin/events/event-admin-info-1/admin-info/edit', state: { from: '/admin/events' } },
      ]}
      initialIndex={2}
    >
      <Routes>
        <Route path="/admin/events" element={<p>イベント一覧スタブ</p>} />
        <Route path="/admin/events/:id/admin-info/edit" element={<EventAdminInfoPage />} />
        <Route path="/admin/events/:id/admin-info" element={<ViewStub />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('EventAdminInfo ページ — 保存後と「← 戻る」の遷移は replace', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()
    vi.mocked(api.events.saveFinances).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(INFO_WITH_GUIDELINES)
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
    vi.mocked(api.events.saveFinances).mockResolvedValue(MOCK_FINANCES)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('保存後に確認画面で履歴を戻ると、編集画面には戻らず、1つ目で最初の確認画面・2つ目でイベント一覧に着く', async () => {
    renderWithHistory()
    await userEvent.click(await screen.findByRole('button', { name: '保存する' }))
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()

    // 1. 1つ戻ると、編集画面ではなく最初に開いた確認画面（目印 entry: 'first'）
    await userEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    await waitFor(() => expect(JSON.parse(screen.getByTestId('view-state').textContent ?? 'null')).toEqual({ from: '/admin/events', entry: 'first' }))
    expect(screen.queryByRole('button', { name: '保存する' })).not.toBeInTheDocument()

    // 2. もう1つ戻るとイベント一覧
    await userEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    expect(await screen.findByText('イベント一覧スタブ')).toBeInTheDocument()
  })

  it('「← 戻る」で確認画面に戻った後に履歴を戻ると、編集画面には戻らず、最初の確認画面 → イベント一覧の順に着く', async () => {
    renderWithHistory()
    await userEvent.click(await screen.findByRole('link', { name: /戻る/ }))
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
    // 「← 戻る」で着いた確認画面には目印が無い（from だけ）
    expect(JSON.parse(screen.getByTestId('view-state').textContent ?? 'null')).toEqual({ from: '/admin/events' })

    await userEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    await waitFor(() => expect(JSON.parse(screen.getByTestId('view-state').textContent ?? 'null')).toEqual({ from: '/admin/events', entry: 'first' }))
    expect(screen.queryByRole('button', { name: '保存する' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    expect(await screen.findByText('イベント一覧スタブ')).toBeInTheDocument()
  })

  it('「← 戻る」は inline-block で上下に 12px の余白があり、タップしやすい', async () => {
    renderAdminInfoPage()
    const back = await screen.findByRole('link', { name: /戻る/ })
    expect(back).toHaveStyle({ display: 'inline-block', paddingTop: '12px', paddingBottom: '12px' })
  })
})

// ---- 未保存の判定（全項目） ----

/**
 * beforeunload を発火させ、ページを離れるのを止めようとしたか（preventDefault されたか）を返す
 * @returns 未保存の確認を出す登録があれば true
 */
function fireBeforeUnload(): boolean {
  const ev = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(ev)
  return ev.defaultPrevented
}

describe('EventAdminInfo ページ — 未保存の変更の判定', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()
    vi.mocked(api.events.saveFinances).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...INFO_WITH_GUIDELINES, carry_in_time: '2099-07-15T09:00' })
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
    vi.mocked(api.events.saveFinances).mockResolvedValue(MOCK_FINANCES)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('読み込み直後（変更なし）は「未保存の変更があります」が出ず、「← 戻る」で confirm も出ず、beforeunload も止めない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
    expect(fireBeforeUnload()).toBe(false)

    await userEvent.click(screen.getByRole('link', { name: /戻る/ }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
  })

  it('収支の出店料・宿泊費を初期値に使ったときも、読み込み直後は未保存にならない', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({} as EventAdminInfo)
    vi.mocked(api.events.getFinances).mockResolvedValue({ ...MOCK_FINANCES, booth_fee: 12000, accommodation: 5000 })
    renderAdminInfoPage()
    await waitFor(() => expect(getInputByLabelText('出店料')).toHaveValue(12000))
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
    expect(fireBeforeUnload()).toBe(false)
  })

  it('要項の文章だけを変えると「未保存の変更があります」が出て、beforeunload で離れるのを止める', async () => {
    renderAdminInfoPage()
    const textarea = await screen.findByLabelText('要項の文章')
    await userEvent.type(textarea, '追記')
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
    expect(fireBeforeUnload()).toBe(true)
  })

  it.each([
    ['ホテル名', async () => { await userEvent.type(getInputByLabelText('ホテル名'), 'ホテルA') }],
    ['出店料', async () => { await userEvent.type(getInputByLabelText('出店料'), '3000') }],
    ['支払い済み', async () => { await userEvent.click(screen.getByRole('checkbox')) }],
    ['搬入の時（プルダウン）', async () => { await userEvent.selectOptions(screen.getByDisplayValue('09'), '10') }],
    ['搬入の分（プルダウン）', async () => { await userEvent.selectOptions(screen.getByDisplayValue('00'), '30') }],
    ['搬出の日付', async () => {
      const dates = document.querySelectorAll('input[type="date"]')
      fireEvent.change(dates[1], { target: { value: '2099-07-16' } })
    }],
  ])('%s だけを変えても「未保存の変更があります」が出る', async (_label, change) => {
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
    await change()
    expect(await screen.findByText('未保存の変更があります')).toBeInTheDocument()
  })

  it('変更してから元の値に戻すと未保存ではなくなり、beforeunload も止めなくなる', async () => {
    renderAdminInfoPage()
    const textarea = await screen.findByLabelText('要項の文章')
    await userEvent.type(textarea, 'X')
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
    expect(fireBeforeUnload()).toBe(true)

    await userEvent.type(textarea, '{Backspace}')
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
    expect(fireBeforeUnload()).toBe(false)
  })

  it('文章だけを変えて「← 戻る」を押すと confirm「保存していない変更があります。破棄して移動しますか？」が出て、キャンセルなら留まる', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAdminInfoPage()
    await userEvent.type(await screen.findByLabelText('要項の文章'), '追記')
    await userEvent.click(screen.getByRole('link', { name: /戻る/ }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy).toHaveBeenCalledWith('保存していない変更があります。破棄して移動しますか？')
    expect(screen.queryByText('確認画面スタブ')).not.toBeInTheDocument()
    expect(screen.getByLabelText('要項の文章')).toHaveValue('出店要項の本文です\n搬入は9時まで追記')
  })

  it('文章だけを変えて「← 戻る」の confirm を OK にすると確認画面へ戻り、beforeunload の登録も外れる', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAdminInfoPage()
    await userEvent.type(await screen.findByLabelText('要項の文章'), '追記')
    expect(fireBeforeUnload()).toBe(true)
    await userEvent.click(screen.getByRole('link', { name: /戻る/ }))
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
    expect(fireBeforeUnload()).toBe(false)
  })

  it('変更して保存すると確認画面へ移り、confirm は出ず、beforeunload の登録も外れる', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderAdminInfoPage()
    await screen.findByLabelText('要項の文章')
    await userEvent.type(getInputByLabelText('ホテル名'), 'ホテルB')
    expect(fireBeforeUnload()).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    expect(await screen.findByText('確認画面スタブ')).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(fireBeforeUnload()).toBe(false)
  })

  it('保存に失敗したときは未保存のまま（「未保存の変更があります」が残り、beforeunload も止める）', async () => {
    vi.mocked(api.events.saveAdminInfo).mockRejectedValue(new Error('500'))
    renderAdminInfoPage()
    await userEvent.type(await screen.findByLabelText('要項の文章'), '追記')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    expect(await screen.findByText('保存に失敗しました。もう一度お試しください。')).toBeInTheDocument()
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
    expect(fireBeforeUnload()).toBe(true)
  })

  it('読み込みに失敗したときは入力しても未保存扱いにならず、「← 戻る」で confirm を出さない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    vi.mocked(api.events.getAdminInfo).mockRejectedValue(new Error('500'))
    renderAdminInfoPage()
    await userEvent.type(await screen.findByLabelText('要項の文章'), '入力')
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
    expect(fireBeforeUnload()).toBe(false)
    await userEvent.click(screen.getByRole('link', { name: /戻る/ }))
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
