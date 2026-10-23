/*
 * ショッピングカートのフックと Provider の入口
 *
 * 開発中の画面の自動更新（Fast Refresh）が効くよう、部品（CartProvider.tsx）とフック（このファイル）を分けている。
 * これまでどおり `import { CartProvider, useCart } from '../lib/cart'` で使える
 */
import { useContext } from 'react'
import { CartCtx, type CartContext } from './cartContext'

export { CartProvider } from './CartProvider'
export type { CartItem } from './cartContext'

/**
 * カートの操作関数と状態を取得するフック
 * @returns カートの中身と操作関数
 * @throws CartProvider の外で使ったとき
 */
export function useCart(): CartContext {
  const ctx = useContext(CartCtx)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
