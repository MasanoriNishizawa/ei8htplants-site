import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PrivacyPolicy, { GA_OPTOUT_URL, GOOGLE_PARTNER_URL } from '../PrivacyPolicy'
import Footer from '../../components/Footer'
import { LangProvider, useLang } from '../../lib/lang'

/**
 *  テスト用に言語を切り替えるボタン
 * @returns 表示する React 要素。
 */
function LangToggle() {
  const { toggle } = useLang()
  return <button onClick={toggle}>言語切替</button>
}

/**
 * プライバシーポリシーのページを描画する
 * @returns render の結果
 */
function renderPage() {
  return render(
    <LangProvider>
      <MemoryRouter>
        <LangToggle />
        <PrivacyPolicy />
      </MemoryRouter>
    </LangProvider>
  )
}

beforeEach(() => {
  // どのテストも日本語から始める（前のテストで英語に切り替えた設定が残らないようにする）
  localStorage.setItem('site-lang', 'ja')
})

describe('PrivacyPolicy ページ', () => {
  it('見出しと、Google アナリティクスの利用・オプトアウトの案内を表示する', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /アクセス解析ツール（Google アナリティクス）/ })).toBeInTheDocument()
    const optout = screen.getByRole('link', { name: 'Google アナリティクス オプトアウト アドオン' })
    expect(optout).toHaveAttribute('href', GA_OPTOUT_URL)
    expect(optout).toHaveAttribute('target', '_blank')
    expect(optout).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: /Google による使用/ })).toHaveAttribute('href', GOOGLE_PARTNER_URL)
  })

  it('取得する情報・委託先・お問い合わせ窓口を表示する', () => {
    renderPage()
    expect(screen.getByText(/クレジットカード情報は決済代行会社（Square）が直接受け取り/)).toBeInTheDocument()
    expect(screen.getByText(/・Resend/)).toBeInTheDocument()
    expect(screen.getByText('メールアドレス：info@ei8htplants.com')).toBeInTheDocument()
    // サイト内リンクは同じタブで開く
    expect(screen.getByRole('link', { name: 'お問い合わせフォーム' })).not.toHaveAttribute('target')
  })

  it('全10節を表示する', () => {
    renderPage()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(10)
  })

  it('英語に切り替えると英語の本文になる', () => {
    renderPage()
    fireEvent.click(screen.getByText('言語切替'))
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Google Analytics Opt-out Browser Add-on' })).toHaveAttribute('href', GA_OPTOUT_URL)
  })
})

describe('Footer — プライバシーポリシーのリンク', () => {
  it.each(['/', '/events', '/shop'])('%s でもリンクを表示する', (path) => {
    render(
      <LangProvider>
        <MemoryRouter initialEntries={[path]}>
          <Footer />
        </MemoryRouter>
      </LangProvider>
    )
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/official/privacy')
  })
})
