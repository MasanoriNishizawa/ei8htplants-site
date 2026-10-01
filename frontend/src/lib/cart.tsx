import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Product } from './api'

export interface CartItem {
  product: Product
  quantity: number
}

interface CartContext {
  items: CartItem[]
  count: number
  add: (product: Product, quantity?: number) => void
  remove: (productId: string) => void
  updateQty: (productId: string, quantity: number) => void
  clear: () => void
}

const Ctx = createContext<CartContext | null>(null)

const STORAGE_KEY = 'ei8ht_cart'

/**
 * カート状態を管理し全体に提供する Context プロバイダー
 * @param children - 子コンポーネント
 */
export function CartProvider({ children }: { children: ReactNode }) {
  // 初期値は localStorage から復元。読み取り失敗時は空配列にフォールバック
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    } catch {
      return []
    }
  })

  // カート内容が変わるたびに localStorage を同期
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const add = (product: Product, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        // 既存アイテムは数量を加算（在庫上限でクランプ）
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: Math.min(i.quantity + quantity, product.stock) }
            : i
        )
      }
      return [...prev, { product, quantity: Math.min(quantity, product.stock) }]
    })
  }

  const remove = (productId: string) =>
    setItems((prev) => prev.filter((i) => i.product.id !== productId))

  const updateQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      remove(productId)
      return
    }
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i))
    )
  }

  const clear = () => setItems([])

  const count = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <Ctx.Provider value={{ items, count, add, remove, updateQty, clear }}>
      {children}
    </Ctx.Provider>
  )
}

/** カートの操作関数と状態を取得するフック */
export function useCart(): CartContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
