import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BrandSiteLayout from '../BrandSiteLayout'
import { LangProvider } from '../../lib/lang'
import { habitatOidesSite } from '../../sites/habitat-oides/site'
import { hueSite } from '../../sites/hue/site'
import HabitatOides from '../../pages/brands/HabitatOides'
import Hue from '../../pages/brands/Hue'

function renderBrand(site: typeof habitatOidesSite | typeof hueSite, page: React.ReactNode) {
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
    expect(screen.getByRole('heading', { name: /A landscape,/ })).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: `${habitatOidesSite.name} navigation` })
    expect(within(navigation).getByRole('link', { name: 'Concept' })).toHaveAttribute('href', '/#world')
    expect(container.querySelector('#world')).toBeInTheDocument()
  })

  it('HUE は専用レイアウトと独自のトップページを表示する', () => {
    const { container } = renderBrand(hueSite, <Hue />)

    expect(container.querySelector('.brand-site-hue')).toBeInTheDocument()
    expect(container.querySelector('.brand-site-header--hue')).toBeInTheDocument()
    expect(container.querySelector('.hue-home')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /A living/ })).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: `${hueSite.name} navigation` })
    expect(within(navigation).getByRole('link', { name: 'Concept' })).toHaveAttribute('href', '/#point-of-view')
    expect(container.querySelector('#point-of-view')).toBeInTheDocument()
  })

  it.each([
    ['Habitat Oides', habitatOidesSite, <HabitatOides />],
    ['HUE', hueSite, <Hue />],
  ] as const)('%s のブランド切替リンクは別タブで全3ブランドへ移動する', (_brand, site, page) => {
    renderBrand(site, page)

    const headerSwitcher = screen.getByRole('navigation', { name: 'Other brand sites' })
    const headerLinks = within(headerSwitcher).getAllByRole('link')
    expect(headerLinks).toHaveLength(2)
    for (const link of headerLinks) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\//))
    }

    const footer = screen.getByRole('navigation', { name: 'Brand websites' })
    const footerLinks = within(footer).getAllByRole('link')
    expect(footerLinks).toHaveLength(3)
    for (const link of footerLinks) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})
