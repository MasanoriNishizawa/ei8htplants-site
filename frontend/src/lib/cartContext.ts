/*
 * ショッピングカートの Context・型と、localStorage からの読み込み
 *
 * 部品（CartProvider.tsx）とフック（cart.ts）を別のファイルに分けたため、両方が使うものをここに置く。
 * 画面からは lib/cart の useCart・CartProvider を使い、このファイルを直接 import しない
 */
import { createContext } from 'react'
import type { Product } from './api'

/** カートの 1 行（商品と数量） */
export interface CartItem {
  /** 商品（カートに入れた時点、または syncProducts で取り直した最新の情報） */
  product: Product
  /** 数量 */
  quantity: number
}

/** カートの Context に入れる値 */
export interface CartContext {
  /** カートの中身 */
  items: CartItem[]
  /** 数量の合計 */
  count: number
  /** 商品を追加する（すでにあれば数量を足す。在庫数が上限） */
  add: (product: Product, quantity?: number) => void
  /** 商品をカートから外す */
  remove: (productId: string) => void
  /** 数量を変える（0 以下なら外す） */
  updateQty: (productId: string, quantity: number) => void
  /**
   * サーバーから取り直した最新の商品情報でカートを更新する（値段・名前・画像・在庫）。
   * 在庫が 0 の商品は外し、在庫より多い数量は在庫数まで減らす。latest に無い商品はそのまま残す
   */
  syncProducts: (latest: Product[]) => void
  /** カートを空にする */
  clear: () => void
}

/** カートの Context。CartProvider の外で使うと useCart がエラーにする */
export const CartCtx = createContext<CartContext | null>(null)

/** localStorage にカートを保存するときのキー */
export const CART_STORAGE_KEY = 'ei8ht_cart'

/**
 * localStorage から読んだ 1 行を、カートの行として使える形に整える。
 * 古い版で保存した形や、手で書き換えられた値で画面（合計の計算・画像の表示）が壊れないようにする
 * 1. 数量が正の整数か
 * 2. 商品が、画面で使う項目（id・名前・値段・在庫）をそろえた形か
 * 3. 画像の一覧は、画像の無い商品だと null（または項目が無い）のことがあるので、捨てずに空の配列にそろえる。
 *    配列でも null でもない値（文字列など）は壊れた行とみなす
 * @param v - 読み込んだ値
 * @returns 使える形ならカートの行（画像の一覧を配列にそろえた写し）、使えなければ null
 */
function toCartItem(v: unknown): CartItem | null {
  if (typeof v !== 'object' || v === null) return null
  // 1. 数量
  const { product, quantity } = v as { product?: unknown; quantity?: unknown }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) return null
  // 2. 商品の必須の項目
  if (typeof product !== 'object' || product === null) return null
  const p = product as Partial<Record<keyof Product, unknown>>
  if (!(
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.price === 'number' && Number.isFinite(p.price) &&
    typeof p.stock === 'number'
  )) return null
  // 3. 画像の一覧
  if (p.image_urls !== null && p.image_urls !== undefined && !Array.isArray(p.image_urls)) return null
  // 配列にそろえた画像の一覧
  const imageUrls: string[] = Array.isArray(p.image_urls) ? p.image_urls.filter((u): u is string => typeof u === 'string') : []
  return { product: { ...(product as Product), image_urls: imageUrls }, quantity }
}

/**
 * localStorage からカートを読み込む。読めない・形が違う行は捨てる
 * @returns カートの中身（読めなければ空配列）
 */
export function loadCart(): CartItem[] {
  try {
    // 保存した文字列を読む（無ければ空のカート）
    const parsed: unknown = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    // 使える行だけを残す（使えない行は null になるので除く）
    return parsed.map(toCartItem).filter((i): i is CartItem => i !== null)
  } catch {
    return []
  }
}
