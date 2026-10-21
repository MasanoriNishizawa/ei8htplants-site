/*
 * 管理画面ダッシュボードの「出店料の支払い」「今後の搬入予定」で使う、絞り込み・並べ替え・表示用の関数（純粋関数）
 * 日付はすべて "YYYY-MM-DD" の文字列で扱い、タイムゾーンで日がずれないよう UTC の日付として計算する
 */
import type { AdminInfoDashboardItem } from '../../lib/api'
import { formatJaDate } from './adminInfoFormat'

/** 支払い期限が「もうすぐ」とみなす日数（期限まで0〜7日なら注意の色にする） */
export const DUE_SOON_DAYS = 7

/** 今後の搬入予定に出す範囲（今日から何日先に始まるイベントまでか） */
export const UPCOMING_DAYS = 60

/** 1日のミリ秒 */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 支払い期限の状態
 * - overdue: 期限切れ（期限が今日より前）
 * - soon: 期限まで DUE_SOON_DAYS 日以内（今日が期限の日も含む）
 * - later: それより先
 * - none: 期限が未設定
 */
export type DueStatus = 'overdue' | 'soon' | 'later' | 'none'

/** 並べる順番（期限切れ → もうすぐ → それ以降 → 期限未設定） */
const DUE_STATUS_ORDER: Record<DueStatus, number> = { overdue: 0, soon: 1, later: 2, none: 3 }

/**
 * "YYYY-MM-DD" を UTC の日付のミリ秒にする
 * @param value - "YYYY-MM-DD" 形式の日付
 * @returns UTC の 0 時のミリ秒。形式が違う・存在しない日付なら null
 */
function ymdToUtcMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const ms = Date.UTC(y, m - 1, d)
  const dt = new Date(ms)
  // 2月30日などは翌月に繰り上がるので、元の値と一致するかで実在を確かめる
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return ms
}

/**
 * 2つの日付の差（日数）を返す
 * 例: daysBetween('2026-10-21', '2026-10-24') → 3
 * @param from - 基準の日付 "YYYY-MM-DD"
 * @param to - 比べる日付 "YYYY-MM-DD"
 * @returns to が from の何日後か（前なら負の数）。どちらかが不正なら null
 */
export function daysBetween(from: string, to: string): number | null {
  const a = ymdToUtcMs(from)
  const b = ymdToUtcMs(to)
  if (a === null || b === null) return null
  return Math.round((b - a) / DAY_MS)
}

/**
 * 日付に日数を足す
 * 例: addDays('2026-10-21', 60) → '2026-12-20'
 * @param value - "YYYY-MM-DD" 形式の日付
 * @param days - 足す日数（負の数なら前へ戻る）
 * @returns 足したあとの日付 "YYYY-MM-DD"。value が不正なら null
 */
export function addDays(value: string, days: number): string | null {
  const ms = ymdToUtcMs(value)
  if (ms === null) return null
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * 支払い期限の状態を判定する
 * @param due - 支払い期限 "YYYY-MM-DD"（null 可）
 * @param today - 今日の日付 "YYYY-MM-DD"
 * @returns 期限の状態。期限が未設定・不正なら 'none'
 */
export function dueStatus(due: string | null | undefined, today: string): DueStatus {
  if (!due) return 'none'
  const diff = daysBetween(today, due)
  if (diff === null) return 'none'
  if (diff < 0) return 'overdue'
  if (diff <= DUE_SOON_DAYS) return 'soon'
  return 'later'
}

/**
 * 期限までの残り日数を文章にする
 * 例: 期限が3日後 → 'あと3日'、今日 → '今日まで'、2日前 → '2日超過'
 * @param due - 支払い期限 "YYYY-MM-DD"（null 可）
 * @param today - 今日の日付 "YYYY-MM-DD"
 * @returns 残り日数の文章。期限が未設定・不正なら null
 */
export function formatDueRemaining(due: string | null | undefined, today: string): string | null {
  if (!due) return null
  const diff = daysBetween(today, due)
  if (diff === null) return null
  if (diff === 0) return '今日まで'
  if (diff > 0) return `あと${diff}日`
  return `${-diff}日超過`
}

/**
 * 出店料の支払いが残っているか（未払いで、出店料か支払い期限が入っている）
 * 出店料が 0 円のときは払うものが無いので、期限が入っているときだけ対象にする
 * @param item - イベント1件分の管理情報
 * @returns 一覧に出すなら true
 */
export function isPaymentPending(item: AdminInfoDashboardItem): boolean {
  if (item.booth_fee_paid) return false
  const hasFee = item.booth_fee !== null && item.booth_fee > 0
  return hasFee || !!item.booth_fee_due
}

/**
 * 「出店料の支払い」に出すイベントを選び、急ぐ順に並べる
 * 1. 未払いで、出店料か支払い期限が入っているものだけにする
 * 2. 期限切れ → 期限まで7日以内 → それ以降 → 期限未設定 の順に並べる
 * 3. 同じ状態の中では期限の早い順、期限未設定どうしは開始日の早い順にする
 * @param items - ダッシュボード API の一覧
 * @param today - 今日の日付 "YYYY-MM-DD"
 * @returns 並べ替えた新しい配列（元の配列は変えない）
 */
export function selectPendingPayments(items: AdminInfoDashboardItem[], today: string): AdminInfoDashboardItem[] {
  return items
    .filter(isPaymentPending)
    .sort((a, b) => {
      const sa = DUE_STATUS_ORDER[dueStatus(a.booth_fee_due, today)]
      const sb = DUE_STATUS_ORDER[dueStatus(b.booth_fee_due, today)]
      if (sa !== sb) return sa - sb
      // "YYYY-MM-DD" どうしは文字列の大小で日付の前後を比べられる
      const da = a.booth_fee_due ?? ''
      const db = b.booth_fee_due ?? ''
      if (da !== db) return da < db ? -1 : 1
      if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1
      return 0
    })
}

/**
 * 「今後の搬入予定」に出すイベントを選び、開始日順に並べる
 * 開始日が今日から days 日以内（今日・days 日後を含む）のもの。すでに始まっているイベントは搬入が済んでいるので出さない
 * @param items - ダッシュボード API の一覧
 * @param today - 今日の日付 "YYYY-MM-DD"
 * @param days - 何日先までを出すか（既定は UPCOMING_DAYS）
 * @returns 開始日の早い順に並べた新しい配列（元の配列は変えない）
 */
export function selectUpcomingCarryIns(
  items: AdminInfoDashboardItem[],
  today: string,
  days: number = UPCOMING_DAYS,
): AdminInfoDashboardItem[] {
  const last = addDays(today, days)
  if (!last) return []
  return items
    .filter((item) => item.start_date >= today && item.start_date <= last)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0))
}

/**
 * 開催日を曜日つきで表示する。終了日が開始日と違えば「〜」でつなぎ、同じ年なら終了日の年を省く
 * 例: ('2026-10-24', '2026-10-25') → '2026年10月24日（土）〜10月25日（日）'
 * @param start - 開始日 "YYYY-MM-DD"
 * @param end - 終了日 "YYYY-MM-DD"（null 可）
 * @returns 開催日の表示。開始日が不正なら開始日の文字列をそのまま返す
 */
export function formatEventPeriod(start: string, end: string | null | undefined): string {
  const startText = formatJaDate(start)
  if (!startText) return start
  if (!end || end === start) return startText
  const endText = formatJaDate(end)
  if (!endText) return startText
  // 同じ年なら終了日の「YYYY年」を省いて短くする
  const endShort = end.slice(0, 4) === start.slice(0, 4) ? endText.replace(/^\d{4}年/, '') : endText
  return `${startText}〜${endShort}`
}
