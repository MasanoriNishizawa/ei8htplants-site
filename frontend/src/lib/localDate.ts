// 日付の文字列を「現地（ブラウザ）の日付」として扱うための小さな関数。
// new Date('2026-05-01') のように日付だけの文字列を渡すと、JavaScript は UTC の 0 時として読むため、
// UTC より西の地域（アメリカなど）では前日の日付になってしまう。日付だけの文字列は年・月・日に分けて作り直す

/** 表示言語 */
type Lang = 'ja' | 'en'

/** 日付だけの文字列（YYYY-MM-DD）にあてはまる正規表現 */
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 日付の文字列を Date にする。YYYY-MM-DD だけの文字列は現地の 0 時として読む（UTC として読んで前日になるのを防ぐ）。
 * 時刻付きの文字列（ISO 形式など）はそのまま new Date で読む
 * @param s - 日付の文字列（YYYY-MM-DD または ISO 形式）
 * @returns Date
 */
export function parseLocalDate(s: string): Date {
  // 年・月・日に分けられたら現地の日付として作る（月は 0 始まり）
  const m = DATE_ONLY_RE.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}

/**
 * 日付の文字列から「年-月」のキー（YYYY-MM）を作る。言語に左右されないので、月の絞り込みの値に使う
 * @param s - 日付の文字列
 * @returns YYYY-MM
 */
export function monthKey(s: string): string {
  // 日付文字列をローカル日付として解釈し、UTC 起因の日付ずれを防ぐ
  const d = parseLocalDate(s)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 「年-月」のキー（YYYY-MM）を表示用の文字に変える
 * @param key - YYYY-MM
 * @param lang - 表示言語
 * @returns 日本語は「2026年5月」、英語は「May 2026」
 */
export function formatMonthKey(key: string, lang: Lang): string {
  // 年と月の数値
  const [y, m] = key.split('-').map(Number)
  if (lang === 'en') {
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
  }
  return `${y}年${m}月`
}

/**
 * イベントの開催期間を表示用の文字に変える（同じ月なら終わりの年・月を省く）
 * @param start - 開始日（YYYY-MM-DD）
 * @param end - 終了日（YYYY-MM-DD）。null か開始日と同じなら 1 日だけの表示
 * @param lang - 表示言語
 * @returns 例: 「2026年5月1日〜3日」「May 1–3, 2026」
 */
export function formatDateRange(start: string, end: string | null, lang: Lang): string {
  // 開始日と、終了日があれば終了日をローカル日付として読む
  const s = parseLocalDate(start)
  // 終了日が省略された場合は期間なしとして null を使う
  const e = end ? parseLocalDate(end) : null
  // 開始日と終了日が同じ年・同じ月か（同じなら終わりの年・月を省く）
  const sameMonth = !!e && s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()
  if (lang === 'en') {
    /** 英語の「May 1, 2026」の形にする。
     * @param d - 表示するローカル日付
     * @returns 英語ロケールで整形した年月日
     */
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    if (!e || end === start) return fmt(s)
    if (sameMonth) {
      return `${s.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}–${e.getDate()}, ${e.getFullYear()}`
    }
    return `${fmt(s)} – ${fmt(e)}`
  }
  /** 日本語の「2026年5月1日」の形にする。
   * @param d - 表示するローカル日付
   * @returns 日本語の年月日文字列
   */
  const fmt = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  if (!e || end === start) return fmt(s)
  if (sameMonth) return `${fmt(s)}〜${e.getDate()}日`
  return `${fmt(s)}〜${fmt(e)}`
}

/** 曜日の日本語表記（Date.getDay() の 0〜6 の順。0 が日曜） */
export const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 日本時間（JST）と UTC の差（ミリ秒）。日本は夏時間が無いので常に 9 時間 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * Date を現地の日付の「YYYY-MM-DD」にする
 * @param d - 日付
 * @returns YYYY-MM-DD
 */
export function toYmd(d: Date): string {
  // 年・月・日をゼロ埋めして YYYY-MM-DD にする
  const y = d.getFullYear()
  // 月・日を2桁にそろえる
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 開始日から終了日までの日付を 1 日ずつ並べる（両端を含む）
 * 例: listDates('2026-05-01', '2026-05-03') → ['2026-05-01', '2026-05-02', '2026-05-03']
 * @param start - 開始日（YYYY-MM-DD）
 * @param end - 終了日（YYYY-MM-DD）。null・undefined・空なら開始日だけ
 * @returns 日付（YYYY-MM-DD）の配列。終了日が開始日より前なら空配列
 */
export function listDates(start: string, end?: string | null): string[] {
  // 並べた日付
  const dates: string[] = []
  // 今見ている日（1 日ずつ進める）
  const cur = parseLocalDate(start)
  // 最後の日
  const last = parseLocalDate(end || start)
  while (cur <= last) {
    dates.push(toYmd(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

/**
 * 日本時間（JST）での今日の日付を返す。管理画面の「本日開催」「当日参加」は、端末の時計の地域に関係なく日本の日付で判定する
 * @param now - 基準の日時（テスト用に差し替えられる。省略時は現在時刻）
 * @returns YYYY-MM-DD
 */
export function todayJst(now: Date = new Date()): string {
  // 9 時間足した時刻を UTC として読めば、日本時間の日付になる
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * 日付を「2026年5月1日」の形にする
 * @param s - 日付（YYYY-MM-DD）
 * @returns 表示用の文字列
 */
export function formatJaYmd(s: string): string {
  // 入力文字列をローカル日付として解釈する
  const d = parseLocalDate(s)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/**
 * 日付を「5月1日（金）」の形にする（年は付けない）
 * @param s - 日付（YYYY-MM-DD）
 * @returns 表示用の文字列
 */
export function formatJaMonthDayDow(s: string): string {
  // 入力文字列をローカル日付として解釈する
  const d = parseLocalDate(s)
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS_JA[d.getDay()]}）`
}

/**
 * 日時（ISO 形式。予約の受付日時・注文日時など）を日本時間の日付にする
 * @param iso - ISO 形式の日時
 * @param padded - true なら月・日を 2 桁にする（2026/05/01）。省略時は「2026/5/1」
 * @returns 表示用の文字列
 */
export function formatJstDate(iso: string, padded = false): string {
  return new Date(iso).toLocaleDateString('ja-JP', padded
    ? { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }
    : { timeZone: 'Asia/Tokyo' })
}
