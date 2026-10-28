/*
 * 管理画面で HTML や CSV を文字列として組み立てるときの無害化の関数
 *
 * - 予約一覧の印刷（window.open + document.write）は React を通さずに HTML を書くため、
 *   予約者が入力した名前・備考などをそのまま入れるとスクリプトが動いてしまう（XSS）。
 *   文字列に入れる前に必ず escapeHtml を通す
 * - CSV は Excel などで開いたときに「=」「+」「-」「@」で始まるセルが数式として実行されるため（CSV インジェクション）、
 *   csvCell で先頭に「'」を付けて文字として扱わせる
 */

/** HTML で特別な意味を持つ文字と、置き換え先の文字参照の対応 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * 文字列を HTML の本文・属性値に安全に埋め込めるよう、特別な意味を持つ文字を文字参照に置き換える
 * 1. null・undefined を空文字にし、それ以外を文字列に変換する。
 * 2. HTML の特殊文字を対応する文字参照に置き換える。
 * @param value - 埋め込む値（null・undefined は空文字、数値は文字列にする）
 * @returns 無害化した文字列
 */
export function escapeHtml(value: string | number | null | undefined): string {
  // 1. null 系の値は HTML に埋め込む空文字として扱う。
  if (value === null || value === undefined) return ''
  // 2. 残る値を文字列にして、特殊文字を HTML 文字参照へ置き換える。
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

/** CSV セルの先頭にあり、表計算ソフトが数式として解釈する可能性がある記号 */
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/
/** 空白・改行・BOM の後に数式記号が続く場合も、先頭記号として扱う */
const CSV_FORMULA_AFTER_WHITESPACE = /^[\s\uFEFF]+[=+\-@]/

/**
 * CSV の1セル分の値を作る
 * 1. 数式記号が直接先頭にある値、または空白・改行・BOMの後に数式記号が続く値は、先頭に「'」を付けて文字として扱わせる
 * 2. ダブルクォートを 2 つ重ねてエスケープし、全体をダブルクォートで囲む
 * @param value - セルの値（null・undefined は空文字）
 * @returns ダブルクォートで囲んだセルの文字列
 */
export function csvCell(value: string | number | null | undefined): string {
  // 1. 数式の無効化
  let s = value === null || value === undefined ? '' : String(value)
  if (CSV_FORMULA_PREFIX.test(s) || CSV_FORMULA_AFTER_WHITESPACE.test(s)) s = `'${s}`
  // 2. クォート
  return `"${s.replace(/"/g, '""')}"`
}
