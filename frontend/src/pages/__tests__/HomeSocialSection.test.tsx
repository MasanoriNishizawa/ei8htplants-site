/**
 * 公式ホームのInstagram・シェア領域について、ブランド順・外部リンク属性・翻訳alt・共有URLを確認する。
 */
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import HomeSocialSection from '../HomeSocialSection'
import { BRAND } from '../../lib/brands'
import { LangCtx } from '../../lib/langContext'

/**
 * 指定した言語でソーシャルセクションを描画する。
 * @param lang - 表示する言語
 * @returns 描画済みのInstagramセクション
 */
function renderSocialSection(lang: 'ja' | 'en') {
  // 1. テスト対象の翻訳だけを指定できるよう、言語Contextを明示して描画する。
  const result = render(
    <LangCtx.Provider value={{ lang, toggle: () => {} }}>
      <HomeSocialSection />
    </LangCtx.Provider>,
  )

  // 2. Instagram見出しを含むsectionを返し、以降の検索範囲を限定する。
  const section = screen.getByText('Instagram').closest('section')
  if (!section) throw new Error('Instagramセクションが見つかりません')
  return { ...result, section }
}

describe('HomeSocialSection の表示と共有リンク', () => {
  it('3ブランドのInstagramリンクを指定順に表示し、安全属性と日本語altを付ける', () => {
    // 1. 日本語表示でソーシャルセクションを描画する。
    const { section } = renderSocialSection('ja')

    // 2. 公式HOME固有の順序と、別タブ遷移時の安全属性を確認する。
    const links = within(section).getAllByRole('link').filter((link) => link.querySelector('img'))
    const expectedBrands = [BRAND.habitatOides, BRAND.ei8htPlants, BRAND.hue]
    expect(links).toHaveLength(expectedBrands.length)
    expectedBrands.forEach((brand, index) => {
      expect(links[index]).toHaveAttribute('href', brand.instagramUrl)
      expect(links[index]).toHaveAttribute('target', '_blank')
      expect(links[index]).toHaveAttribute('rel', 'noopener noreferrer')
      expect(within(links[index]).getByRole('img')).toHaveAttribute('src', brand.logo)
      expect(within(links[index]).getByRole('img')).toHaveAttribute('alt', `${brand.name} の Instagram`)
    })
  })

  it('英語altへ切り替え、XとThreadsへ公式HOMEのURLと共有文を渡す', () => {
    // 1. 英語表示でソーシャルセクションを描画する。
    const { section } = renderSocialSection('en')

    // 2. 各ブランドの画像説明が正式名を使った英語altへ切り替わることを確認する。
    const images = within(section).getAllByRole('img')
    expect(images.map((image) => image.getAttribute('alt'))).toEqual([
      `${BRAND.habitatOides.name} on Instagram`,
      `${BRAND.ei8htPlants.name} on Instagram`,
      `${BRAND.hue.name} on Instagram`,
    ])

    // 3. X・Threadsの共有リンクからURLと共有文を復元し、公式HOMEの値を確認する。
    const expectedUrl = `${window.location.origin}/official`
    const expectedText = 'ei8ht plants — Collect the strange.'
    const xLink = within(section).getByRole('link', { name: 'Post on X' })
    const xUrl = new URL(xLink.getAttribute('href') ?? '')
    expect(xUrl.origin + xUrl.pathname).toBe('https://x.com/intent/tweet')
    expect(xUrl.searchParams.get('url')).toBe(expectedUrl)
    expect(xUrl.searchParams.get('text')).toBe(expectedText)
    expect(xLink).toHaveAttribute('target', '_blank')
    expect(xLink).toHaveAttribute('rel', 'noopener noreferrer')

    const threadsLink = within(section).getByRole('link', { name: 'Share on Threads' })
    const threadsUrl = new URL(threadsLink.getAttribute('href') ?? '')
    expect(threadsUrl.origin + threadsUrl.pathname).toBe('https://www.threads.net/intent/post')
    expect(threadsUrl.searchParams.get('text')).toBe(`${expectedText}\n${expectedUrl}`)
    expect(threadsLink).toHaveAttribute('target', '_blank')
    expect(threadsLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
