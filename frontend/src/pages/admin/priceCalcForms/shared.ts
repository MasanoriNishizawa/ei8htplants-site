/** 価格計算フォーム方式ごとに共有するブランド型、設定値、純粋な表示計算を定義する。 */
import { formatYen } from '../../../lib/format'

/** 価格計算で使うブランドのキー（price_calc_entries.brand に保存する値） */
export type Brand = 'ei8htplants' | 'habitatoides' | 'hue'

/** 実生を扱うブランド（HUE は実生が無い） */
export const SEEDLING_BRANDS: readonly Brand[] = ['ei8htplants', 'habitatoides']

/** 実生の原価計算で扱う種子の粒数（1 袋分の上代をこの粒数で割って 1 粒の元値を求める） */
export const SEEDS_PER_PACK = 20

/** ブランドごとの植物名の入力欄の placeholder（生産・仕入れ・実生で同じものを使う） */
export const PLANT_PLACEHOLDERS: Readonly<Record<Brand, string>> = {
  ei8htplants: '例: アガベ チタノタ',
  habitatoides: '例: アガベ ポタトルム',
  hue: '例: ユーフォルビア オベサ',
}

/** 生産の販売価格の倍率（卸価格のちょうど 2 倍。切り上げはしない） */
export const WHOLESALE_MARKUP = 2

/**
 * ei8ht plants の仕入れで出す仲卸価格（販売価格 ÷ WHOLESALE_MARKUP。生産の「販売価格 = 卸価格 × 2」と同じ関係）。
 * 1 円未満の端数は 1 円単位に切り上げる。表示だけで、登録リストには保存しない。
 * @param sellingPrice - 販売価格（円）
 * @returns 仲卸価格（円）
 */
export const wholesalePrice = (sellingPrice: number) => Math.ceil(sellingPrice / WHOLESALE_MARKUP)

/**
 * 計算結果（小数を含む）を四捨五入して「¥1,234」の形にする。
 * @param n - 金額（円）
 * @returns 四捨五入した金額を円表示にした文字列
 */
export const yenRounded = (n: number) => formatYen(Math.round(n))
