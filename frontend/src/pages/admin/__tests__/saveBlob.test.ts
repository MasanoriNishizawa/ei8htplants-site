/**
 * pages/admin/saveBlob.ts（作ったデータをファイルとして保存させる共通の関数）のテスト
 * 1. オブジェクト URL を作り、download 属性付きのリンクを body に足してクリックし、取り除く
 * 2. 1 秒（REVOKE_DELAY_MS）たってからオブジェクト URL を解放する
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { saveBlob, REVOKE_DELAY_MS } from '../saveBlob'

describe('saveBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom には createObjectURL・revokeObjectURL が無いので用意する
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('download 属性とオブジェクト URL を持つリンクを body に足してクリックし、クリック後は取り除く', () => {
    // 1. クリックされたリンクを記録する
    const clicked: { href: string; download: string; inBody: boolean }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href') ?? '', download: this.download, inBody: document.body.contains(this) })
    })
    const blob = new Blob(['a,b'], { type: 'text/csv' })
    saveBlob(blob, 'test.csv')
    // 2. URL を作ってクリックしている
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicked).toEqual([{ href: 'blob:mock-url', download: 'test.csv', inBody: true }])
    // 3. クリック後はリンクが残らない
    expect(document.body.querySelector('a[download]')).toBeNull()
  })

  it('オブジェクト URL はすぐには解放せず、1 秒たってから解放する', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    saveBlob(new Blob(['x']), 'x.txt')
    expect(REVOKE_DELAY_MS).toBe(1000)
    vi.advanceTimersByTime(999)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
