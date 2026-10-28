/**
 * 記事（Articles）・商品（Products）の編集モーダルの閉じ方のテスト
 * - キャンセル・幕・Esc: 書きかけなら確認（キャンセルなら開いたまま）、書きかけでなければ確認なしで閉じる
 * - 日本語の変換中の Esc では閉じない
 * - 保存中はキャンセル・幕・Esc のどれでも閉じない（確認も出さない）
 * - 関連商品（product_ids）を外して付け直しただけなら、並び順が変わっても書きかけ扱いにしない
 * - 写真の拡大表示（ImageLightbox）の Esc は preventDefault で受け取り済みにするので、後ろのモーダルは閉じない
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { api, type Article, type Product } from '../../../lib/api'
import AdminArticles from '../Articles'
import AdminProducts from '../Products'
import ImageLightbox from '../../../components/ImageLightbox'
import { useEscapeToClose, UNSAVED_CLOSE_MESSAGE } from '../UnsavedChanges'

// 使う api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      articles: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      products: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      upload: vi.fn(),
    },
  }
})

/** 関連商品の候補 2 件 */
const PRODUCTS: Product[] = [
  { id: 'p1', name: '鉢 S', description: null, price: 3800, stock: 5, image_urls: [], tags: [], is_published: true, display_order: 1, category: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'p2', name: '鉢 M', description: null, price: 5200, stock: 3, image_urls: [], tags: [], is_published: true, display_order: 2, category: null, created_at: '2026-01-01T00:00:00Z' },
] as Product[]

/** 関連商品が 2 つ付いた記事 */
const ARTICLE = {
  id: 'a1', title: '鉢の選び方', content: null, image_urls: [], tags: [], product_ids: ['p1', 'p2'],
  is_published: true, display_order: 0, created_at: '2026-01-01T00:00:00Z', published_at: null,
} as unknown as Article

/** confirm のモック */
let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.mocked(api.articles.list).mockReset().mockResolvedValue([ARTICLE])
  vi.mocked(api.products.list).mockReset().mockResolvedValue(PRODUCTS)
  vi.mocked(api.articles.update).mockReset()
  vi.mocked(api.products.create).mockReset()
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
})

afterEach(() => {
  confirmSpy.mockRestore()
})

/**
 *  モーダル（role=dialog）。閉じていれば null
 * @returns 戻り値なし。
 */
const dialog = () => screen.queryByRole('dialog')

/**
 *  モーダルの後ろの幕（モーダルの親の固定の div）
 * @returns 戻り値なし。
 */
const backdrop = () => dialog()!.parentElement as HTMLElement

describe('記事の編集モーダル（Articles）', () => {
  /**
   *  一覧から記事の編集モーダルを開く
   * @returns 戻り値なし。
   */
  async function openEdit() {
    render(<AdminArticles />)
    fireEvent.click(await screen.findByRole('button', { name: '編集' }))
    expect(dialog()).not.toBeNull()
  }

  it('書きかけでなければキャンセルで確認なしに閉じる', async () => {
    await openEdit()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('タイトルを変えてキャンセル・幕を押すと確認が出て、キャンセルすれば開いたまま', async () => {
    await openEdit()
    fireEvent.change(screen.getByLabelText(/タイトル/), { target: { value: '書きかけ' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenLastCalledWith(UNSAVED_CLOSE_MESSAGE)
    expect(dialog()).not.toBeNull()
    fireEvent.click(backdrop())
    expect(confirmSpy).toHaveBeenCalledTimes(2)
    expect(dialog()).not.toBeNull()
  })

  it('書きかけで確認に OK すると閉じる', async () => {
    await openEdit()
    fireEvent.change(screen.getByLabelText(/タイトル/), { target: { value: '書きかけ' } })
    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(dialog()).toBeNull()
  })

  it('Esc: 書きかけでなければ閉じ、書きかけなら確認を出す', async () => {
    await openEdit()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    fireEvent.change(screen.getByLabelText(/タイトル/), { target: { value: '書きかけ' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CLOSE_MESSAGE)
    expect(dialog()).not.toBeNull()
  })

  it('日本語の変換中の Esc では閉じず、確認も出さない', async () => {
    await openEdit()
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(dialog()).not.toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('保存中はキャンセル・幕・Esc のどれでも閉じず、確認も出さない', async () => {
    await openEdit()
    fireEvent.change(screen.getByLabelText(/タイトル/), { target: { value: '保存中の記事' } })
    vi.mocked(api.articles.update).mockReturnValue(new Promise(() => {}))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('button', { name: '保存中...' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    fireEvent.click(backdrop())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog()).not.toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('関連商品を外して付け直しただけ（並び順が変わる）なら、キャンセルで確認なしに閉じる', async () => {
    await openEdit()
    const p1 = screen.getByRole('checkbox', { name: /鉢 S/ })
    fireEvent.click(p1)
    expect(p1).not.toBeChecked()
    fireEvent.click(p1)
    expect(p1).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('関連商品を外したままなら書きかけとして確認が出る', async () => {
    await openEdit()
    fireEvent.click(screen.getByRole('checkbox', { name: /鉢 S/ }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CLOSE_MESSAGE)
  })
})

describe('商品の編集モーダル（Products）', () => {
  /**
   *  新規作成のモーダルを開く
   * @returns 戻り値なし。
   */
  async function openNew() {
    render(<AdminProducts />)
    fireEvent.click(await screen.findByRole('button', { name: '+ 商品追加' }))
    expect(dialog()).not.toBeNull()
  }

  it('何も入れていなければキャンセル・幕・Esc で確認なしに閉じる', async () => {
    await openNew()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(dialog()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ 商品追加' }))
    fireEvent.click(backdrop())
    expect(dialog()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ 商品追加' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog()).toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('商品名を入れると、キャンセル・Esc で確認が出て、キャンセルすれば開いたまま', async () => {
    await openNew()
    fireEvent.change(screen.getByLabelText(/商品名/), { target: { value: '新しい鉢' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(confirmSpy).toHaveBeenCalledTimes(2)
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CLOSE_MESSAGE)
    expect(dialog()).not.toBeNull()
  })

  it('日本語の変換中の Esc では閉じない', async () => {
    await openNew()
    fireEvent.change(screen.getByLabelText(/商品名/), { target: { value: 'はち' } })
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(dialog()).not.toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('保存中はキャンセル・幕・Esc のどれでも閉じない', async () => {
    await openNew()
    fireEvent.change(screen.getByLabelText(/商品名/), { target: { value: '新しい鉢' } })
    fireEvent.change(screen.getByLabelText(/価格/), { target: { value: '1000' } })
    vi.mocked(api.products.create).mockReturnValue(new Promise(() => {}))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存中...' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    fireEvent.click(backdrop())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog()).not.toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

describe('写真の拡大表示（ImageLightbox）の Esc と後ろのモーダル', () => {
  /**
   *  useEscapeToClose を使うモーダルの上に、写真の拡大表示を重ねる部品
   * @returns 表示する React 要素。
   */
  function ModalWithLightbox() {
    // Esc キーで閉じる対象になる背面モーダルの表示状態
    const [modalOpen, setModalOpen] = useState(true)
    // 背面モーダルの上に重ねる写真拡大表示の状態
    const [lightbox, setLightbox] = useState(true)
    useEscapeToClose(modalOpen, () => setModalOpen(false))
    return (
      <div>
        {modalOpen && <div role="dialog" aria-label="後ろのモーダル">モーダル</div>}
        {lightbox && <ImageLightbox images={['https://example.com/a.jpg']} index={0} onClose={() => setLightbox(false)} onChange={() => {}} alt="テスト写真" />}
      </div>
    )
  }

  it('Esc を押すと拡大表示だけが閉じ、後ろのモーダルは開いたまま。もう一度 Esc でモーダルが閉じる', () => {
    render(<ModalWithLightbox />)
    expect(screen.getByRole('img', { name: 'テスト写真' })).toBeInTheDocument()
    // 1. 1 回目の Esc は拡大表示が受け取る（preventDefault）
    const first = fireEvent.keyDown(window, { key: 'Escape' })
    expect(first).toBe(false) // preventDefault された
    expect(screen.queryByRole('img', { name: 'テスト写真' })).toBeNull()
    expect(screen.getByRole('dialog', { name: '後ろのモーダル' })).toBeInTheDocument()
    // 2. 2 回目の Esc でモーダルが閉じる
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '後ろのモーダル' })).toBeNull()
  })
})
