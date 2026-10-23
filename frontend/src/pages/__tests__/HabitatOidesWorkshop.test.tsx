/**
 * Habitat Oides のワークショップのページ（pages/brands/HabitatOidesWorkshop.tsx）の参加費の表示のテスト
 * 日本語表示は「1,000円」、英語表示は「¥1,000」になる（lib/constants の WS_FEE_YEN）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HabitatOidesWorkshop from '../brands/HabitatOidesWorkshop'
import { LangProvider } from '../../lib/lang'

/**
 * ページを描画する
 * @returns render の結果
 */
function renderPage() {
  return render(
    <LangProvider>
      <MemoryRouter>
        <HabitatOidesWorkshop />
      </MemoryRouter>
    </LangProvider>,
  )
}

describe('HabitatOidesWorkshop の参加費', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('日本語表示では「1,000円」', () => {
    localStorage.setItem('site-lang', 'ja')
    renderPage()
    expect(screen.getByText('1,000円')).toBeInTheDocument()
  })

  it('英語表示では「¥1,000」で、「1,000円」は出ない', () => {
    localStorage.setItem('site-lang', 'en')
    renderPage()
    expect(screen.getByText('¥1,000')).toBeInTheDocument()
    expect(screen.queryByText('1,000円')).toBeNull()
  })
})
