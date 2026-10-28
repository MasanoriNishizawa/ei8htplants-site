import type { Event, Reservation } from '../../lib/api'
import { STATUS_LABELS } from '../../lib/reservationConstants'
import { escapeHtml, csvCell } from '../../lib/escapeHtml'
import { formatJstDate } from '../../lib/localDate'

/** 予約に、セッション ID から引いた時間ラベル（session_time）を足したもの */
export type ReservationWithTime = Reservation & { session_time?: string }

/**
 * 指定された予約を印刷するための HTML 文字列を生成する。
 * 1. イベントの日付表示と、予約行の HTML を作る。
 * 2. 参加人数を合計し、印刷用の文書全体を組み立てる。
 * ユーザー入力値はすべて HTML エスケープして埋め込む。
 * @param event - ヘッダーに表示するイベント情報
 * @param rows - 印刷対象の予約一覧
 * @returns 印刷に使用する HTML 文字列
 */
export function buildReservationPrintHtml(event: Event, rows: ReservationWithTime[]): string {
  /** 開催日の表示（複数日なら「開始 〜 終了」） */
  const dateRange = event.end_date && event.end_date !== event.start_date
    ? `${event.start_date} 〜 ${event.end_date}`
    : event.start_date
  /** 表の行の HTML（予約1件で1行） */
  const trs = rows.map((r) => {
    /** 持ち込みの表示（植物・鉢） */
    const bring = [r.bring_plant && '植物', r.bring_pot && '鉢'].filter(Boolean).join('・')
    return `<tr>
      <td>${escapeHtml(formatJstDate(r.created_at))}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.preferred_date ?? '-')}</td>
      <td>${escapeHtml(r.session_time ?? r.preferred_time ?? '-')}</td>
      <td>${escapeHtml(r.participants)}</td>
      <td>${escapeHtml(bring || '-')}</td>
      <td>${escapeHtml(r.note ?? '-')}</td>
      <td>${escapeHtml(STATUS_LABELS[r.status] ?? r.status)}</td>
    </tr>`
  }).join('')
  /** 印刷する予約の参加人数の合計（キャンセルも含む） */
  const totalPeople = rows.reduce((s, r) => s + r.participants, 0)
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>${escapeHtml(event.name)} 予約一覧</title>
<style>
/* 印刷用予約一覧の本文・タイトル・表見出し・行・合計欄の体裁 */
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;padding:16px 20px;color:#1c2417;}
h1{font-size:15px;font-weight:normal;margin:0 0 3px;}
p.meta{font-size:10px;color:#666;margin:0 0 14px;}
table{width:100%;border-collapse:collapse;}
th{background:#3a4535;color:#fff;padding:6px 8px;text-align:left;font-weight:normal;font-size:10px;letter-spacing:.5px;}
td{padding:5px 8px;border-bottom:1px solid #e8e8e8;vertical-align:top;}
tr:nth-child(even) td{background:#f7f7f7;}
p.total{margin:8px 0 0;font-size:10px;color:#666;}
</style></head><body>
<h1>${escapeHtml(event.name)} ワークショップ予約一覧</h1>
<p class="meta">${escapeHtml(dateRange)}${event.time ? ' ' + escapeHtml(event.time) : ''} / ${escapeHtml(event.location)}</p>
<table><thead><tr>
  <th>受付日</th><th>お名前</th><th>予約日</th><th>予約時間</th><th>人数</th><th>持込</th><th>備考</th><th>ステータス</th>
</tr></thead>
<tbody>${trs}</tbody></table>
<p class="total">合計 ${rows.length} 件 / ${totalPeople} 名</p>
<script>window.onload=()=>window.print();</script>
</body></html>`
}

/**
 * 予約一覧を BOM・CRLF 付きの CSV 文字列に変換する。
 * 1. 現行仕様の見出しと、予約ごとの列を同じ順序で作る。
 * 2. セルを数式注入対策付きで連結し、先頭 BOM と CRLF を付ける。
 * @param rows - CSV に含める予約一覧
 * @returns BOM 付き UTF-8 CSV 文字列
 */
export function buildReservationsCsv(rows: ReservationWithTime[]): string {
  /** CSV の見出し（既存の列名と並びを維持する） */
  const header = ['受付日', 'お名前', 'メール', '電話', '予約日', '予約時間', '人数', '植物持込', '鉢持込', '備考', 'ステータス']
  /** 予約ごとの CSV 行。各値は csvCell で式注入対策を行う */
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
  /** Excel での文字化けを防ぐため、従来どおり先頭に付ける BOM */
  const bom = '﻿'
  /** CSV 全体（見出し、予約行の順で CRLF 区切り） */
  return bom + [header.join(','), ...lines].join('\r\n')
}
