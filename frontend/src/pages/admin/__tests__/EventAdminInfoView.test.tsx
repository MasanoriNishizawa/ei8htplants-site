/**
 * EventAdminInfoView（管理情報の確認画面 /admin/events/:id/admin-info）のテスト
 *
 * 1. 各項目の表示（イベント名・開催日・搬入/搬出日時・宿泊・出店料・支払い方法・期限・出店要項・メモ）
 * 2. 未入力の項目は「未入力」、全部未入力なら「まだ管理情報が登録されていません」
 * 3. 支払い状況のバッジ（支払い済み／未払い／未払い＋期限切れ。今日の日付は固定する）
 * 4. 読み込み失敗時のメッセージと、編集ボタンは出ること
 * 5. state.saved の「保存しました」（role=status）と 3 秒後に消えること・履歴から saved を消すこと
 * 6. 「← 戻る」と「編集」のリンク先と引き継ぐ state
 * 7. 出店要項画像のサムネイルを押すと拡大表示が開く
 * 8. 出店料・宿泊料金が未入力のとき収支の値（0 以外）で補い「（収支から）」を添える・収支の読み込み失敗でも画面は出る
 * 9. 空白だけの文字列は「未入力」扱い（全部未入力の案内・支払い状況の判定も同様）。表示する文章は trim しない
 * 10. 「← 戻る」のタップ領域（inline-block・上下 12px の余白）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import EventAdminInfoView from '../EventAdminInfoView'
import { api } from '../../../lib/api'
import type { Event, EventAdminInfo, EventFinances } from '../../../lib/api'

// このファイルのテストは時・分の select（選択肢が多い）や画像の操作を含み、単独でも 1〜3 秒かかるものがある。
// 全テストをまとめて実行したときやマシンが混んでいるときに既定の 5 秒で打ち切られないよう、1 テストあたり 20 秒まで待つ
vi.setConfig({ testTimeout: 20000 })

// api モジュールのモック。確認画面が使う get・getAdminInfo だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: {
        get: vi.fn(),
        getAdminInfo: vi.fn(),
        // 収支（管理情報の出店料・宿泊料金が未入力のときに補う値として使う）
        getFinances: vi.fn(),
      },
    },
  }
})

// ---- テスト用モックデータ ----

/** テスト用のイベント（2日間開催） */
const MOCK_EVENT: Event = {
  id: 'ev-view-1',
  slug: 'view-test',
  name: '確認画面テストイベント',
  start_date: '2026-10-24',
  end_date: '2026-10-25',
  time: '10:00〜17:00',
  location: 'テスト会場',
  booth_number: 'A-1',
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

/** すべての項目が入った管理情報（未払い・期限は 2026-10-20） */
const FULL_INFO: EventAdminInfo = {
  carry_in_time: '2026-10-24T09:00',
  carry_out_time: '2026-10-25T18:30',
  hotel_name: 'テストホテル',
  hotel_fee: 8000,
  booth_fee: 14000,
  booth_fee_pay_method: '銀行振込',
  booth_fee_due: '2026-10-20',
  booth_fee_paid: false,
  notes: 'メモ1行目\nメモ2行目',
  guidelines_text: '要項1行目\n要項2行目',
  guidelines_image_urls: ['https://ex.com/v-1.png', 'https://ex.com/v-2.png'],
}

/** 出店料・宿泊費が 0 の収支（0 は補わないので、既定ではどの表示にも影響しない） */
const ZERO_FINANCES: EventFinances = {
  id: 'fin-view-1',
  event_id: 'ev-view-1',
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

/** 何も入力されていない管理情報 */
const EMPTY_INFO: EventAdminInfo = {
  carry_in_time: null,
  carry_out_time: null,
  hotel_name: null,
  hotel_fee: null,
  booth_fee: null,
  booth_fee_pay_method: null,
  booth_fee_due: null,
  booth_fee_paid: false,
  notes: null,
  guidelines_text: null,
  guidelines_image_urls: [],
}

/**
 * 現在の URL と location.state を画面に出すプローブ（リンク先の state・履歴の書き換えを確かめる）
 * @returns 表示する React 要素。
 */
function LocationProbe() {
  const location = useLocation()
  return (
    <div>
      <p data-testid="probe-path">{location.pathname}</p>
      <p data-testid="probe-state">{JSON.stringify(location.state ?? null)}</p>
    </div>
  )
}

/**
 * プローブに出ている location.state を取り出す
 * @returns location.state（無ければ null）
 */
function probeState(): unknown {
  return JSON.parse(screen.getByTestId('probe-state').textContent ?? 'null')
}

/**
 * 確認画面を MemoryRouter でレンダリングする。編集画面・一覧はスタブに置き換える
 * @param state - 確認画面に渡す location.state（from・saved）
 * @returns 処理結果。
 */
function renderView(state: { from?: string; saved?: boolean } | null = null) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/admin/events/ev-view-1/admin-info', state }]}>
      <Routes>
        <Route path="/admin/events/:id/admin-info" element={<EventAdminInfoView />} />
        <Route path="/admin/events/:id/admin-info/edit" element={<p>編集画面スタブ</p>} />
        <Route path="/admin/events" element={<p>イベント一覧スタブ</p>} />
        <Route path="/admin/events/:id/edit" element={<p>イベント編集スタブ</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

/**
 * 「ラベル」の行に表示されている値の要素を取り出す（ラベルの次の兄弟要素）
 * @param label - 行のラベル（完全一致）
 * @returns 値の要素
 */
function rowValue(label: string): HTMLElement {
  // 「出店料」はセクション見出しと行ラベルの両方にあるため、次の兄弟要素（値）を持つ行ラベルを選ぶ
  const labelEl = screen.getAllByText(label, { selector: 'div' }).find((el) => el.nextElementSibling !== null)
  const value = labelEl?.nextElementSibling
  if (!value) throw new Error(`${label} の値が見つからない`)
  return value as HTMLElement
}

/**
 * 今日の日付だけを固定する（setTimeout などは本物のまま）
 * @param ymd - 固定する日付 "YYYY-MM-DD"
 * @returns 戻り値なし。
 */
function fixToday(ymd: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${ymd}T12:00:00`))
}

beforeEach(() => {
  vi.mocked(api.events.get).mockReset()
  vi.mocked(api.events.getAdminInfo).mockReset()
  vi.mocked(api.events.getFinances).mockReset()
  vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
  vi.mocked(api.events.getFinances).mockResolvedValue(ZERO_FINANCES)
  vi.mocked(api.events.getAdminInfo).mockResolvedValue(FULL_INFO)
  // 既定では今日を期限（10/20）より前に固定する
  fixToday('2026-10-16')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---- 各項目の表示 ----

describe('EventAdminInfoView — 各項目の表示', () => {
  it('見出し・イベント名と開催期間（曜日つき）が表示される', async () => {
    renderView()
    expect(screen.getByRole('heading', { name: '管理情報' })).toBeInTheDocument()
    expect(await screen.findByText(/確認画面テストイベント/)).toHaveTextContent(
      '確認画面テストイベント — 2026年10月24日（土） 〜 2026年10月25日（日）',
    )
  })

  it('開催日が1日だけ（end_date なし）のときは「〜」を付けない', async () => {
    vi.mocked(api.events.get).mockResolvedValue({ ...MOCK_EVENT, end_date: null })
    renderView()
    const p = await screen.findByText(/確認画面テストイベント/)
    expect(p).toHaveTextContent('確認画面テストイベント — 2026年10月24日（土）')
    expect(p.textContent).not.toContain('〜')
  })

  it('読み込み中は「読み込み中...」が表示される', () => {
    vi.mocked(api.events.getAdminInfo).mockReturnValue(new Promise(() => {}))
    renderView()
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
  })

  it('搬入・搬出日時が「2026年10月24日（土） 09:00」形式で表示される', async () => {
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('搬入日時')).toHaveTextContent('2026年10月24日（土） 09:00')
    expect(rowValue('搬出日時')).toHaveTextContent('2026年10月25日（日） 18:30')
  })

  it('宿泊（ホテル名・料金）と出店料（金額・支払い方法・期限）が表示される', async () => {
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('ホテル名')).toHaveTextContent('テストホテル')
    expect(rowValue('宿泊料金')).toHaveTextContent('8,000円')
    expect(rowValue('出店料')).toHaveTextContent('14,000円')
    expect(rowValue('支払い方法')).toHaveTextContent('銀行振込')
    expect(rowValue('支払い期限')).toHaveTextContent('2026年10月20日（火）')
  })

  it('出店要項の文章とメモは改行がそのまま残り（pre-wrap）、画像は枚数とサムネイルで表示される', async () => {
    renderView()
    const guide = await screen.findByText(/要項1行目/)
    expect(guide.textContent).toBe('要項1行目\n要項2行目')
    expect(guide).toHaveStyle({ whiteSpace: 'pre-wrap' })
    const memo = screen.getByText(/メモ1行目/)
    expect(memo.textContent).toBe('メモ1行目\nメモ2行目')
    expect(memo).toHaveStyle({ whiteSpace: 'pre-wrap' })
    expect(screen.getByText('要項の画像（2 枚）')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '出店要項の画像 1' })).toHaveAttribute('src', 'https://ex.com/v-1.png')
    expect(screen.getByRole('img', { name: '出店要項の画像 2' })).toHaveAttribute('src', 'https://ex.com/v-2.png')
    // 全部入っているので「未入力」も案内も出ない
    expect(screen.queryByText('未入力')).not.toBeInTheDocument()
    expect(screen.queryByText(/まだ管理情報が登録されていません/)).not.toBeInTheDocument()
  })

  it('出店料が 0 円のときは「未入力」ではなく「0円」と表示される', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, booth_fee: 0 })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('出店料')).toHaveTextContent('0円')
  })

  it('サムネイルを押すと拡大表示が開き、押した画像が出る', async () => {
    renderView()
    await userEvent.click(await screen.findByRole('button', { name: '出店要項の画像 2 を拡大表示' }))
    const dialog = screen.getByRole('dialog', { name: '出店要項の画像の拡大表示' })
    expect(within(dialog).getByText('2 / 2')).toBeInTheDocument()
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://ex.com/v-2.png')
    await userEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

// ---- 未入力 ----

describe('EventAdminInfoView — 未入力の表示', () => {
  it('一部だけ入力されているときは、空の項目が「未入力」になり、案内は出ない', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, hotel_name: '一部ホテル' })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('ホテル名')).toHaveTextContent('一部ホテル')
    expect(rowValue('搬入日時')).toHaveTextContent('未入力')
    expect(rowValue('搬出日時')).toHaveTextContent('未入力')
    expect(rowValue('宿泊料金')).toHaveTextContent('未入力')
    expect(rowValue('出店料')).toHaveTextContent('未入力')
    expect(rowValue('支払い期限')).toHaveTextContent('未入力')
    expect(screen.queryByText(/まだ管理情報が登録されていません/)).not.toBeInTheDocument()
  })

  it('不正な日時が入っているときは「未入力」と表示される', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, notes: 'x', carry_in_time: 'invalid', booth_fee_due: '2026-02-30' })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('搬入日時')).toHaveTextContent('未入力')
    expect(rowValue('支払い期限')).toHaveTextContent('未入力')
  })

  it('全部未入力のときは「まだ管理情報が登録されていません」が出て、各項目と支払い状況・文章・画像・メモが「未入力」になる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EMPTY_INFO)
    renderView()
    expect(await screen.findByText(/まだ管理情報が登録されていません/)).toBeInTheDocument()
    // 搬入・搬出2・宿泊2・出店料4（金額・方法・期限・状況）・要項の文章・画像・メモ の 11 か所
    expect(screen.getAllByText('未入力')).toHaveLength(11)
    expect(rowValue('支払い状況')).toHaveTextContent('未入力')
    expect(screen.queryByText('未払い')).not.toBeInTheDocument()
    expect(screen.getByText('要項の画像')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('guidelines_* が無い既存データ（空オブジェクト）でも全部未入力として表示できる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({} as EventAdminInfo)
    renderView()
    expect(await screen.findByText(/まだ管理情報が登録されていません/)).toBeInTheDocument()
  })

  it('画像だけが登録されているときは案内を出さない', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, guidelines_image_urls: ['https://ex.com/only.png'] })
    renderView()
    await screen.findByText('要項の画像（1 枚）')
    expect(screen.queryByText(/まだ管理情報が登録されていません/)).not.toBeInTheDocument()
  })

  it('支払い済みだけが付いているときは案内を出さず「支払い済み」を表示する', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, booth_fee_paid: true })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(screen.queryByText(/まだ管理情報が登録されていません/)).not.toBeInTheDocument()
    expect(within(rowValue('支払い状況')).getByText('支払い済み')).toBeInTheDocument()
  })
})

// ---- 支払い状況のバッジ ----

describe('EventAdminInfoView — 支払い状況のバッジ（今日は固定）', () => {
  it('支払い済みなら期限を過ぎていても「支払い済み」だけが出る', async () => {
    fixToday('2026-10-25')
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...FULL_INFO, booth_fee_paid: true })
    renderView()
    await screen.findByText('搬入・搬出')
    const cell = rowValue('支払い状況')
    expect(within(cell).getByText('支払い済み')).toBeInTheDocument()
    expect(within(cell).queryByText('未払い')).not.toBeInTheDocument()
    expect(within(cell).queryByText('期限切れ')).not.toBeInTheDocument()
  })

  it('未払いで期限前（今日 10/16・期限 10/20）なら「未払い」だけが出る', async () => {
    renderView()
    await screen.findByText('搬入・搬出')
    const cell = rowValue('支払い状況')
    expect(within(cell).getByText('未払い')).toBeInTheDocument()
    expect(within(cell).queryByText('期限切れ')).not.toBeInTheDocument()
  })

  it('未払いで期限の当日（今日 10/20）はまだ「期限切れ」を出さない', async () => {
    fixToday('2026-10-20')
    renderView()
    await screen.findByText('搬入・搬出')
    const cell = rowValue('支払い状況')
    expect(within(cell).getByText('未払い')).toBeInTheDocument()
    expect(within(cell).queryByText('期限切れ')).not.toBeInTheDocument()
  })

  it('未払いで期限の翌日（今日 10/21）になると「未払い」と「期限切れ」が並ぶ', async () => {
    fixToday('2026-10-21')
    renderView()
    await screen.findByText('搬入・搬出')
    const cell = rowValue('支払い状況')
    expect(within(cell).getByText('未払い')).toBeInTheDocument()
    expect(within(cell).getByText('期限切れ')).toBeInTheDocument()
  })

  it('未払いで期限が未入力なら「期限切れ」は出ない', async () => {
    fixToday('2030-01-01')
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...FULL_INFO, booth_fee_due: null })
    renderView()
    await screen.findByText('搬入・搬出')
    const cell = rowValue('支払い状況')
    expect(within(cell).getByText('未払い')).toBeInTheDocument()
    expect(within(cell).queryByText('期限切れ')).not.toBeInTheDocument()
  })

  it('出店料関連が支払い方法だけ入力されているときは「未払い」を出す（未入力扱いにしない）', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, booth_fee_pay_method: 'カード' })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(within(rowValue('支払い状況')).getByText('未払い')).toBeInTheDocument()
  })

  it('出店料関連が全部未入力なら、ほかの項目が入っていても支払い状況は「未入力」', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, hotel_name: 'ホテル', notes: 'メモ' })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('支払い状況')).toHaveTextContent('未入力')
    expect(screen.queryByText('未払い')).not.toBeInTheDocument()
  })
})

// ---- 読み込み失敗 ----

describe('EventAdminInfoView — 読み込み失敗', () => {
  it.each([
    ['管理情報（getAdminInfo）', () => vi.mocked(api.events.getAdminInfo).mockRejectedValue(new Error('500'))],
    ['イベント（get）', () => vi.mocked(api.events.get).mockRejectedValue(new Error('404'))],
  ])('%s の読み込みに失敗するとエラーメッセージが出て、項目は出ず、編集ボタンは出る', async (_label, makeFail) => {
    makeFail()
    renderView()
    expect(await screen.findByText('管理情報の読み込みに失敗しました。ページを再読み込みしてください。')).toBeInTheDocument()
    expect(screen.queryByText('搬入・搬出')).not.toBeInTheDocument()
    expect(screen.queryByText(/まだ管理情報が登録されていません/)).not.toBeInTheDocument()
    // 編集ボタンは上下2か所とも出る
    expect(screen.getAllByRole('link', { name: '編集' })).toHaveLength(2)
  })
})

// ---- 保存しました ----

describe('EventAdminInfoView — 保存後の「保存しました」', () => {
  it('state.saved が true のとき「保存しました」（role=status）が出て、3秒後に消える', async () => {
    // 1. Date に加えて setTimeout も偽物にして時間を進められるようにする
    vi.useRealTimers()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-10-16T12:00:00'))
    renderView({ from: '/admin/events', saved: true })
    expect(await screen.findByRole('status')).toHaveTextContent('保存しました')

    // 2. 2.9 秒ではまだ出ている
    act(() => { vi.advanceTimersByTime(2900) })
    expect(screen.getByRole('status')).toHaveTextContent('保存しました')

    // 3. 3 秒を過ぎると消える
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('state.saved が true で来ると、履歴の state から saved が消えて from だけが残る（URL は確認画面のまま）', async () => {
    renderView({ from: '/admin/events', saved: true })
    await waitFor(() => expect(probeState()).toEqual({ from: '/admin/events' }))
    expect(screen.getByTestId('probe-path')).toHaveTextContent('/admin/events/ev-view-1/admin-info')
    // state を書き換えても「保存しました」は表示されたまま
    expect(screen.getByRole('status')).toHaveTextContent('保存しました')
  })

  it('state.saved が無いときは「保存しました」を出さず、state も書き換えない', async () => {
    renderView({ from: '/admin/events' })
    await screen.findByText('搬入・搬出')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('保存しました')).not.toBeInTheDocument()
    expect(probeState()).toEqual({ from: '/admin/events' })
  })
})

// ---- 戻る・編集のリンク ----

describe('EventAdminInfoView — 戻る・編集のリンク', () => {
  it('state.from があると「← 戻る」はその画面を指し、押すとそこへ戻る', async () => {
    renderView({ from: '/admin/events/ev-view-1/edit' })
    const back = screen.getByRole('link', { name: /戻る/ })
    expect(back).toHaveAttribute('href', '/admin/events/ev-view-1/edit')
    await userEvent.click(back)
    expect(await screen.findByText('イベント編集スタブ')).toBeInTheDocument()
  })

  it('state.from が無いと「← 戻る」はイベント一覧（/admin/events）を指す', async () => {
    renderView()
    const back = screen.getByRole('link', { name: /戻る/ })
    expect(back).toHaveAttribute('href', '/admin/events')
    await userEvent.click(back)
    expect(await screen.findByText('イベント一覧スタブ')).toBeInTheDocument()
  })

  it('「編集」ボタンは上下2か所にあり、どちらも編集画面（/admin-info/edit）を指す', async () => {
    renderView({ from: '/admin/events' })
    await screen.findByText('搬入・搬出')
    const edits = screen.getAllByRole('link', { name: '編集' })
    expect(edits).toHaveLength(2)
    for (const link of edits) {
      expect(link).toHaveAttribute('href', '/admin/events/ev-view-1/admin-info/edit')
    }
  })

  it('読み込み中は上の「編集」ボタンだけが出る', () => {
    vi.mocked(api.events.getAdminInfo).mockReturnValue(new Promise(() => {}))
    renderView()
    expect(screen.getAllByRole('link', { name: '編集' })).toHaveLength(1)
  })

  it.each([0, 1])('%i 番目の「編集」を押すと編集画面へ移り、state.from が引き継がれる', async (index) => {
    renderView({ from: '/admin/events' })
    await screen.findByText('搬入・搬出')
    await userEvent.click(screen.getAllByRole('link', { name: '編集' })[index])
    expect(await screen.findByText('編集画面スタブ')).toBeInTheDocument()
    expect(screen.getByTestId('probe-path')).toHaveTextContent('/admin/events/ev-view-1/admin-info/edit')
    expect(probeState()).toEqual({ from: '/admin/events' })
  })

  it('保存後（saved: true）に来た画面から「編集」を押しても saved は渡らず from だけが引き継がれる', async () => {
    renderView({ from: '/admin/events', saved: true })
    await screen.findByText('搬入・搬出')
    await userEvent.click(screen.getAllByRole('link', { name: '編集' })[0])
    expect(await screen.findByText('編集画面スタブ')).toBeInTheDocument()
    expect(probeState()).toEqual({ from: '/admin/events' })
  })
})

// ---- 収支からの補完 ----

describe('EventAdminInfoView — 出店料・宿泊料金を収支から補う', () => {
  it('管理情報の出店料・宿泊料金が未入力で収支に値があると、収支の値に「（収支から）」を添えて表示する', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EMPTY_INFO)
    vi.mocked(api.events.getFinances).mockResolvedValue({ ...ZERO_FINANCES, booth_fee: 15000, accommodation: 7000 })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('出店料')).toHaveTextContent('15,000円（収支から）')
    expect(rowValue('宿泊料金')).toHaveTextContent('7,000円（収支から）')
    expect(api.events.getFinances).toHaveBeenCalledWith('ev-view-1')
  })

  it('補った出店料があると支払い状況は「未入力」ではなく「未払い」になる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EMPTY_INFO)
    vi.mocked(api.events.getFinances).mockResolvedValue({ ...ZERO_FINANCES, booth_fee: 15000 })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(within(rowValue('支払い状況')).getByText('未払い')).toBeInTheDocument()
  })

  it('宿泊料金だけを補ったときは、出店料関連が未入力なので支払い状況は「未入力」のまま', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EMPTY_INFO)
    vi.mocked(api.events.getFinances).mockResolvedValue({ ...ZERO_FINANCES, accommodation: 7000 })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('宿泊料金')).toHaveTextContent('7,000円（収支から）')
    expect(rowValue('支払い状況')).toHaveTextContent('未入力')
  })

  it('「まだ管理情報が登録されていません」は管理情報だけで判定し、収支から補った値があっても出る', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EMPTY_INFO)
    vi.mocked(api.events.getFinances).mockResolvedValue({ ...ZERO_FINANCES, booth_fee: 15000, accommodation: 7000 })
    renderView()
    expect(await screen.findByText(/まだ管理情報が登録されていません/)).toBeInTheDocument()
    expect(rowValue('出店料')).toHaveTextContent('15,000円（収支から）')
  })

  it('収支の出店料・宿泊費が 0 のときは補わず「未入力」のまま（「（収支から）」も出ない）', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue(EMPTY_INFO)
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('出店料')).toHaveTextContent('未入力')
    expect(rowValue('宿泊料金')).toHaveTextContent('未入力')
    expect(screen.queryByText('（収支から）')).not.toBeInTheDocument()
  })

  it('管理情報に値があれば収支の値は使わない（管理情報の 0 も「0円」として優先する）', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, booth_fee: 0, hotel_fee: 5000 })
    vi.mocked(api.events.getFinances).mockResolvedValue({ ...ZERO_FINANCES, booth_fee: 9999, accommodation: 8888 })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('出店料')).toHaveTextContent(/^0円$/)
    expect(rowValue('宿泊料金')).toHaveTextContent(/^5,000円$/)
    expect(screen.queryByText('（収支から）')).not.toBeInTheDocument()
  })

  it('収支（getFinances）の読み込みに失敗しても、エラーを出さず管理情報を表示する', async () => {
    vi.mocked(api.events.getFinances).mockRejectedValue(new Error('500'))
    renderView()
    await screen.findByText('搬入・搬出')
    expect(screen.queryByText(/読み込みに失敗しました/)).not.toBeInTheDocument()
    expect(rowValue('出店料')).toHaveTextContent('14,000円')
    expect(rowValue('ホテル名')).toHaveTextContent('テストホテル')
    expect(screen.getAllByRole('link', { name: '編集' })).toHaveLength(2)
  })

  it('収支の読み込みに失敗し、管理情報の出店料も未入力なら「未入力」になる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, hotel_name: 'ホテル' })
    vi.mocked(api.events.getFinances).mockRejectedValue(new Error('500'))
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('出店料')).toHaveTextContent('未入力')
    expect(rowValue('支払い状況')).toHaveTextContent('未入力')
  })
})

// ---- 空白だけの文字列 ----

describe('EventAdminInfoView — 空白だけの文字列は未入力', () => {
  it('ホテル名・支払い方法・要項の文章・メモが空白・改行だけなら「未入力」になる', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({
      ...EMPTY_INFO,
      booth_fee: 1000,
      hotel_name: '   ',
      booth_fee_pay_method: '\u3000',
      guidelines_text: ' \n\t ',
      notes: '\n\n',
    })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('ホテル名')).toHaveTextContent('未入力')
    expect(rowValue('支払い方法')).toHaveTextContent('未入力')
    // 要項の文章（1）・画像（1）・メモ（1）・搬入搬出（2）・宿泊料金（1）・期限（1）・ホテル名（1）・支払い方法（1）
    expect(screen.getAllByText('未入力')).toHaveLength(9)
  })

  it('文字列の項目が空白だけで、ほかも未入力なら「まだ管理情報が登録されていません」が出て、支払い状況も「未入力」', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({
      ...EMPTY_INFO,
      hotel_name: '  ',
      booth_fee_pay_method: ' ',
      booth_fee_due: ' ',
      notes: ' \n ',
      guidelines_text: '\t',
      carry_in_time: ' ',
    })
    renderView()
    expect(await screen.findByText(/まだ管理情報が登録されていません/)).toBeInTheDocument()
    expect(rowValue('支払い状況')).toHaveTextContent('未入力')
    expect(screen.queryByText('未払い')).not.toBeInTheDocument()
  })

  it('支払い方法だけが空白だと出店料関連は未入力扱いで、支払い状況は「未入力」', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, hotel_name: 'ホテル', booth_fee_pay_method: '  ' })
    renderView()
    await screen.findByText('搬入・搬出')
    expect(rowValue('支払い状況')).toHaveTextContent('未入力')
  })

  it('表示する文章は trim しない（前後の空白・改行もそのまま表示する）', async () => {
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ ...EMPTY_INFO, notes: '  先頭に空白\n末尾に改行\n', guidelines_text: '\n要項 ' })
    renderView()
    const memo = await screen.findByText(/先頭に空白/)
    expect(memo.textContent).toBe('  先頭に空白\n末尾に改行\n')
    expect(screen.getByText(/要項/, { selector: 'p' }).textContent).toBe('\n要項 ')
  })
})

// ---- 「← 戻る」のタップ領域 ----

describe('EventAdminInfoView — 「← 戻る」のタップ領域', () => {
  it('「← 戻る」は inline-block で上下に 12px の余白があり、タップしやすい', () => {
    renderView()
    const back = screen.getByRole('link', { name: /戻る/ })
    expect(back).toHaveStyle({ display: 'inline-block', paddingTop: '12px', paddingBottom: '12px' })
  })
})
