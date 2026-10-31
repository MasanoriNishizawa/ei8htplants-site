/**
 * 公式ホームのショップ表示を、商品順・遷移先・価格・画像状態・売切れ表示まで確認する。
 */
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HomeShopSection from '../HomeShopSection'
import { MOCK_PRODUCTS } from '../../mocks/data'
import { formatYen } from '../../lib/format'

describe('HomeShopSection の商品表示', () => {
  /** 商品一覧の順序・商品詳細URL・一覧URL・共通価格書式を確認する。 */
  it('商品順と各リンク先、View All、円価格を表示する', () => {
    // 1. 既存の商品fixtureを使ってショップ領域を描画する。
    render(<MemoryRouter><HomeShopSection products={MOCK_PRODUCTS} /></MemoryRouter>)

    // 2. 商品カードがfixture順で並び、各詳細URLと価格が一致することを確認する。
    const heading = screen.getByRole('heading', { name: 'Shop' })
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    if (!section) return
    const cards = within(section).getAllByRole('link').filter((link) => link.classList.contains('home-shop-card'))
    expect(cards).toHaveLength(MOCK_PRODUCTS.length)
    MOCK_PRODUCTS.forEach((product, index) => {
      expect(cards[index]).toHaveAttribute('href', `/official/shop/${product.id}`)
      expect(within(cards[index]).getByText(product.name)).toBeInTheDocument()
      expect(within(cards[index]).getByText(formatYen(product.price))).toBeInTheDocument()
    })

    // 3. 商品一覧リンクは公式ショップへ遷移することを確認する。
    expect(within(section).getByRole('link', { name: 'View All →' })).toHaveAttribute('href', '/official/shop')
  })

  /** 商品画像のsrc/altと、画像が無いときの正方形placeholderを確認する。 */
  it('画像URLと商品名altを使い、画像なし商品はplaceholderを表示する', () => {
    // 1. 画像付き商品と画像なし商品を準備して描画する。
    const withImage = MOCK_PRODUCTS[0]
    const withoutImage = { ...MOCK_PRODUCTS[1], id: 'p-no-image', name: 'Image-less Pot', image_urls: [] }
    render(<MemoryRouter><HomeShopSection products={[withImage, withoutImage]} /></MemoryRouter>)

    // 2. 画像のURLと代替テキストが商品データに一致することを確認する。
    const productImage = screen.getByRole('img', { name: withImage.name })
    expect(productImage).toHaveAttribute('src', withImage.image_urls[0])
    expect(productImage).toHaveAttribute('alt', withImage.name)

    // 3. 画像無しカードでは画像を描かず、既存の薄色placeholderを表示することを確認する。
    const placeholderCard = screen.getByRole('link', { name: /Image-less Pot/ })
    expect(within(placeholderCard).queryByRole('img')).not.toBeInTheDocument()
    const placeholder = placeholderCard.querySelector('div[style*="--c-faint"]')
    expect(placeholder).toBeInTheDocument()
  })

  /** stock=0 の商品にだけSOLD OUT表示が出ることを確認する。 */
  it('在庫0の商品にSOLD OUTを重ね、在庫がある商品には表示しない', () => {
    // 1. 在庫あり・売切れfixtureを同じ一覧へ渡す。
    render(<MemoryRouter><HomeShopSection products={[MOCK_PRODUCTS[0], MOCK_PRODUCTS[2]]} /></MemoryRouter>)

    // 2. 在庫数が0のカードだけにSOLD OUTが表示されることを確認する。
    const availableCard = screen.getByRole('link', { name: /Habitat Style Pot S/ })
    const soldOutCard = screen.getByRole('link', { name: /Habitat Style Pot L \(Sold Out\)/ })
    expect(within(availableCard).queryByText('SOLD OUT')).not.toBeInTheDocument()
    expect(within(soldOutCard).getByText('SOLD OUT')).toBeInTheDocument()
  })
})
