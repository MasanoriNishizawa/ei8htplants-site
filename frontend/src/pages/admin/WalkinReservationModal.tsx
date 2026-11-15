import { useEffect, useRef, useState } from 'react'
import { api, type Event, type Reservation, type WsSession } from '../../lib/api'
import { failMessage } from './errorMessage'
import { RESERVE_MAX_PARTICIPANTS } from '../../lib/constants'
import { formatJaMonthDayDow } from '../../lib/localDate'
import { defaultWalkinDate, isWorkshopDay, workshopDates } from '../../lib/wsDates'
import type { ReservationWithTime } from './reservationPrint'

/** 当日参加モーダルの入力・時間枠取得・登録を担当するためのプロパティ */
interface WalkinReservationModalProps {
  /** 現在のタブに表示されている WS イベント候補 */
  events: Event[]
  /** イベント ID からイベント詳細を引く対応表 */
  eventsDataMap: Map<string, Event>
  /** 親が初期値として決めたイベント ID */
  initialEventId: string
  /** 今日の日付（YYYY-MM-DD。参加日の初めの値を決めるのに使う） */
  initialDate: string
  /** モーダルを閉じる処理 */
  onClose: () => void
  /** 登録成功後に、時間ラベルを含む予約を親へ返す処理 */
  onCreated: (created: ReservationWithTime) => void
}

/**
 * 当日参加の予約を登録するモーダル。入力、時間枠の非同期取得、POST、結果表示を担当する。
 * @param props - イベント候補、初期値、閉じる処理、登録成功時の通知
 * @returns 当日参加の登録フォーム
 */
export default function WalkinReservationModal({
  events,
  eventsDataMap,
  initialEventId,
  initialDate,
  onClose,
  onCreated,
}: WalkinReservationModalProps) {
  /** 初めに選ぶイベント ID（選択肢の events に無い ID は、表示と中身が食い違うので空にする） */
  const startEventId = events.some((event) => event.id === initialEventId) ? initialEventId : ''
  /** 現在フォームで選択しているイベント ID */
  const [eventId, setEventId] = useState(startEventId)
  /**
   * 参加日（YYYY-MM-DD）。イベントの実施日から選ぶ。初めの値は defaultWalkinDate
   * （今日が実施日なら今日、無ければ今日より前で一番近い実施日、それも無ければ最初の実施日）。
   * イベントを選んでいなければ今日。日付が変われば取得 effect が枠を取り直す
   */
  const [date, setDate] = useState(() => {
    /** 初めに選んでいるイベント */
    const initialEvent = startEventId ? eventsDataMap.get(startEventId) : undefined
    return initialEvent ? (defaultWalkinDate(initialEvent, initialDate) || initialDate) : initialDate
  })
  /** 選択中イベント・日付で予約可能な時間枠 */
  const [sessions, setSessions] = useState<WsSession[]>([])
  /** 選択中の時間枠 ID */
  const [sessionId, setSessionId] = useState('')
  /** 参加人数 */
  const [participants, setParticipants] = useState(1)
  /** 予約を登録中か */
  const [saving, setSaving] = useState(false)
  /** 時間枠を読み込み中か */
  const [sessionsLoading, setSessionsLoading] = useState(false)
  /** 時間枠の取得に失敗したか（正常な空枠と通信失敗を区別する） */
  const [sessionsFailed, setSessionsFailed] = useState(false)
  /** 時間枠取得または登録のエラー文 */
  const [error, setError] = useState('')
  /** 時間枠 GET の新旧を区別し、古い応答を無効にする連番 */
  const sessionsRequestSequence = useRef(0)
  /** state 更新前の連続クリックも含めて二重 POST を防ぐ同期フラグ */
  const savingLock = useRef(false)

  /*
   * 選択イベントまたは日付ごとの時間枠を読み込む。
   * 1. 入力が変わったら前回の選択を初期化する
   * 2. 最新の要求だけを反映し、依存値変更・閉じる操作後の応答は捨てる
   */
  useEffect(() => {
    /** この GET に割り当てた要求番号 */
    const requestSequence = ++sessionsRequestSequence.current
    /** この effect が有効な間だけ応答を反映する */
    let active = true
    // 1. 新しいイベント・日付では、古い候補と選択・エラーを消して人数を初期値に戻す。
    setSessions([])
    setSessionId('')
    setParticipants(1)
    setError('')
    setSessionsFailed(false)

    if (!eventId) {
      // 2. イベント未選択なら GET は行わず、読み込み表示だけ解除する。
      setSessionsLoading(false)
      return () => {
        active = false
      }
    }

    // 3. イベント・日付に対応する時間枠を取得し、この要求が最新かつ有効な場合だけ反映する。
    setSessionsLoading(true)
    api.events.getSessions(eventId, date)
      .then((result) => {
        if (active && requestSequence === sessionsRequestSequence.current) setSessions(result)
      })
      .catch((e: unknown) => {
        if (active && requestSequence === sessionsRequestSequence.current) {
          setSessionsFailed(true)
          setError(failMessage('時間枠の読み込みに失敗しました', e))
        }
      })
      .finally(() => {
        if (active && requestSequence === sessionsRequestSequence.current) setSessionsLoading(false)
      })

    return () => {
      // 4. 入力変更またはモーダル終了後は、保留中の応答を無効にする。
      active = false
    }
  }, [eventId, date])

  /**
   * イベント選択を更新する。
   * @param nextEventId - 選択したイベント ID
   * @returns 戻り値なし。
   */
  const changeEvent = (nextEventId: string) => {
    // 選択変更の処理時点で旧要求を無効化し、新しい effect が始まる前の応答も捨てる。
    sessionsRequestSequence.current += 1
    setEventId(nextEventId)
    // 参加日を、選んだイベントの実施日の初めの値にする
    /** 選んだイベント */
    const nextEvent = nextEventId ? eventsDataMap.get(nextEventId) : undefined
    setDate(nextEvent ? (defaultWalkinDate(nextEvent, initialDate) || initialDate) : initialDate)
  }

  /**
   * 参加日を変える（選んでいた枠・人数は取得 effect が初期値に戻し、その日の枠を取り直す）
   * @param nextDate - 選んだ参加日（YYYY-MM-DD）
   * @returns 戻り値なし。
   */
  const changeDate = (nextDate: string) => {
    // 古い日付の応答を、新しい effect が始まる前から捨てる
    sessionsRequestSequence.current += 1
    setDate(nextDate)
  }

  /**
   * 選択した時間枠を更新し、人数を初期値へ戻す。
   * @param nextSessionId - 選択した時間枠 ID
   * @returns 戻り値なし。
   */
  const changeSession = (nextSessionId: string) => {
    // 1. 時間枠を更新し、2. 新しい枠に合わせて参加人数を初期値へ戻す。
    setSessionId(nextSessionId)
    setParticipants(1)
  }

  /**
   * 当日参加を登録し、成功した場合だけ親へ作成行を返す。
   * 1. 入力値を API 形式に整える
   * 2. 成功時に時間ラベル付き予約を親へ返す
   * 3. 失敗時は入力を維持してエラーを表示する
   * @returns 登録処理の完了を表す Promise
   */
  const submit = async () => {
    if (!eventId || savingLock.current) return
    savingLock.current = true
    setSaving(true)
    setError('')
    try {
      // 1. 入力のある項目だけを登録内容へ追加する。
      /** API へ送る当日参加の内容 */
      const body: Parameters<typeof api.reserve.addWalkin>[0] = { event_id: eventId, participants }
      if (sessionId) body.session_id = sessionId
      if (date) body.preferred_date = date
      /** 選択中の時間枠。成功行へ表示用の時間を付ける */
      const selectedSession = sessions.find((session) => session.id === sessionId)

      // 2. 成功した予約だけを親へ渡す。
      /** サーバーで作成された予約 */
      const created: Reservation = await api.reserve.addWalkin(body)
      onCreated({ ...created, session_time: selectedSession?.time_label })
    } catch (e) {
      // 3. エラー時はフォーム値を変更せず、モーダル内に理由を表示する。
      setError(failMessage('当日参加の追加に失敗しました', e))
    } finally {
      savingLock.current = false
      setSaving(false)
    }
  }

  /** 現在選択中のイベント。複数日イベントでは参加日を表示する */
  const selectedEvent = eventId ? eventsDataMap.get(eventId) : undefined
  /** 選択イベントが複数日にわたるか */
  const isMultiDay = !!selectedEvent?.end_date && selectedEvent.end_date !== selectedEvent.start_date
  /** 参加日に選べる日（選んだイベントのワークショップ実施日。過去・未来の日も含む） */
  const walkinDates = selectedEvent ? workshopDates(selectedEvent) : []
  /** 現在選択中の時間枠 */
  const selectedSession = sessions.find((session) => session.id === sessionId) ?? null
  /** 選んでいる枠が満席か（当日参加は会場で調整するので登録は止めず、案内だけ出す） */
  const selectedFull = !!selectedSession && selectedSession.max_participants - selectedSession.reserved_count <= 0
  /**
   * 参加日がワークショップの実施日でないか（開催期間外・実施する日に選んでいない日）。
   * サーバーも 400 で受け付けないので、登録できなくして理由を出す
   */
  const notWorkshopDay = !!selectedEvent && !!date && !isWorkshopDay(selectedEvent, date)
  /** 必須選択が揃い、枠読み込み中・取得失敗中でなく、参加日が実施日の場合に登録可能 */
  const canSubmit = !!eventId && !notWorkshopDay && !sessionsLoading && !sessionsFailed && (sessions.length === 0 || !!sessionId)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}
    >
      {/* 背景は画面を覆って中央配置し、内側のダイアログとはクリックを分ける */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkin-title"
        style={{ background: '#fff', borderRadius: 8, padding: '28px 32px', width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ダイアログ本体は固定幅と影を持たせ、内側クリックで背景への伝播を止める */}
        <h3 id="walkin-title" style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>当日参加を追加</h3>

        {/* イベント選択は候補を親から受け取り、変更後の時間枠取得を effect に任せる */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="walkin-event" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>イベント</label>
          <select id="walkin-event" value={eventId} onChange={(e) => changeEvent(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}>
            <option value="">-- 選択 --</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
        </div>

        {/* 参加日に選べる日が 2 日以上なら、選ぶ欄を出す */}
        {walkinDates.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="walkin-date" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加日</label>
            <select id="walkin-date" value={date} onChange={(e) => changeDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}>
              {walkinDates.map((d) => (
                <option key={d} value={d}>{formatJaMonthDayDow(d)}</option>
              ))}
            </select>
          </div>
        )}

        {/* 複数日イベントで選べる日が 1 日以下なら、参加日を文字で出すだけにする */}
        {isMultiDay && walkinDates.length <= 1 && (
          <div style={{ marginBottom: 16 }}>
            {/* 参加日は親から渡された当日で固定し、複数日イベントのときだけ表示する */}
            <span style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加日</span>
            <div style={{ padding: '8px 12px', border: '1px solid #f0f0f5', borderRadius: 4, fontSize: 14, background: '#fafafa', color: 'var(--c-ink)' }}>
              {date}
            </div>
          </div>
        )}

        {/* イベント・日付に対応する時間枠を読み込み中表示または選択肢で示す */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="walkin-session" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>時間枠</label>
          {sessionsLoading ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--c-muted)' }}>読み込み中...</p>
          ) : sessions.length > 0 ? (
            <select id="walkin-session" value={sessionId} onChange={(e) => changeSession(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}>
              <option value="">-- 選択 --</option>
              {sessions.map((session) => {
                /** この時間枠の残り人数（定員を超えていても 0 と出す。当日参加は会場で調整するので、満席でも選べる） */
                const available = Math.max(0, session.max_participants - session.reserved_count)
                return (
                  <option key={session.id} value={session.id}>
                    {session.time_label}{'\u3000'}残{available}名{available === 0 ? '（満席）' : ''}
                  </option>
                )
              })}
            </select>
          ) : notWorkshopDay ? (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: '#c0392b' }}>
              {formatJaMonthDayDow(date)}はこのイベントのワークショップの実施日ではありません
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--c-muted)' }}>この日の枠はありません（時間指定なしで登録します）</p>
          )}
          {/* 選んだ枠が満席のときの案内（登録は止めない。当日参加は会場で調整して記録するため） */}
          {selectedFull && (
            <p role="status" style={{ /* 注意の文字: 小さめの橙色 */ margin: '6px 0 0', fontSize: 12, color: '#b9770e', lineHeight: 1.6 }}>
              満席です。会場で調整したうえで登録してください。
            </p>
          )}
        </div>

        {/* 参加人数は時間枠を選んだときに表示する。残りの人数では限らず、1〜RESERVE_MAX_PARTICIPANTS 名から選ぶ（満席でも会場で調整して記録する） */}
        {selectedSession && (
          <div style={{ marginBottom: 24 }}>
            <label htmlFor="walkin-participants" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加人数</label>
            <select id="walkin-participants" value={participants} onChange={(e) => setParticipants(Number(e.target.value))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}>
              {Array.from({ length: RESERVE_MAX_PARTICIPANTS }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>{count}名</option>
              ))}
            </select>
          </div>
        )}

        {/* 時間枠取得と登録の失敗を同じ赤い帯で表示する */}
        {error && <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '8px 0 16px', padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>{error}</p>}

        {/* 下部の操作列は右寄せにし、登録中以外はキャンセルを常に使える */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: selectedSession ? 0 : 24 }}>
          <button onClick={onClose}
            style={{ padding: '8px 18px', border: '1px solid #dddde8', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            キャンセル
          </button>
          <button onClick={submit} disabled={saving || !canSubmit}
            style={{ padding: '8px 18px', background: '#2d3a24', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', opacity: !canSubmit ? 0.5 : 1 }}>
            {saving ? '登録中...' : '登録'}
          </button>
        </div>
      </div>
    </div>
  )
}
