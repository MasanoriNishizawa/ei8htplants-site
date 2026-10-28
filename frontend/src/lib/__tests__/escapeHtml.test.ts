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

  it('FE-CR-01 空白・LF・CR・BOM の後に数式記号が続く値は文字列化される', () => {
    /** 数式記号の前に置く、入力の先頭で無害化が必要な文字 */
    const prefixes = [
      { label: '空白', value: ' ' },
      { label: 'LF', value: '\n' },
      { label: 'CR', value: '\r' },
      { label: 'BOM', value: '\uFEFF' },
    ]
    /** 先頭にあると表計算ソフトで式として解釈される可能性がある記号 */
    const formulaMarkers = ['=', '+', '-', '@']

    // 1. 4種類の接頭文字と数式記号を組み合わせ、16通りの入力を作る。
    for (const prefix of prefixes) {
      for (const marker of formulaMarkers) {
        /** 接頭文字の直後に数式記号と値が続く入力 */
        const value = `${prefix.value}${marker}1+1`
        /** csvCell が作る、数式として扱われない引用済みセル */
        const cell = csvCell(value)

        // 2. 元の接頭文字を残したまま、その前にアポストロフィを追加することを確認する。
        expect(cell, `${prefix.label} + ${marker}`).toBe(`"'${value}"`)
      }
    }
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
