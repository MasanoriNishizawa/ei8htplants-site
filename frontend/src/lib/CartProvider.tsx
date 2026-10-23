import { useState, useEffect, type ReactNode } from 'react'
import type { Product } from './api'
import { CART_STORAGE_KEY, CartCtx, loadCart, type CartItem } from './cartContext'

/**
 * カート状態を管理し全体に提供する Context プロバイダー
 * （画面からは lib/cart から import する。lib/cart がこのファイルを再 export している）
 * @param children - 子コンポーネント
 * @returns Context で包んだ子コンポーネント
 */
export function CartProvider({ children }: { children: ReactNode }) {
  // カートの中身。初期値は localStorage から復元する
  const [items, setItems] = useState<CartItem[]>(loadCart)

  // カート内容が変わるたびに localStorage へ保存する。
  // 容量オーバーやプライベートモードで保存できなくても、画面上のカートはそのまま使えるようにする
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    } catch { /* 保存できなくてもカートの操作は続ける */ }
  }, [items])

  /** 商品を追加する（すでにあれば数量を足す。在庫数が上限） */
  const add = (product: Product, quantity = 1) => {
    setItems((prev) => {
      // 同じ商品がすでにカートにあるか
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        // 既存アイテムは数量を加算（在庫上限でクランプ）。商品情報も渡された最新のものにする
        return prev.map((i) =>
          i.product.id === product.id
            ? { product, quantity: Math.min(i.quantity + quantity, product.stock) }
            : i
        )
      }
      // 新しい商品は末尾に足す（在庫数を超えない）
      return [...prev, { product, quantity: Math.min(quantity, product.stock) }]
    })
  }

  /** 商品をカートから外す */
  const remove = (productId: string) =>
    setItems((prev) => prev.filter((i) => i.product.id !== productId))

  /** 数量を変える（0 以下なら外す） */
  const updateQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      remove(productId)
      return
    }
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i))
    )
  }

  /** 最新の商品情報でカートを更新する（売り切れは外し、在庫より多い数量は在庫数まで減らす） */
  const syncProducts = (latest: Product[]) => {
    // id から最新の商品を引けるようにする
    const byId = new Map(latest.map((p) => [p.id, p]))
    setItems((prev) =>
      prev.flatMap((i) => {
        // この行の商品の最新の情報
        const p = byId.get(i.product.id)
        // 取り直せなかった商品はそのまま残す（通信の失敗で勝手に消さない）
        if (!p) return [i]
        // 売り切れはカートから外す
        if (p.stock <= 0) return []
        // 最新の情報に差し替え、在庫より多い数量は在庫数まで減らす
        return [{ product: p, quantity: Math.min(i.quantity, p.stock) }]
      })
    )
  }

  /** カートを空にする */
  const clear = () => setItems([])

  // 数量の合計（ヘッダーのカート表示用）
  const count = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <CartCtx.Provider value={{ items, count, add, remove, updateQty, syncProducts, clear }}>
      {children}
    </CartCtx.Provider>
  )
}
