/**
 * Stockists ページのユニットテスト
 *
 * - api.stockists.list を vi.mock でモックして本番 DB への接続を防ぐ
 * - 店舗名・エリア情報・ブランドタグの表示を確認する
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Stockists from '../Stockists'
import { api } from '../../lib/api'
import type { Stockist } from '../../lib/api'

// api モジュール全体をモックし、本番 API への接続を完全に遮断する
vi.mock('../../lib/api', () => ({
  api: {
    stockists: {
      // list は各テストで mockResolvedValue で上書きする
      list: vi.fn(),
    },
  },
}))

/**
 * テスト用 Stockist データのファクトリ関数
 * @param overrides - 上書きするフィールド
 * @returns 戻り値なし。
 */
const makeStockist = (overrides: Partial<Stockist> = {}): Stockist => ({
  id: 'store-1',
  name: 'テストショップ',
  area: '東京',
  address: '東京都渋谷区テスト1-2-3',
  url: null,
  brands: [],
  ...overrides,
})

describe('Stockists ページ', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセットして呼び出し履歴を初期化する
    vi.mocked(api.stockists.list).mockReset()
  })

  it('ストア一覧ページがレンダリングされる（"Stockists" 見出しが表示される）', async () => {
    // ページに "Stockists" という h1 見出しが表示されることを確認する
    vi.mocked(api.stockists.list).mockResolvedValue([])
    render(<Stockists />)
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
    expect(screen.getByText('Stockists')).toBeDefined()
  })

  it('店舗名が表示される', async () => {
    // api.stockists.list が返す店舗名が画面に表示されることを確認する
    const stores = [
      makeStockist({ id: 'store-1', name: 'グリーンショップ渋谷', area: '東京' }),
      makeStockist({ id: 'store-2', name: '植物堂大阪', area: '大阪' }),
    ]
    vi.mocked(api.stockists.list).mockResolvedValue(stores)
    render(<Stockists />)
    await waitFor(() => {
      expect(screen.getByText('グリーンショップ渋谷')).toBeDefined()
      expect(screen.getByText('植物堂大阪')).toBeDefined()
    })
  })

  it('エリア情報が h2 見出しとして表示される', async () => {
    // エリア名がセクション見出し（h2）として表示されることを確認する
    const stores = [
      makeStockist({ id: 'store-1', name: '東京の店', area: '東京' }),
      makeStockist({ id: 'store-2', name: '大阪の店', area: '大阪' }),
    ]
    vi.mocked(api.stockists.list).mockResolvedValue(stores)
    render(<Stockists />)
    await waitFor(() => {
      // エリア名が h2 要素として表示される
      const headings = screen.getAllByRole('heading', { level: 2 })
      const headingTexts = headings.map(h => h.textContent ?? '')
      expect(headingTexts.some(t => t.includes('東京'))).toBe(true)
      expect(headingTexts.some(t => t.includes('大阪'))).toBe(true)
    })
  })

  it('area が null の店舗は「その他」エリアに表示される', async () => {
    // area が null の店舗は「その他」グループにまとめられる
    const stores = [makeStockist({ id: 'store-1', name: 'エリア不明店', area: null })]
    vi.mocked(api.stockists.list).mockResolvedValue(stores)
    render(<Stockists />)
    await waitFor(() => {
      // 「その他」見出しが表示される
      const headings = screen.getAllByRole('heading', { level: 2 })
      const headingTexts = headings.map(h => h.textContent ?? '')
      expect(headingTexts.some(t => t.includes('その他'))).toBe(true)
      // 店舗名も表示される
      expect(screen.getByText('エリア不明店')).toBeDefined()
    })
  })

  it('ブランドタグが表示される', async () => {
    // 店舗に紐付くブランド名がタグとして表示されることを確認する
    const stores = [
      makeStockist({
        id: 'store-1',
        name: 'ブランドタグテスト店',
        area: '愛知',
        brands: ['ei8ht plants', 'Habitat Oides'],
      }),
    ]
    vi.mocked(api.stockists.list).mockResolvedValue(stores)
    render(<Stockists />)
    await waitFor(() => {
      // ブランドタグが span 要素として表示される
      expect(screen.getByText('ei8ht plants')).toBeDefined()
      expect(screen.getByText('Habitat Oides')).toBeDefined()
    })
  })

  it('ローディング中は「読み込み中...」が表示される', () => {
    // API が解決される前はローディングメッセージが表示される
    vi.mocked(api.stockists.list).mockReturnValue(new Promise(() => {})) // 永遠に保留
    render(<Stockists />)
    expect(screen.getByText('読み込み中...')).toBeDefined()
  })

  it('URL リンク付きの店舗名はリンクとして表示される', async () => {
    // url フィールドがある場合は店舗名が <a> 要素で表示される
    const stores = [
      makeStockist({
        id: 'store-1',
        name: 'リンク付き店舗',
        area: '福岡',
        url: 'https://example.com/shop',
      }),
    ]
    vi.mocked(api.stockists.list).mockResolvedValue(stores)
    render(<Stockists />)
    await waitFor(() => {
      // 店舗名がリンク要素として表示される
      expect(screen.getByRole('link', { name: 'リンク付き店舗' })).toBeDefined()
    })
  })
})

// ---- ブランドのラベルの色（HUE は短い表記・正式名のどちらでも同じ色） ----
describe('Stockists のブランドのラベルの色', () => {
  /** HUE のラベルの色（背景・文字） */
  const HUE_STYLE = { backgroundColor: '#f5ead8', color: '#6b3c1a' }

  beforeEach(() => {
    vi.mocked(api.stockists.list).mockReset()
  })

  it('brand が「HUE」（短い表記）のときラベルに HUE の色が付く', async () => {
    vi.mocked(api.stockists.list).mockResolvedValue([makeStockist({ id: 'a', name: '短い表記の店', brands: ['HUE'] })])
    render(<Stockists />)
    const label = await screen.findByText('HUE')
    expect(label).toHaveStyle(HUE_STYLE)
  })

  it('brand が「HUE by ei8ht plants」（正式名）のときも同じ HUE の色が付く', async () => {
    vi.mocked(api.stockists.list).mockResolvedValue([makeStockist({ id: 'b', name: '正式名の店', brands: ['HUE by ei8ht plants'] })])
    render(<Stockists />)
    const label = await screen.findByText('HUE by ei8ht plants')
    expect(label).toHaveStyle(HUE_STYLE)
  })

  it('ei8ht plants・Habitat Oides もそれぞれの色が付き、知らないブランドは灰色の既定の色になる', async () => {
    vi.mocked(api.stockists.list).mockResolvedValue([
      makeStockist({ id: 'c', name: '店C', brands: ['ei8ht plants', 'Habitat Oides', 'その他ブランド'] }),
    ])
    render(<Stockists />)
    expect(await screen.findByText('ei8ht plants')).toHaveStyle({ backgroundColor: '#e8f0e8', color: '#2d4a2d' })
    expect(screen.getByText('Habitat Oides')).toHaveStyle({ backgroundColor: '#dde4f5', color: '#1e3272' })
    expect(screen.getByText('その他ブランド')).toHaveStyle({ backgroundColor: '#f0f0f5' })
  })
})
