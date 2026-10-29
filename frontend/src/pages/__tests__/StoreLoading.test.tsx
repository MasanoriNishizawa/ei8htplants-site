/**
 * ショップ・ジャーナルの 4 画面（Journal・JournalArticle・Shop・ShopProduct）の読み込み中の表示のテスト
 * 日本語表示では「読み込み中...」、英語表示では「Loading...」が出ることを確かめる
 * api は応答を返さない（ずっと読み込み中の）モックにして、本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactElement } from 'react'
import Journal from '../Journal'
import JournalArticle from '../JournalArticle'
import Shop from '../Shop'
import ShopProduct from '../ShopProduct'
import { LangProvider } from '../../lib/lang'
import { CartProvider } from '../../lib/cart'

/**
 *  いつまでも終わらない Promise（読み込み中のままにする）
 * @returns 解決しない Promise。各画面を読み込み中の状態に保つ
 */
const pending = () => new Promise<never>(() => {})

// 4 画面が使う api の関数を、いつまでも終わらないモックにする
vi.mock('../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: {
      articles: { list: vi.fn(() => pending()), get: vi.fn(() => pending()) },
      products: { list: vi.fn(() => pending()), get: vi.fn(() => pending()) },
    },
  }
})

/** 確かめる画面（名前・URL・ルートのパス・部品） */
const PAGES: { name: string; url: string; path: string; element: ReactElement }[] = [
  { name: 'Journal', url: '/journal', path: '/journal', element: <Journal /> },
  { name: 'JournalArticle', url: '/journal/a1', path: '/journal/:id', element: <JournalArticle /> },
  { name: 'Shop', url: '/shop', path: '/shop', element: <Shop /> },
  { name: 'ShopProduct', url: '/shop/p1', path: '/shop/:id', element: <ShopProduct /> },
]

/**
 * 画面を描画する
 * @param page - 確かめる画面
 * @returns render の結果
 */
function renderPage(page: (typeof PAGES)[number]) {
  return render(
    <LangProvider>
      <CartProvider>
        <MemoryRouter initialEntries={[page.url]}>
          <Routes>
            <Route path={page.path} element={page.element} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </LangProvider>,
  )
}

describe('ショップ・ジャーナルの読み込み中の表示', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it.each(PAGES)('$name は日本語表示のとき「読み込み中...」を出す', (page) => {
    localStorage.setItem('site-lang', 'ja')
    renderPage(page)
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).toBeNull()
  })

  it.each(PAGES)('$name は英語表示のとき「Loading...」を出す', (page) => {
    localStorage.setItem('site-lang', 'en')
    renderPage(page)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
