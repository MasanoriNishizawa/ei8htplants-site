import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BrandSiteLayout from '../BrandSiteLayout'
import { LangProvider } from '../../lib/lang'
import { habitatOidesSite } from '../../sites/habitat-oides/site'
import { hueSite } from '../../sites/hue/site'
import HabitatOides from '../../pages/brands/HabitatOides'
import Hue from '../../pages/brands/Hue'

beforeEach(() => {
  // HUE の動きは reduced-motion を有効にして、DOM テストで IntersectionObserver を必要としないようにする
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

function renderBrand(site: typeof habitatOidesSite | typeof hueSite, page: React.ReactNode) {
  localStorage.setItem('site-lang', 'ja')
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<BrandSiteLayout site={site} />}>
            <Route index element={page} />
          </Route>
        </Routes>
      </MemoryRouter>
    </LangProvider>,
  )
}

describe('独立ブランドサイトのレイアウトとページ', () => {
  it('Habitat Oides は専用レイアウトと独自のトップページを表示する', () => {
    const { container } = renderBrand(habitatOidesSite, <HabitatOides />)

    expect(container.querySelector('.brand-site-habitat-oides')).toBeInTheDocument()
    expect(container.querySelector('.brand-site-header--habitat-oides')).toBeInTheDocument()
    expect(container.querySelector('.habitat-home')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /自然の景色を、.*一鉢に仕立てる。/ })).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: `${habitatOidesSite.name} navigation` })
    expect(within(navigation).getByRole('link', { name: '世界観' })).toHaveAttribute('href', '/#world')
    expect(container.querySelector('#world')).toBeInTheDocument()
  })

  it('HUE は専用レイアウトと独自のトップページを表示する', () => {
    const { container } = renderBrand(hueSite, <Hue />)

    expect(container.querySelector('.brand-site-hue')).toBeInTheDocument()
    expect(container.querySelector('.brand-site-header--hue')).toBeInTheDocument()
    expect(container.querySelector('.hue-home')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /植物と、.*暮らす。/ })).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: `${hueSite.name} navigation` })
    expect(within(navigation).getByRole('link', { name: 'HUEについて' })).toHaveAttribute('href', '/about')
    expect(container.querySelector('#point-of-view')).toBeInTheDocument()
  })

  it.each([
    ['Habitat Oides', habitatOidesSite, <HabitatOides />],
    ['HUE', hueSite, <Hue />],
  ] as const)('%s のヘッダーから公式サイトと他ブランドへ移動できる', (_brand, site, page) => {
    renderBrand(site, page)

    // 公式サイトへのリンクは、独立ブランドのトップではなく公式トップを指す
    expect(screen.getByRole('link', { name: 'Official Site' })).toHaveAttribute('href', 'https://ei8htplants.com/official')

    const headerSwitcher = screen.getByRole('navigation', { name: 'Other brand sites' })
    const headerLinks = within(headerSwitcher).getByRole('link', { name: _brand === 'Habitat Oides' ? 'HUE by ei8ht plants' : 'Habitat Oides' })
    expect(within(headerSwitcher).getAllByRole('link')).toHaveLength(2)
    expect(headerLinks).toHaveAttribute('href', _brand === 'Habitat Oides' ? 'https://huebyei8htplants.com' : 'https://habitatoides.com')
    for (const link of within(headerSwitcher).getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }

    const footer = screen.getByRole('navigation', { name: 'Brand websites' })
    const footerLinks = within(footer).getAllByRole('link')
    expect(footerLinks).toHaveLength(3)
    expect(footerLinks.map((link) => link.getAttribute('href'))).toEqual([
      'https://ei8htplants.com/',
      'https://habitatoides.com',
      'https://huebyei8htplants.com',
    ])
    for (const link of footerLinks) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})
