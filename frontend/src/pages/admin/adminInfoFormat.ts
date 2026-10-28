/*
 * イベント管理情報の確認画面で使う、表示用の整形関数（純粋関数）
 * タイムゾーンで日付がずれないよう、Date に文字列をそのまま渡さず、年・月・日を分解して計算する
 */

import { formatYen as formatYenCommon } from '../../lib/format'

/** 曜日の表記（日曜始まり。Date.getUTCDay() の値と対応） */
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

/**
 * "YYYY-MM-DD" を年・月・日に分解し、実在する日付かどうかを確かめる
 * @param value - "YYYY-MM-DD" 形式の文字列
 * @returns 年・月・日と曜日の番号（0=日曜）。形式が違う・存在しない日付なら null
 */
function parseYmd(value: string): { y: number; m: number; d: number; wd: number } | null {
  // 期待する日付形式に一致するかを確かめ、年・月・日を数値として取り出す。
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  // 曜日計算と表示に使う年月日の数値。
  const y = Number(match[1])
  // 年の後に続く月と日を数値化する。
  const m = Number(match[2])
  /** 日付の曜日計算に使う月内の日 */
  const d = Number(match[3])
  // UTC で作るので、実行環境のタイムゾーンに関係なく同じ日付・曜日になる
  const dt = new Date(Date.UTC(y, m - 1, d))
  // 2月30日などは翌月に繰り上がるため、作った日付と元の値が一致するかで実在を確かめる
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return { y, m, d, wd: dt.getUTCDay() }
}

/**
 * 日付を曜日つきの日本語表記にする
 * 例: formatJaDate('2026-10-09') → '2026年10月9日（金）'
 * @param value - "YYYY-MM-DD" 形式の日付（null・undefined 可）
 * @returns 曜日つきの日付。未入力・不正な値なら null
 */
export function formatJaDate(value: string | null | undefined): string | null {
  if (!value) return null
  // 日付を検証して分解し、失敗した場合は表示文字列を作らない。
  const p = parseYmd(value)
  if (!p) return null
  return `${p.y}年${p.m}月${p.d}日（${WEEKDAYS_JA[p.wd]}）`
}

/**
 * 日時を曜日つきの日本語表記にする
 * 例: formatJaDateTime('2026-10-24T09:00') → '2026年10月24日（土） 09:00'
 * @param value - "YYYY-MM-DDTHH:MM" 形式の日時（秒がついていても時・分だけを使う。null・undefined 可）
 * @returns 曜日つきの日時。未入力・不正な値なら null
 */
export function formatJaDateTime(value: string | null | undefined): string | null {
  if (!value) return null
  // ISO 形式の日時から日付と時・分の各部分を取得する。
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  // 日付部分を曜日付きの日本語表記へ変換する。
  const date = formatJaDate(match[1])
  if (!date) return null
  // 時と分を数値化して範囲を検証し、表示形式へ戻す。
  const hour = Number(match[2])
  // 分の数値は時刻として有効な範囲かの判定に使う。
  const minute = Number(match[3])
  if (hour > 23 || minute > 59) return null
  return `${date} ${match[2]}:${match[3]}`
}

/**
 * 金額を3桁区切りの「円」表記にする
 * 例: formatYen(14000) → '14,000円'
 * @param value - 金額（円。null・undefined 可）
 * @returns 3桁区切りの金額。未入力・数値でない値なら null
 */
export function formatYen(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  // 表記は共通の関数（lib/format）の「1,234円」の形を使う
  return formatYenCommon(value, 'suffix')
}

/**
 * 出店料の支払い期限を過ぎているかどうか（期限日の当日はまだ過ぎていない扱い）
 * @param due - 支払い期限 "YYYY-MM-DD"（null・undefined 可）
 * @param today - 今日の日付 "YYYY-MM-DD"
 * @returns 期限が今日より前なら true。期限が未入力・不正なら false
 */
export function isPastDue(due: string | null | undefined, today: string): boolean {
  if (!due || !parseYmd(due) || !parseYmd(today)) return false
  // 同じ "YYYY-MM-DD" 形式どうしなので文字列の大小で日付の前後を比べられる
  return due < today
}

/**
 * 端末のローカル時刻での今日の日付を "YYYY-MM-DD" で返す
 * @param now - 基準の日時（テスト用に差し替えられる。省略時は現在時刻）
 * @returns 今日の日付
 */
export function localToday(now: Date = new Date()): string {
  // 端末のローカル年月日を取り出し、月日を2桁にそろえる。
  const y = now.getFullYear()
  // 月は Date API で 0 始まりのため 1 を加えてから 2 桁化する。
  const m = String(now.getMonth() + 1).padStart(2, '0')
  /** 端末のローカル日付から取り出した2桁の日 */
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
