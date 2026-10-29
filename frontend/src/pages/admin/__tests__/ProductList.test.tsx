/**
 * 管理画面の商品一覧表示（ProductList）のテスト。
 * 商品の主要情報、読み込み・空・エラー状態、行操作の通知と処理中制御を確認する。
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Product } from '../../../lib/api'
import ProductList from '../ProductList'

/** 商品一覧に表示する公開中の商品。 */
const publishedProduct: Product = {
  id: 'product-1', name: '斑入りの鉢', description: null, price: 12800, stock: 0,
  image_urls: ['https://example.com/plant.jpg'], tags: [], is_published: true,
  display_order: 1, category: '観葉植物', created_at: '2026-01-01T00:00:00Z',
}

/** 画像とカテゴリーが未設定の非公開商品。 */
const draftProduct: Product = {
  id: 'product-2', name: '素焼きの鉢', description: null, price: 3500, stock: 4,
  image_urls: [], tags: [], is_published: false,
  display_order: 2, category: null, created_at: '2026-01-02T00:00:00Z',
}

/**
 * 商品一覧へ渡す既定の props を組み立て、各操作を spy として返す。
 * @param overrides - 個別テストで差し替える表示状態や商品
 * @returns 各行操作の spy
 */
function renderProductList(overrides: Partial<React.ComponentProps<typeof ProductList>> = {}) {
  const onTogglePublish = vi.fn<(product: Product) => void>()
  const onEdit = vi.fn<(product: Product) => void>()
  const onDelete = vi.fn<(product: Product) => void>()
  const props: React.ComponentProps<typeof ProductList> = {
    products: [publishedProduct, draftProduct],
    loading: false,
    pageError: '',
    busyId: null,
    onTogglePublish,
    onEdit,
    onDelete,
    ...overrides,
  }
  render(<ProductList {...props} />)
  return { onTogglePublish, onEdit, onDelete }
}

describe('ProductList の商品一覧表示と操作', () => {
  it('画像・未設定の代替表示・カテゴリー・価格・在庫・公開状態を表示する', () => {
    renderProductList()

    const rows = screen.getAllByRole('row')
    const publishedRow = rows[1]
    const draftRow = rows[2]
    // alt="" の画像は読み上げ対象外なので、role ではなく一覧行内の img 要素を確認する。
    const productImage = publishedRow.querySelector('img')
    expect(productImage).not.toBeNull()
    expect(productImage).toHaveAttribute('src', 'https://example.com/plant.jpg')
    expect(within(publishedRow).getByText('観葉植物')).toBeInTheDocument()
    expect(within(publishedRow).getByText('¥12,800')).toBeInTheDocument()
    expect(within(publishedRow).getByText('0')).toBeInTheDocument()
    expect(within(publishedRow).getByRole('button', { name: /公開中/ })).toHaveTextContent('公開中')
    expect(within(draftRow).queryByRole('img')).not.toBeInTheDocument()
    // 画像が無い場合は、画像セルに灰色の 48px プレースホルダーを表示する。
    const placeholder = draftRow.querySelector('td:first-child > div')
    expect(placeholder).not.toBeNull()
    expect(placeholder).toHaveStyle({ width: '48px', height: '48px', background: '#f5f5f8' })
    expect(within(draftRow).getByText('—')).toBeInTheDocument()
    expect(within(draftRow).getByText('¥3,500')).toBeInTheDocument()
    expect(within(draftRow).getByText('4')).toBeInTheDocument()
    expect(within(draftRow).getByRole('button', { name: /非公開/ })).toHaveTextContent('非公開')
  })

  it('読み込み中は案内を表示し、商品表と空一覧の案内を表示しない', () => {
    renderProductList({ loading: true })

    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('商品がありません。')).not.toBeInTheDocument()
  })

  it('商品が0件でエラーがなければ空一覧の案内を表示する', () => {
    renderProductList({ products: [] })

    expect(screen.getByText('商品がありません。')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('エラーがある空一覧では空の案内を出さず、残っている商品行は表示する', () => {
    renderProductList({ products: [publishedProduct], pageError: '商品の読み込みに失敗しました' })

    expect(screen.queryByText('商品がありません。')).not.toBeInTheDocument()
    expect(screen.getByText('斑入りの鉢')).toBeInTheDocument()
  })

  it('処理中の商品だけ公開切替と削除を無効にし、編集は操作できるままにする', () => {
    renderProductList({ busyId: publishedProduct.id })

    const busyRow = screen.getAllByRole('row')[1]
    const idleRow = screen.getAllByRole('row')[2]
    expect(within(busyRow).getByRole('button', { name: /公開状態を切り替える/ })).toBeDisabled()
    expect(within(busyRow).getByRole('button', { name: '削除' })).toBeDisabled()
    expect(within(busyRow).getByRole('button', { name: '編集' })).toBeEnabled()
    expect(within(idleRow).getByRole('button', { name: /公開状態を切り替える/ })).toBeEnabled()
    expect(within(idleRow).getByRole('button', { name: '削除' })).toBeEnabled()
  })

  it('編集・削除を押すと対象の商品を親画面へ渡す', () => {
    const { onEdit, onDelete } = renderProductList()

    const row = screen.getAllByRole('row')[1]
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(publishedProduct)
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(publishedProduct)
  })

  it('公開状態を押すと現在の商品データを親画面へ渡す', () => {
    const { onTogglePublish } = renderProductList()

    fireEvent.click(screen.getAllByRole('button', { name: /公開状態を切り替える/ })[0])
    fireEvent.click(screen.getAllByRole('button', { name: /公開状態を切り替える/ })[1])

    expect(onTogglePublish).toHaveBeenNthCalledWith(1, publishedProduct)
    expect(onTogglePublish).toHaveBeenNthCalledWith(2, draftProduct)
  })

  it('操作列の見出しと各商品の操作セルに admin-sticky-col を保つ', () => {
    renderProductList()

    expect(screen.getByRole('columnheader', { name: '操作' })).toHaveClass('admin-sticky-col')
    for (const row of screen.getAllByRole('row').slice(1)) {
      expect(row.querySelector('td.admin-sticky-col')).not.toBeNull()
    }
  })
})
