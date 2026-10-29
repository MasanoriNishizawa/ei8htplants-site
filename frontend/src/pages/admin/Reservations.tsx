import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type Event, type WsSession } from '../../lib/api'
import { STATUS_LABELS, STATUS_COLORS, STATUS_OPTIONS } from '../../lib/reservationConstants'
import { formatJstDate, todayJst } from '../../lib/localDate'
import { clickableProps } from './a11y'
import { failMessage, statusOf } from './errorMessage'
import { buildReservationPrintHtml, type ReservationWithTime } from './reservationPrint'

/** エラーの帯の見た目（画面の上・当日参加のモーダルで共通の赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/**
 * 印刷用ウィンドウを開き、純粋なHTML生成関数の結果を表示する。
 * @param rows - 印刷対象の予約一覧
 * @param eventName - 印刷タイトルに使うイベント名
 * @param sessionsData - セッションIDからセッション情報を引くマップ
 * @param event - 日付・時間枠で分類するイベント。nullならフラット表示
 * @returns 戻り値なし。ポップアップが開けない場合は何も書き込まない
 */
function printReservations(
  rows: ReservationWithTime[],
  eventName: string,
  sessionsData: Map<string, WsSession>,
  event: Event | null,
) {
  // ポップアップを先に開き、ブロックされた場合は画面を変更しない。
  /** 印刷用に開いたウィンドウ */
  const win = window.open('', '_blank')
  if (!win) return

  win.document.write(buildReservationPrintHtml(rows, eventName, sessionsData, event, new Date()))
  win.document.close()
}

/**
 * 全イベント横断の WS 予約一覧。イベント絞り込み・ステータス更新・印刷（PDF）・当日参加の追加に対応するページ
 * URL: /admin/reservations（?event_id= でイベントを、?past=1 で過去のタブを最初から選べる）
 * @returns タブ・絞り込み・予約の一覧（スマホはカード、PC は表）と、詳細・当日参加のモーダル
 */
export default function AdminReservations() {
  /** URL のクエリ（event_id・past） */
  const [searchParams] = useSearchParams()
  /** 全イベントの予約（時間ラベル付き） */
  const [rows, setRows] = useState<ReservationWithTime[]>([])
  /** イベント ID → イベント名 */
  const [eventsMap, setEventsMap] = useState<Map<string, string>>(new Map())
  /** イベント ID → イベントの情報（印刷の日付・セッション分けに使う） */
  const [eventsDataMap, setEventsDataMap] = useState<Map<string, Event>>(new Map())
  /** セッション ID → セッションの情報 */
  const [sessionsData, setSessionsData] = useState<Map<string, WsSession>>(new Map())
  /** 一覧を読み込み中か */
  const [loading, setLoading] = useState(true)
  /** ステータスを変更中の予約の id（その行の select を無効にする） */
  const [updating, setUpdating] = useState<string | null>(null)
  /** 今後開催のワークショップありのイベント */
  const [upcomingWorkshopEvents, setUpcomingWorkshopEvents] = useState<Event[]>([])
  /** 過去のワークショップありのイベント */
  const [pastWorkshopEvents, setPastWorkshopEvents] = useState<Event[]>([])
  /** 「過去の開催」タブを表示中か（URL の ?past=1 で初期値を決める） */
  const [isPast, setIsPast] = useState(searchParams.get('past') === '1')
  /** 詳細（スライドアップ）に出している予約（null なら閉じている） */
  const [selectedRow, setSelectedRow] = useState<ReservationWithTime | null>(null)
  /** 当日参加の追加モーダルを開いているか */
  const [showWalkin, setShowWalkin] = useState(false)
  /** 当日参加のイベント id */
  const [walkinEventId, setWalkinEventId] = useState('')
  /** 当日参加で選べる時間枠（その日の残り枠つき） */
  const [walkinSessions, setWalkinSessions] = useState<WsSession[]>([])
  /** 当日参加で選んだ時間枠の id */
  const [walkinSessionId, setWalkinSessionId] = useState('')
  /** 当日参加の人数 */
  const [walkinParticipants, setWalkinParticipants] = useState(1)
  /** 当日参加の参加日（今日。YYYY-MM-DD） */
  const [walkinDate, setWalkinDate] = useState('')
  /** 当日参加を登録中か */
  const [walkinSaving, setWalkinSaving] = useState(false)
  /** 当日参加の時間枠を読み込み中か */
  const [walkinSessionsLoading, setWalkinSessionsLoading] = useState(false)
  /** 一覧の読み込み・ステータス変更の失敗の文言（画面の上に出す。空なら出さない） */
  const [pageError, setPageError] = useState('')
  /** 当日参加の追加・時間枠の読み込みの失敗の文言（モーダルの中に出す） */
  const [walkinError, setWalkinError] = useState('')
  /** 絞り込み中のイベントの id（'all' はタブのすべての WS イベント。URL の event_id があれば初期値にする） */
  const [eventFilter, setEventFilter] = useState<string>(searchParams.get('event_id') ?? 'all')
  /**
   * 画面を開いたときに URL に event_id があったかどうか。読み込みは最初の 1 回だけなので、
   * そのときの値を ref に控えて effect から読む（URL が後で変わっても読み込み直さない）
   */
  const hadEventIdParam = useRef(!!searchParams.get('event_id'))

  /*
   * 画面を開いたときに一度だけ読み込む
   * 1. 予約・今後のイベント・過去のイベントをまとめて取得する
   * 2. イベントの対応表と、WS ありのイベントの一覧を作る
   * 3. URL に event_id が無ければ、今日開催の WS イベントで絞り込む
   * 4. 予約があるイベントの時間枠を取得し、予約に時間ラベルを付ける
   */
  useEffect(() => {
    // 1. まとめて取得
    Promise.all([
      api.reserve.list(),
      api.events.list(false),
      api.events.list(true),
    ]).then(async ([reservations, upcoming, past]) => {
      // 2. 対応表
      /** 今後と過去のすべてのイベント */
      const allEvents: Event[] = [...upcoming, ...past]
      /** イベント ID → イベント名 */
      const eMap = new Map<string, string>(allEvents.map((e) => [e.id, e.name]))
      /** イベント ID → イベント */
      const edMap = new Map<string, Event>(allEvents.map((e) => [e.id, e]))
      setEventsMap(eMap)
      setEventsDataMap(edMap)
      /** 今後の WS ありのイベント */
      const upcomingWs = upcoming.filter((e) => e.has_workshop)
      /** 過去の WS ありのイベント */
      const pastWs = past.filter((e) => e.has_workshop)
      setUpcomingWorkshopEvents(upcomingWs)
      setPastWorkshopEvents(pastWs)

      // 3. URL に event_id 指定がなければ、本日開催のWSイベントで自動絞り込み
      if (!hadEventIdParam.current) {
        /** 今日の日付（日本時間） */
        const today = todayJst()
        /** 今日開催している WS イベント（複数あれば最初の1つ） */
        const todayEvent = upcomingWs.find((e) => e.start_date <= today && (e.end_date ?? e.start_date) >= today)
        if (todayEvent) setEventFilter(todayEvent.id)
      }

      // 4. session_id を持つ予約が存在するイベントのセッション情報を非同期で一括取得する。
      // 1イベントの取得に失敗しても一覧は出したいので、イベントごとに失敗を受け止める（その分の時間は preferred_time で表示）
      /** 時間枠を取りに行くイベントの id（重複なし） */
      const eventIds = [...new Set(reservations.filter((r) => r.session_id).map((r) => r.event_id))]
      /** セッション ID → セッション */
      const sMap = new Map<string, WsSession>()
      /** どれか1つでも時間枠の取得に失敗したか */
      let sessionFailed = false
      await Promise.all(eventIds.map(async (eid) => {
        try {
          /** このイベントの時間枠 */
          const sessions = await api.events.getSessions(eid)
          sessions.forEach((s) => sMap.set(s.id, s))
        } catch {
          sessionFailed = true
        }
      }))
      setSessionsData(sMap)
      setRows(reservations.map((r) => ({ ...r, session_time: r.session_id ? sMap.get(r.session_id)?.time_label : undefined })))
      if (sessionFailed) setPageError('一部のイベントの時間枠を読み込めませんでした。時間の表示や印刷の枠分けが不完全な場合があります')
    }).catch((e: unknown) => {
      // 予約・イベントの一覧自体が取れなかったときは「予約はありません」と区別できるようにエラーを出す
      setPageError(failMessage('予約一覧の読み込みに失敗しました', e))
    }).finally(() => setLoading(false))
  }, [])

  /**
   * 予約のステータスを変更する
   * 画面の値はサーバーが受け付けたあとにだけ書き換える。失敗したら元の値のまま（select も元の値に戻る）にしてエラーを出す
   * （満席で戻せない 409 は専用の文言にする）
   * @param id - 予約の id
   * @param status - 新しいステータス
   * @returns 戻り値なし。
   */
  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    setPageError('')
    try {
      /** サーバーが更新したあとの予約 */
      const updated = await api.reserve.updateStatus(id, status)
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r))
      setSelectedRow((prev) => prev?.id === id ? { ...prev, ...updated } : prev)
    } catch (e) {
      // キャンセルから受付済に戻すとき、時間枠が満席だとサーバーは 409 を返す
      setPageError(statusOf(e) === 409
        ? failMessage('満席のため受付済に戻せません。元の状態のままです', e)
        : failMessage('ステータスの変更に失敗しました。元の状態のままです', e))
    } finally {
      setUpdating(null)
    }
  }

  /**
   * 当日参加の時間枠を読み込む（選択と人数は初期化する）。失敗したらモーダルの中にエラーを出す
   * @param eventId - イベントの id
   * @param date - 参加日（YYYY-MM-DD）
   * @returns 戻り値なし。
   */
  const fetchWalkinSessions = (eventId: string, date: string) => {
    setWalkinSessions([])
    setWalkinSessionId('')
    setWalkinParticipants(1)
    if (!eventId) return
    setWalkinSessionsLoading(true)
    setWalkinError('')
    api.events.getSessions(eventId, date)
      .then(setWalkinSessions)
      .catch((e: unknown) => setWalkinError(failMessage('時間枠の読み込みに失敗しました', e)))
      .finally(() => setWalkinSessionsLoading(false))
  }

  /**
   *  当日参加のモーダルを開く。今日開催のイベントが1つだけなら自動で選び、その時間枠を読み込む
   * @returns 戻り値なし。
   */
  const openWalkin = () => {
    /** 今日の日付（日本時間。当日参加の参加日にする） */
    const today = todayJst()
    /** 最初から選んでおくイベントの id（決められなければ空） */
    let autoEventId = ''
    if (isPast && eventFilter !== 'all') {
      // 過去タブ: 絞り込み済みのイベントを使用
      autoEventId = eventFilter
    } else {
      // 今後タブ: 本日開催のWSイベントを自動特定
      /** 今日開催している WS イベント */
      const todayEvents = upcomingWorkshopEvents.filter(
        (e) => e.start_date <= today && (e.end_date ?? e.start_date) >= today
      )
      autoEventId = todayEvents.length === 1 ? todayEvents[0].id : ''
    }
    setWalkinDate(today)
    setWalkinEventId(autoEventId)
    setWalkinSessionId('')
    setWalkinParticipants(1)
    setWalkinSessions([])
    setWalkinError('')
    setShowWalkin(true)
    if (autoEventId) fetchWalkinSessions(autoEventId, today)
  }

  /**
   * 当日参加のイベントを選び直したとき、その時間枠を読み込み直す
   * @param eventId - 選んだイベントの id
   * @returns 戻り値なし。
   */
  const onWalkinEventChange = (eventId: string) => {
    setWalkinEventId(eventId)
    fetchWalkinSessions(eventId, walkinDate)
  }


  /**
   * 当日参加を登録する。失敗したらモーダルを開いたままエラーを出す（入力は残す）
   * 1. 送る内容を作る（入力のある項目だけ足す）
   * 2. 登録できたら一覧の末尾に足し、モーダルを閉じて入力を初期値に戻す
   * 3. 失敗したら文言を出す
   * @returns 戻り値なし。
   */
  const submitWalkin = async () => {
    if (!walkinEventId) return
    setWalkinSaving(true)
    setWalkinError('')
    try {
      // 1. 送る内容
      /** 送る内容 */
      const body: Parameters<typeof api.reserve.addWalkin>[0] = { event_id: walkinEventId, participants: walkinParticipants }
      if (walkinSessionId) body.session_id = walkinSessionId
      if (walkinDate) body.preferred_date = walkinDate
      /** 選んだ時間枠（一覧に時間ラベルを出すため） */
      const session = walkinSessions.find((s) => s.id === walkinSessionId)
      // 2. 登録と画面への反映
      /** 登録された予約 */
      const created = await api.reserve.addWalkin(body)
      setRows((prev) => [...prev, { ...created, session_time: session?.time_label }])
      setShowWalkin(false)
      setWalkinEventId('')
      setWalkinSessionId('')
      setWalkinParticipants(1)
      setWalkinDate('')
      setWalkinSessions([])
    } catch (e) {
      // 3. 失敗
      setWalkinError(failMessage('当日参加の追加に失敗しました', e))
    } finally {
      setWalkinSaving(false)
    }
  }

  /** いまのタブで絞り込みに出すワークショップのイベント */
  const workshopEvents = isPast ? pastWorkshopEvents : upcomingWorkshopEvents
  /** いまのタブのワークショップのイベントの id */
  const wsEventIds = new Set(workshopEvents.map((e) => e.id))
  /**
   * 絞り込んで並べた予約（印刷もこの内容を使う）
   * 特定イベント選択時は event_id で直接絞り込み、all 時のみ wsEventIds でタブのWS予約に限定する。
   * 並びは希望日 → 希望時間（preferred_time）の順
   */
  const filtered = (eventFilter !== 'all'
    ? rows.filter((r) => r.event_id === eventFilter)
    : rows.filter((r) => wsEventIds.has(r.event_id)))
    .slice()
    .sort((a, b) => {
      // 希望日を先に比較し、同日なら希望時間の昇順で予約を並べる。
      const dateA = a.preferred_date ?? ''
      // 希望日が未入力の予約は空文字として比較する。
      const dateB = b.preferred_date ?? ''
      if (dateA !== dateB) return dateA < dateB ? -1 : 1
      /** 希望時間が未入力の予約も同じ順序で比較できるよう空文字にそろえた値 */
      const timeA = a.preferred_time ?? ''
      // 希望時間が未入力の予約は空文字として比較する。
      const timeB = b.preferred_time ?? ''
      return timeA < timeB ? -1 : timeA > timeB ? 1 : 0
    })
  /** 絞り込んだ予約のうちキャンセル以外 */
  const nonCancelled = filtered.filter((r) => r.status !== 'cancelled')
  /** キャンセル以外の参加人数の合計 */
  const totalPeople = nonCancelled.reduce((s, r) => s + r.participants, 0)
  /** 印刷のタイトルに使う名前 */
  const selectedEventName = eventFilter === 'all' ? 'WS予約一覧' : (eventsMap.get(eventFilter) ?? 'イベント')

  /** PC 用の表の見出し（「すべてのイベント」のときは、表の側でこの前に「イベント」列を足す） */
  const headers = ['受付日', 'お名前', 'メール', '電話', '希望日', '予約時間', '人数', '持込', '備考', 'ステータス']

  /**
   * 「今後の開催」「過去の開催」のタブを切り替える（絞り込みと詳細は初期化）
   * @param past - 過去のタブにするか
   * @returns 戻り値なし。
   */
  const switchTab = (past: boolean) => {
    setIsPast(past)
    setEventFilter('all')
    setSelectedRow(null)
  }

  return (
    <div>
      {/* 「今後の開催」「過去の開催」のタブ */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #dddde8' }}>
        {[{ label: '今後の開催', past: false }, { label: '過去の開催', past: true }].map(({ label, past }) => (
          <button key={label} onClick={() => switchTab(past)}
            style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${isPast === past ? '#1c2417' : 'transparent'}`, marginBottom: -2, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', color: isPast === past ? '#1c2417' : 'var(--c-muted)', fontWeight: isPast === past ? 500 : 400 }}>
            {label}
          </button>
        ))}
      </div>
      {/* 見出しと、イベントの絞り込み・当日参加の追加（今後のタブだけ）・印刷 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>WS予約一覧</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {workshopEvents.length > 0 && (
            <select
              aria-label="イベントで絞り込み"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-body)' }}
            >
              <option value="all">すべてのイベント</option>
              {[...workshopEvents].reverse().map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          )}
          {!isPast && (
            <button
              onClick={openWalkin}
              style={{ padding: '8px 18px', border: 'none', borderRadius: 4, fontSize: 13, background: '#2d3a24', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              当日参加を追加
            </button>
          )}
          {filtered.length > 0 && (
            <button
              onClick={() => printReservations(filtered, selectedEventName, sessionsData, eventFilter === 'all' ? null : (eventsDataMap.get(eventFilter) ?? null))}
              style={{ padding: '8px 20px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-body)' }}
            >
              PDF で印刷
            </button>
          )}
        </div>
      </div>

      {/* 読み込み・ステータス変更の失敗 */}
      {pageError && <p role="alert" style={errorBoxStyle}>{pageError}</p>}

      {/* 件数と人数の合計（イベント別の予約画面と同じく、キャンセルは除く） */}
      {filtered.length > 0 && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--c-muted)' }}>
          全{nonCancelled.length}件 / {totalPeople}名
        </div>
      )}

      {loading ? <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p> : (
        <>
        {/* モバイル用カードリスト */}
        <div className="reservation-cards">
          {filtered.map((r) => {
            /** ステータスのバッジの色（知らないステータスは「受付済」の色） */
            const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.pending
            return (
              <div
                key={r.id}
                {...clickableProps(() => setSelectedRow(r))}
                aria-label={`${r.name} さんの予約の詳細を開く`}
                style={{ background: '#fff', border: '1px solid #e8e8f0', borderRadius: 6, padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    {/* 予約確認メールを送れなかった予約の印 */}
                    {r.email_failed && <span style={{ display: 'inline-block', padding: '1px 6px', background: '#fff0f0', border: '1px solid #f0b0b0', borderRadius: 3, fontSize: 10, color: '#c0392b', flexShrink: 0 }}>メール未送信</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>
                    {eventFilter === 'all' && <span>{eventsMap.get(r.event_id) ?? ''} · </span>}
                    {[r.session_time ?? r.preferred_time, r.preferred_date].filter(Boolean).join(' / ') || '時間未定'}
                    {' · '}{r.participants}名
                  </div>
                </div>
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: sc.bg, color: sc.color, flexShrink: 0 }}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>
            )
          })}
          {filtered.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>予約はありません。</p>}
        </div>

        {/* PC用テーブル */}
        <div className="reservation-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
                {eventFilter === 'all' && (
                  <th style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--c-body)', whiteSpace: 'nowrap' }}>イベント</th>
                )}
                {headers.map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--c-body)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                /** ステータスのバッジの色（知らないステータスは「受付済」の色） */
                const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.pending
                /** 持ち込みの表示（植物・鉢） */
                const bringFlags = [r.bring_plant && '植物', r.bring_pot && '鉢'].filter(Boolean).join('・')
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                    {eventFilter === 'all' && (
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--c-muted)', maxWidth: 160, wordBreak: 'break-all' }}>
                        {eventsMap.get(r.event_id) ?? '-'}
                      </td>
                    )}
                    <td style={{ padding: '12px 14px', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>{formatJstDate(r.created_at)}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <span>{r.name}</span>
                      {r.email_failed && (
                        <span style={{ marginLeft: 8, display: 'inline-block', padding: '2px 7px', background: '#fff0f0', border: '1px solid #f0b0b0', borderRadius: 3, fontSize: 11, color: '#c0392b', fontWeight: 500, letterSpacing: 0.3 }}>
                          メール未送信
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>{r.email.endsWith('.invalid') ? '-' : <a href={`mailto:${r.email}`} style={{ color: '#4a6741' }}>{r.email}</a>}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{r.phone ?? '-'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: r.preferred_date ? '#1c2417' : '#ccc' }}>{r.preferred_date ?? '-'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: (r.session_time ?? r.preferred_time) ? '#1c2417' : '#ccc' }}>{r.session_time ?? r.preferred_time ?? '-'}</td>
                    <td style={{ padding: '12px 14px' }}>{r.participants}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {bringFlags || <span style={{ color: '#ccc' }}>-</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--c-muted)', minWidth: 240, maxWidth: 360, wordBreak: 'break-word' }}>{r.note ?? '-'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: sc.bg, color: sc.color }}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                        <select
                          aria-label={`${r.name} さんの予約のステータス`}
                          value={r.status}
                          disabled={updating === r.id}
                          onChange={(e) => updateStatus(r.id, e.target.value)}
                          style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #dddde8', borderRadius: 2, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {STATUS_OPTIONS.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>予約はありません。</p>}
        </div>
        </>
      )}

      {/* スライドアップ詳細（スマホのカードを押すと下から出る。暗い背景を押すと閉じる） */}
      {selectedRow && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setSelectedRow(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedRow.name} さんの予約の詳細`}
            style={{ background: '#fff', width: '100%', maxWidth: 560, borderRadius: '12px 12px 0 0', padding: '24px 20px 40px', maxHeight: '85dvh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 500, fontSize: 16 }}>{selectedRow.name}</span>
              <button onClick={() => setSelectedRow(null)} aria-label="閉じる" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--c-muted)', lineHeight: 1, padding: '4px 8px' }}>×</button>
            </div>
            {[
              ...(eventFilter === 'all' ? [{ label: 'イベント', value: eventsMap.get(selectedRow.event_id) ?? '-' }] : []),
              { label: '受付日', value: formatJstDate(selectedRow.created_at) },
              { label: 'メール', value: selectedRow.email.endsWith('.invalid') ? '-' : <a href={`mailto:${selectedRow.email}`} style={{ color: '#4a6741' }}>{selectedRow.email}</a> },
              ...(selectedRow.phone ? [{ label: '電話', value: selectedRow.phone }] : []),
              ...(selectedRow.preferred_date ? [{ label: '希望日', value: selectedRow.preferred_date }] : []),
              ...((selectedRow.session_time ?? selectedRow.preferred_time) ? [{ label: '予約時間', value: selectedRow.session_time ?? selectedRow.preferred_time }] : []),
              { label: '人数', value: `${selectedRow.participants}名` },
              { label: '持込', value: [selectedRow.bring_plant && '植物', selectedRow.bring_pot && '鉢'].filter(Boolean).join('・') || 'なし' },
              ...(selectedRow.note ? [{ label: '備考', value: selectedRow.note }] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f5', fontSize: 14 }}>
                <span style={{ color: 'var(--c-muted)', fontSize: 12 }}>{label}</span>
                <span style={{ color: 'var(--c-ink)' }}>{value}</span>
              </div>
            ))}
            <div style={{ marginTop: 20 }}>
              <label htmlFor="reservation-detail-status" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 8 }}>ステータス</label>
              <select
                id="reservation-detail-status"
                value={selectedRow.status}
                disabled={updating === selectedRow.id}
                onChange={(e) => updateStatus(selectedRow.id, e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
              >
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 当日参加モーダル（暗い背景を押すと閉じる） */}
      {showWalkin && (() => {
        /** 選んだイベント */
        const ev = walkinEventId ? eventsDataMap.get(walkinEventId) : undefined
        /** 複数日のイベントか（そのときだけ参加日を見せる） */
        const isMultiDay = ev?.end_date && ev.end_date !== ev.start_date
        /** 選んだ時間枠 */
        const selectedSession = walkinSessions.find((s) => s.id === walkinSessionId) ?? null
        /** 選んだ時間枠の残り人数（人数の選択肢の上限） */
        const remaining = selectedSession ? selectedSession.max_participants - selectedSession.reserved_count : 0
        /** 登録を押せるか（イベントを選び、時間枠があるならそれも選んだとき） */
        const canSubmit = !!walkinEventId && (!walkinSessionsLoading && walkinSessions.length > 0 ? !!walkinSessionId : true)
        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
            onClick={() => setShowWalkin(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="walkin-title"
              style={{ background: '#fff', borderRadius: 8, padding: '28px 32px', width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="walkin-title" style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>当日参加を追加</h3>

              <div style={{ marginBottom: 16 }}>
                <label htmlFor="walkin-event" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>イベント</label>
                <select id="walkin-event" value={walkinEventId} onChange={(e) => onWalkinEventChange(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}>
                  <option value="">-- 選択 --</option>
                  {(isPast ? pastWorkshopEvents : upcomingWorkshopEvents).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              {isMultiDay && (
                <div style={{ marginBottom: 16 }}>
                  {/* 参加日は今日で固定の表示なので、入力欄ではなく文字として出す */}
                  <span style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加日</span>
                  <div style={{ padding: '8px 12px', border: '1px solid #f0f0f5', borderRadius: 4, fontSize: 14, background: '#fafafa', color: 'var(--c-ink)' }}>
                    {walkinDate}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label htmlFor="walkin-session" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>時間枠</label>
                {walkinSessionsLoading ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--c-muted)' }}>読み込み中...</p>
                ) : walkinSessions.length > 0 ? (
                  <select id="walkin-session" value={walkinSessionId} onChange={(e) => { setWalkinSessionId(e.target.value); setWalkinParticipants(1) }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}>
                    <option value="">-- 選択 --</option>
                    {walkinSessions.map((s) => {
                      /** この時間枠の残り人数（0 以下は選べない） */
                      const rem = s.max_participants - s.reserved_count
                      return (
                        <option key={s.id} value={s.id} disabled={rem <= 0}>
                          {s.time_label}{'\u3000'}残{rem}枠
                        </option>
                      )
                    })}
                  </select>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--c-muted)' }}>この日の枠はありません</p>
                )}
              </div>

              {/* 参加人数（時間枠を選び、残りがあるときだけ。残り人数までの選択肢） */}
              {selectedSession && remaining > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <label htmlFor="walkin-participants" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加人数</label>
                  <select id="walkin-participants" value={walkinParticipants} onChange={(e) => setWalkinParticipants(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}>
                    {Array.from({ length: remaining }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}名</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 当日参加の追加・時間枠の読み込みの失敗 */}
              {walkinError && <p role="alert" style={{ ...errorBoxStyle, marginTop: 8 }}>{walkinError}</p>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: selectedSession && remaining > 0 ? 0 : 24 }}>
                <button onClick={() => setShowWalkin(false)}
                  style={{ padding: '8px 18px', border: '1px solid #dddde8', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                  キャンセル
                </button>
                <button onClick={submitWalkin} disabled={walkinSaving || !canSubmit || (!!selectedSession && remaining <= 0)}
                  style={{ padding: '8px 18px', background: '#2d3a24', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', opacity: (!canSubmit || (!!selectedSession && remaining <= 0)) ? 0.5 : 1 }}>
                  {walkinSaving ? '登録中...' : '登録'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
