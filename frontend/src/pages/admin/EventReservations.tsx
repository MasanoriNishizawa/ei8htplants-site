import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, type Event, type WsSession } from '../../lib/api'
import { STATUS_LABELS, STATUS_COLORS, STATUS_OPTIONS } from '../../lib/reservationConstants'
import { formatJstDate, todayJst } from '../../lib/localDate'
import { clickableProps } from './a11y'
import { failMessage, statusOf } from './errorMessage'
import { saveBlob } from './saveBlob'
import { backPathFrom } from '../../lib/navigation'
import { buildReservationPrintHtml, buildReservationsCsv, type ReservationWithTime } from './eventReservationExports'
import EventReservationDetailModal from './EventReservationDetailModal'

/** エラーの帯の見た目（画面の上・当日参加のモーダルで共通の赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
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
   * セッション再保存で UUID が変わった場合は preferred_time でフォールバック照合する
   */
  const filtered = activeSession === 'all'
    ? rows
    : rows.filter((r) => {
        if (r.session_id === activeSession) return true
        /** 絞り込み中のセッション */
        const session = sessions.find((s) => s.id === activeSession)
        if (!session) return false
        return (!r.session_id || !validSessionIds.has(r.session_id)) && r.preferred_time === session.time_label
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
      /** セッションの id → 時間ラベル */
      const sessionMap = new Map(sessions.map((s) => [s.id, s.time_label]))
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

  /** キャンセル以外の予約 */
  const nonCancelled = rows.filter((r) => r.status !== 'cancelled')
  /** キャンセル以外の参加人数の合計 */
  const totalPeople = nonCancelled.reduce((s, r) => s + r.participants, 0)

  /** 画面上部の操作ボタン・セッションの絞り込みボタンの共通の見た目 */
  const btnStyle: React.CSSProperties = {
    padding: '8px 18px', border: '1px solid #dddde8', borderRadius: 4,
    fontSize: 13, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-body)',
  }

  /** PC 用の表の見出し */
  const headers = ['受付日', 'お名前', 'メール', '電話', '予約日', '予約時間', '人数', '持込', '備考', 'ステータス']

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
              onClick={() => {
              /** 今日の日付（日本時間。当日参加の参加日にする） */
              const today = todayJst()
              setWalkinDate(today)
              setWalkinError('')
              setShowWalkin(true)
            }}
              style={{ ...btnStyle, background: '#2d3a24', color: '#fff', border: 'none' }}
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
              {sessions.map((s) => {
                /** このセッションのキャンセル以外の参加人数の合計（古い session_id は時間ラベルで照合する） */
                const count = rows.filter((r) => {
                  // 現在のセッション ID、または無効な ID を持つ古い予約の時間ラベルで照合する。
                  const matches = r.session_id === s.id ||
                    ((!r.session_id || !validSessionIds.has(r.session_id)) && r.preferred_time === s.time_label)
                  return matches && r.status !== 'cancelled'
                }).reduce((sum, r) => sum + r.participants, 0)
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSession(s.id)}
                    style={{ ...btnStyle, background: activeSession === s.id ? '#1c2417' : '#ffffff', color: activeSession === s.id ? '#fff' : '#3a4535', border: `1px solid ${activeSession === s.id ? '#1c2417' : '#dddde8'}` }}
                  >
                    {s.time_label}{count > 0 ? ` (${count}人)` : ''}
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>
      ) : (
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
                  <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>
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
          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>予約はありません。</p>
          )}
        </div>

        {/* PC用テーブル */}
        <div className="reservation-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
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
                    <td style={{ padding: '12px 14px', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>
                      {formatJstDate(r.created_at)}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{r.name}</td>
                    {/* メール（当日参加のダミーのアドレス .invalid は出さない） */}
                    <td style={{ padding: '12px 14px' }}>
                      {r.email.endsWith('.invalid') ? '-' : <a href={`mailto:${r.email}`} style={{ color: '#4a6741' }}>{r.email}</a>}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{r.phone ?? '-'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: r.preferred_date ? '#1c2417' : '#ccc' }}>
                      {r.preferred_date ?? '-'}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: (r.session_time ?? r.preferred_time) ? '#1c2417' : '#ccc' }}>
                      {r.session_time ?? r.preferred_time ?? '-'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>{r.participants}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {bringFlags || <span style={{ color: '#ccc' }}>-</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--c-muted)', maxWidth: 160 }}>{r.note ?? '-'}</td>
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
          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>予約はありません。</p>
          )}
        </div>
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

      {/* 当日参加の追加モーダル（暗い背景を押すと閉じる） */}
      {showWalkin && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowWalkin(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-walkin-title"
            style={{ background: '#fff', borderRadius: 8, padding: '28px 32px', width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="event-walkin-title" style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>当日参加を追加</h3>

            {/* 複数日のイベントのときだけ参加日を見せる */}
            {event?.end_date && event.end_date !== event.start_date && (
              <div style={{ marginBottom: 16 }}>
                {/* 参加日は今日で固定の表示なので、入力欄ではなく文字として出す */}
                <span style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加日</span>
                <div style={{ padding: '8px 12px', border: '1px solid #f0f0f5', borderRadius: 4, fontSize: 14, background: '#fafafa', color: 'var(--c-ink)' }}>
                  {walkinDate}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="event-walkin-session" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>時間枠</label>
              {/* 時間枠があれば選ぶ、無ければ時間を文字で入れる */}
              {sessions.length > 0 ? (
                <select
                  id="event-walkin-session"
                  value={walkinSession}
                  onChange={(e) => setWalkinSession(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}
                >
                  <option value="">-- 選択 --</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.time_label}</option>
                  ))}
                </select>
              ) : (
                <input
                  id="event-walkin-session"
                  type="text"
                  placeholder="例: 10:00〜11:30"
                  value={walkinTime}
                  onChange={(e) => setWalkinTime(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              )}
            </div>

            <div style={{ marginBottom: 24 }}>
              <label htmlFor="event-walkin-participants" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加人数</label>
              <input
                id="event-walkin-participants"
                type="number"
                min={1}
                value={walkinParticipants}
                onChange={(e) => setWalkinParticipants(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', textAlign: 'right', boxSizing: 'border-box' }}
              />
            </div>

            {/* 当日参加の追加の失敗 */}
            {walkinError && <p role="alert" style={errorBoxStyle}>{walkinError}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowWalkin(false)}
                style={{ padding: '8px 18px', border: '1px solid #dddde8', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}
              >
                キャンセル
              </button>
              <button
                onClick={submitWalkin}
                disabled={walkinSaving || (sessions.length > 0 && !walkinSession)}
                style={{ padding: '8px 18px', background: '#2d3a24', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', opacity: (sessions.length > 0 && !walkinSession) ? 0.5 : 1 }}
              >
                {walkinSaving ? '登録中...' : '登録'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
