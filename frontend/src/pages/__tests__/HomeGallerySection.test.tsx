/**
 * 公式ホームのGallery表示を、画像の2周表示と重複読み上げ防止属性まで確認する。
 */
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HomeGallerySection from '../HomeGallerySection'
import { MOCK_GALLERY } from '../../mocks/data'

describe('HomeGallerySection の表示', () => {
  /** Gallery見出し・リンク・画像列を描画し、マーキーの読み上げ属性を確認する。 */
  it('Gallery見出しとView Allリンクを表示し、3枚を装飾属性付きで2周描画する', () => {
    // 1. 3枚の既存fixtureを渡してギャラリーセクションを描画する。
    render(
      <MemoryRouter>
        <HomeGallerySection gallery={MOCK_GALLERY} fontFamily="serif" />
      </MemoryRouter>,
    )

    // 2. Gallery見出しと公式ギャラリーへのリンクが表示されることを確認する。
    const heading = screen.getByRole('heading', { name: 'Gallery' })
    const section = heading.parentElement?.parentElement
    expect(heading).toBeInTheDocument()
    expect(section).not.toBeNull()
    if (!section) return
    expect(within(section).getByRole('link', { name: 'View All →' })).toHaveAttribute('href', '/official/gallery')

    // 3. 画像はfixtureの順番で2周し、1周目はaltとlazy属性を保つことを確認する。
    const images = Array.from(section.querySelectorAll('img'))
    expect(images).toHaveLength(6)
    MOCK_GALLERY.forEach((image, index) => {
      expect(images[index]).toHaveAttribute('src', image.url)
      expect(images[index]).toHaveAttribute('alt', image.alt ?? '')
      expect(images[index]).toHaveAttribute('loading', 'lazy')
      expect(images[index + MOCK_GALLERY.length]).toHaveAttribute('src', image.url)
      expect(images[index + MOCK_GALLERY.length]).toHaveAttribute('alt', '')
      expect(images[index + MOCK_GALLERY.length]).toHaveAttribute('loading', 'lazy')
    })

    // 4. 2周目の各画像wrapperは読み上げ対象外になっていることを確認する。
    MOCK_GALLERY.forEach((_, index) => {
      expect(images[index + MOCK_GALLERY.length].parentElement).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
