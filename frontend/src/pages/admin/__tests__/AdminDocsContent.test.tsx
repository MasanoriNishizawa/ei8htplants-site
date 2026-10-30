/**
 * 管理画面「設計書」の本文表示部品（AdminDocsContent.tsx）のテスト。
 * 親画面から受け取る未選択・読み込み中・失敗・Markdown本文の各状態と、参照/click callback を確かめる。
 */
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AdminDocsContent from '../AdminDocsContent'

/**
 * 各ケースで必要な状態とDOM参照を作り、本文表示部品を描画する。
 * @param overrides - ケースごとに上書きするprops
 * @returns 描画結果、参照、クリックcallback
 */
function renderContent(overrides: Partial<React.ComponentProps<typeof AdminDocsContent>> = {}) {
  /** 本文欄全体のスクロール先を受け取る参照 */
  const contentAreaRef = createRef<HTMLDivElement>()
  /** Markdown本文の見出し検索先を受け取る参照 */
  const contentRef = createRef<HTMLDivElement>()
  /** Markdown本文のクリックイベントを親へ通知するcallback */
  const onContentClick = vi.fn()

  const result = render(
    <AdminDocsContent
      selected=""
      loading={false}
      error=""
      content=""
      contentAreaRef={contentAreaRef}
      contentRef={contentRef}
      onContentClick={onContentClick}
      {...overrides}
    />,
  )

  return { ...result, contentAreaRef, contentRef, onContentClick }
}

describe('AdminDocsContent の本文表示', () => {
  it('未選択ならファイル選択の案内だけを表示する', () => {
    renderContent()

    expect(screen.getByText('目次からファイルを選択してください。')).toBeInTheDocument()
    expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
    expect(document.querySelector('.docs-markdown')).toBeNull()
  })

  it('読み込み中なら案内と本文を隠して読み込み表示を出す', () => {
    renderContent({ selected: '02_DD/01_概要.md', loading: true, content: '<p>古い本文</p>' })

    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(screen.queryByText('目次からファイルを選択してください。')).not.toBeInTheDocument()
    expect(document.querySelector('.docs-markdown')).toBeNull()
  })

  it('読み込みが終わって失敗しているならalertでエラーを表示し本文を隠す', () => {
    renderContent({ selected: '02_DD/01_概要.md', error: 'ファイルの取得に失敗しました', content: '<p>本文</p>' })

    expect(screen.getByRole('alert')).toHaveTextContent('ファイルの取得に失敗しました')
    expect(document.querySelector('.docs-markdown')).toBeNull()
  })

  it('Markdown本文を参照付きで表示しクリックイベントを親へ渡す', () => {
    const { contentAreaRef, contentRef, onContentClick } = renderContent({
      selected: '02_DD/01_概要.md',
      content: '<p><a href="../03_PM/計画.md">計画へ</a></p>',
    })

    const contentArea = document.querySelector('.admin-docs-body')
    const markdown = document.querySelector('.docs-markdown')
    expect(contentAreaRef.current).toBe(contentArea)
    expect(contentRef.current).toBe(markdown)
    expect(screen.getByRole('link', { name: '計画へ' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '計画へ' }))

    expect(onContentClick).toHaveBeenCalledTimes(1)
    expect(onContentClick.mock.calls[0][0].target).toBe(screen.getByRole('link', { name: '計画へ' }))
  })
})
