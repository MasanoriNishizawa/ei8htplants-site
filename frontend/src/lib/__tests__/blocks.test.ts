/**
 * lib/blocks.ts（記事・商品の本文のブロック）のテスト
 * - isBlock: ブロックとして使える形かの判定
 * - parseBlocks: JSON の配列から形の違う要素を捨てる・昔のテキスト形式の読み込み
 * - serializeBlocks・blocksToText
 */
import { describe, it, expect } from 'vitest'
import { blocksToText, isBlock, parseBlocks, serializeBlocks, type Block } from '../blocks'

describe('isBlock', () => {
  it('value が文字列の見出し・テキストと、url が文字列の画像はブロックと判定される', () => {
    expect(isBlock({ type: 'heading', value: '見出し' })).toBe(true)
    expect(isBlock({ type: 'text', value: '' })).toBe(true)
    expect(isBlock({ type: 'image', url: 'https://example.com/a.jpg' })).toBe(true)
  })

  it('value が文字列でない見出し・テキストはブロックではない', () => {
    expect(isBlock({ type: 'heading', value: 1 })).toBe(false)
    expect(isBlock({ type: 'text' })).toBe(false)
  })

  it('url が無い画像・知らない type・null・文字列・配列はブロックではない', () => {
    expect(isBlock({ type: 'image', value: 'x' })).toBe(false)
    expect(isBlock({ type: 'video', url: 'x' })).toBe(false)
    expect(isBlock(null)).toBe(false)
    expect(isBlock('text')).toBe(false)
    expect(isBlock([])).toBe(false)
  })
})

describe('parseBlocks', () => {
  it('null・undefined・空文字を渡すと空の配列になる', () => {
    expect(parseBlocks(null)).toEqual([])
    expect(parseBlocks(undefined)).toEqual([])
    expect(parseBlocks('')).toEqual([])
  })

  it('JSON の配列なら、ブロックの形をした要素だけが残り、形の違う要素は捨てられる', () => {
    const content = JSON.stringify([
      { type: 'heading', value: 'はじめに' },
      { type: 'text', value: 123 },
      null,
      'ただの文字',
      { type: 'image', url: '/img/a.jpg' },
      { type: 'unknown', value: 'x' },
    ])
    expect(parseBlocks(content)).toEqual([
      { type: 'heading', value: 'はじめに' },
      { type: 'image', url: '/img/a.jpg' },
    ])
  })

  it('JSON だが配列でないとき（オブジェクト）は昔のテキスト形式として 1 つのテキストになる', () => {
    expect(parseBlocks('{"a":1}')).toEqual([{ type: 'text', value: '{"a":1}' }])
  })

  it('昔のテキスト形式は「## 」の行が見出しになり、続く行はまとめて 1 つのテキストになる（空行は無視）', () => {
    const legacy = '## 見出し1\n本文1行目\n本文2行目\n\n## 見出し2\n本文3'
    expect(parseBlocks(legacy)).toEqual([
      { type: 'heading', value: '見出し1' },
      { type: 'text', value: '本文1行目\n本文2行目' },
      { type: 'heading', value: '見出し2' },
      { type: 'text', value: '本文3' },
    ])
  })

  it('serializeBlocks で文字列にしたものを parseBlocks で読むと元に戻る', () => {
    const blocks: Block[] = [
      { type: 'heading', value: 'A' },
      { type: 'text', value: 'B\nC' },
      { type: 'image', url: '/img/x.png' },
    ]
    expect(parseBlocks(serializeBlocks(blocks))).toEqual(blocks)
  })
})

describe('blocksToText', () => {
  it('見出しとテキストだけを空白でつなぎ、改行は空白にし、画像は除く', () => {
    const blocks: Block[] = [
      { type: 'heading', value: '見出し' },
      { type: 'image', url: '/img/x.png' },
      { type: 'text', value: '1行目\n2行目' },
    ]
    expect(blocksToText(blocks)).toBe('見出し 1行目 2行目')
  })

  it('maxLen を超える分は切り捨てる', () => {
    expect(blocksToText([{ type: 'text', value: 'abcdef' }], 3)).toBe('abc')
  })
})
