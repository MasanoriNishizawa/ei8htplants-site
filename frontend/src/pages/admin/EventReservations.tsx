import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, type Event, type Reservation, type WsSession } from '../../lib/api'
import { STATUS_LABELS, STATUS_COLORS, STATUS_OPTIONS } from '../../lib/reservationConstants'
import { escapeHtml as esc, csvCell } from '../../lib/escapeHtml'
import { formatJstDate, todayJst } from '../../lib/localDate'
import { clickableProps } from './a11y'
import { failMessage, statusOf } from './errorMessage'
import { saveBlob } from './saveBlob'
import { backPathFrom } from '../../lib/navigation'

/** 予約に、セッション ID から引いた時間ラベル（session_time）を足したもの */
type ReservationWithTime = Reservation & { session_time?: string }

/** エラーの帯の見た目（画面の上・当日参加のモーダルで共通の赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/**
 * 印刷用の HTML 文字列を生成する（新規ウィンドウで window.print() を自動実行）
 * 予約者の入力・イベント名・時間ラベル・ステータスはすべて esc（escapeHtml）を通して埋め込む
 * @param event - イベント情報（ヘッダー表示用）
 * @param rows - 印刷対象の予約一覧
 * @returns 印刷用 HTML 文字列
 */
function buildPrintHtml(event: Event, rows: ReservationWithTime[]): string {
  /** 開催日の表示（複数日なら「開始 〜 終了」） */
  const dateRange = event.end_date && event.end_date !== event.start_date
    ? `${event.start_date} 〜 ${event.end_date}`
    : event.start_date
  /** 表の行の HTML（予約1件で1行） */
  const trs = rows.map((r) => {
    /** 持ち込みの表示（植物・鉢） */
    const bring = [r.bring_plant && '植物', r.bring_pot && '鉢'].filter(Boolean).join('・')
    return `<tr>
      <td>${esc(formatJstDate(r.created_at))}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.preferred_date ?? '-')}</td>
      <td>${esc(r.session_time ?? r.preferred_time ?? '-')}</td>
      <td>${esc(r.participants)}</td>
      <td>${esc(bring || '-')}</td>
      <td>${esc(r.note ?? '-')}</td>
      <td>${esc(STATUS_LABELS[r.status] ?? r.status)}</td>
    </tr>`
  }).join('')
  /** 印刷する予約の参加人数の合計（キャンセルも含む） */
  const totalPeople = rows.reduce((s, r) => s + r.participants, 0)
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>${esc(event.name)} 予約一覧</title>
<style>
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;padding:16px 20px;color:#1c2417;}
h1{font-size:15px;font-weight:normal;margin:0 0 3px;}
p.meta{font-size:10px;color:#666;margin:0 0 14px;}
table{width:100%;border-collapse:collapse;}
th{background:#3a4535;color:#fff;padding:6px 8px;text-align:left;font-weight:normal;font-size:10px;letter-spacing:.5px;}
td{padding:5px 8px;border-bottom:1px solid #e8e8e8;vertical-align:top;}
tr:nth-child(even) td{background:#f7f7f7;}
p.total{margin:8px 0 0;font-size:10px;color:#666;}
</style></head><body>
<h1>${esc(event.name)} ワークショップ予約一覧</h1>
<p class="meta">${esc(dateRange)}${event.time ? ' ' + esc(event.time) : ''} / ${esc(event.location)}</p>
<table><thead><tr>
  <th>受付日</th><th>お名前</th><th>予約日</th><th>予約時間</th><th>人数</th><th>持込</th><th>備考</th><th>ステータス</th>
</tr></thead>
<tbody>${trs}</tbody></table>
<p class="total">合計 ${rows.length} 件 / ${totalPeople} 名</p>
<script>window.onload=()=>window.print();</script>
</body></html>`
}

/**
 * BOM 付き CSV としてダウンロードする（Excel での文字化けを防ぐため BOM を先頭に付与）
 * 各セルは csvCell で作る（= + - @ などで始まる値が Excel で数式として実行されないよう先頭に ' を付ける）
 * @param event - ファイル名に使用するイベント情報
 * @param rows - エクスポート対象の予約一覧
 * 1. 見出しと各行を CSV の文字列にする
 * 2. BOM を付けて blob にし、共通の saveBlob でダウンロードさせる
 */
function exportCsv(event: Event, rows: ReservationWithTime[]) {
  // 1. CSV の文字列
  /** 見出しの行 */
  const header = ['受付日', 'お名前', 'メール', '電話', '予約日', '予約時間', '人数', '植物持込', '鉢持込', '備考', 'ステータス']
  /** 予約ごとの行 */
  const lines = rows.map((r) => [
    formatJstDate(r.created_at),
    r.name, r.email, r.phone ?? '',
    r.preferred_date ?? '',
    r.session_time ?? r.preferred_time ?? '',
    String(r.participants),
    r.bring_plant ? 'あり' : 'なし',
    r.bring_pot ? 'あり' : 'なし',
    r.note ?? '', STATUS_LABELS[r.status] ?? r.status,
  ].map(csvCell).join(','))
  /** 先頭に付ける BOM（U+FEFF） */
  const bom = '﻿'
  /** CSV の全体（改行は CRLF） */
  const csv = bom + [header.join(','), ...lines].join('\r\n')
  // 2. ダウンロード（オブジェクト URL は共通の関数が少し待ってから解放する）
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  saveBlob(blob, `reservations_${event.name}_${todayJst()}.csv`)
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

  // イベント・セッション・予約を同時取得し、セッション ID から表示時間を解決して rows に付与する
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
      setEvent(ev)
      setSessions(sess)
      /** セッションの id → 時間ラベル */
      const sessionMap = new Map(sess.map((s) => [s.id, s.time_label]))
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
   * @param reservationId - 予約の id
   * @param status - 新しいステータス
   */
  const updateStatus = async (reservationId: string, status: string) => {
    setUpdating(reservationId)
    setPageError('')
    try {
      /** サーバーが更新したあとの予約 */
      const updated = await api.reserve.updateStatus(reservationId, status)
      setRows((prev) => prev.map((r) => r.id === reservationId ? { ...r, ...updated } : r))
      setSelectedRow((prev) => prev?.id === reservationId ? { ...prev, ...updated } : prev)
    } catch (e) {
      // キャンセルから受付済に戻すとき、時間枠が満席だとサーバーは 409 を返す
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
    const url = `https://ei8htplants.com/reserve?event_id=${id}`
    setCopyFailedUrl(null)
    try {
      // navigator.clipboard が無い環境では、ここで TypeError になり catch に入る
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailedUrl(url)
    }
  }

  /**
   * 当日参加を登録する。失敗したらモーダルを開いたままエラーを出す（入力は残す）
   * 1. 送る内容を作る（入力のある項目だけ足す）
   * 2. 登録できたら一覧の末尾に足し、モーダルを閉じて入力を初期値に戻す
   * 3. 失敗したら文言を出す
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

  /** 表示中（絞り込み後）の予約を新しいウィンドウに書き出して印刷する（ポップアップが止められたら何もしない） */
  const handlePrint = () => {
    if (!event) return
    /** 印刷用に開いたウィンドウ */
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(buildPrintHtml(event, filtered))
    win.document.close()
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
              <button onClick={() => event && exportCsv(event, filtered)} style={btnStyle}>CSV</button>
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
              { label: '受付日', value: formatJstDate(selectedRow.created_at) },
              { label: 'メール', value: selectedRow.email.endsWith('.invalid') ? '-' : <a href={`mailto:${selectedRow.email}`} style={{ color: '#4a6741' }}>{selectedRow.email}</a> },
              ...(selectedRow.phone ? [{ label: '電話', value: selectedRow.phone }] : []),
              ...(selectedRow.preferred_date ? [{ label: '予約日', value: selectedRow.preferred_date }] : []),
              ...((selectedRow.session_time ?? selectedRow.preferred_time) ? [{ label: '予約時間', value: selectedRow.session_time ?? selectedRow.preferred_time }] : []),
              { label: '人数', value: `${selectedRow.participants}名` },
              ...(selectedRow.bring_plant || selectedRow.bring_pot ? [{ label: '持込', value: [selectedRow.bring_plant && '植物', selectedRow.bring_pot && '鉢'].filter(Boolean).join('・') }] : []),
              ...(selectedRow.bring_plant || selectedRow.bring_pot ? [] : [{ label: '持込', value: 'なし' }]),
              ...(selectedRow.note ? [{ label: '備考', value: selectedRow.note }] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f5', fontSize: 14 }}>
                <span style={{ color: 'var(--c-muted)', fontSize: 12 }}>{label}</span>
                <span style={{ color: 'var(--c-ink)' }}>{value}</span>
              </div>
            ))}
            <div style={{ marginTop: 20 }}>
              <label htmlFor="event-reservation-detail-status" style={{ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 8 }}>ステータス</label>
              <select
                id="event-reservation-detail-status"
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
