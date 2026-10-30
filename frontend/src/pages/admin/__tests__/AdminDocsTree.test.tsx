/**
 * 管理画面「設計書」のツリー部品にあるスマートフォン用目次開閉操作を確認する。
 * 目次ボタンの親通知と、親から開閉状態が戻った後のラベル・aria-expandedを検証する。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AdminDocsTree from '../AdminDocsTree'

describe('AdminDocsTree のスマートフォン用目次開閉', () => {
  it('目次ボタンの操作を親へ通知し、状態に合わせてラベルとaria-expandedを同期する', () => {
    /** 親コンポーネントへ目次開閉を通知するcallback */
    const onToggleToc = vi.fn()
    /** 表示状態を制御する親コンポーネントから渡すprops */
    const props = {
      nodes: [],
      selected: '',
      tocOpen: false,
      treeError: '',
      onSelect: vi.fn(),
      onToggleToc,
    }

    // 1. 目次を閉じた状態で描画し、開く操作のラベルとARIA状態を確認する。
    const { rerender } = render(<AdminDocsTree {...props} />)
    // ボタンはデスクトップ初期表示で display:none になるため、画面上の文言から取得する。
    const openButton = screen.getByText('目次を開く', { selector: 'button' })
    expect(openButton).toHaveAttribute('aria-expanded', 'false')
    expect(openButton).toHaveAttribute('aria-controls', 'admin-docs-tree')
    expect(document.getElementById('admin-docs-tree')).toBeInTheDocument()

    // 2. 開く操作で親callbackが呼ばれ、親が状態を更新した後の表示が同期する。
    fireEvent.click(openButton)
    expect(onToggleToc).toHaveBeenCalledTimes(1)
    rerender(<AdminDocsTree {...props} tocOpen />)
    const closeButton = screen.getByText('目次を閉じる', { selector: 'button' })
    expect(closeButton).toHaveAttribute('aria-expanded', 'true')

    // 3. 閉じる操作も親へ通知され、親の更新後にラベルとARIA状態が閉じた状態へ戻る。
    fireEvent.click(closeButton)
    expect(onToggleToc).toHaveBeenCalledTimes(2)
    rerender(<AdminDocsTree {...props} />)
    expect(screen.getByText('目次を開く', { selector: 'button' })).toHaveAttribute('aria-expanded', 'false')
  })
})
