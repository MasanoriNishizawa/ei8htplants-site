/*
 * 金額・数値の表示用の整形関数（純粋関数）
 *
 * 画面ごとに「¥1,234」「1,234円」「1,234 円」の 3 通りの表記があり、
 * それぞれ今の表示を変えないよう YenStyle で選べるようにしている
 * - symbol: 公開ページ（ショップ・カート・記事）と管理画面の商品・注文・記事・価格計算（¥1,234）
 * - suffix: 管理画面のイベント管理情報・ダッシュボード（1,234円）
 * - suffixSpaced: 管理画面の収支・WS 集計・手伝い支払い（1,234 円）
 */

/** 金額の表記の種類 */
export type YenStyle = 'symbol' | 'suffix' | 'suffixSpaced'

/**
 * 数値を 3 桁区切りにする。実行環境の言語設定に左右されないよう ja-JP を指定する
 * 例: formatNumber(14000) → '14,000'
 * @param n - 数値
 * @returns 3 桁区切りの文字列
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('ja-JP')
}

/**
 * 金額を 3 桁区切りの表記にする
 * 例: formatYen(1234) → '¥1,234'、formatYen(1234, 'suffix') → '1,234円'、formatYen(1234, 'suffixSpaced') → '1,234 円'
 * @param n - 金額（円）
 * @param style - 表記の種類（省略時は symbol）
 * @returns 整形した金額
 */
export function formatYen(n: number, style: YenStyle = 'symbol'): string {
  // 金額部分を共通の3桁区切り表記にする
  const num = formatNumber(n)
  if (style === 'suffix') return `${num}円`
  if (style === 'suffixSpaced') return `${num} 円`
  return `¥${num}`
}
