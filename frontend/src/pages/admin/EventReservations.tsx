import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, type Event, type WsSession } from '../../lib/api'
import { formatJaMonthDayDow, todayJst } from '../../lib/localDate'
import { defaultWalkinDate, formatShortDateDow, formatWorkshopDates, isPartialWorkshopSchedule, workshopDates } from '../../lib/wsDates'
import { failMessage, statusOf } from './errorMessage'
import { saveBlob } from './saveBlob'
import { backPathFrom } from '../../lib/navigation'
import { buildReservationPrintHtml, buildReservationsCsv, type ReservationWithTime } from './eventReservationExports'
import EventReservationDetailModal from './EventReservationDetailModal'
import EventReservationsList from './EventReservationsList'
import EventWalkinReservationModal from './EventWalkinReservationModal'

/** エラーの帯の見た目（画面の上・当日参加のモーダルで共通の赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/**
 * 予約がその時間枠のものか（古い session_id は時間ラベルで照合する）
 * 日ごとの枠（session_date あり）は、時間ラベルで照合するときに予約日も同じ日であることを確かめる
 * @param r - 予約
 * @param s - 時間枠
 * @param validSessionIds - いまある時間枠の id（再保存で消えた古い session_id を見分ける）
 * @returns その時間枠の予約なら true
 */
function reservationMatchesSession(r: ReservationWithTime, s: WsSession, validSessionIds: Set<string>): boolean {
  if (r.session_id === s.id) return true
  // 1. 有効な別の枠の予約は対象外
  if (r.session_id && validSessionIds.has(r.session_id)) return false
  // 2. 時間ラベルが同じで、日ごとの枠なら予約日も同じ
  return r.preferred_time === s.time_label && (!s.session_date || r.preferred_date === s.session_date)
}

/**
 * 時間枠を日付ごとにまとめる（共通の枠は date が null の組。共通の枠を先、日ごとの枠は日付の昇順）
 * @param sessions - 時間枠
 * @returns 日付と、その日の時間枠（表示順）の組の一覧
 */
function groupSessionsByDate(sessions: WsSession[]): { date: string | null; sessions: WsSession[] }[] {
  /** 日付（共通の枠は ''）→ 時間枠 */
  const map = new Map<string, WsSession[]>()
  ;[...sessions].sort((a, b) => a.display_order - b.display_order).forEach((s) => {
    /** まとめるときの鍵 */
    const key = s.session_date ?? ''
    map.set(key, [...(map.get(key) ?? []), s])
  })
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({ date: key || null, sessions: list }))
}

/**
 * 特定イベントの WS 予約一覧。セッション別フィルタ・ステータス更新・CSV 出力・印刷・当日参加の追加に対応するページ
 * URL: /admin/events/:id/reservations
 * @returns 予約の一覧（スマホはカード、PC は表）と、詳細・当日参加のモーダル
 */
export default function AdminEventReservations() {
  /** URL の :id（対象のイベントの id） */
  const { id } = useParams<{ id: string }>()
  /** 今の画面の場所（戻り先 state.from を読むため） */
  const location = useLocation()
  /** 戻るリンクの行き先。遷移元が無いときはイベント管理へ戻る */
  const backTo = backPathFrom(location.state, '/admin/events')
  /** 対象のイベント */
  const [event, setEvent] = useState<Event | null>(null)
  /** イベントの WS セッション（時間枠） */
  const [sessions, setSessions] = useState<WsSession[]>([])
  /** このイベントの予約（時間ラベル付き） */
  const [rows, setRows] = useState<ReservationWithTime[]>([])
  /** 読み込み中か */
  const [loading, setLoading] = useState(true)
  /** 絞り込み中のセッションの id（'all' はすべて） */
  const [activeSession, setActiveSession] = useState<string>('all')
  /** ステータスを変更中の予約の id */
  const [updating, setUpdating] = useState<string | null>(null)
  /** 予約ページのリンクをコピーした直後か（2 秒で戻る） */
  const [copied, setCopied] = useState(false)
  /** クリップボードにコピーできなかったときの、手でコピーしてもらう予約ページの URL（null なら出さない） */
  const [copyFailedUrl, setCopyFailedUrl] = useState<string | null>(null)
  /** 詳細（スライドアップ）に出している予約（null なら閉じている） */
  const [selectedRow, setSelectedRow] = useState<ReservationWithTime | null>(null)
  /** 当日参加の追加モーダルを開いているか */
  const [showWalkin, setShowWalkin] = useState(false)
  /** 当日参加で選んだセッションの id */
  const [walkinSession, setWalkinSession] = useState('')
  /** セッションが無いイベントで入力する当日参加の時間 */
  const [walkinTime, setWalkinTime] = useState('')
  /** 当日参加の人数 */
  const [walkinParticipants, setWalkinParticipants] = useState(1)
  /** 当日参加の参加日（今日。YYYY-MM-DD） */
  const [walkinDate, setWalkinDate] = useState('')
  /** 当日参加を登録中か */
  const [walkinSaving, setWalkinSaving] = useState(false)
  /** 読み込み・ステータス変更の失敗の文言（画面の上に出す） */
  const [pageError, setPageError] = useState('')
  /** 当日参加の追加の失敗の文言（モーダルの中に出す） */
  const [walkinError, setWalkinError] = useState('')
  /** 当日参加のモーダルに出す、参加日に使える時間枠（共通の枠＋その日の枠。その日の残り人数つき） */
  const [walkinSessions, setWalkinSessions] = useState<WsSession[]>([])
  /** 今日使える時間枠を読み込み中か */
  const [walkinSessionsLoading, setWalkinSessionsLoading] = useState(false)
  /** 今日使える時間枠の読み込みに失敗したか（失敗したまま登録させない） */
  const [walkinSessionsFailed, setWalkinSessionsFailed] = useState(false)
  /** 参加日の枠の取得の通し番号（参加日を続けて変えたとき、古い応答を捨てる） */
  const walkinSessionsSeq = useRef(0)

  /**
   * イベント・時間枠・予約を取得し、予約にセッション時間を加えて画面状態へ反映する。
   * 1. 必須のイベントと予約を時間枠と並行して取得する。
   * 2. セッション ID から時間ラベルを引き、予約一覧に付ける。
   * 3. 失敗を画面に表示し、処理終了後に読み込み状態を解除する。
   */
  useEffect(() => {
    if (!id) return
    Promise.all([
      api.events.get(id),
      // 時間枠が取れなくても予約の一覧は出したいので、失敗は空の一覧として受け止めて知らせる
      api.events.getSessions(id).catch(() => {
        setPageError('時間枠を読み込めませんでした。時間の表示や絞り込みが不完全な場合があります')
        return [] as WsSession[]
      }),
      api.reserve.list(id),
    ]).then(([ev, sess, reservations]) => {
      /** 取得したイベント情報 */
      setEvent(ev)
      /** 取得した時間枠の一覧 */
      setSessions(sess)
      /** セッションの id → 時間ラベル */
      const sessionMap = new Map(sess.map((s) => [s.id, s.time_label]))
      /** 時間枠の表示名を追加した予約一覧 */
      setRows(reservations.map((r) => ({
        ...r,
        session_time: r.session_id ? sessionMap.get(r.session_id) : undefined,
      })))
    }).catch((e: unknown) => {
      setPageError(failMessage('予約一覧の読み込みに失敗しました', e))
    }).finally(() => setLoading(false))
  }, [id])

  /**
   * 予約のステータスを変更する
   * 画面の値はサーバーが受け付けたあとにだけ書き換える。失敗したら元の値のまま（select も元の値に戻る）にしてエラーを出す
   * （満席で戻せない 409 は専用の文言にする）
   * 1. 更新中状態と既存エラーをリセットする。
   * 2. サーバーで更新し、成功時に一覧と詳細表示へ反映する。
   * 3. 失敗時は画面にエラーを出し、最後に更新中状態を解除する。
   * @param reservationId - 予約の id
   * @param status - 新しいステータス
   * @returns 戻り値なし。
   */
  const updateStatus = async (reservationId: string, status: string) => {
    // 1. 更新中表示に切り替え、前回のエラーを消す。
    setUpdating(reservationId)
    setPageError('')
    try {
      /** サーバーが更新したあとの予約 */
      const updated = await api.reserve.updateStatus(reservationId, status)
      // 2. 一覧と開いている詳細の両方にサーバーの値を反映する。
      setRows((prev) => prev.map((r) => r.id === reservationId ? { ...r, ...updated } : r))
      setSelectedRow((prev) => prev?.id === reservationId ? { ...prev, ...updated } : prev)
    } catch (e) {
      // 3. 失敗理由に応じた文言を出し、サーバー未更新の表示値を維持する。
      setPageError(statusOf(e) === 409
        ? failMessage('満席のため受付済に戻せません。元の状態のままです', e)
        : failMessage('ステータスの変更に失敗しました。元の状態のままです', e))
    } finally {
      setUpdating(null)
    }
  }

  /** いまあるセッションの id（再保存で消えた古い session_id を見分けるため） */
  const validSessionIds = new Set(sessions.map((s) => s.id))

  /**
   * 絞り込んだあとの予約（印刷・CSV もこの内容を使う）
   * セッション再保存で UUID が変わった場合は preferred_time でフォールバック照合する（日ごとの枠は予約日も見る）
   */
  const filtered = activeSession === 'all'
    ? rows
    : rows.filter((r) => {
        /** 絞り込み中のセッション */
        const session = sessions.find((s) => s.id === activeSession)
        if (!session) return r.session_id === activeSession
        return reservationMatchesSession(r, session, validSessionIds)
      })

  /**
   * このイベントの予約ページの URL をクリップボードにコピーし、2 秒だけ「コピーしました」を出す
   * コピーできなかったとき（許可されていない・http で開いているなど）は、URL を画面に出して手でコピーしてもらう
   * @returns コピーが終わる Promise
   */
  const copyReserveLink = async () => {
    /** 公開サイトの予約ページの URL */
    const url = `https://ei8htplants.com/official/reserve?event_id=${id}`
    // 1. 以前のコピー失敗 URL を隠してクリップボードへの書き込みを試す。
    setCopyFailedUrl(null)
    try {
      // navigator.clipboard が無い環境では、ここで TypeError になり catch に入る
      await navigator.clipboard.writeText(url)
      // 2. 成功したら短時間だけ完了表示を出す。
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 3. 失敗時は手動コピーできるよう URL を画面に表示する。
      setCopyFailedUrl(url)
    }
  }

  /**
   * 当日参加を登録する。失敗したらモーダルを開いたままエラーを出す（入力は残す）
   * 1. 送る内容を作る（入力のある項目だけ足す）
   * 2. 登録できたら一覧の末尾に足し、モーダルを閉じて入力を初期値に戻す
   * 3. 失敗したら文言を出す
   * @returns 戻り値なし。
   */
  const submitWalkin = async () => {
    if (!id) return
    setWalkinSaving(true)
    setWalkinError('')
    try {
      // 1. 送る内容
      /** 送る内容 */
      const body: Parameters<typeof api.reserve.addWalkin>[0] = { event_id: id, participants: walkinParticipants }
      if (walkinSession) body.session_id = walkinSession
      if (walkinTime) body.preferred_time = walkinTime
      if (walkinDate) body.preferred_date = walkinDate
      // 2. 登録と画面への反映
      /** 登録された予約 */
      const created = await api.reserve.addWalkin(body)
      /** セッションの id → 時間ラベル（今日の枠と、イベントの全部の枠） */
      const sessionMap = new Map([...sessions, ...walkinSessions].map((s) => [s.id, s.time_label]))
      setRows((prev) => [...prev, { ...created, session_time: created.session_id ? sessionMap.get(created.session_id) : undefined }])
      setShowWalkin(false)
      setWalkinSession('')
      setWalkinTime('')
      setWalkinParticipants(1)
      setWalkinDate('')
    } catch (e) {
      // 3. 失敗
      setWalkinError(failMessage('当日参加の追加に失敗しました', e))
    } finally {
      setWalkinSaving(false)
    }
  }

  /**
   *  表示中（絞り込み後）の予約を新しいウィンドウに書き出して印刷する（ポップアップが止められたら何もしない）
   * 1. 印刷用ウィンドウを開けるか確認する。
   * 2. 純関数で生成した HTML を書き込み、文書を確定する。
   * @returns 戻り値なし。
   */
  const handlePrint = () => {
    if (!event) return
    /** 印刷用に開いたウィンドウ。ポップアップが拒否された場合は null */
    const win = window.open('', '_blank')
    if (!win) return
    // 1. 表示中のイベントと絞り込み済み予約から印刷用 HTML を生成して書き込む。
    win.document.write(buildReservationPrintHtml(event, filtered))
    // 2. 書き込みを閉じて、印刷用文書の読み込みと印刷処理を進める。
    win.document.close()
  }

  /**
   * 表示中（絞り込み後）の予約 CSV を、従来のファイル名と MIME 型で保存する。
   * 1. 純関数で CSV を生成する。
   * 2. Blob を作り、共通の saveBlob でダウンロードさせる。
   * @param currentEvent - ファイル名に使う対象イベント
   * @returns 戻り値なし。
   */
  const handleExportCsv = (currentEvent: Event) => {
    /** CSV ファイルにする文字列 */
    const csv = buildReservationsCsv(filtered)
    /** ダウンロードする UTF-8 CSV の Blob */
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    saveBlob(blob, `reservations_${currentEvent.name}_${todayJst()}.csv`)
  }

  /** 時間枠を日付ごとにまとめたもの（絞り込みボタンの並びに使う） */
  const sessionGroups = groupSessionsByDate(sessions)
  /** 日ごとの枠（session_date あり）があるか（あれば日付の小見出しを付ける） */
  const hasDatedSessions = sessions.some((s) => !!s.session_date)
  /** 当日参加の参加日に選べる日（ワークショップの実施日。過去・未来の日も含む） */
  const walkinDates = event?.has_workshop ? workshopDates(event) : []
  /** 当日参加を追加できない理由（追加できるなら空）。実施日が 1 日も無いときだけ */
  const walkinBlockedReason = event?.has_workshop && walkinDates.length === 0
    ? 'ワークショップの実施日が無いため、当日参加を追加できません'
    : ''

  /**
   * 参加日に使える時間枠（共通の枠＋その日の枠）を取り直す
   * 1. 前の枠・エラーを消して読み込み中にする
   * 2. GET sessions?date=参加日 で取り、いちばん新しい要求の応答だけをモーダルに渡す（失敗したら登録させずにエラーを出す）
   * @param date - 参加日（YYYY-MM-DD）
   * @returns 戻り値なし。
   */
  const loadWalkinSessions = (date: string) => {
    if (!id) return
    /** この要求の通し番号 */
    const seq = ++walkinSessionsSeq.current
    // 1. 初期化
    setWalkinSessions([])
    setWalkinSessionsFailed(false)
    setWalkinError('')
    setWalkinSessionsLoading(true)
    // 2. 取得
    api.events.getSessions(id, date)
      .then((list) => { if (seq === walkinSessionsSeq.current) setWalkinSessions(list) })
      .catch((e: unknown) => {
        if (seq !== walkinSessionsSeq.current) return
        setWalkinSessionsFailed(true)
        setWalkinError(failMessage('この日の時間枠を読み込めませんでした。参加日を選び直すか、閉じてもう一度開いてください', e))
      })
      .finally(() => { if (seq === walkinSessionsSeq.current) setWalkinSessionsLoading(false) })
  }

  /**
   * 当日参加のモーダルを開く
   * 1. 参加日の初めの値を決める（今日が実施日なら今日、無ければ今日より前で一番近い実施日、それも無ければ最初の実施日）
   * 2. モーダルを開き、その日の枠を読み込む（人数などの入力は前回のまま残す）
   * @returns 戻り値なし。
   */
  const openWalkin = () => {
    if (!id || !event || walkinBlockedReason) return
    // 1. 参加日の初めの値
    /** 初めの参加日 */
    const date = defaultWalkinDate(event, todayJst())
    setWalkinDate(date)
    // 2. 開いて枠を読み込む
    setShowWalkin(true)
    loadWalkinSessions(date)
  }

  /**
   * 参加日を変える。選んでいた枠を外し、その日の枠を取り直す
   * @param date - 新しい参加日（YYYY-MM-DD）
   * @returns 戻り値なし。
   */
  const changeWalkinDate = (date: string) => {
    setWalkinDate(date)
    setWalkinSession('')
    loadWalkinSessions(date)
  }

  /** キャンセル以外の予約 */
  const nonCancelled = rows.filter((r) => r.status !== 'cancelled')
  /** キャンセル以外の参加人数の合計 */
  const totalPeople = nonCancelled.reduce((s, r) => s + r.participants, 0)

  /** 画面上部の操作ボタン・セッションの絞り込みボタンの共通の見た目 */
  const btnStyle: React.CSSProperties = {
    padding: '8px 18px', border: '1px solid #dddde8', borderRadius: 4,
    fontSize: 13, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-body)',
  }

  return (
    <div>
      {/* 戻るリンク（遷移元があればそこへ、無ければイベント管理へ） */}
      <div style={{ marginBottom: 24 }}>
        <Link to={backTo} style={{ fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none' }}>
          &larr; {backTo === '/admin/events' ? 'イベント管理' : '戻る'}
        </Link>
      </div>

      {/* 左: イベント名と開催日・会場 / 右: 操作ボタン */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: '0 0 6px' }}>
            {event ? event.name : '読み込み中...'}
          </h2>
          {event && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--c-muted)' }}>
              {event.start_date}{event.end_date && event.end_date !== event.start_date ? ` 〜 ${event.end_date}` : ''}
              {event.time ? ` ${event.time}` : ''} / {event.location}
            </p>
          )}
          {/* 一部の日だけ実施するときは、WS の実施日も出す */}
          {event && isPartialWorkshopSchedule(event) && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--c-body)' }}>
              WS実施日: {formatWorkshopDates(workshopDates(event), 'ja')}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={copyReserveLink}
            style={{ ...btnStyle, background: copied ? '#f0f6f0' : '#ffffff', color: copied ? '#4a6741' : 'var(--c-body)', borderColor: copied ? '#4a6741' : '#dddde8' }}
          >
            {copied ? 'コピーしました' : '予約ページリンクをコピー'}
          </button>
          {event?.has_workshop && (
            <button
              onClick={openWalkin}
              disabled={!!walkinBlockedReason}
              aria-describedby={walkinBlockedReason ? 'walkin-blocked-reason' : undefined}
              style={{ ...btnStyle, background: '#2d3a24', color: '#fff', border: 'none', opacity: walkinBlockedReason ? 0.4 : 1, cursor: walkinBlockedReason ? 'not-allowed' : 'pointer' }}
            >
              当日参加を追加
            </button>
          )}
          {/* 印刷・CSV（予約が1件以上あるときだけ） */}
          {rows.length > 0 && (
            <>
              <button onClick={handlePrint} style={btnStyle}>印刷</button>
              <button onClick={() => event && handleExportCsv(event)} style={btnStyle}>CSV</button>
            </>
          )}
        </div>
      </div>

      {/* 当日参加を追加できない理由（ワークショップの実施日が 1 日も無いとき） */}
      {walkinBlockedReason && (
        <p id="walkin-blocked-reason" style={{ fontSize: 12, color: 'var(--c-muted)', margin: '-8px 0 16px', textAlign: 'right' }}>{walkinBlockedReason}</p>
      )}

      {/* 読み込み・ステータス変更の失敗 */}
      {pageError && <p role="alert" style={errorBoxStyle}>{pageError}</p>}

      {/* 予約ページのリンクをコピーできなかったときの案内（URL を選んで手でコピーしてもらう） */}
      {copyFailedUrl && (
        <p role="alert" style={{ ...errorBoxStyle, overflowWrap: 'anywhere' }}>
          リンクをコピーできませんでした。次の URL を選択してコピーしてください: <span style={{ userSelect: 'all', color: 'var(--c-ink)' }}>{copyFailedUrl}</span>
        </p>
      )}

      {/* 件数・人数の合計と、セッションでの絞り込みボタン */}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--c-muted)', marginRight: 4 }}>
            全{nonCancelled.length}件 / {totalPeople}名
          </span>
          {sessions.length > 0 && (
            <>
              <button
                onClick={() => setActiveSession('all')}
                style={{ ...btnStyle, background: activeSession === 'all' ? '#1c2417' : '#ffffff', color: activeSession === 'all' ? '#fff' : '#3a4535', border: `1px solid ${activeSession === 'all' ? '#1c2417' : '#dddde8'}` }}
              >
                全て
              </button>
              {/* 時間枠を日付ごとにまとめて出す（共通の枠だけなら今までどおり 1 列に並べる） */}
              {sessionGroups.map((group) => (
                <div key={group.date ?? 'common'} role="group" aria-label={group.date ? `${formatJaMonthDayDow(group.date)}の時間枠` : '共通の時間枠'} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', ...(hasDatedSessions ? { flexBasis: '100%' } : {}) }}>
                  {/* 日ごとの枠があるときだけ、日付（共通の枠は「全日程」）の小見出しを付ける */}
                  {hasDatedSessions && (
                    <span style={{ fontSize: 12, color: 'var(--c-muted)', minWidth: 72 }}>{group.date ? formatShortDateDow(group.date, 'ja') : '全日程'}</span>
                  )}
                  {group.sessions.map((s) => {
                    /** このセッションのキャンセル以外の参加人数の合計（古い session_id は時間ラベルで照合する） */
                    const count = rows
                      .filter((r) => reservationMatchesSession(r, s, validSessionIds) && r.status !== 'cancelled')
                      .reduce((sum, r) => sum + r.participants, 0)
                    return (
                      <button
                        key={s.id}
                        onClick={() => setActiveSession(s.id)}
                        aria-label={group.date ? `${formatJaMonthDayDow(group.date)} ${s.time_label}${count > 0 ? ` (${count}人)` : ''}` : undefined}
                        style={{ ...btnStyle, background: activeSession === s.id ? '#1c2417' : '#ffffff', color: activeSession === s.id ? '#fff' : '#3a4535', border: `1px solid ${activeSession === s.id ? '#1c2417' : '#dddde8'}` }}
                      >
                        {s.time_label}{count > 0 ? ` (${count}人)` : ''}
                      </button>
                    )
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>
      ) : (
        <>
          {/* 絞り込み済みの予約と更新操作だけを受け取り、表示を子コンポーネントへ委譲する */}
          <EventReservationsList
            reservations={filtered}
            updatingId={updating}
            onSelectReservation={setSelectedRow}
            onStatusUpdate={updateStatus}
          />
        </>
      )}

      {/* 予約の詳細（スマホのカードを押すと下から出る。暗い背景を押すと閉じる） */}
      {selectedRow && (
        <EventReservationDetailModal
          reservation={selectedRow}
          updating={updating === selectedRow.id}
          onClose={() => setSelectedRow(null)}
          onStatusChange={updateStatus}
        />
      )}

      {/* イベント固有の当日参加 UI だけを子へ渡し、状態と登録処理はこの画面に残す */}
      {showWalkin && (
        <EventWalkinReservationModal
          event={event}
          sessions={walkinSessions}
          sessionsLoading={walkinSessionsLoading}
          sessionsFailed={walkinSessionsFailed}
          walkinSession={walkinSession}
          walkinTime={walkinTime}
          walkinParticipants={walkinParticipants}
          walkinDate={walkinDate}
          walkinDates={walkinDates}
          onDateChange={changeWalkinDate}
          walkinSaving={walkinSaving}
          walkinError={walkinError}
          errorBoxStyle={errorBoxStyle}
          onClose={() => setShowWalkin(false)}
          onSessionChange={setWalkinSession}
          onTimeChange={setWalkinTime}
          onParticipantsChange={setWalkinParticipants}
          onSubmit={submitWalkin}
        />
      )}
    </div>
  )
}
