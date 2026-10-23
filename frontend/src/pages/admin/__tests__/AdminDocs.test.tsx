/**
 * 管理画面「設計書」（pages/admin/AdminDocs.tsx）のテスト
 * - 本文の中の .md へのリンクを押すと、画面を移動せずにそのファイルを画面内に開く（ツリーでも選択中になる）
 * - 外部リンクは target=_blank・rel=noopener noreferrer で新しいタブに開く
 * - 設計書の外のファイルへのリンクは href が外れて押しても移動しない
 * - 本文の中のスクリプトは無害化される
 * api.docs はモックにして、本番のサーバーには接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminDocs from '../AdminDocs'
import { api } from '../../../lib/api'

// api.docs だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      docs: {
        tree: vi.fn(),
        content: vi.fn(),
      },
    },
  }
})

/** 設計書のツリー（2 つのフォルダに 1 ファイルずつ） */
const TREE = [
  { type: 'dir' as const, name: '01_BD', path: '01_BD', children: [{ type: 'file' as const, name: '01_概要.md', path: '01_BD/01_概要.md' }] },
  { type: 'dir' as const, name: '02_DD', path: '02_DD', children: [{ type: 'file' as const, name: '06_API仕様.md', path: '02_DD/06_API仕様.md' }] },
]

/** パス → 本文の Markdown */
const CONTENTS: Record<string, string> = {
  '01_BD/01_概要.md': [
    '# 概要',
    '',
    '[API 仕様へ](../02_DD/06_API仕様.md#イベント)',
    '',
    '[外部のページ](https://example.com/page)',
    '',
    '[ソース](../../frontend/src/App.tsx)',
    '',
    '<script>window.__docsXss = true</script>',
  ].join('\n'),
  '02_DD/06_API仕様.md': '# API 仕様\n\n## イベント\n\nイベントの API の説明',
}

/**
 * 設計書の画面を開き、最初のファイル（01_概要）をツリーから選んで本文が出るまで待つ
 * @returns なし
 */
async function openOverview() {
  render(
    <MemoryRouter initialEntries={['/admin/docs']}>
      <AdminDocs />
    </MemoryRouter>,
  )
  // 1. フォルダを開いてファイルを選ぶ
  fireEvent.click(await screen.findByRole('button', { name: /01_BD/ }))
  fireEvent.click(screen.getByRole('button', { name: '01_概要' }))
  // 2. 本文の見出しが出るまで待つ
  await screen.findByRole('heading', { name: '概要' })
}

describe('AdminDocs の本文のリンク', () => {
  beforeEach(() => {
    vi.mocked(api.docs.tree).mockReset()
    vi.mocked(api.docs.content).mockReset()
    vi.mocked(api.docs.tree).mockResolvedValue(TREE)
    vi.mocked(api.docs.content).mockImplementation((path: string) =>
      CONTENTS[path] ? Promise.resolve(CONTENTS[path]) : Promise.reject(new Error('404')),
    )
    // jsdom には scrollIntoView が無いので、見出しへのスクロールを空の関数にする
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('.md へのリンクを押すと画面を移動せずにそのファイルを読み込み、本文が切り替わる', async () => {
    await openOverview()
    // 1. リンクを押す
    fireEvent.click(screen.getByRole('link', { name: 'API 仕様へ' }))
    // 2. 開いているファイルの場所から解決したパスで本文を取りに行く
    await waitFor(() => expect(api.docs.content).toHaveBeenLastCalledWith('02_DD/06_API仕様.md'))
    // 3. 本文が切り替わり、ツリーでも選択中になる（別フォルダも自動で開く）
    expect(await screen.findByRole('heading', { name: 'API 仕様' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '概要' })).toBeNull()
    expect(screen.getByRole('button', { name: '06_API仕様' })).toHaveAttribute('aria-current', 'true')
  })

  it('.md へのリンクに #見出し があると、開いた後にその見出しまでスクロールする', async () => {
    await openOverview()
    fireEvent.click(screen.getByRole('link', { name: 'API 仕様へ' }))
    await screen.findByRole('heading', { name: 'API 仕様' })
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
    // スクロールした要素は「イベント」の見出し
    const contexts = vi.mocked(Element.prototype.scrollIntoView).mock.contexts
    // tsconfig の lib が ES2020 で Array.prototype.at が使えないため、末尾は添字で取る
    const target = contexts[contexts.length - 1] as HTMLElement
    expect(target.textContent).toBe('イベント')
  })

  it('外部リンクは target=_blank・rel=noopener noreferrer が付き、新しいタブで開く', async () => {
    await openOverview()
    const link = screen.getByRole('link', { name: '外部のページ' })
    expect(link).toHaveAttribute('href', 'https://example.com/page')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('外部リンクを押しても設計書の読み込みは行わない（本文はそのまま）', async () => {
    await openOverview()
    const calls = vi.mocked(api.docs.content).mock.calls.length
    fireEvent.click(screen.getByText('外部のページ'))
    expect(vi.mocked(api.docs.content).mock.calls.length).toBe(calls)
    expect(screen.getByRole('heading', { name: '概要' })).toBeInTheDocument()
  })

  it('設計書の外のファイルへのリンクは href が外れ、理由が title に入る', async () => {
    await openOverview()
    const el = screen.getByText('ソース')
    expect(el.tagName).toBe('A')
    expect(el).not.toHaveAttribute('href')
    expect(el.getAttribute('title')).toContain('設計書の外のファイル')
  })

  it('本文の <script> は無害化されて実行されない', async () => {
    await openOverview()
    expect(document.querySelector('.docs-markdown script')).toBeNull()
    expect((window as unknown as { __docsXss?: boolean }).__docsXss).toBeUndefined()
  })

  it('リンク先のファイルの読み込みに失敗すると「ファイルの取得に失敗しました」が出る', async () => {
    await openOverview()
    vi.mocked(api.docs.content).mockRejectedValueOnce(new Error('500'))
    fireEvent.click(screen.getByRole('link', { name: 'API 仕様へ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ファイルの取得に失敗しました')
  })
})
