/**
 * 当日参加の「参加日」をワークショップの実施日から選ぶ動きのテスト（2026-11-13 追加）
 * - Reservations（全イベントの予約一覧）の当日参加モーダル（WalkinReservationModal）
 *   参加日の選択肢は実施日だけ・初めの値は defaultWalkinDate・参加日を変えると枠を取り直して選んでいた枠を外す・
 *   preferred_date で送る・実施日が無いイベントは登録できない・過去の開催のタブでもボタンが出る・
 *   満席の枠も選べて案内が出て登録できる・参加人数は 1〜10 名（2026-11-16 変更）
 * - EventReservations（イベント別の予約画面）の当日参加（EventWalkinReservationModal）
 *   同じく参加日の選択・枠の取り直し・送る内容。実施日が 0 日のときだけボタンを押せない。一部の日だけなら「WS実施日」を出す
 * - EventWalkinReservationModal 単体: 選べる日が 2 日以上なら選択欄、1 日なら文字。読み込み中は登録できない。
 *   満席の枠も選べて「残0名（満席）」と出し、選ぶと会場で調整する案内を出す（登録は止めない。2026-11-13 変更）
 * api はモックにして本番には接続しない。日付は Date だけを固定する（setTimeout などは本物のまま）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { api, type Event, type Reservation, type WsSession } from '../../../lib/api'
import AdminReservations from '../Reservations'
import AdminEventReservations from '../EventReservations'
import EventWalkinReservationModal from '../EventWalkinReservationModal'

// 使う api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: { list: vi.fn(), get: vi.fn(), getSessions: vi.fn() },
      reserve: { list: vi.fn(), updateStatus: vi.fn(), addWalkin: vi.fn() },
    },
  }
})

/** 7/1（木）〜7/4（日）の 4 日間で、ワークショップを 7/2（金）と 7/4（日）だけ実施するイベント */
const WS_EVENT = {
  id: 'ws-ev', slug: 'ws-ev', name: 'Plants Weekend', start_date: '2027-07-01', end_date: '2027-07-04', time: '10:00〜17:00',
  location: '会場', booth_number: null, address: null, official_url: null, brands: [], has_workshop: true,
  ws_requires_reservation: true, is_past: false, display_order: 1, images: [], page_content: null, daily_times: null,
  ws_dates: ['2027-07-02', '2027-07-04'],
} as Event

/** 実施日が 1 日も無い（ws_dates が全部開催期間の外）イベント */
const NO_DAY_EVENT = { ...WS_EVENT, id: 'no-day', name: '実施日なし', ws_dates: ['2027-08-01'] } as Event

/** 終わったイベント（10/1〜10/3 で、10/1 と 10/3 だけ実施） */
const PAST_EVENT = {
  ...WS_EVENT, id: 'past-ev', name: '終わったイベント', start_date: '2026-10-01', end_date: '2026-10-03', is_past: true,
  ws_dates: ['2026-10-01', '2026-10-03'],
} as Event

/** 7/2 の枠（11:00 は空きあり、13:00 は満席） */
const DAY2_SESSIONS: WsSession[] = [
  { id: 's-11', event_id: 'ws-ev', time_label: '11:00〜12:00', max_participants: 6, reserved_count: 2, display_order: 0, session_date: '2027-07-02' },
  { id: 's-13', event_id: 'ws-ev', time_label: '13:00〜14:00', max_participants: 4, reserved_count: 4, display_order: 1, session_date: '2027-07-02' },
]

/**
 * 登録したあとに API が返す予約を作る
 * @param over - 上書きする項目
 * @returns 予約
 */
function created(over: Partial<Reservation>): Reservation {
  return {
    id: 'walkin-1', event_id: 'ws-ev', name: '当日参加', email: '', phone: null, participants: 1, note: null,
    status: 'confirmed', session_id: null, bring_plant: false, bring_pot: false, preferred_date: '2027-07-02',
    preferred_time: null, created_at: '2027-07-02T00:00:00Z', email_failed: null, ...over,
  } as Reservation
}

beforeEach(() => {
  // 今日を 2026-11-13（日本時間）に固定する（WS_EVENT は開催前・PAST_EVENT は開催後）
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T03:00:00Z'))
  vi.mocked(api.events.list).mockReset().mockImplementation((past = false) => Promise.resolve(past ? [PAST_EVENT] : [WS_EVENT, NO_DAY_EVENT]))
  vi.mocked(api.events.get).mockReset().mockResolvedValue(WS_EVENT)
  // 日付の指定があればその日の枠（7/2 だけ枠あり）、無ければ全部の枠
  vi.mocked(api.events.getSessions).mockReset().mockImplementation((_id, date) =>
    Promise.resolve(!date || date === '2027-07-02' ? DAY2_SESSIONS : []))
  vi.mocked(api.reserve.list).mockReset().mockResolvedValue([])
  vi.mocked(api.reserve.addWalkin).mockReset().mockResolvedValue(created({}))
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * 選択欄の選択肢の表示（文字）を並べる
 * @param select - select 要素
 * @returns 選択肢の文字
 */
const optionTexts = (select: HTMLElement) => Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)

describe('Reservations の当日参加（参加日を実施日から選ぶ）', () => {
  /**
   * 全イベントの予約一覧を開く
   * @param url - 開く URL
   * @returns render の結果
   */
  const renderPage = (url = '/admin/reservations') =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/admin/reservations" element={<AdminReservations />} />
        </Routes>
      </MemoryRouter>,
    )

  /**
   * 当日参加のダイアログを開き、イベントを選ぶ
   * @param eventId - 選ぶイベントの id
   * @returns ダイアログ
   */
  async function openAndSelect(eventId: string) {
    fireEvent.click(await screen.findByRole('button', { name: '当日参加を追加' }))
    /** 当日参加のダイアログ */
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'イベント' }), { target: { value: eventId } })
    return dialog
  }

  it('FE-ES-01 参加日の選択肢は実施日（7/2・7/4）だけで、初めの値は最初の実施日。その日の枠を日付つきで取り、残りを「残N名」（満席は「残0名（満席）」）で出す', async () => {
    renderPage()
    const dialog = await openAndSelect(WS_EVENT.id)
    /** 参加日の選択欄 */
    const dateSelect = within(dialog).getByRole('combobox', { name: '参加日' })
    expect(optionTexts(dateSelect)).toEqual(['7月2日（金）', '7月4日（日）'])
    expect(dateSelect).toHaveValue('2027-07-02')
    await waitFor(() => expect(api.events.getSessions).toHaveBeenCalledWith(WS_EVENT.id, '2027-07-02'))
    // 残りの人数が「残N名」で出る。2026-11-16 変更: 管理者の当日参加は満席でも登録できるので、満席の枠も選べて「残0名（満席）」と出る
    expect(await within(dialog).findByRole('option', { name: '11:00〜12:00　残4名' })).not.toBeDisabled()
    expect(within(dialog).getByRole('option', { name: '13:00〜14:00　残0名（満席）' })).not.toBeDisabled()
  })

  it('FE-ES-02 参加日を変えると、その日の枠を取り直して選んでいた枠を外し、選んだ参加日（枠なし）で送る', async () => {
    renderPage()
    const dialog = await openAndSelect(WS_EVENT.id)
    // 1. 7/2 の枠を選ぶ
    const sessionSelect = await within(dialog).findByRole('combobox', { name: '時間枠' })
    fireEvent.change(sessionSelect, { target: { value: 's-11' } })
    expect(sessionSelect).toHaveValue('s-11')
    // 2. 参加日を 7/4 に変える → 7/4 の枠を取り直し、枠が無いので時間指定なしの案内
    fireEvent.change(within(dialog).getByRole('combobox', { name: '参加日' }), { target: { value: '2027-07-04' } })
    await waitFor(() => expect(api.events.getSessions).toHaveBeenCalledWith(WS_EVENT.id, '2027-07-04'))
    expect(await within(dialog).findByText('この日の枠はありません（時間指定なしで登録します）')).toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox', { name: '時間枠' })).toBeNull()
    // 3. 登録すると、選んだ参加日で、枠なしで送る
    fireEvent.click(within(dialog).getByRole('button', { name: '登録' }))
    await waitFor(() => expect(api.reserve.addWalkin).toHaveBeenCalledWith({
      event_id: WS_EVENT.id, participants: 1, preferred_date: '2027-07-04',
    }))
  })

  it('FE-ES-03 参加日を 7/4 から 7/2 に戻すと、枠を選び直すまで登録できない（前の選択は残らない）', async () => {
    renderPage()
    const dialog = await openAndSelect(WS_EVENT.id)
    fireEvent.change(await within(dialog).findByRole('combobox', { name: '時間枠' }), { target: { value: 's-11' } })
    fireEvent.change(within(dialog).getByRole('combobox', { name: '参加日' }), { target: { value: '2027-07-04' } })
    await within(dialog).findByText('この日の枠はありません（時間指定なしで登録します）')
    fireEvent.change(within(dialog).getByRole('combobox', { name: '参加日' }), { target: { value: '2027-07-02' } })
    /** 取り直した 7/2 の時間枠の選択欄 */
    const sessionSelect = await within(dialog).findByRole('combobox', { name: '時間枠' })
    expect(sessionSelect).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: '登録' })).toBeDisabled()
    // 枠を選ぶと、その日と枠で送れる
    fireEvent.change(sessionSelect, { target: { value: 's-11' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '登録' }))
    await waitFor(() => expect(api.reserve.addWalkin).toHaveBeenCalledWith({
      event_id: WS_EVENT.id, participants: 1, session_id: 's-11', preferred_date: '2027-07-02',
    }))
  })

  it('FE-ES-04 実施日が 1 日も無いイベントを選ぶと、実施日でない案内が出て登録できない', async () => {
    renderPage()
    const dialog = await openAndSelect(NO_DAY_EVENT.id)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('はこのイベントのワークショップの実施日ではありません')
    expect(within(dialog).queryByRole('combobox', { name: '参加日' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: '登録' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: '登録' }))
    expect(api.reserve.addWalkin).not.toHaveBeenCalled()
  })

  it('FE-ES-22 満席の枠も選べて「満席です。会場で調整したうえで登録してください。」が出て、登録を押すとその枠で送る（2026-11-16 追加）', async () => {
    renderPage()
    const dialog = await openAndSelect(WS_EVENT.id)
    const sessionSelect = await within(dialog).findByRole('combobox', { name: '時間枠' })
    // 満席の 13:00 を選ぶ
    fireEvent.change(sessionSelect, { target: { value: 's-13' } })
    expect(sessionSelect).toHaveValue('s-13')
    expect(within(dialog).getByRole('status')).toHaveTextContent('満席です。会場で調整したうえで登録してください。')
    // 人数を 2 名にして登録できる
    fireEvent.change(within(dialog).getByRole('combobox', { name: '参加人数' }), { target: { value: '2' } })
    const submit = within(dialog).getByRole('button', { name: '登録' })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await waitFor(() => expect(api.reserve.addWalkin).toHaveBeenCalledWith({
      event_id: WS_EVENT.id, participants: 2, session_id: 's-13', preferred_date: '2027-07-02',
    }))
  })

  it('FE-ES-23 空きのある枠では満席の案内は出ない。枠を選ぶまで参加人数の欄は出ない（2026-11-16 追加）', async () => {
    renderPage()
    const dialog = await openAndSelect(WS_EVENT.id)
    const sessionSelect = await within(dialog).findByRole('combobox', { name: '時間枠' })
    expect(within(dialog).queryByRole('combobox', { name: '参加人数' })).toBeNull()
    fireEvent.change(sessionSelect, { target: { value: 's-11' } })
    expect(within(dialog).queryByText(/満席です。/)).toBeNull()
    expect(within(dialog).getByRole('combobox', { name: '参加人数' })).toBeInTheDocument()
  })

  it('FE-ES-24 参加人数の選択肢は、残りの人数（4 名・0 名）に限らず 1〜10 名になる（2026-11-16 追加）', async () => {
    renderPage()
    const dialog = await openAndSelect(WS_EVENT.id)
    const sessionSelect = await within(dialog).findByRole('combobox', { name: '時間枠' })
    /** 1〜10 名の選択肢 */
    const expected = Array.from({ length: 10 }, (_, i) => `${i + 1}名`)
    // 残り 4 名の枠
    fireEvent.change(sessionSelect, { target: { value: 's-11' } })
    expect(optionTexts(within(dialog).getByRole('combobox', { name: '参加人数' }))).toEqual(expected)
    // 満席（残り 0 名）の枠
    fireEvent.change(sessionSelect, { target: { value: 's-13' } })
    expect(optionTexts(within(dialog).getByRole('combobox', { name: '参加人数' }))).toEqual(expected)
  })

  it('FE-ES-05 過去の開催のタブでも当日参加のボタンが出て、絞り込んだイベントの今日より前で一番近い実施日（10/3）が初めの参加日になる', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '過去の開催' }))
    fireEvent.change(await screen.findByRole('combobox', { name: 'イベントで絞り込み' }), { target: { value: PAST_EVENT.id } })
    fireEvent.click(screen.getByRole('button', { name: '当日参加を追加' }))
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    expect(within(dialog).getByRole('combobox', { name: 'イベント' })).toHaveValue(PAST_EVENT.id)
    /** 参加日の選択欄（10/1・10/3 の 2 日） */
    const dateSelect = within(dialog).getByRole('combobox', { name: '参加日' })
    expect(optionTexts(dateSelect)).toEqual(['10月1日（木）', '10月3日（土）'])
    expect(dateSelect).toHaveValue('2026-10-03')
    await waitFor(() => expect(api.events.getSessions).toHaveBeenCalledWith(PAST_EVENT.id, '2026-10-03'))
  })
})

describe('Reservations の当日参加の初めのイベント（2026-11-13 追加）', () => {
  /**
   * 全イベントの予約一覧を開く
   * @returns render の結果
   */
  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/admin/reservations']}>
        <Routes>
          <Route path="/admin/reservations" element={<AdminReservations />} />
        </Routes>
      </MemoryRouter>,
    )

  it('FE-ES-15 今後の開催のタブでは、今日が実施日の WS イベントが 1 つならそれを選び、今日を参加日にする', async () => {
    // 今日を 7/4（WS_EVENT の実施日）にする
    vi.setSystemTime(new Date('2027-07-04T03:00:00Z'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '当日参加を追加' }))
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    expect(within(dialog).getByRole('combobox', { name: 'イベント' })).toHaveValue(WS_EVENT.id)
    expect(within(dialog).getByRole('combobox', { name: '参加日' })).toHaveValue('2027-07-04')
  })

  it('FE-ES-16 過去の開催のタブで絞り込みが「すべて」なら、今日が実施日の今後のイベントがあっても選ばない', async () => {
    vi.setSystemTime(new Date('2027-07-04T03:00:00Z'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '過去の開催' }))
    fireEvent.click(screen.getByRole('button', { name: '当日参加を追加' }))
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    /** イベントの選択欄（過去のイベントだけが選択肢） */
    const select = within(dialog).getByRole('combobox', { name: 'イベント' })
    expect(select).toHaveValue('')
    expect(optionTexts(select)).toEqual(['-- 選択 --', PAST_EVENT.name])
    expect(api.events.getSessions).not.toHaveBeenCalledWith(WS_EVENT.id, expect.anything())
  })

  it('FE-ES-17 今後のタブで今日が実施日のイベントが無ければ（7/3 は実施しない日）、イベントは選ばない', async () => {
    vi.setSystemTime(new Date('2027-07-03T03:00:00Z'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '当日参加を追加' }))
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    expect(within(dialog).getByRole('combobox', { name: 'イベント' })).toHaveValue('')
  })
})

describe('EventReservations の当日参加（参加日を実施日から選ぶ）', () => {
  /**
   * イベント別の予約画面を開く
   * @param eventId - イベントの id
   * @returns render の結果
   */
  const renderPage = (eventId = WS_EVENT.id) =>
    render(
      <MemoryRouter initialEntries={[`/admin/events/${eventId}/reservations`]}>
        <Routes>
          <Route path="/admin/events/:id/reservations" element={<AdminEventReservations />} />
        </Routes>
      </MemoryRouter>,
    )

  it('FE-ES-06 一部の日だけ実施するイベントは見出しの下に「WS実施日: 7/2（金）・7/4（日）」を出す', async () => {
    renderPage()
    expect(await screen.findByText('WS実施日: 7/2（金）・7/4（日）')).toBeInTheDocument()
  })

  it('FE-ES-07 参加日の選択肢は実施日だけ・初めの値は最初の実施日。参加日を変えると枠を取り直して選んでいた枠を外し、選んだ日で送る', async () => {
    vi.mocked(api.reserve.addWalkin).mockResolvedValue(created({ preferred_date: '2027-07-04' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '当日参加を追加' }))
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    // 1. 参加日の選択肢と初めの値。その日の枠を取る
    const dateSelect = within(dialog).getByRole('combobox', { name: '参加日' })
    expect(optionTexts(dateSelect)).toEqual(['7月2日（金）', '7月4日（日）'])
    expect(dateSelect).toHaveValue('2027-07-02')
    await waitFor(() => expect(api.events.getSessions).toHaveBeenCalledWith(WS_EVENT.id, '2027-07-02'))
    // 2. 7/2 の枠を選ぶ（2026-11-13 変更: イベント別の当日参加では満席の枠も選べる。満席の扱いは FE-ES-18〜21）
    const sessionSelect = await within(dialog).findByRole('combobox', { name: '時間枠' })
    fireEvent.change(sessionSelect, { target: { value: 's-11' } })
    // 3. 参加日を 7/4 に変えると、枠を取り直し（0 件なので時間の入力欄になる）、選んでいた枠を外す
    fireEvent.change(dateSelect, { target: { value: '2027-07-04' } })
    await waitFor(() => expect(api.events.getSessions).toHaveBeenCalledWith(WS_EVENT.id, '2027-07-04'))
    expect(await within(dialog).findByRole('textbox', { name: '時間枠' })).toBeInTheDocument()
    // 4. 登録すると、7/4 で枠なしで送る
    fireEvent.click(within(dialog).getByRole('button', { name: '登録' }))
    await waitFor(() => expect(api.reserve.addWalkin).toHaveBeenCalledWith({
      event_id: WS_EVENT.id, participants: 1, preferred_date: '2027-07-04',
    }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '当日参加を追加' })).toBeNull())
  })

  it('FE-ES-08 その日の枠の読み込みに失敗すると、案内を出して登録できない', async () => {
    renderPage()
    // 画面を開いたときの枠（日付なし）は成功、当日参加の日付つきは失敗させる
    vi.mocked(api.events.getSessions).mockImplementation((_id, date) => date ? Promise.reject(new Error('通信エラー')) : Promise.resolve(DAY2_SESSIONS))
    fireEvent.click(await screen.findByRole('button', { name: '当日参加を追加' }))
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('この日の時間枠を読み込めませんでした')
    expect(within(dialog).getByRole('button', { name: '登録' })).toBeDisabled()
  })

  it('FE-ES-09 実施日が 0 日のイベントでは、当日参加のボタンを押せず理由を出す', async () => {
    vi.mocked(api.events.get).mockResolvedValue(NO_DAY_EVENT)
    renderPage(NO_DAY_EVENT.id)
    /** 当日参加のボタン */
    const button = await screen.findByRole('button', { name: '当日参加を追加' })
    await waitFor(() => expect(button).toBeDisabled())
    expect(button).toHaveAccessibleDescription('ワークショップの実施日が無いため、当日参加を追加できません')
    fireEvent.click(button)
    expect(screen.queryByRole('dialog', { name: '当日参加を追加' })).toBeNull()
  })

  it('FE-ES-10 終わったイベント（is_past）でも、実施日があればボタンを押せて、今日より前で一番近い実施日が初めの参加日になる', async () => {
    vi.mocked(api.events.get).mockResolvedValue(PAST_EVENT)
    renderPage(PAST_EVENT.id)
    /** 当日参加のボタン */
    const button = await screen.findByRole('button', { name: '当日参加を追加' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    expect(within(dialog).getByRole('combobox', { name: '参加日' })).toHaveValue('2026-10-03')
  })
})

describe('EventWalkinReservationModal の参加日（単体）', () => {
  /**
   * モーダルを開く
   * @param over - 上書きする props
   * @returns 渡した props
   */
  function renderModal(over: Partial<React.ComponentProps<typeof EventWalkinReservationModal>> = {}) {
    const props: React.ComponentProps<typeof EventWalkinReservationModal> = {
      event: WS_EVENT, sessions: DAY2_SESSIONS, walkinSession: '', walkinTime: '', walkinParticipants: 1,
      walkinDate: '2027-07-02', walkinDates: ['2027-07-02', '2027-07-04'], onDateChange: vi.fn(),
      walkinSaving: false, walkinError: '', errorBoxStyle: {}, onClose: vi.fn(), onSessionChange: vi.fn(),
      onTimeChange: vi.fn(), onParticipantsChange: vi.fn(), onSubmit: vi.fn(), ...over,
    }
    render(<EventWalkinReservationModal {...props} />)
    return props
  }

  it('FE-ES-11 選べる日が 2 日以上なら選択欄を出し、選んだ日を親へ伝える', () => {
    const props = renderModal()
    fireEvent.change(screen.getByRole('combobox', { name: '参加日' }), { target: { value: '2027-07-04' } })
    expect(props.onDateChange).toHaveBeenCalledWith('2027-07-04')
  })

  it('FE-ES-12 選べる日が 1 日なら選択欄は出さず、参加日を文字で出す', () => {
    renderModal({ walkinDates: ['2027-07-02'] })
    expect(screen.queryByRole('combobox', { name: '参加日' })).toBeNull()
    expect(screen.getByText('参加日')).toBeInTheDocument()
    expect(screen.getByText('2027-07-02')).toBeInTheDocument()
  })

  it('FE-ES-13 枠の読み込み中は「読み込み中...」を出して登録できない', () => {
    renderModal({ sessions: [], sessionsLoading: true })
    expect(screen.getByRole('status')).toHaveTextContent('読み込み中...')
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
  })

  it('FE-ES-14 枠の読み込みに失敗したときは、枠が 0 件でも登録できない', () => {
    renderModal({ sessions: [], sessionsFailed: true })
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
  })

  it('FE-ES-18 満席の枠も選択肢に出て選べ、「残0名（満席）」と出す（空きのある枠は「残4名」）', () => {
    const props = renderModal()
    expect(screen.getByRole('option', { name: '13:00〜14:00　残0名（満席）' })).not.toBeDisabled()
    expect(screen.getByRole('option', { name: '11:00〜12:00　残4名' })).not.toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: '時間枠' }), { target: { value: 's-13' } })
    expect(props.onSessionChange).toHaveBeenCalledWith('s-13')
  })

  it('FE-ES-19 満席の枠を選んでいると「満席です。会場で調整したうえで登録してください。」を出し、登録は止めない', () => {
    const props = renderModal({ walkinSession: 's-13' })
    expect(screen.getByRole('status')).toHaveTextContent('満席です。会場で調整したうえで登録してください。')
    const submit = screen.getByRole('button', { name: '登録' })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    expect(props.onSubmit).toHaveBeenCalledOnce()
  })

  it('FE-ES-20 空きのある枠を選んでいるときは満席の案内を出さない', () => {
    renderModal({ walkinSession: 's-11' })
    expect(screen.queryByText(/満席です。/)).toBeNull()
  })

  it('FE-ES-21 予約済みが定員を超えていても、残りは 0 名（マイナスにしない）と出す', () => {
    renderModal({ sessions: [{ ...DAY2_SESSIONS[1], reserved_count: 6 }], walkinSession: 's-13' })
    expect(screen.getByRole('option', { name: '13:00〜14:00　残0名（満席）' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('満席です。')
  })
})
