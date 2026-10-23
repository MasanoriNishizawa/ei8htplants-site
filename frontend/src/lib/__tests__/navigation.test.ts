/**
 * lib/navigation.ts（backPathFrom: location.state から戻り先を取り出す）のテスト
 */
import { describe, it, expect } from 'vitest'
import { backPathFrom } from '../navigation'

describe('backPathFrom', () => {
  it('state に from の文字列があればそれを返す', () => {
    expect(backPathFrom({ from: '/admin/finances' }, '/admin/events')).toBe('/admin/finances')
  })

  it('state が null・undefined なら fallback を返す', () => {
    expect(backPathFrom(null, '/admin/events')).toBe('/admin/events')
    expect(backPathFrom(undefined, '/admin/events')).toBe('/admin/events')
  })

  it('from が空文字なら fallback を返す', () => {
    expect(backPathFrom({ from: '' }, '/admin/events')).toBe('/admin/events')
  })

  it('from が文字列でない（数値・オブジェクト）なら fallback を返す', () => {
    expect(backPathFrom({ from: 1 }, '/admin/events')).toBe('/admin/events')
    expect(backPathFrom({ from: { path: '/x' } }, '/admin/events')).toBe('/admin/events')
  })

  it('state が文字列や from の無いオブジェクトなら fallback を返す', () => {
    expect(backPathFrom('/admin/finances', '/admin/events')).toBe('/admin/events')
    expect(backPathFrom({}, '/admin/events')).toBe('/admin/events')
  })
})
