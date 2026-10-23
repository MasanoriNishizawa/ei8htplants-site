/**
 * pages/admin/docLinks.ts（設計書画面のリンクと見出しの整え）のテスト
 * - .md への相対リンク: data-doc-path（と data-doc-anchor）に doc/ からのパスを入れる
 * - #見出し: data-doc-anchor に入れる
 * - 外部リンク（http・https）: target=_blank と rel=noopener noreferrer
 * - 設計書の外のファイル（ソースコードなど）: href を外す
 * - 見出しの id（GitHub と同じ規則・重複は -1 -2）
 */
import { describe, it, expect } from 'vitest'
import { docLinkTarget, headingSlug, processDocLinks, resolveRelative } from '../docLinks'

/** 開いているファイル（doc/ からのパス） */
const CURRENT = '01_BD/pages/admin/02_Events.md'

/**
 * processDocLinks の結果を DOM にして、最初の a 要素を返す
 * @param html - 処理する HTML
 * @returns a 要素
 */
function firstLink(html: string): HTMLAnchorElement {
  const div = document.createElement('div')
  div.innerHTML = processDocLinks(html, CURRENT)
  return div.querySelector('a')!
}

describe('resolveRelative', () => {
  it('../ で 1 つずつ上がって doc/ からのパスになる', () => {
    expect(resolveRelative(CURRENT, '../../features/01_認証.md')).toBe('01_BD/features/01_認証.md')
  })

  it('同じフォルダのファイル名・./ 付きは同じフォルダを指す', () => {
    expect(resolveRelative(CURRENT, '03_Gallery.md')).toBe('01_BD/pages/admin/03_Gallery.md')
    expect(resolveRelative(CURRENT, './03_Gallery.md')).toBe('01_BD/pages/admin/03_Gallery.md')
  })

  it('「/」で始まるパスは doc/ の直下から数える', () => {
    expect(resolveRelative(CURRENT, '/02_DD/06_API仕様.md')).toBe('02_DD/06_API仕様.md')
  })

  it('doc/ より上に出るパスは null になる', () => {
    expect(resolveRelative(CURRENT, '../../../../backend/app/main.py')).toBeNull()
  })
})

describe('docLinkTarget', () => {
  it('.md への相対リンクは doc/ からのパスと見出しを返す（日本語のパーセントエンコードは戻す）', () => {
    const href = `../../../02_DD/${encodeURIComponent('06_API仕様')}.md#${encodeURIComponent('イベント')}`
    expect(docLinkTarget(CURRENT, href)).toEqual({ path: '02_DD/06_API仕様.md', anchor: 'イベント' })
  })

  it('見出しの無い .md へのリンクは anchor が空文字になる', () => {
    expect(docLinkTarget(CURRENT, '03_Gallery.md')).toEqual({ path: '01_BD/pages/admin/03_Gallery.md', anchor: '' })
  })

  it('外部リンク・mailto・#見出しだけ・.md 以外・doc/ の外は null になる', () => {
    expect(docLinkTarget(CURRENT, 'https://example.com/a.md')).toBeNull()
    expect(docLinkTarget(CURRENT, '//example.com/a.md')).toBeNull()
    expect(docLinkTarget(CURRENT, 'mailto:a@example.com')).toBeNull()
    expect(docLinkTarget(CURRENT, '#見出し')).toBeNull()
    expect(docLinkTarget(CURRENT, '../../../../frontend/src/App.tsx')).toBeNull()
    expect(docLinkTarget(CURRENT, '../../../../README.md')).toBeNull()
  })
})

describe('headingSlug', () => {
  it('小文字にし、記号を除き、空白を - にする（日本語は残る）', () => {
    expect(headingSlug('API の一覧 (v2)')).toBe('api-の一覧-v2')
  })
})

describe('processDocLinks', () => {
  it('.md への相対リンクは data-doc-path と data-doc-anchor が付く', () => {
    const a = firstLink('<a href="../../features/01_auth.md#login">認証</a>')
    expect(a.getAttribute('data-doc-path')).toBe('01_BD/features/01_auth.md')
    expect(a.getAttribute('data-doc-anchor')).toBe('login')
  })

  it('見出しの無い .md へのリンクには data-doc-anchor が付かない', () => {
    const a = firstLink('<a href="03_Gallery.md">ギャラリー</a>')
    expect(a.getAttribute('data-doc-path')).toBe('01_BD/pages/admin/03_Gallery.md')
    expect(a.hasAttribute('data-doc-anchor')).toBe(false)
  })

  it('#見出し のリンクは data-doc-anchor が付き、data-doc-path は付かない', () => {
    const a = firstLink(`<a href="#${encodeURIComponent('概要')}">概要へ</a>`)
    expect(a.getAttribute('data-doc-anchor')).toBe('概要')
    expect(a.hasAttribute('data-doc-path')).toBe(false)
  })

  it('外部の http・https リンクは target=_blank と rel=noopener noreferrer が付く', () => {
    for (const href of ['https://example.com/', 'http://example.com/']) {
      const a = firstLink(`<a href="${href}">外部</a>`)
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(a.getAttribute('href')).toBe(href)
    }
  })

  it('mailto のリンクはそのまま残る', () => {
    const a = firstLink('<a href="mailto:a@example.com">メール</a>')
    expect(a.getAttribute('href')).toBe('mailto:a@example.com')
    expect(a.hasAttribute('target')).toBe(false)
  })

  it('設計書の外のファイルへのリンクは href が外れ、開けない理由が title に入る', () => {
    const a = firstLink('<a href="../../../../frontend/src/App.tsx">App.tsx</a>')
    expect(a.hasAttribute('href')).toBe(false)
    expect(a.getAttribute('title')).toContain('設計書の外のファイル')
    expect(a.getAttribute('title')).toContain('App.tsx')
  })

  it('見出しに id が付き、同じ文字の見出しには -1・-2 が付く', () => {
    const div = document.createElement('div')
    div.innerHTML = processDocLinks('<h2>概要</h2><h3>概要</h3><h3>概要</h3><h2>API 一覧</h2>', CURRENT)
    expect(Array.from(div.querySelectorAll('h2, h3')).map((h) => h.id)).toEqual(['概要', '概要-1', '概要-2', 'api-一覧'])
  })
})
