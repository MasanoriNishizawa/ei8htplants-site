import type { Event, Reservation, WsSession } from '../../lib/api'
import { STATUS_LABELS } from '../../lib/reservationConstants'
import { escapeHtml } from '../../lib/escapeHtml'
import { formatJaYmd, formatJstDate, listDates } from '../../lib/localDate'

/** 印刷時刻を補った予約。 */
export type ReservationWithTime = Reservation & { session_time?: string }

/**
 * 予約者の入力をエスケープし、印刷用の1行を作る。
 * @param reservation - 印刷する予約
 * @returns エスケープ済みのHTML行
 */
function renderPrintRow(reservation: ReservationWithTime): string {
  /** 持ち込みの表示（植物・鉢） */
  const bringFlags = [reservation.bring_plant && '植物', reservation.bring_pot && '鉢'].filter(Boolean).join('・')
  return `<tr>
    <td>${escapeHtml(formatJstDate(reservation.created_at))}</td>
    <td>${escapeHtml(reservation.name)}</td>
    <td>${escapeHtml(reservation.email)}</td>
    <td>${escapeHtml(reservation.phone ?? '-')}</td>
    <td>${escapeHtml(reservation.session_time ?? reservation.preferred_time ?? '-')}</td>
    <td style="text-align:center">${escapeHtml(reservation.participants)}</td>
    <td>${escapeHtml(bringFlags || '-')}</td>
    <td class="col-note">${escapeHtml(reservation.note ?? '-')}</td>
    <td>${escapeHtml(STATUS_LABELS[reservation.status] ?? reservation.status)}</td>
  </tr>`
}

/**
 * 印刷用に手書きの空き枠行を作る。
 * @param index - 空き枠番号（0始まり）
 * @returns 空き枠のHTML行
 */
function renderEmptyRow(index: number): string {
  return `<tr class="empty-row">
    <td></td><td></td><td></td><td></td>
    <td style="color:#bbb;font-size:10px">空枠 ${index + 1}</td>
    <td></td><td></td><td></td><td></td>
  </tr>`
}

/**
 * 予約とイベント情報から、ブラウザー副作用を伴わない印刷HTMLを生成する。
 * 1. イベントの開催日と時間枠に予約を振り分ける
 * 2. 未割当予約またはフラット表示の行を追加する
 * 3. 印刷用のHTML文書として返す
 * @param rows - 印刷対象の予約一覧
 * @param eventName - 印刷タイトルに使うイベント名
 * @param sessionsData - セッションIDからセッション情報を引くマップ
 * @param event - 日付・時間枠で分類するイベント。nullならフラット表示
 * @param outputDate - 出力日として表示する日時
 * @returns 印刷用HTML文字列
 */
export function buildReservationPrintHtml(
  rows: ReservationWithTime[],
  eventName: string,
  sessionsData: Map<string, WsSession>,
  event: Event | null,
  outputDate: Date,
): string {
  /** 印刷する予約の参加人数（キャンセルを含む） */
  const totalParticipants = rows.reduce((sum, reservation) => sum + reservation.participants, 0)
  /** 選択イベントのセッションを表示順にする */
  const eventSessions = event
    ? [...sessionsData.values()]
        .filter((session) => session.event_id === event.id)
        .sort((a, b) => a.display_order - b.display_order)
    : []
  /** 表本体のHTML */
  let tableBody = ''

  if (eventSessions.length > 0 && event) {
    /** 開催日の一覧 */
    const dates = listDates(event.start_date, event.end_date)
    /** 現在有効なセッションID（古い予約の時間照合に使う） */
    const validSessionIds = new Set(eventSessions.map((session) => session.id))
    /** すでにセッションへ割り当てた予約ID */
    const assignedRowIds = new Set<string>()

    for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
      /** 現在の開催日 */
      const date = dates[dateIndex]
      tableBody += `<tr class="date-header${dateIndex > 0 ? ' date-break' : ''}"><td colspan="9">${formatJaYmd(date)}</td></tr>`

      for (const session of eventSessions) {
        /** この日・時間枠に該当する予約 */
        const sessionRows = rows.filter((reservation) => {
          if (assignedRowIds.has(reservation.id)) return false
          // 希望日が一致する予約、または単日イベントで希望日が未指定の予約を対象にする。
          const dateMatches = reservation.preferred_date === date || (!reservation.preferred_date && dates.length === 1)
          if (!dateMatches) return false
          // セッションIDが有効ならIDを優先し、未設定・古いIDの場合だけ希望時間で照合する。
          const directMatch = reservation.session_id === session.id
          const fallbackMatch =
            (!reservation.session_id || !validSessionIds.has(reservation.session_id)) &&
            reservation.preferred_time === session.time_label
          return directMatch || fallbackMatch
        })
        sessionRows.forEach((reservation) => assignedRowIds.add(reservation.id))
        /** キャンセルを除いた定員消費人数 */
        const reservedCount = sessionRows
          .filter((reservation) => reservation.status !== 'cancelled')
          .reduce((sum, reservation) => sum + reservation.participants, 0)
        /** 手書き用に印刷する残り枠 */
        const remaining = Math.max(0, session.max_participants - reservedCount)

        tableBody += `<tr class="session-header">
          <td colspan="9">${escapeHtml(session.time_label)}\u3000${reservedCount} / ${escapeHtml(session.max_participants)} 名</td>
        </tr>`
        sessionRows.forEach((reservation) => { tableBody += renderPrintRow(reservation) })
        for (let index = 0; index < remaining; index++) tableBody += renderEmptyRow(index)
      }
    }

    /** セッションに割り当てられなかった予約を末尾にまとめる */
    const unassigned = rows.filter((reservation) => !assignedRowIds.has(reservation.id))
    if (unassigned.length > 0) {
      tableBody += '<tr class="session-header"><td colspan="9">セッション未指定</td></tr>'
      unassigned.forEach((reservation) => { tableBody += renderPrintRow(reservation) })
    }
  } else {
    // イベント未選択、または時間枠が無い場合はフラットに並べる。
    rows.forEach((reservation) => { tableBody += renderPrintRow(reservation) })
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(eventName)} — WS予約一覧</title>
  <style>
    /* 印刷ページ全体の余白・文字と、予約一覧表の見出し・行・集計欄を整える */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif; font-size: 11px; color: #1a1a1a; padding: 16px 20px; }
    h1 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .meta { font-size: 10px; color: #666; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f0f4; font-weight: 600; font-size: 10px; letter-spacing: 0.5px; border: 1px solid #ccc; padding: 5px 8px; text-align: left; white-space: nowrap; }
    td { border: 1px solid #ddd; padding: 5px 8px; vertical-align: top; }
    td.col-note { max-width: 160px; white-space: normal; word-break: break-word; }
    tr.date-header td { background: #2c3a28; color: #fff; font-weight: 600; font-size: 12px; border: 1px solid #1a2416; padding: 7px 8px; }
    tr.date-break { break-before: page; }
    tr.session-header td { background: #e8e8f0; font-weight: 600; font-size: 11px; letter-spacing: 0.5px; border: 1px solid #b0b0c8; }
    tr.empty-row td { background: #fafafa; height: 28px; border: 1px dashed #ccc; }
    .summary { margin-top: 12px; font-size: 11px; color: #444; }
    /* 印刷時は A4 横向きにし、用紙端に 10mm の余白を設ける */
    @media print { @page { size: A4 landscape; margin: 10mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(eventName)} — WS予約一覧</h1>
  <div class="meta">出力日: ${formatJstDate(outputDate.toISOString())} / 予約件数: ${rows.length} 件 / 合計人数: ${totalParticipants} 名</div>
  <table>
    <thead>
      <tr>
        <th>受付日</th><th>お名前</th><th>メール</th><th>電話</th>
        <th>予約時間</th><th>人数</th>
        <th>持込</th><th>備考</th><th>ステータス</th>
      </tr>
    </thead>
    <tbody>${tableBody}</tbody>
  </table>
  <div class="summary">合計参加人数: ${totalParticipants} 名</div>
  <script>window.onload = () => { window.print() }</script>
</body>
</html>`
}
