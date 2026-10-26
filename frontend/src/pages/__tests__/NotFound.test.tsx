/**
 * 公開サイトの 404 ページ（pages/NotFound.tsx）のテスト
 * - 存在しない URL を開くと、公開サイトのレイアウト（ヘッダー）の中に「ページが見つかりません」とブランドホームへのリンクが出る
 * - 検索エンジンに登録させない noindex が付く
 * - 英語表示に切り替えると英語の案内になる
 * ルートの組み方は App.tsx（Layout の中の path="*"）と同じにする
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Layout from '../../components/Layout'
import NotFound from '../NotFound'
import { LangProvider } from '../../lib/lang'

/**
 * 公開サイトのレイアウトの中で、指定した URL を開く
 * @param path - 開く URL
 * @returns render の結果
 */
function renderAt(path: string) {
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<div>ei8ht plants ブランドホーム</div>} />
            <Route path="/official" element={<div>公式サイトHOME</div>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </LangProvider>,
  )
}

describe('公開サイトの NotFound', () => {
  beforeEach(() => {
    // どのテストも日本語の表示から始める
    localStorage.setItem('site-lang', 'ja')
  })

  it('存在しない URL を開くと、ヘッダーのあるレイアウトの中に 404 と「ページが見つかりません」の見出しが出る', () => {
    renderAt('/no-such-page')
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'ページが見つかりません' })).toBeInTheDocument()
  })

  it('「トップページへ」のリンクが / を指し、押すと ei8ht plants ブランドホームに切り替わる', async () => {
    renderAt('/events/aaa/bbb')
    const link = screen.getByRole('link', { name: 'トップページへ' })
    expect(link).toHaveAttribute('href', '/')
    link.click()
    expect(await screen.findByText('ei8ht plants ブランドホーム')).toBeInTheDocument()
  })

  it('公式サイト配下の404からは公式HOMEへ戻れる', async () => {
    renderAt('/official/no-such-page')
    const link = screen.getByRole('link', { name: 'トップページへ' })
    expect(link).toHaveAttribute('href', '/official')
    link.click()
    expect(await screen.findByText('公式サイトHOME')).toBeInTheDocument()
  })

  it('検索エンジンに登録させない noindex の meta が付く', () => {
    renderAt('/no-such-page')
    expect(document.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull()
  })

  it('英語表示のときは「Page Not Found」と「Back to Home」になる', () => {
    localStorage.setItem('site-lang', 'en')
    renderAt('/no-such-page')
    expect(screen.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/')
    // 公式トップではなく ei8ht plants ブランドHOMEを指す仕様
  })
})
