// ChatMessageTextが本文、URL、句読点、改行をリンク安全属性つきで表示することを確認する
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import ChatMessageText from '../ChatMessageText'

describe('ChatMessageText の本文表示', () => {
  it('URLを含まない通常文をそのまま表示する', () => {
    // 1. 通常文を表示し、文章の内容が変わらないことを確かめる
    const { container } = render(<ChatMessageText text="植物の様子を見ながら水やりしてください。" />)
    expect(container.textContent).toBe('植物の様子を見ながら水やりしてください。')
    expect(container.querySelector('a')).toBeNull()
  })

  it('本文中の複数URLをそれぞれリンクにする', () => {
    // 1. 文章中に2つのURLを入れ、表示順とリンク先を確かめる
    const { container } = render(<ChatMessageText text="公式サイト https://example.com/ と記事 https://example.org/news" />)
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', 'https://example.com/')
    expect(links[1]).toHaveAttribute('href', 'https://example.org/news')
    expect(container.textContent).toBe('公式サイト https://example.com/ と記事 https://example.org/news')
  })

  it('日本語の句読点をURLのリンクから外して本文に残す', () => {
    // 1. URL末尾の句点と閉じ括弧はリンク外に表示する
    const { container } = render(<ChatMessageText text="詳細はこちら https://example.com/page。" />)
    const link = container.querySelector('a')
    expect(link).toHaveAttribute('href', 'https://example.com/page')
    expect(link?.textContent).toBe('https://example.com/page')
    expect(container.textContent).toBe('詳細はこちら https://example.com/page。')
  })

  it('改行を行ごとの改行要素として表示する', () => {
    // 1. 改行数と画面上の本文内容を確かめる
    const { container } = render(<ChatMessageText text={'1行目\n2行目\n3行目'} />)
    expect(container.querySelectorAll('br')).toHaveLength(2)
    expect(container.textContent).toBe('1行目2行目3行目')
  })

  it('リンクを新しいタブで開きnoopener noreferrerを指定する', () => {
    // 1. 外部URLのリンクに新規タブと安全属性が設定されることを確かめる
    const { container } = render(<ChatMessageText text="https://example.com" />)
    const link = container.querySelector('a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
