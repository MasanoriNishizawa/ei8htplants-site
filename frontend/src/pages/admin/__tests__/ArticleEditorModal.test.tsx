/**
 * 記事編集モーダルの表示と親への入力通知を確認する。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Article, ArticleBody, Product } from '../../../lib/api'
import type { Block } from '../../../lib/blocks'
import ArticleEditorModal from '../articles/ArticleEditorModal'

/** モーダル表示に使う商品候補。 */
const products: Product[] = [
  { id: 'p1', name: '鉢 S', description: null, price: 3800, stock: 0, image_urls: [], tags: [], is_published: true, display_order: 1, category: null, created_at: '2026-01-01T00:00:00Z' },
]

/** 記事フォームと親コールバックを使ってモーダルを描画する。 */
function renderModal() {
  /** 記事本文フォームの初期値。 */
  const form: ArticleBody = { title: '記事タイトル', content: '', image_urls: [], tags: ['植物'], product_ids: ['p1'], is_published: true, display_order: 0 }
  /** 記事編集を示す表示データ。 */
  const editing = { id: 'a1', title: form.title } as Article
  /** ブロックエディタへ渡す本文ブロック。 */
  const blocks: Block[] = []
  /** 親が所有する各入力・操作の通知先。 */
  const callbacks = {
    onFieldChange: vi.fn(), onBlocksChange: vi.fn(), onTagInputChange: vi.fn(),
    onAddTag: vi.fn(), onRemoveTag: vi.fn(), onToggleProduct: vi.fn(),
    onRequestClose: vi.fn(), onSave: vi.fn(),
  }

  render(<ArticleEditorModal
    editing={editing} form={form} blocks={blocks} tagInput="新しいタグ" products={products}
    saving={false} saveError="" errorBoxStyle={{ color: 'red' }} {...callbacks}
  />)
  return callbacks
}

describe('ArticleEditorModal の表示と親への通知', () => {
  it('記事編集フォーム・タグ・関連商品・公開状態を表示する', () => {
    renderModal()

    expect(screen.getByRole('dialog', { name: '記事編集' })).toBeInTheDocument()
    expect(screen.getByLabelText('タイトル *')).toHaveValue('記事タイトル')
    expect(screen.getByText('植物')).toBeInTheDocument()
    expect(screen.getByText('鉢 S')).toBeInTheDocument()
    expect(screen.getByText('売り切れ')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '公開する' })).toBeChecked()
  })

  it('入力と各操作を親のコールバックへ渡し、Enter のタグ追加では送信を防ぐ', () => {
    const callbacks = renderModal()

    fireEvent.change(screen.getByLabelText('タイトル *'), { target: { value: '更新タイトル' } })
    expect(callbacks.onFieldChange).toHaveBeenCalledWith('title', '更新タイトル')
    fireEvent.change(screen.getByLabelText('タグ'), { target: { value: '追加タグ' } })
    expect(callbacks.onTagInputChange).toHaveBeenCalledWith('追加タグ')
    fireEvent.keyDown(screen.getByLabelText('タグ'), { key: 'Enter' })
    expect(callbacks.onAddTag).toHaveBeenCalledOnce()
    expect(callbacks.onRemoveTag).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'タグ「植物」を外す' }))
    expect(callbacks.onRemoveTag).toHaveBeenCalledWith('植物')
    fireEvent.click(screen.getByRole('checkbox', { name: /鉢 S/ }))
    expect(callbacks.onToggleProduct).toHaveBeenCalledWith('p1')
    fireEvent.click(screen.getByRole('checkbox', { name: '公開する' }))
    expect(callbacks.onFieldChange).toHaveBeenLastCalledWith('is_published', false)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(callbacks.onSave).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(callbacks.onRequestClose).toHaveBeenCalledOnce()
  })
})
