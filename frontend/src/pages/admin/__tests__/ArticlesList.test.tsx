/**
 * 管理画面の記事一覧（ArticlesList）の表示と親への操作通知を確認する。
 * 読み込み中・空一覧・ページエラー時の表示と、記事情報・行操作を検証する。
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Article } from '../../../lib/api'
import ArticlesList from '../articles/ArticlesList'

/** 画像・タグ・公開日を持つ公開済み記事。 */
const publishedArticle: Article = {
  id: 'article-1',
  title: '朝の光で育てる植物',
  content: null,
  image_urls: ['https://example.com/article.jpg'],
  tags: ['植物', '育て方'],
  product_ids: [],
  is_published: true,
  display_order: 1,
  published_at: '2026-01-02T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
}

/** 画像と公開日がない非公開記事。 */
const draftArticle: Article = {
  id: 'article-2',
  title: '鉢の選び方',
  content: null,
  image_urls: [],
  tags: [],
  product_ids: [],
  is_published: false,
  display_order: 2,
  published_at: null,
  created_at: '2026-01-02T00:00:00Z',
}

/**
 * 記事一覧を既定状態で描画し、操作コールバックを返す。
 * @param overrides - 個別に差し替える一覧の表示状態
 * @returns 記事操作のコールバック
 */
function renderArticlesList(overrides: Partial<React.ComponentProps<typeof ArticlesList>> = {}) {
  const onTogglePublish = vi.fn<(article: Article) => void>()
  const onEdit = vi.fn<(article: Article) => void>()
  const onDelete = vi.fn<(article: Article) => void>()
  const props: React.ComponentProps<typeof ArticlesList> = {
    articles: [publishedArticle, draftArticle],
    loading: false,
    hasPageError: false,
    busyId: null,
    onTogglePublish,
    onEdit,
    onDelete,
    ...overrides,
  }
  render(<ArticlesList {...props} />)
  return { onTogglePublish, onEdit, onDelete }
}

describe('ArticlesList の記事一覧表示と操作', () => {
  it('読み込み中は案内を表示し、記事表と空一覧の案内を表示しない', () => {
    renderArticlesList({ articles: [], loading: true })

    // 1. 読み込み案内だけが表示され、一覧と空表示はまだ出ないことを確認する。
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('記事がありません。')).not.toBeInTheDocument()
  })

  it('記事が0件でページエラーがなければ空一覧の案内を表示する', () => {
    renderArticlesList({ articles: [] })

    // 1. 空状態の案内を表示し、記事表も空のまま存在することを確認する。
    expect(screen.getByText('記事がありません。')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(1)
  })

  it('記事が0件でページエラーがある場合は空一覧の案内を抑止する', () => {
    renderArticlesList({ articles: [], hasPageError: true })

    // 1. エラーは親ページが表示するため、この一覧は空案内を重ねて表示しない。
    expect(screen.queryByText('記事がありません。')).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(1)
  })

  it('画像の有無・タイトル・タグ・公開日・公開状態を記事ごとに表示する', () => {
    renderArticlesList()

    // 1. 画像ありの記事と画像なしの記事を行単位で確認する。
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    const publishedRow = rows[1]
    const draftRow = rows[2]
    const articleImage = publishedRow.querySelector('img')
    expect(articleImage).not.toBeNull()
    expect(articleImage).toHaveAttribute('src', 'https://example.com/article.jpg')
    expect(publishedRow.querySelector('td:first-child > div')).toBeNull()
    expect(within(publishedRow).getByText('朝の光で育てる植物')).toBeInTheDocument()
    expect(within(publishedRow).getByText('植物')).toBeInTheDocument()
    expect(within(publishedRow).getByText('育て方')).toBeInTheDocument()
    expect(within(publishedRow).getByText('2026/01/02')).toBeInTheDocument()
    expect(within(publishedRow).getByRole('button', { name: '「朝の光で育てる植物」の公開状態を切り替える（いまは公開中）' })).toHaveTextContent('公開中')

    // 2. 画像なしの記事には代替表示があり、日付なしは記号、状態は非公開と表示する。
    expect(draftRow.querySelector('img')).toBeNull()
    expect(draftRow.querySelector('td:first-child > div')).not.toBeNull()
    expect(within(draftRow).getByText('鉢の選び方')).toBeInTheDocument()
    expect(within(draftRow).getByText('—')).toBeInTheDocument()
    expect(within(draftRow).getByRole('button', { name: '「鉢の選び方」の公開状態を切り替える（いまは非公開）' })).toHaveTextContent('非公開')
  })

  it('公開状態の切替を押すと対象の記事を親へ渡す', () => {
    const { onTogglePublish } = renderArticlesList()

    // 1. 公開中の記事の操作を押し、同じ記事データをコールバックへ渡す。
    fireEvent.click(screen.getByRole('button', { name: '「朝の光で育てる植物」の公開状態を切り替える（いまは公開中）' }))
    expect(onTogglePublish).toHaveBeenCalledExactlyOnceWith(publishedArticle)
  })

  it('編集を押すと対象の記事を親へ渡す', () => {
    const { onEdit } = renderArticlesList()

    // 1. 対象記事の行にある編集を押し、記事データをコールバックへ渡す。
    const row = screen.getByRole('row', { name: /朝の光で育てる植物/ })
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(publishedArticle)
  })

  it('削除を押すと対象の記事を親へ渡す', () => {
    const { onDelete } = renderArticlesList()

    // 1. 対象記事の行にある削除を押し、記事データをコールバックへ渡す。
    const row = screen.getByRole('row', { name: /鉢の選び方/ })
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(draftArticle)
  })

  it('処理中の記事だけ公開切替と削除を無効にする', () => {
    renderArticlesList({ busyId: publishedArticle.id })

    // 1. 処理中の記事の公開切替と削除は押せず、別記事の操作は有効なままにする。
    const publishedRow = screen.getByRole('row', { name: /朝の光で育てる植物/ })
    const draftRow = screen.getByRole('row', { name: /鉢の選び方/ })
    expect(within(publishedRow).getByRole('button', { name: /公開状態を切り替える/ })).toBeDisabled()
    expect(within(publishedRow).getByRole('button', { name: '削除' })).toBeDisabled()
    expect(within(draftRow).getByRole('button', { name: /公開状態を切り替える/ })).toBeEnabled()
    expect(within(draftRow).getByRole('button', { name: '削除' })).toBeEnabled()
  })
})
