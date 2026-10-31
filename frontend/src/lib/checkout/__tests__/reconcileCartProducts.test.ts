import { describe, expect, it } from 'vitest'
import type { CartItem } from '../../cart'
import type { Product } from '../../api'
import { reconcileCartProducts } from '../reconcileCartProducts'

/** Checkout の商品再取得照合で使う商品を、指定した差分だけ変えて作る。 */
function createProduct(overrides: Partial<Product> = {}): Product {
  // 1. 商品の基本情報を用意し、各テストで必要な項目だけ上書きする
  return {
    id: 'p-1',
    name: '鉢 S',
    description: null,
    price: 3800,
    stock: 5,
    image_urls: [],
    tags: [],
    is_published: true,
    display_order: 1,
    category: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Product
}

/** 商品と注文数量から、カートの比較元となる行を作る。 */
function createCartItem(product: Product, quantity = 1): CartItem {
  // 1. 取得前の商品情報と数量を1行のカート商品としてまとめる
  return { product, quantity }
}

describe('Checkout の最新商品照合', () => {
  it('最新商品をカートの順序で返し、売り切れも照合結果に含めて通知する', () => {
    // 1. 商品取得順と異なる更新内容を含む2商品を照合する
    const first = createProduct({ id: 'p-1', name: '鉢 S' })
    const soldOut = createProduct({ id: 'p-2', name: '鉢 M', stock: 0 })
    const result = reconcileCartProducts(
      [createCartItem(first), createCartItem(createProduct({ id: 'p-2', name: '鉢 M' }))],
      [first, soldOut],
    )

    // 2. 最新一覧はカートの並びを保ち、売り切れ通知は名前付きで作る
    expect(result.latest).toEqual([first, soldOut])
    expect(result.removedIds).toEqual([])
    expect(result.notices).toEqual([{ kind: 'soldout', name: '鉢 M' }])
  })

  it('在庫が注文数量より減ったとき在庫数の通知を作る', () => {
    // 1. 数量4の商品が最新在庫2になった場合を照合する
    const original = createProduct()
    const latest = createProduct({ stock: 2 })
    const result = reconcileCartProducts([createCartItem(original, 4)], [latest])

    // 2. 最新商品と削除対象なしを返し、数量を調整する通知を作る
    expect(result.latest).toEqual([latest])
    expect(result.removedIds).toEqual([])
    expect(result.notices).toEqual([{ kind: 'stock', name: '鉢 S', stock: 2 }])
  })

  it('在庫減少と価格変更が同時に起きたとき、在庫・価格の順で通知を作る', () => {
    // 1. 数量と価格の両方が変わる最新商品を照合する
    const original = createProduct({ price: 3800 })
    const latest = createProduct({ stock: 2, price: 4200 })
    const result = reconcileCartProducts([createCartItem(original, 4)], [latest])

    // 2. 旧価格と新価格を保ち、既存画面と同じ通知順を確認する
    expect(result.notices).toEqual([
      { kind: 'stock', name: '鉢 S', stock: 2 },
      { kind: 'price', name: '鉢 S', oldPrice: 3800, newPrice: 4200 },
    ])
  })

  it('価格だけが変わったとき旧価格と新価格を通知する', () => {
    // 1. 在庫は足りていて価格だけ異なる商品を照合する
    const original = createProduct({ price: 3800 })
    const latest = createProduct({ price: 4500 })
    const result = reconcileCartProducts([createCartItem(original, 2)], [latest])

    // 2. 最新商品を返し、価格変更だけを通知する
    expect(result.latest).toEqual([latest])
    expect(result.notices).toEqual([{ kind: 'price', name: '鉢 S', oldPrice: 3800, newPrice: 4500 }])
  })

  it('404の商品は削除IDと元の商品名を使った通知にし、最新一覧から外す', () => {
    // 1. 取得成功・404・通信失敗が混ざる複数行を元の順で照合する
    const first = createProduct({ id: 'p-1', name: '鉢 S' })
    const removed = createProduct({ id: 'p-2', name: '鉢 M' })
    const unchecked = createProduct({ id: 'p-3', name: '鉢 L' })
    const newestFirst = createProduct({ id: 'p-1', name: '鉢 S 新' })
    const newestLast = createProduct({ id: 'p-4', name: '鉢 XL' })
    const result = reconcileCartProducts(
      [createCartItem(first), createCartItem(removed), createCartItem(unchecked), createCartItem(createProduct({ id: 'p-4', name: '鉢 XL' }))],
      [newestFirst, 'gone', null, newestLast],
    )

    // 2. 成功商品だけを元の順で返し、404の商品IDと通知を取り出す
    expect(result.latest).toEqual([newestFirst, newestLast])
    expect(result.removedIds).toEqual(['p-2'])
    expect(result.notices).toEqual([
      { kind: 'removed', name: '鉢 M' },
      { kind: 'unchecked', name: '鉢 L' },
    ])
  })

  it('通信失敗の商品は削除対象にせず、最新一覧から除いて確認失敗を通知する', () => {
    // 1. 通信失敗と成功商品を含む結果を照合する
    const failed = createProduct({ id: 'p-1', name: '鉢 S' })
    const current = createProduct({ id: 'p-2', name: '鉢 M' })
    const result = reconcileCartProducts(
      [createCartItem(failed), createCartItem(current)],
      [null, current],
    )

    // 2. 通信失敗行は削除せず、成功商品のみを返して案内用通知を作る
    expect(result.latest).toEqual([current])
    expect(result.removedIds).toEqual([])
    expect(result.notices).toEqual([{ kind: 'unchecked', name: '鉢 S' }])
  })

  it('商品情報に差がないとき通知を作らない', () => {
    // 1. 取得前後で価格・在庫・名前が一致する商品を照合する
    const unchanged = createProduct()
    const result = reconcileCartProducts([createCartItem(unchanged, 2)], [unchanged])

    // 2. 最新一覧だけを更新対象として返し、お知らせは空にする
    expect(result.latest).toEqual([unchanged])
    expect(result.removedIds).toEqual([])
    expect(result.notices).toEqual([])
  })
})
