/*
 * 管理画面「販売価格計算」（pages/admin/PriceCalc.tsx）の計算（純粋関数）
 *
 * 推奨販売価格は「原価率が目標原価率（既定は MAX_COST_RATE = 40%）以下になる、キリの良い値」にする。
 * 目安 = 原価 ÷ 目標原価率 を、100 円単位（PRICE_UNIT）で切り上げる。
 * 切り上げなので、推奨価格の原価率は必ず目標原価率以下になる。
 * 全ブランド（ei8ht plants・Habitat Oides・HUE）で同じ計算を使う。
 * 目標原価率はブランドごとに持ち（既定値は DEFAULT_COST_RATES）、画面で変えられ、
 * このブラウザの localStorage にブランドごとに覚えておく（読み書きの関数もここに置く）
 */

/** 目標原価率の既定値（0.4 = 40%）。関数の引数を省略したときに使う。ブランドごとの既定値は DEFAULT_COST_RATES */
export const MAX_COST_RATE = 0.4

/** 目標原価率をブランドごとに持つときのブランドのキー（price_calc_entries.brand の値と同じ） */
export type CostRateBrand = 'ei8htplants' | 'habitatoides' | 'hue'

/**
 * ブランドごとの目標原価率の既定値
 * - ei8ht plants: 33.4%（原価のほぼ 3 倍で売れるように。例: 原価 1,500 円 → ¥4,500、1,000 円 → ¥3,000）
 * - Habitat Oides・HUE: 40%（MAX_COST_RATE と同じ）
 */
export const DEFAULT_COST_RATES: Readonly<Record<CostRateBrand, number>> = {
  ei8htplants: 0.334,
  habitatoides: MAX_COST_RATE,
  hue: MAX_COST_RATE,
}

/**
 * 目標原価率の入力を覚えておく localStorage のキーの頭の部分。実際のキーは costRateStorageKey で「頭:ブランド」にする
 * 以前はこのキーそのものに 3 ブランド共通の値を保存していたが、ブランドごとに既定値が違う（ei8ht plants は 33.4%）ため、
 * 古い共通のキーは読まない（読むと ei8ht plants が 40% から始まってしまう）
 */
export const COST_RATE_STORAGE_KEY = 'price-calc-cost-rate'

/**
 * ブランドの目標原価率を覚えておく localStorage のキーを返す
 * 例: costRateStorageKey('ei8htplants') → 'price-calc-cost-rate:ei8htplants'
 * @param brand - ブランド
 * @returns localStorage のキー
 */
export function costRateStorageKey(brand: CostRateBrand): string {
  return `${COST_RATE_STORAGE_KEY}:${brand}`
}

/**
 * 浮動小数の誤差を消すときの小数の桁数。
 * 例えば 400 ÷ 0.4 が 1000.0000000000001 のようになると、切り上げで 1 単位上（1,100）に跳ねてしまうため、
 * いったんこの桁で丸めてから切り上げる
 */
const ROUND_DIGITS = 6

/**
 * 浮動小数の誤差を消すため、小数第 ROUND_DIGITS 位で四捨五入する
 * @param n - 丸める数
 * @returns 丸めた数
 */
function roundFloat(n: number): number {
  const p = 10 ** ROUND_DIGITS
  return Math.round(n * p) / p
}

/** 推奨販売価格を切り上げる単位（円）。どの金額でも 100 円単位にする */
export const PRICE_UNIT = 100

/**
 * 原価から推奨販売価格を計算する（原価率が目標原価率以下でキリの良い値）
 * 例: recommendPrice(1500) → 3800、recommendPrice(300) → 800、recommendPrice(5000) → 12500、
 *     recommendPrice(30) → 100、recommendPrice(400) → 1000（ちょうど割り切れるときは上に跳ねない）
 *     recommendPrice(1500, 0.35) → 4300（目安 4,285.7… を 100 円単位で切り上げ）
 *     原価がごく小さい（0.000005 円など）ときも、最低 1 単位（100 円）にする
 * @param cost - 原価（円。0 より大きい数）
 * @param maxRate - 目標原価率（0 より大きく 1 以下。省略時は MAX_COST_RATE = 40%）
 * @returns 推奨販売価格（円。最低でも 100）
 */
export function recommendPrice(cost: number, maxRate: number = MAX_COST_RATE): number {
  // 1. 目安 = 原価 ÷ 目標原価率（浮動小数の誤差を消しておく）
  const target = roundFloat(cost / maxRate)
  // 2. 100 円単位で切り上げる（割り算の結果も誤差を消してから切り上げる）。
  //    誤差を消す丸めで 0 になるほど小さい原価でも 0 円にならないよう、最低 1 単位（100 円）にする
  return Math.max(PRICE_UNIT, Math.ceil(roundFloat(target / PRICE_UNIT)) * PRICE_UNIT)
}

/**
 * 原価率（原価 ÷ 販売価格）を計算する
 * 例: costRate(1500, 4000) → 0.375
 * @param cost - 原価（円）
 * @param price - 販売価格（円。0 より大きい数）
 * @returns 原価率（0.375 = 37.5%。浮動小数の誤差は消してある）
 */
export function costRate(cost: number, price: number): number {
  return roundFloat(cost / price)
}

/**
 * 原価率を「37.5%」の形（小数第 1 位まで）にする
 * 目標原価率（例: 40%）を少しだけ超える原価率（例: 0.4004）は四捨五入すると「40.0%」になり、
 * 「40% を超えています」の注意と食い違って見えるため、そのときだけ切り上げて「40.1%」と出す
 * @param rate - 原価率（0.375 = 37.5%）
 * @param maxRate - 目標原価率（切り上げるかの判定に使う。省略時は MAX_COST_RATE = 40%）
 * @returns 整形した原価率
 */
export function formatCostRate(rate: number, maxRate: number = MAX_COST_RATE): string {
  // 1. ふつうは小数第 1 位で四捨五入する
  const rounded = (rate * 100).toFixed(1)
  // 2. 目標を超えているのに四捨五入で目標以下の表示になるときは、小数第 1 位で切り上げる
  //    （0.35 × 100 が 35.00000000000001 になるような誤差は消してから比べる）
  if (rate > maxRate && Number(rounded) <= roundFloat(maxRate * 100)) {
    return `${(Math.ceil(roundFloat(rate * 1000)) / 10).toFixed(1)}%`
  }
  return `${rounded}%`
}

/**
 * 販売価格での原価率が目標原価率を超えているか
 * 例: exceedsMaxCostRate(1500, 3000) → true（50%）、exceedsMaxCostRate(400, 1000) → false（ちょうど 40%）、
 *     exceedsMaxCostRate(1500, 4000, 0.35) → true（37.5% は 35% を超える）
 * @param cost - 原価（円）
 * @param price - 販売価格（円。0 より大きい数）
 * @param maxRate - 目標原価率（省略時は MAX_COST_RATE = 40%）
 * @returns 超えていれば true
 */
export function exceedsMaxCostRate(cost: number, price: number, maxRate: number = MAX_COST_RATE): boolean {
  return costRate(cost, price) > roundFloat(maxRate)
}

/**
 * 目標原価率を見出し・注意の文言用に「40%」「37.5%」の形にする（余計な 0 は付けない）
 * 例: formatRateLabel(0.4) → '40%'、formatRateLabel(0.375) → '37.5%'、formatRateLabel(0.35) → '35%'
 * @param rate - 目標原価率（0.4 = 40%）
 * @returns 整形した率
 */
export function formatRateLabel(rate: number): string {
  // 0.35 × 100 = 35.00000000000001 のような誤差を消してから文字にする（String は末尾の 0 を付けない）
  return `${roundFloat(rate * 100)}%`
}

/**
 * 目標原価率の入力（% の数値の文字列）を率にする
 * 0 より大きく 100 以下の数（小数可）だけを受け付け、それ以外（空・範囲外・数でない）は null
 * 例: parseCostRateInput('40') → 0.4、parseCostRateInput('37.5') → 0.375、parseCostRateInput('0') → null、
 *     parseCostRateInput('101') → null、parseCostRateInput('abc') → null、parseCostRateInput('') → null、
 *     parseCostRateInput('４０') → 0.4（全角も可）、parseCostRateInput('1e2') → null、parseCostRateInput('0.00004') → null
 * @param input - 入力欄の文字列（% の数値）
 * @returns 率（0.4 = 40%）。受け付けない値なら null
 */
export function parseCostRateInput(input: string): number | null {
  // 1. 全角の数字・小数点（日本語入力のまま打った「４０．５」など）を半角にし、前後の空白を除く
  const normalized = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .trim()
  // 2. ふつうの 10 進数の形だけを受け付ける（空・'40abc'・'1e2'・'0x28'・'-5' などは除く）
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return null
  const percent = Number(normalized)
  // 3. 0 より大きく 100 以下だけを受け付け、率（÷ 100）にする
  if (percent <= 0 || percent > 100) return null
  // 4. 誤差を消す丸めで 0 になるほど小さい率（0.00004% など）は、推奨価格が無限大になるので受け付けない
  const rate = roundFloat(percent / 100)
  return rate > 0 ? rate : null
}

/**
 * ブランドの目標原価率の既定値を、入力欄の文字列（% の数値）にする
 * 例: defaultCostRateInput('ei8htplants') → '33.4'、defaultCostRateInput('hue') → '40'
 * @param brand - ブランド
 * @returns 既定値の入力（「33.4% に戻す」ボタンで入れる値）
 */
export function defaultCostRateInput(brand: CostRateBrand): string {
  return String(roundFloat(DEFAULT_COST_RATES[brand] * 100))
}

/**
 * このブラウザに覚えさせたブランドの目標原価率の入力を読む
 * 保存が無い・読めない（localStorage が使えない環境など）・受け付けない値のときは、そのブランドの既定値を返す
 * 古い共通のキー（COST_RATE_STORAGE_KEY そのもの）は読まない
 * @param brand - ブランド
 * @returns 目標原価率の入力欄の初期値（% の数値の文字列）
 */
export function loadCostRateInput(brand: CostRateBrand): string {
  /** そのブランドの既定の入力（ei8ht plants は '33.4'、ほかは '40'） */
  const fallback = defaultCostRateInput(brand)
  try {
    const saved = localStorage.getItem(costRateStorageKey(brand))
    return saved !== null && parseCostRateInput(saved) !== null ? saved : fallback
  } catch {
    return fallback
  }
}

/**
 * ブランドの目標原価率の入力をこのブラウザに覚えさせる。保存できなくても（localStorage が使えないなど）画面の動作は続ける
 * 受け付けない値（空・範囲外）は保存せず、前に覚えた値を残す（次に開いたとき正しい率から始まるように）
 * @param brand - ブランド
 * @param input - 目標原価率の入力欄の文字列（% の数値）
 */
export function saveCostRateInput(brand: CostRateBrand, input: string): void {
  if (parseCostRateInput(input) === null) return
  try { localStorage.setItem(costRateStorageKey(brand), input.trim()) } catch { /* 保存できなくても動作は続ける */ }
}
