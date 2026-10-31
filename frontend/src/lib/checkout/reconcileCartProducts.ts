import type { CartItem } from '../cart'
import type { Product } from '../api'

/**
 * 最新の商品情報との照合結果として表示するお知らせ。
 * 文言は画面側で翻訳し、ここでは種類と必要な値だけを保持する。
 */
export type CartNotice =
  | { kind: 'soldout'; name: string }
  | { kind: 'removed'; name: string }
  | { kind: 'unchecked'; name: string }
  | { kind: 'stock'; name: string; stock: number }
  | { kind: 'price'; name: string; oldPrice: number; newPrice: number }

/** API から取得した各商品の結果。404 は gone、その他の失敗は null で表す。 */
export type CartProductLookupResult = Product | 'gone' | null

/**
 * カートの控えと最新の商品取得結果を順に照合し、画面反映に必要な値を組み立てる。
 * 配列の対応付けは既存処理と同じく results の各要素に対する snapshot[idx] で行う。
 * @param snapshot - 再取得を始めた時点のカート行
 * @param results - snapshot の各商品に対する最新情報、404、または通信失敗
 * @returns 最新商品一覧、削除対象 ID、および画面表示順のお知らせ
 */
export function reconcileCartProducts(
  snapshot: CartItem[],
  results: CartProductLookupResult[],
): { latest: Product[]; removedIds: string[]; notices: CartNotice[] } {
  // 最新の商品一覧、削除対象、お知らせを元のカート順で蓄積する
  const latest: Product[] = []
  const removedIds: string[] = []
  const notices: CartNotice[] = []

  // 1. API結果を元のカート行と同じ添字で照合する
  results.forEach((productResult, idx) => {
    // 既存処理と同じく、取得結果の添字から比較元のカート行を参照する
    const cartItem = snapshot[idx]

    // 2. 削除済み・確認失敗・在庫切れを判定し、それぞれの結果を記録する
    if (productResult === 'gone') {
      removedIds.push(cartItem.product.id)
      notices.push({ kind: 'removed', name: cartItem.product.name })
      return
    }
    if (!productResult) {
      notices.push({ kind: 'unchecked', name: cartItem.product.name })
      return
    }

    // 在庫切れ商品も最新一覧には含め、削除は既存の syncProducts に委ねる
    latest.push(productResult)
    if (productResult.stock <= 0) {
      notices.push({ kind: 'soldout', name: productResult.name })
      return
    }

    // 3. 注文数量と価格に差があれば、既存の表示順でお知らせを追加する
    if (productResult.stock < cartItem.quantity) {
      notices.push({ kind: 'stock', name: productResult.name, stock: productResult.stock })
    }
    if (productResult.price !== cartItem.product.price) {
      notices.push({
        kind: 'price',
        name: productResult.name,
        oldPrice: cartItem.product.price,
        newPrice: productResult.price,
      })
    }
  })

  return { latest, removedIds, notices }
}
