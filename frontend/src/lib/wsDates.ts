// ワークショップの「実施日」を扱う小さな関数。
// イベントの ws_dates が配列なら、その日だけワークショップを実施する（null・未設定なら開催期間の全日程）。
// ws_dates が有効なのは「ワークショップあり」かつ「複数日のイベント」のときだけなので、その判定もここにまとめる。
// 公開の予約ページ・イベントページ・管理画面（予約一覧・印刷・当日参加）で同じ判定を使う
import type { Event } from './apiTypes'
import { WEEKDAYS_JA, listDates, parseLocalDate } from './localDate'

/** 表示言語 */
type Lang = 'ja' | 'en'

/** 実施日の判定に使うイベントの項目（Event の一部だけ持つテスト用の値でも使えるようにする） */
type WsDatesSource = Pick<Event, 'start_date' | 'end_date' | 'has_workshop'> & Partial<Pick<Event, 'ws_dates'>>

/**
 * イベントで「実施する日を選ぶ」が有効になっているか（ワークショップあり・複数日・ws_dates が1日以上）
 * @param event - イベント
 * @returns 有効なら true
 */
export function hasWsDateSelection(event: WsDatesSource): boolean {
  // 1. ワークショップなし・ws_dates なしは全日程扱い
  if (!event.has_workshop || !event.ws_dates || event.ws_dates.length === 0) return false
  // 2. 1 日だけのイベントでは ws_dates を使わない
  return listDates(event.start_date, event.end_date).length > 1
}

/**
 * ワークショップを実施する日の一覧を返す（開催期間の中の日だけ・日付の昇順）
 * ws_dates が有効なら、その中で開催期間に入っている日。そうでなければ開催期間の全日程
 * @param event - イベント
 * @returns 実施日（YYYY-MM-DD）の配列
 */
export function workshopDates(event: WsDatesSource): string[] {
  /** 開催期間の全日程 */
  const all = listDates(event.start_date, event.end_date)
  if (!hasWsDateSelection(event)) return all
  /** 選ばれた実施日（重複を除く） */
  const picked = new Set(event.ws_dates ?? [])
  // 開催期間の並び順のまま、選ばれた日だけを残す（期間外の日は捨てる）
  return all.filter((d) => picked.has(d))
}

/**
 * 指定した日がワークショップの実施日か（バックエンドの is_workshop_day と同じ判定）
 * ワークショップなしのイベント・開催期間外・ws_dates に無い日は false
 * @param event - イベント
 * @param date - 日付（YYYY-MM-DD）
 * @returns 実施日なら true
 */
export function isWorkshopDay(event: WsDatesSource, date: string): boolean {
  return event.has_workshop && workshopDates(event).includes(date)
}

/**
 * 公開ページに「ワークショップ実施日」を出すべきか（全日程ではなく、一部の日だけ実施するとき）
 * @param event - イベント
 * @returns 一部の日だけなら true
 */
export function isPartialWorkshopSchedule(event: WsDatesSource): boolean {
  if (!hasWsDateSelection(event)) return false
  /** 実施日 */
  const dates = workshopDates(event)
  return dates.length > 0 && dates.length < listDates(event.start_date, event.end_date).length
}

/**
 * 日付を「11/3（日）」（英語は「11/3 (Sun)」）の短い形にする
 * @param date - 日付（YYYY-MM-DD）
 * @param lang - 表示言語
 * @returns 表示用の文字列
 */
export function formatShortDateDow(date: string, lang: Lang): string {
  // 1. 現地の日付として読む（UTC として読んで前日になるのを防ぐ）
  const d = parseLocalDate(date)
  /** 月/日 */
  const md = `${d.getMonth() + 1}/${d.getDate()}`
  // 2. 言語ごとに曜日を付ける
  if (lang === 'en') return `${md} (${d.toLocaleDateString('en-US', { weekday: 'short' })})`
  return `${md}（${WEEKDAYS_JA[d.getDay()]}）`
}

/**
 * 実施日の一覧を 1 行の文字にする（日本語は「11/3（日）・11/5（火）」、英語は「11/3 (Sun), 11/5 (Tue)」）
 * @param dates - 実施日（YYYY-MM-DD）
 * @param lang - 表示言語
 * @returns 表示用の文字列
 */
export function formatWorkshopDates(dates: string[], lang: Lang): string {
  return dates.map((d) => formatShortDateDow(d, lang)).join(lang === 'en' ? ', ' : '・')
}

/**
 * 当日参加の参加日の初めの値を決める
 * 1. 今日が実施日なら今日
 * 2. そうでなければ、今日より前で一番近い実施日
 * 3. それも無ければ最初の実施日（実施日が無ければ空文字）
 * @param event - イベント
 * @param today - 今日（YYYY-MM-DD。日本時間）
 * @returns 参加日の初めの値（YYYY-MM-DD）
 */
export function defaultWalkinDate(event: WsDatesSource, today: string): string {
  /** ワークショップの実施日（昇順） */
  const dates = event.has_workshop ? workshopDates(event) : []
  if (dates.includes(today)) return today
  /** 今日より前の実施日 */
  const before = dates.filter((d) => d < today)
  if (before.length > 0) return before[before.length - 1]
  return dates[0] ?? ''
}
