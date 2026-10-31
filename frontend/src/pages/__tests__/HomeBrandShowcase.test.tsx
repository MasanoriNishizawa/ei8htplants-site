/**
 * 公式ホームのブランド紹介ストリップについて、表示内容・外部リンク属性・画面幅ごとの操作を確認する。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HomeBrandShowcase from '../HomeBrandShowcase'
import { BRAND_SHOWCASES } from '../../lib/brandShowcase'

/** matchMedia に登録された画面幅変更callbackを、テストから発火できるようにする型 */
type MediaChangeListener = (event: MediaQueryListEvent) => void

/**
 * コンポーネントが使う max-width メディアクエリをテスト用に登録する。
 * @param matches - 初回描画時にスマホ幅条件へ一致させるか
 * @returns 登録済みの画面幅変更listener
 */
function mockMatchMedia(matches: boolean) {
  // matchMediaに登録されたchangeイベントlistenerを保持する
  const listeners: MediaChangeListener[] = []
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener: (_type: string, listener: MediaChangeListener) => listeners.push(listener),
    removeEventListener: (_type: string, listener: MediaChangeListener) => {
      const index = listeners.indexOf(listener)
      if (index >= 0) listeners.splice(index, 1)
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
  return listeners
}

/**
 * HomeBrandShowcase を Router 内で描画し、sectionを返す。
 * @returns 描画したブランド紹介sectionとそのDOM要素
 */
function renderShowcase() {
  // LinkがRouterを参照できるよう、メモリ上のルート内で部品を描画する
  const result = render(<MemoryRouter><HomeBrandShowcase /></MemoryRouter>)
  const section = screen.getByRole('heading', { name: '私たちのブランド' }).closest('section')
  if (!section) throw new Error('ブランド紹介sectionが見つかりません')
  return { ...result, section }
}

afterEach(() => {
  // 各テストのmatchMedia差し替えがほかのテストへ残らないようにする
  vi.unstubAllGlobals()
})

describe('HomeBrandShowcase の表示と操作', () => {
  it('ブランド見出しとOUR BRANDSへのリンク、3ブランドの順序・URL・別タブ属性を表示する', () => {
    // 1. デスクトップ幅でブランド紹介sectionを描画する
    mockMatchMedia(false)
    const { section } = renderShowcase()

    // 2. 見出しとブランド一覧への公式URLを確認する
    expect(within(section).getByRole('heading', { name: '私たちのブランド' })).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: /すべてのブランド/ })).toHaveAttribute('href', '/official/brands')

    // 3. ブランドデータの順序どおりにリンクし、外部遷移の安全属性が付くことを確認する
    const cards = section.querySelectorAll<HTMLAnchorElement>('.brand-strip-item')
    expect(cards).toHaveLength(BRAND_SHOWCASES.length)
    BRAND_SHOWCASES.forEach((brand, index) => {
      expect(cards[index]).toHaveAttribute('href', brand.to)
      expect(cards[index]).toHaveAttribute('target', '_blank')
      expect(cards[index]).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  it('デスクトップでは先頭カードを初期展開し、hover・focusで切り替え、mouseleaveで先頭へ戻す', async () => {
    // 1. デスクトップ幅で初期状態を確認する
    mockMatchMedia(false)
    const { section } = renderShowcase()
    const cards = section.querySelectorAll<HTMLAnchorElement>('.brand-strip-item')
    expect(cards[0]).toHaveStyle({ flex: '0 0 55%' })
    expect(cards[1]).toHaveStyle({ flex: '1 1 0' })

    // 2. 2枚目へのhoverで2枚目が展開し、キーボードfocusでも3枚目へ切り替わる
    fireEvent.mouseEnter(cards[1])
    await waitFor(() => expect(cards[1]).toHaveStyle({ flex: '0 0 55%' }))
    fireEvent.focus(cards[2])
    await waitFor(() => expect(cards[2]).toHaveStyle({ flex: '0 0 55%' }))

    // 3. ストリップからpointerが離れると初期の先頭カードへ戻る
    fireEvent.mouseLeave(section.querySelector('.brand-strip') as HTMLElement)
    await waitFor(() => expect(cards[0]).toHaveStyle({ flex: '0 0 55%' }))
  })

  it('画面幅がモバイルへ変わると全カードの展開情報を表示し、説明文を隠してinline flexを指定しない', async () => {
    // 1. デスクトップ幅から始め、change listenerを取得する
    const listeners = mockMatchMedia(false)
    const { section } = renderShowcase()
    const cards = section.querySelectorAll<HTMLAnchorElement>('.brand-strip-item')

    // 2. メディア条件の変化を通知し、すべてのカードでロゴとView Brandが表示されるのを待つ
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
    await waitFor(() => {
      BRAND_SHOWCASES.forEach((brand, index) => {
        const card = cards[index]
        within(card).getAllByRole('img', { name: brand.shortName }).forEach((logo) => expect(logo).toBeVisible())
        expect(within(card).getByText('View Brand')).toBeVisible()
        expect(within(card).queryByText(brand.descJa)).not.toBeInTheDocument()
      })
    })

    // 3. モバイルカードは縦表示用のCSSへ任せ、inline flex値を持たないことを確認する
    cards.forEach((card) => expect(card.style.flex).toBe(''))
  })
})
