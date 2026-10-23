/**
 * hooks/useBodyScrollLock.ts（表示中に body のスクロールを止める）のテスト
 * 参照カウント式なので、複数の部品が同時に止めても最後の 1 つが外れるまで止まったままになる
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBodyScrollLock } from '../useBodyScrollLock'

describe('useBodyScrollLock', () => {
  beforeEach(() => {
    // 各テストの前に body の overflow を空に戻す
    document.body.style.overflow = ''
  })

  it('active が true のあいだ body の overflow が hidden になり、外すと元に戻る', () => {
    const { rerender } = renderHook(({ active }) => useBodyScrollLock(active), { initialProps: { active: true } })
    expect(document.body.style.overflow).toBe('hidden')
    rerender({ active: false })
    expect(document.body.style.overflow).toBe('')
  })

  it('active が false なら何も変えない', () => {
    document.body.style.overflow = 'auto'
    renderHook(() => useBodyScrollLock(false))
    expect(document.body.style.overflow).toBe('auto')
  })

  it('止める前の overflow の値（scroll）を覚えておき、解除するとその値に戻る', () => {
    document.body.style.overflow = 'scroll'
    const { unmount } = renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('2 つの部品が止めているとき、先に 1 つが外れてもスクロールは止まったまま、両方外れると戻る', () => {
    const menu = renderHook(() => useBodyScrollLock(true))
    const lightbox = renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')
    // 1. メニューだけ閉じる → まだ写真の拡大表示が止めている
    menu.unmount()
    expect(document.body.style.overflow).toBe('hidden')
    // 2. 拡大表示も閉じる → 元に戻る
    lightbox.unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
