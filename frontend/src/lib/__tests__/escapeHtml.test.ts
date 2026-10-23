/**
 * lib/escapeHtml.ts のテスト
 * - escapeHtml: 印刷用の HTML に入れる値の無害化（XSS 対策）
 * - csvCell: CSV のセルの作成（数式として実行されないようにする・クォート）
 */
import { describe, it, expect } from 'vitest'
import { csvCell, escapeHtml } from '../escapeHtml'

describe('escapeHtml', () => {
  it('& < > " \' の 5 文字が文字参照に置き換わる', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('<script> を含む名前はタグとして動かない文字列になる', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('属性値を閉じようとする文字列も無害になる', () => {
    expect(escapeHtml('" onmouseover="x')).toBe('&quot; onmouseover=&quot;x')
  })

  it('null・undefined は空文字、数値は文字列になる', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(3)).toBe('3')
  })

  it('特別な文字を含まない日本語はそのまま返る', () => {
    expect(escapeHtml('山田 花子')).toBe('山田 花子')
  })
})

describe('csvCell', () => {
  it('普通の値はダブルクォートで囲まれる', () => {
    expect(csvCell('山田')).toBe('"山田"')
  })

  it('値の中のダブルクォートは 2 つ重ねになる', () => {
    expect(csvCell('a"b')).toBe('"a""b"')
  })

  it('= + - @ で始まる値は先頭に「\'」が付き、数式として実行されない', () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`)
    expect(csvCell('+81')).toBe(`"'+81"`)
    expect(csvCell('-1')).toBe(`"'-1"`)
    expect(csvCell('@cmd')).toBe(`"'@cmd"`)
  })

  it('タブ・CR で始まる値にも「\'」が付く', () => {
    expect(csvCell('\tx')).toBe(`"'\tx"`)
    expect(csvCell('\rx')).toBe(`"'\rx"`)
  })

  it('途中に = がある値には「\'」は付かない', () => {
    expect(csvCell('a=b')).toBe('"a=b"')
  })

  it('null・undefined は空のセル、数値は文字列のセルになる（負の数は数式扱いで「\'」が付く）', () => {
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
    expect(csvCell(5)).toBe('"5"')
    expect(csvCell(-5)).toBe(`"'-5"`)
  })
})
