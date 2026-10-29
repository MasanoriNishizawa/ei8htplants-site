/**
 * 予約一覧の印刷・件数・CSV・戻るリンク・リンクのコピーのテスト
 * - Reservations（全イベントの予約一覧）: 件数がキャンセルを除いた「全N件 / M名」、
 *   印刷の空き枠がキャンセルを数えない、名前に <script> を入れても印刷の HTML ではエスケープされて実行されない
 * - EventReservations（イベント別の予約画面）: 印刷の XSS・CSV の中身・戻り先（state.from）・クリップボードの失敗
 * 印刷は window.open をモックして、書き出された HTML の文字列を調べる。api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { api, ApiError, type Event, type Reservation, type WsSession } from '../../../lib/api'
import { todayJst } from '../../../lib/localDate'
import AdminReservations from '../Reservations'
import AdminEventReservations from '../EventReservations'
import { saveBlob } from '../saveBlob'

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

// CSV の保存はファイルを作らず、渡された blob とファイル名を記録する
vi.mock('../saveBlob', () => ({ saveBlob: vi.fn(), REVOKE_DELAY_MS: 1000 }))

/** XSS を試す名前 */
const XSS_NAME = '<script>window.__printXss = 1</script><img src=x onerror="window.__printXss=2">'

/** WS ありの今後のイベント（1 日だけ。未来日にして終了済み判定に左右されないようにする） */
const EVENT = {
  id: 'ev-1', slug: 'ev-1', name: 'テスト<b>イベント</b>', start_date: '2099-06-01', end_date: null, time: '10:00〜17:00',
  location: '会場', booth_number: null, address: null, official_url: null, brands: [], has_workshop: true,
  ws_requires_reservation: true, is_past: false, display_order: 1, images: [], page_content: null, daily_times: null,
} as Event

/** 先行読み込みの競合を再現するために使う、2つ目の今後開催イベント */
const EVENT_B: Event = { ...EVENT, id: 'ev-2', slug: 'ev-2', name: '別イベント' }

/** 定員 5 名・予約済み 2 名の時間枠（空き枠表示と人数計算の確認に使う） */
const SESSION: WsSession = { id: 's-1', event_id: 'ev-1', time_label: '11:00〜12:00', max_participants: 5, reserved_count: 2, display_order: 1 }

/** イベントAの遅延応答で時間枠一覧が上書きされるかを確認する時間枠 */
const SESSION_A: WsSession = { ...SESSION, id: 's-a', event_id: EVENT.id, time_label: 'A 11:00〜12:00' }
/** 最後に選択したイベントBの時間枠として残るべきデータ */
const SESSION_B: WsSession = { ...SESSION, id: 's-b', event_id: EVENT_B.id, time_label: 'B 13:00〜14:00' }

/**
 * 予約を 1 件作る
 * @param over - 上書きする項目
 * @returns 予約
 */
function makeReservation(over: Partial<Reservation>): Reservation {
  return {
    id: 'r', event_id: 'ev-1', name: '山田', email: 'a@example.com', phone: null, participants: 1, note: null,
    status: 'pending', session_id: 's-1', bring_plant: false, bring_pot: false, preferred_date: '2099-06-01',
    preferred_time: null, created_at: '2099-05-01T00:00:00Z', email_failed: null, ...over,
  } as Reservation
}

/** 受付済み 2 名（名前に XSS）とキャンセル 3 名の予約 */
const RESERVATIONS = [
  makeReservation({ id: 'r-1', name: XSS_NAME, participants: 2, note: '=HYPERLINK("x")' }),
  makeReservation({ id: 'r-2', name: 'キャンセルした人', participants: 3, status: 'cancelled' }),
]

/** window.open の代わりに返す印刷用のウィンドウ。書き出された HTML を記録する */
let written = ''
/** 印刷用のウィンドウのモック */
const fakeWin = { document: { write: (html: string) => { written += html }, close: vi.fn() } }

beforeEach(() => {
  written = ''
  vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window)
  vi.mocked(api.events.list).mockReset().mockImplementation((past = false) => Promise.resolve(past ? [] : [EVENT]))
  vi.mocked(api.events.get).mockReset().mockResolvedValue(EVENT)
  vi.mocked(api.events.getSessions).mockReset().mockResolvedValue([SESSION])
  vi.mocked(api.reserve.list).mockReset().mockResolvedValue(RESERVATIONS)
  vi.mocked(api.reserve.updateStatus).mockReset()
  vi.mocked(api.reserve.addWalkin).mockReset()
  vi.mocked(saveBlob).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * 印刷の HTML に、予約者の入力から作られた要素（script・img）が入っていないことを確かめる
 * 1. 文字列としては &lt;script&gt; の形でエスケープされている
 * 2. HTML として読んでも、script は印刷を始める 1 つだけ（予約者の入力の script は無い）で、img も無い
 * @returns 戻り値なし。
 */
function expectEscaped() {
  // 1. エスケープされた形
  expect(written).toContain('&lt;script&gt;window.__printXss = 1&lt;/script&gt;')
  expect(written).not.toContain('<script>window.__printXss')
  expect(written).not.toContain('<img')
  // 2. HTML として読む（DOMParser はスクリプトを実行しない）
  const doc = new DOMParser().parseFromString(written, 'text/html')
  const scripts = Array.from(doc.querySelectorAll('script')).map((s) => s.textContent ?? '')
  expect(scripts.every((s) => !s.includes('__printXss'))).toBe(true)
  expect(doc.querySelector('img')).toBeNull()
  // 名前は文字として表に出ている
  expect(doc.body.textContent).toContain('<script>window.__printXss = 1</script>')
}

describe('Reservations（全イベントの予約一覧）', () => {
  /**
   * イベントで絞り込んだ予約一覧を開く
   * @returns render の結果
   */
  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/admin/reservations?event_id=ev-1']}>
        <Routes>
          <Route path="/admin/reservations" element={<AdminReservations />} />
        </Routes>
      </MemoryRouter>,
    )

  it('件数と人数はキャンセルを除いて「全1件 / 2名」になる', async () => {
    renderPage()
    expect(await screen.findByText('全1件 / 2名')).toBeInTheDocument()
  })

  it('名前に <script> を入れた予約を印刷しても、HTML ではエスケープされて実行されない', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'PDF で印刷' }))
    expect(window.open).toHaveBeenCalledWith('', '_blank')
    expectEscaped()
    // イベント名のタグもエスケープされる
    expect(written).toContain('テスト&lt;b&gt;イベント&lt;/b&gt;')
  })

  it('印刷の時間枠の見出しはキャンセルを数えず「2 / 5 名」になり、空き枠は 3 行出る', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'PDF で印刷' }))
    await waitFor(() => expect(written).not.toBe(''))
    expect(written).toContain('11:00〜12:00　2 / 5 名')
    expect(written.match(/空枠 \d+/g)).toEqual(['空枠 1', '空枠 2', '空枠 3'])
  })

  it('ポップアップが止められた（window.open が null）ときは何も書き出さず、画面も落ちない', async () => {
    vi.mocked(window.open).mockReturnValue(null)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'PDF で印刷' }))
    expect(written).toBe('')
    expect(screen.getByText('全1件 / 2名')).toBeInTheDocument()
  })

  /**
   * ステータス更新成功後に一覧表示がサーバーの値へ同期することを確かめる。
   * @returns アサーション完了時に解決する Promise
   */
  it('ステータス更新に成功すると一覧の選択値とラベルが新しい状態になる', async () => {
    /** 更新前後の表示確認に使う単独の予約 */
    const reservation = makeReservation({ id: 'r-status', name: '状態確認さん', status: 'pending' })
    /** API が返す更新後の予約 */
    const updatedReservation = { ...reservation, status: 'cancelled' }
    vi.mocked(api.reserve.list).mockResolvedValue([reservation])
    vi.mocked(api.reserve.updateStatus).mockResolvedValue(updatedReservation)
    renderPage()

    // 1. 一覧の対象予約を新しいステータスへ変更する。
    /** 一覧にある対象予約のステータス選択欄 */
    const statusSelect = await screen.findByRole('combobox', { name: '状態確認さん さんの予約のステータス' })
    fireEvent.change(statusSelect, { target: { value: 'cancelled' } })

    // 2. API 呼び出しと画面上の更新後ステータスを確かめる。
    await waitFor(() => expect(api.reserve.updateStatus).toHaveBeenCalledWith('r-status', 'cancelled'))
    await waitFor(() => expect(statusSelect).toHaveValue('cancelled'))
    expect(screen.getAllByText('キャンセル').length).toBeGreaterThan(0)
  })

  /**
   * ステータス更新失敗時に元の値を保ち、再操作可能になることを確かめる。
   * @returns アサーション完了時に解決する Promise
   */
  it('ステータス更新の一般エラーでは元の状態を保ち、エラー後も再操作できる', async () => {
    /** 更新失敗後も画面に残る予約 */
    const reservation = makeReservation({ id: 'r-status', name: '状態確認さん', status: 'pending' })
    vi.mocked(api.reserve.list).mockResolvedValue([reservation])
    vi.mocked(api.reserve.updateStatus).mockRejectedValue(new Error('通信エラー'))
    renderPage()

    // 1. 更新要求を失敗させ、2. エラー表示・値の維持・再操作可能状態を確認する。
    /** 一覧にある対象予約のステータス選択欄 */
    const statusSelect = await screen.findByRole('combobox', { name: '状態確認さん さんの予約のステータス' })
    fireEvent.change(statusSelect, { target: { value: 'cancelled' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('ステータスの変更に失敗しました。元の状態のままです（通信エラー）')
    expect(statusSelect).toHaveValue('pending')
    expect(statusSelect).toBeEnabled()
    expect(screen.getAllByText('受付済').length).toBeGreaterThan(0)
  })

  /**
   * 満席エラーでは専用文言を出し、予約状態を変えないことを確かめる。
   * @returns アサーション完了時に解決する Promise
   */
  it('満席の409では専用メッセージを表示し、元のステータスを保つ', async () => {
    /** 満席時に元の状態が維持されることを確かめる予約 */
    const reservation = makeReservation({ id: 'r-status', name: '状態確認さん', status: 'cancelled' })
    vi.mocked(api.reserve.list).mockResolvedValue([reservation])
    vi.mocked(api.reserve.updateStatus).mockRejectedValue(
      new ApiError(409, '409 この時間枠は満席のため、キャンセルを取り消せません', 'この時間枠は満席のため、キャンセルを取り消せません'),
    )
    renderPage()

    // 1. キャンセル予約を受付済へ戻そうとして、満席エラー時の表示と状態を確認する。
    /** 一覧にある対象予約のステータス選択欄 */
    const statusSelect = await screen.findByRole('combobox', { name: '状態確認さん さんの予約のステータス' })
    fireEvent.change(statusSelect, { target: { value: 'pending' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '満席のため受付済に戻せません。元の状態のままです（この時間枠は満席のため、キャンセルを取り消せません）',
    )
    expect(statusSelect).toHaveValue('cancelled')
    expect(statusSelect).toBeEnabled()
    expect(screen.getAllByText('キャンセル').length).toBeGreaterThan(0)
  })

  /**
   * 当日参加の追加モーダルを開き、対象イベントの時間枠を読み終わるまで待つ。
   * @returns 表示された当日参加ダイアログ
   */
  async function openWalkinDialog() {
    // 1. 当日参加の追加を押し、イベントを指定する前のダイアログを開く。
    fireEvent.click(await screen.findByRole('button', { name: '当日参加を追加' }))
    /** 当日参加の追加ダイアログ */
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    // 2. 未来イベントを選び、時間枠の読み込み結果がフォームに反映されるのを待つ。
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'イベント' }), { target: { value: EVENT.id } })
    await within(dialog).findByRole('option', { name: /11:00〜12:00/ })
    return dialog
  }

  /**
   * 当日参加の登録成功で選択内容が送信され、一覧へ追加されることを確かめる。
   * @returns アサーション完了時に解決する Promise
   */
  it('イベント・時間枠・人数を選んで当日参加を追加すると、正しい内容で登録して一覧へ反映し、ダイアログを閉じる', async () => {
    /** 画面に追加される当日参加の予約 */
    const createdReservation = makeReservation({
      id: 'walkin-1', event_id: EVENT.id, name: '当日参加', email: 'walkin@nomail.invalid',
      participants: 3, status: 'confirmed', session_id: SESSION.id, preferred_time: SESSION.time_label,
    })
    vi.mocked(api.reserve.list).mockResolvedValue([])
    vi.mocked(api.reserve.addWalkin).mockResolvedValue(createdReservation)
    renderPage()
    // 1. イベント・時間枠・参加人数を選ぶ。
    /** 時間枠を選択できる状態の当日参加ダイアログ */
    const dialog = await openWalkinDialog()
    fireEvent.change(within(dialog).getByRole('combobox', { name: '時間枠' }), { target: { value: SESSION.id } })
    fireEvent.change(within(dialog).getByRole('combobox', { name: '参加人数' }), { target: { value: '3' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '登録' }))

    // 2. API に正しい入力が送られ、作成行が表示されてダイアログが閉じたことを確認する。
    await waitFor(() => expect(api.reserve.addWalkin).toHaveBeenCalledWith({
      event_id: EVENT.id,
      participants: 3,
      session_id: SESSION.id,
      preferred_date: todayJst(),
    }))
    expect((await screen.findAllByText('当日参加')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: '当日参加を追加' })).not.toBeInTheDocument()
  })

  /**
   * 当日参加登録の失敗後に入力値とモーダルを維持してエラーを表示することを確かめる。
   * @returns アサーション完了時に解決する Promise
   */
  it('当日参加の登録に失敗するとダイアログと入力を保ち、画面内にエラーを表示する', async () => {
    vi.mocked(api.reserve.list).mockResolvedValue([])
    vi.mocked(api.reserve.addWalkin).mockRejectedValue(new Error('通信エラー'))
    renderPage()
    // 1. 選択内容を入力して登録要求を失敗させる。
    /** 登録失敗後も入力が残ることを確かめる当日参加ダイアログ */
    const dialog = await openWalkinDialog()
    fireEvent.change(within(dialog).getByRole('combobox', { name: '時間枠' }), { target: { value: SESSION.id } })
    fireEvent.change(within(dialog).getByRole('combobox', { name: '参加人数' }), { target: { value: '3' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '登録' }))

    // 2. エラーが出てもイベント・枠・人数が保持され、再送信可能なことを確認する。
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('当日参加の追加に失敗しました（通信エラー）')
    expect(within(dialog).getByRole('combobox', { name: 'イベント' })).toHaveValue(EVENT.id)
    expect(within(dialog).getByRole('combobox', { name: '時間枠' })).toHaveValue(SESSION.id)
    expect(within(dialog).getByRole('combobox', { name: '参加人数' })).toHaveValue('3')
    expect(within(dialog).getByRole('button', { name: '登録' })).toBeEnabled()
  })

  /**
   * 時間枠の取得失敗を正常な空枠と区別し、予約登録を止めることを確かめる。
   * @returns API失敗と登録ボタンの状態確認が完了したときに解決するPromise
   */
  it('時間枠の読み込みに失敗した場合は空枠として登録せず、登録ボタンを無効にする', async () => {
    // 1. 一覧取得と時間枠取得を設定し、空の予約一覧を表示する。
    vi.mocked(api.reserve.list).mockResolvedValue([])
    vi.mocked(api.events.getSessions).mockRejectedValue(new Error('時間枠APIエラー'))
    renderPage()

    // 2. 当日参加ダイアログでイベントを選び、読み込みエラーを確認する。
    fireEvent.click(await screen.findByRole('button', { name: '当日参加を追加' }))
    /** 時間枠の読み込みに失敗した当日参加ダイアログ */
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'イベント' }), { target: { value: EVENT.id } })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('時間枠の読み込みに失敗しました（時間枠APIエラー）')

    // 3. 通信失敗を空枠と扱わず、POSTを送らないことを確かめる。
    expect(within(dialog).getByRole('button', { name: '登録' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: '登録' }))
    expect(api.reserve.addWalkin).not.toHaveBeenCalled()
  })

  /**
   * 時間枠取得の応答順が逆転しても、最後に選択したイベントの枠だけが表示されることを確かめる。
   * @returns 非同期応答と表示のアサーション完了時に解決する Promise
   */
  it('FE-CX-06 遅れて届いたイベントAの時間枠ではなく、最後に選んだイベントBの時間枠を表示する', async () => {
    /**
     * イベントAの時間枠取得 Promise を指定した枠で完了させる。
     * @param sessions - イベントAの時間枠
     * @returns なし
     */
    let resolveSessionsA: (sessions: WsSession[]) => void = () => undefined
    /**
     * イベントBの時間枠取得 Promise を指定した枠で完了させる。
     * @param sessions - イベントBの時間枠
     * @returns なし
     */
    let resolveSessionsB: (sessions: WsSession[]) => void = () => undefined
    /** イベントAを選んだ直後にはまだ完了させないセッション取得 */
    const sessionsA = new Promise<WsSession[]>((resolve) => { resolveSessionsA = resolve })
    /** イベントBを選んだ直後にはまだ完了させないセッション取得 */
    const sessionsB = new Promise<WsSession[]>((resolve) => { resolveSessionsB = resolve })
    vi.mocked(api.events.list).mockImplementation((past = false) => Promise.resolve(past ? [] : [EVENT, EVENT_B]))
    vi.mocked(api.reserve.list).mockResolvedValue([])
    vi.mocked(api.events.getSessions).mockImplementation((eventId) => eventId === EVENT.id ? sessionsA : sessionsB)
    renderPage()

    // 1. 当日参加のダイアログを開く。
    fireEvent.click(await screen.findByRole('button', { name: '当日参加を追加' }))
    /** 2イベントを切り替えられる当日参加ダイアログ */
    const dialog = await screen.findByRole('dialog', { name: '当日参加を追加' })
    /** 当日参加のイベント選択欄 */
    const eventSelect = within(dialog).getByRole('combobox', { name: 'イベント' })
    fireEvent.change(eventSelect, { target: { value: EVENT.id } })
    await waitFor(() => expect(api.events.getSessions).toHaveBeenCalledTimes(1))
    fireEvent.change(eventSelect, { target: { value: EVENT_B.id } })
    await waitFor(() => expect(api.events.getSessions).toHaveBeenCalledTimes(2))

    // 2. 後から選んだイベントBの応答を先に返し、Bの枠が表示されることを確認する。
    resolveSessionsB([SESSION_B])
    await within(dialog).findByRole('option', { name: /B 13:00〜14:00/ })
    // 3. 先に選んだイベントAの応答を後から返し、Bの枠だけが残ることを確認する。
    resolveSessionsA([SESSION_A])
    /** 非同期応答が反映されたあとの時間枠選択欄 */
    const sessionSelect = within(dialog).getByRole('combobox', { name: '時間枠' })
    await waitFor(() => {
      expect(Array.from(sessionSelect.querySelectorAll('option')).map((option) => option.value)).toEqual(['', SESSION_B.id])
    })
  })
})

describe('EventReservations（イベント別の予約画面）', () => {
  /**
   * イベント別の予約画面を開く
   * @param state - 移動するときの location.state（戻り先）
   * @returns render の結果
   */
  const renderPage = (state?: unknown) =>
    render(
      <MemoryRouter initialEntries={[{ pathname: '/admin/events/ev-1/reservations', state }]}>
        <Routes>
          <Route path="/admin/events/:id/reservations" element={<AdminEventReservations />} />
        </Routes>
      </MemoryRouter>,
    )

  /**
   * 詳細モーダルの表示・更新に使う予約をモック一覧へ設定する。
   * 1. 詳細欄の各項目を区別できる予約を作る。
   * 2. 予約一覧 API のモックへ設定し、作成した予約を返す。
   * @returns 詳細モーダルのテストで使う予約。
   */
  const setDetailReservation = () => {
    /** 詳細欄で各予約情報が見分けられるよう、固有値を持たせた予約 */
    const reservation = makeReservation({
      id: 'r-detail', name: '詳細確認さん', email: 'detail@example.com', phone: '090-1234-5678',
      participants: 3, bring_plant: true, bring_pot: true, note: '備考の内容',
    })
    vi.mocked(api.reserve.list).mockResolvedValue([reservation])
    return reservation
  }

  it('件数と人数はキャンセルを除いて「全1件 / 2名」になる', async () => {
    renderPage()
    expect(await screen.findByText('全1件 / 2名')).toBeInTheDocument()
  })

  it('名前に <script> を入れた予約を印刷しても、HTML ではエスケープされて実行されない', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '印刷' }))
    expectEscaped()
    expect(written).toContain('テスト&lt;b&gt;イベント&lt;/b&gt; ワークショップ予約一覧')
  })

  it('CSV は BOM 付き・CRLF 区切りで、見出しと予約の行が入り、= で始まる備考には「\'」が付く', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'CSV' }))
    expect(saveBlob).toHaveBeenCalledTimes(1)
    const [blob, fileName] = vi.mocked(saveBlob).mock.calls[0]
    // ファイル名は reservations_イベント名_日付.csv
    expect(fileName).toMatch(/^reservations_テスト<b>イベント<\/b>_\d{4}-\d{2}-\d{2}\.csv$/)
    expect(blob.type).toBe('text/csv;charset=utf-8;')
    // Blob.text() は先頭の BOM を取り除いてしまうので、バイト列で先頭が EF BB BF（BOM）かを確かめる
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    const lines = text.split('\r\n')
    expect(lines[0].startsWith('﻿受付日,お名前,メール')).toBe(true)
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(lines[1]).toContain('"11:00〜12:00"')
  })

  it('state.from が無いときは戻るリンクが「イベント管理」で /admin/events を指す', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: /イベント管理/ })
    expect(link).toHaveAttribute('href', '/admin/events')
  })

  it('state.from があるときは戻るリンクが「戻る」でその場所を指す', async () => {
    renderPage({ from: '/admin/reservations?event_id=ev-1' })
    const link = await screen.findByRole('link', { name: /戻る/ })
    expect(link).toHaveAttribute('href', '/admin/reservations?event_id=ev-1')
  })

  it('予約ページのリンクのコピーに成功すると「コピーしました」になる', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '予約ページリンクをコピー' }))
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('https://ei8htplants.com/official/reserve?event_id=ev-1')
  })

  it('コピーに失敗すると、手でコピーしてもらう URL の案内が出る', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '予約ページリンクをコピー' }))
    expect(await screen.findByText(/リンクをコピーできませんでした/)).toBeInTheDocument()
    expect(screen.getByText('https://ei8htplants.com/official/reserve?event_id=ev-1')).toBeInTheDocument()
  })

  it('navigator.clipboard が無い環境でも、URL の案内が出て画面は落ちない', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '予約ページリンクをコピー' }))
    expect(await screen.findByText(/リンクをコピーできませんでした/)).toBeInTheDocument()
  })

  it('FE-CY-01 モバイルカードから詳細を開くと予約情報が表示される', /**
   * 画面上のモバイルカードを操作し、予約情報が詳細に出ることを確認する。
   * @returns {Promise<void>} 表示確認が完了したときに解決する。
   */
  async () => {
    setDetailReservation()
    renderPage()

    // 1. 一覧のモバイルカードから予約詳細を開く。
    fireEvent.click(await screen.findByLabelText('詳細確認さん さんの予約の詳細を開く'))
    /** 名前付き予約情報が表示される詳細ダイアログ */
    const dialog = await screen.findByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })

    // 2. 予約者と予約内容が詳細画面に表示される。
    expect(within(dialog).getByText('detail@example.com')).toBeInTheDocument()
    expect(within(dialog).getByText('090-1234-5678')).toBeInTheDocument()
    expect(within(dialog).getByText('2099-06-01')).toBeInTheDocument()
    expect(within(dialog).getByText('11:00〜12:00')).toBeInTheDocument()
    expect(within(dialog).getByText('3名')).toBeInTheDocument()
    expect(within(dialog).getByText('植物・鉢')).toBeInTheDocument()
    expect(within(dialog).getByText('備考の内容')).toBeInTheDocument()
  })

  it('FE-CY-02 詳細の内側をクリックしても閉じず、閉じる操作で閉じる', /**
   * 詳細内のクリックが閉じる操作にならず、閉じるボタンで閉じることを確認する。
   * @returns {Promise<void>} 開閉の確認が完了したときに解決する。
   */
  async () => {
    setDetailReservation()
    renderPage()
    fireEvent.click(await screen.findByLabelText('詳細確認さん さんの予約の詳細を開く'))
    /** 内側クリックと閉じるボタンの対象となる詳細ダイアログ */
    const dialog = await screen.findByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })

    // 1. 詳細内容へのクリックは背景へ伝播せず、ダイアログを保つ。
    fireEvent.click(within(dialog).getByText('備考の内容'))
    expect(screen.getByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })).toBeInTheDocument()

    // 2. 閉じるボタンを押すとダイアログを閉じる。
    fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })).not.toBeInTheDocument()
  })

  it('FE-CY-03 詳細の背景をクリックすると閉じる', /**
   * 詳細モーダルの背景を押すと閉じることを確認する。
   * @returns {Promise<void>} 背景操作の確認が完了したときに解決する。
   */
  async () => {
    setDetailReservation()
    renderPage()
    fireEvent.click(await screen.findByLabelText('詳細確認さん さんの予約の詳細を開く'))
    /** 背景クリック時に閉じる対象の詳細ダイアログ */
    const dialog = await screen.findByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })

    // 1. ダイアログ外側の背景を押すと、詳細を閉じる。
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(screen.queryByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })).not.toBeInTheDocument()
  })

  it('FE-CY-04 詳細内のステータス更新成功は一覧と詳細の両方へ反映される', /**
   * 詳細内のステータス更新が成功したとき、一覧と詳細が同じ状態になることを確認する。
   * @returns {Promise<void>} 更新結果の確認が完了したときに解決する。
   */
  async () => {
    /** ステータス更新のレスポンスに使う元の予約 */
    const reservation = setDetailReservation()
    vi.mocked(api.reserve.updateStatus).mockResolvedValue({ ...reservation, status: 'cancelled' })
    renderPage()
    fireEvent.click(await screen.findByLabelText('詳細確認さん さんの予約の詳細を開く'))
    /** ステータス更新操作を行う詳細ダイアログ */
    const dialog = await screen.findByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })

    // 1. 詳細内でキャンセルを選び、予約 API を呼ぶ。
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'ステータス' }), { target: { value: 'cancelled' } })
    await waitFor(() => expect(api.reserve.updateStatus).toHaveBeenCalledWith('r-detail', 'cancelled'))

    // 2. API 成功後、一覧のバッジと一覧・詳細の選択欄が新しい状態になる。
    expect(within(dialog).getByRole('combobox', { name: 'ステータス' })).toHaveValue('cancelled')
    /** 画面上の表にある対象予約の行。badge と select の状態確認に使う */
    const reservationRow = screen.getAllByRole('row').find((row) => row.textContent?.includes('詳細確認さん')) as HTMLElement
    await waitFor(() => expect(within(reservationRow).getByRole('combobox', { name: '詳細確認さん さんの予約のステータス' })).toHaveValue('cancelled'))
    expect(within(reservationRow).getByText('キャンセル', { selector: 'span' })).toBeVisible()
  })

  it('FE-CY-05 詳細内のステータス更新失敗は元状態を保ちエラーを表示する', /**
   * 詳細内のステータス更新が失敗したとき、元状態とエラー表示を確認する。
   * @returns {Promise<void>} 失敗時の画面確認が完了したときに解決する。
   */
  async () => {
    /** 更新失敗前後の予約情報が元状態のままか調べる予約 */
    const reservation = setDetailReservation()
    vi.mocked(api.reserve.updateStatus).mockRejectedValue(new Error('一時障害'))
    renderPage()
    fireEvent.click(await screen.findByLabelText('詳細確認さん さんの予約の詳細を開く'))
    /** 失敗後の状態を確認する詳細ダイアログ */
    const dialog = await screen.findByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })

    // 1. キャンセルを選んで失敗させる。
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'ステータス' }), { target: { value: 'cancelled' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('ステータスの変更に失敗しました。元の状態のままです（一時障害）')

    // 2. 一覧と詳細のどちらも元の受付済状態を表示し、再操作できる。
    expect(within(dialog).getByRole('combobox', { name: 'ステータス' })).toHaveValue('pending')
    /** 画面上の表にある対象予約の行。badge と select の状態確認に使う */
    const reservationRow = screen.getAllByRole('row').find((row) => row.textContent?.includes('詳細確認さん')) as HTMLElement
    expect(within(reservationRow).getByRole('combobox', { name: '詳細確認さん さんの予約のステータス' })).toHaveValue('pending')
    expect(within(reservationRow).getByText('受付済', { selector: 'span' })).toBeVisible()
    expect(reservation.status).toBe('pending')
  })
})

describe('EventReservations の CSV のファイル名の日付（日本時間）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * 時刻を固定してイベント別の予約画面を開き、CSV を出力してファイル名を返す
   * @param iso - 固定する時刻（UTC）
   * @returns 保存したファイル名
   */
  async function csvNameAt(iso: string): Promise<string> {
    // Date だけを差し替える（setTimeout などは本物のまま。画面の読み込みを待てるようにする）
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
    render(
      <MemoryRouter initialEntries={['/admin/events/ev-1/reservations']}>
        <Routes>
          <Route path="/admin/events/:id/reservations" element={<AdminEventReservations />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'CSV' }))
    return vi.mocked(saveBlob).mock.calls[0][1]
  }

  it('UTC 14:59（日本時間 23:59）なら、その日の日付になる', async () => {
    expect(await csvNameAt('2026-05-01T14:59:00Z')).toBe('reservations_テスト<b>イベント</b>_2026-05-01.csv')
  })

  it('UTC 15:00（日本時間の翌日 0:00）なら、翌日の日付になる', async () => {
    expect(await csvNameAt('2026-05-01T15:00:00Z')).toBe('reservations_テスト<b>イベント</b>_2026-05-02.csv')
  })
})
