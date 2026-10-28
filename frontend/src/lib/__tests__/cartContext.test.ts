/**
 * lib/cartContext.ts の loadCart（localStorage からカートを読み込む。中では toCartItem で 1 行ずつ整える）のテスト
 * - image_urls が null・項目なしの商品は捨てずに空の配列にそろえて残す
 * - image_urls の配列の中の文字列でない要素は除く
 * - image_urls が文字列などの不正な値の行・必須項目の無い行・数量が正の整数でない行は捨てる
 * - 読めない JSON・配列でない値は空のカート
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { CART_STORAGE_KEY, loadCart } from '../cartContext'

/** 正しい形の商品（画像の一覧だけ各テストで変える） */
const PRODUCT = {
  id: 'p-1', name: '鉢 S', description: null, price: 3800, stock: 5, image_urls: ['/img/a.png'],
  tags: [], is_published: true, display_order: 1, category: null, created_at: '2026-01-01T00:00:00Z',
}

/**
 * localStorage にカートの値を保存する
 * @param value - 保存する値（JSON にする）
 * @returns なし
 */
function saveRaw(value: unknown) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(value))
}

describe('loadCart', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('保存が無ければ空のカートになる', () => {
    expect(loadCart()).toEqual([])
  })

  it('正しい形の行はそのまま読み込む', () => {
    saveRaw([{ product: PRODUCT, quantity: 2 }])
    expect(loadCart()).toEqual([{ product: PRODUCT, quantity: 2 }])
  })

  it('image_urls が null の商品は捨てずに残し、image_urls を空の配列にする', () => {
    saveRaw([{ product: { ...PRODUCT, image_urls: null }, quantity: 1 }])
    const cart = loadCart()
    expect(cart).toHaveLength(1)
    expect(cart[0].product.image_urls).toEqual([])
    expect(cart[0].product.name).toBe('鉢 S')
  })

  it('image_urls の項目が無い商品も捨てずに残し、空の配列にする', () => {
    const { image_urls: _omit, ...withoutImages } = PRODUCT
    void _omit
    saveRaw([{ product: withoutImages, quantity: 1 }])
    const cart = loadCart()
    expect(cart).toHaveLength(1)
    expect(cart[0].product.image_urls).toEqual([])
  })

  it('image_urls の配列の中の文字列でない要素（数値・null・オブジェクト）は除く', () => {
    saveRaw([{ product: { ...PRODUCT, image_urls: ['/img/a.png', 1, null, { u: 'x' }, '/img/b.png'] }, quantity: 1 }])
    expect(loadCart()[0].product.image_urls).toEqual(['/img/a.png', '/img/b.png'])
  })

  it('image_urls が文字列・数値・オブジェクトの行は壊れた行として捨て、ほかの正しい行は残す', () => {
    saveRaw([
      { product: { ...PRODUCT, id: 'bad-1', image_urls: '/img/a.png' }, quantity: 1 },
      { product: { ...PRODUCT, id: 'bad-2', image_urls: 3 }, quantity: 1 },
      { product: { ...PRODUCT, id: 'bad-3', image_urls: { 0: 'x' } }, quantity: 1 },
      { product: PRODUCT, quantity: 1 },
    ])
    expect(loadCart().map((i) => i.product.id)).toEqual(['p-1'])
  })

  it('数量が 0・負・小数・文字列の行は捨てる', () => {
    saveRaw([
      { product: PRODUCT, quantity: 0 },
      { product: PRODUCT, quantity: -1 },
      { product: PRODUCT, quantity: 1.5 },
      { product: PRODUCT, quantity: '2' },
    ])
    expect(loadCart()).toEqual([])
  })

  it('商品の id・名前・値段・在庫のどれかが欠けている・型が違う行は捨てる', () => {
    saveRaw([
      { product: { ...PRODUCT, id: 1 }, quantity: 1 },
      { product: { ...PRODUCT, name: null }, quantity: 1 },
      { product: { ...PRODUCT, price: 'NaN' }, quantity: 1 },
      { product: { ...PRODUCT, stock: undefined }, quantity: 1 },
      { product: null, quantity: 1 },
      'ただの文字',
      null,
    ])
    expect(loadCart()).toEqual([])
  })

  it('読めない JSON や配列でない値のときは空のカートになる', () => {
    localStorage.setItem(CART_STORAGE_KEY, '{壊れた')
    expect(loadCart()).toEqual([])
    saveRaw({ product: PRODUCT, quantity: 1 })
    expect(loadCart()).toEqual([])
  })

  it('読み込んでも localStorage の元の値は書き換えない（null のまま）', () => {
    saveRaw([{ product: { ...PRODUCT, image_urls: null }, quantity: 1 }])
    loadCart()
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)!)[0].product.image_urls).toBeNull()
  })
})
