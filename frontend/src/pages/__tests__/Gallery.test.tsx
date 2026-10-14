/**
 * Gallery ページのユニットテスト
 *
 * - api.gallery.list を vi.mock でモックして本番 DB への接続を防ぐ
 * - 画像一覧の表示・ブランドフィルターボタンの存在を確認する
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import Gallery from '../Gallery'
import { api } from '../../lib/api'
import type { GalleryImage } from '../../lib/api'

// api モジュール全体をモックし、本番 API への接続を完全に遮断する
vi.mock('../../lib/api', () => ({
  api: {
    gallery: {
      // list は各テストで mockResolvedValue で上書きする
      list: vi.fn(),
    },
  },
}))

/**
 * テスト用ギャラリー画像データのファクトリ関数
 * @param id - 画像ID
 * @param brand - 画像のブランド（null の場合はブランドなし）
 * @param alt - 代替テキスト
 */
const makeImage = (id: string, brand: string | null = null, alt: string | null = null): GalleryImage => ({
  id,
  url: `https://example.com/gallery/${id}.jpg`,
  alt,
  brand,
  display_order: parseInt(id, 10) || 1,
})

describe('Gallery ページ', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセットして呼び出し履歴を初期化する
    vi.mocked(api.gallery.list).mockReset()
  })

  it('ギャラリーページがレンダリングされる（"Gallery" 見出しが表示される）', async () => {
    // ページに "Gallery" という h1 見出しが表示されることを確認する
    vi.mocked(api.gallery.list).mockResolvedValue([])
    render(<Gallery />)
    // h1 は同期的に表示される
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
    expect(screen.getByText('Gallery')).toBeDefined()
  })

  it('画像が一覧表示される', async () => {
    // api.gallery.list が返す画像が .gallery-item として表示されることを確認する
    const images = [
      makeImage('1', 'ei8ht plants', 'テスト画像1'),
      makeImage('2', 'Habitat Oides', 'テスト画像2'),
      makeImage('3', null, null), // alt が null → alt="" で装飾的画像として扱われる
    ]
    vi.mocked(api.gallery.list).mockResolvedValue(images)
    const { container } = render(<Gallery />)
    await waitFor(() => {
      // .gallery-item の数で表示件数を確認する（alt="" の img は role='img' にならないため）
      const items = container.querySelectorAll('.gallery-item')
      expect(items.length).toBe(3)
    })
  })

  it('ブランドフィルターボタンが存在する（All・ei8ht plants・Habitat Oides・HUE）', async () => {
    // 4つのフィルターボタン（All + 3ブランド）が表示されることを確認する
    vi.mocked(api.gallery.list).mockResolvedValue([])
    render(<Gallery />)
    // 同期的にレンダリングされるフィルターボタンを確認する
    expect(screen.getByRole('button', { name: 'All' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'ei8ht plants' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Habitat Oides' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'HUE by ei8ht plants' })).toBeDefined()
  })

  it('ローディング中は「読み込み中...」が表示される', () => {
    // API が解決される前はローディングメッセージが表示される
    vi.mocked(api.gallery.list).mockReturnValue(new Promise(() => {})) // 永遠に保留
    render(<Gallery />)
    expect(screen.getByText('読み込み中...')).toBeDefined()
  })

  it('画像が空のとき「まだ写真が追加されていません。」と表示される', async () => {
    // 空配列が返ったとき、画像なしメッセージが表示される
    vi.mocked(api.gallery.list).mockResolvedValue([])
    render(<Gallery />)
    await waitFor(() => {
      expect(screen.getByText('まだ写真が追加されていません。')).toBeDefined()
    })
  })

  it('ブランドフィルターをクリックすると api.gallery.list がブランド指定で再呼び出しされる', async () => {
    // フィルターボタンのクリックで API が再呼び出しされることを確認する
    vi.mocked(api.gallery.list).mockResolvedValue([])
    render(<Gallery />)
    await waitFor(() => {
      // 初回はブランドなし（undefined）で呼ばれる
      expect(vi.mocked(api.gallery.list)).toHaveBeenCalledWith(undefined)
    })
    // 「ei8ht plants」フィルターをクリックする
    fireEvent.click(screen.getByRole('button', { name: 'ei8ht plants' }))
    await waitFor(() => {
      // ブランド名を指定して API が呼ばれることを確認する
      expect(vi.mocked(api.gallery.list)).toHaveBeenCalledWith('ei8ht plants')
    })
  })
})
