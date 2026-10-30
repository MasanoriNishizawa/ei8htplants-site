/**
 * 管理画面「設計書」（pages/admin/AdminDocs.tsx）のテスト
 * - 本文の中の .md へのリンクを押すと、画面を移動せずにそのファイルを画面内に開く（ツリーでも選択中になる）
 * - 外部リンクは target=_blank・rel=noopener noreferrer で新しいタブに開く
 * - 設計書の外のファイルへのリンクは href が外れて押しても移動しない
 * - 本文の中のスクリプトは無害化される
 * api.docs はモックにして、本番のサーバーには接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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

/** 実リポジトリの設計書本文を、テストファイル位置からの相対URLで読み込む */
const REAL_DOCS = [
  {
    path: '02_DD/01_モジュール構成.md',
    heading: 'DD-01 — モジュール構成',
    expected: ['API型定義ファイルツリー', 'gallery.ts', 'priceCalcEntries.ts'],
  },
  {
    path: '02_DD/03_フロントエンドロジック.md',
    heading: 'DD-03 — フロントエンドロジック',
    expected: ['API 型定義の配置', 'apiTypes/gallery.ts', 'apiTypes/priceCalcEntries.ts', 'GalleryImage'],
  },
  {
    path: '03_PM/06_プロジェクト全体リファクタリング計画.md',
    heading: 'PM-06 — プロジェクト全体リファクタリング計画',
    expected: ['段階2のAPI型配置整理を完了しました', '全15ドメイン', 'apiTypes.ts'],
  },
].map((doc) => ({
  ...doc,
  // 1. テストファイルの絶対パスからリポジトリのdoc/を解決し、runnerの起動位置に依存せず本文を読む
  markdown: readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../doc', doc.path), 'utf8'),
}))

/** 実文書3件をAdminDocsのAPIツリーノードとして選べる形にする */
const REAL_DOC_TREE = [
  {
    type: 'dir' as const,
    name: '02_DD',
    path: '02_DD',
    children: REAL_DOCS.filter((doc) => doc.path.startsWith('02_DD/')).map((doc) => ({
      type: 'file' as const,
      name: doc.path.split('/')[1],
      path: doc.path,
    })),
  },
  {
    type: 'dir' as const,
    name: '03_PM',
    path: '03_PM',
    children: REAL_DOCS.filter((doc) => doc.path.startsWith('03_PM/')).map((doc) => ({
      type: 'file' as const,
      name: doc.path.split('/')[1],
      path: doc.path,
    })),
  },
]

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

describe('AdminDocs の実文書本文表示', () => {
  beforeEach(() => {
    vi.mocked(api.docs.tree).mockReset()
    vi.mocked(api.docs.content).mockReset()
    vi.mocked(api.docs.tree).mockResolvedValue(REAL_DOC_TREE)
    vi.mocked(api.docs.content).mockImplementation((path: string) => {
      const doc = REAL_DOCS.find((candidate) => candidate.path === path)
      return doc ? Promise.resolve(doc.markdown) : Promise.reject(new Error('404'))
    })
  })

  /**
   * 実文書を選択し、Markdown描画後に指定本文が表示されることを確かめる。
   * @param doc - 実リポジトリから読み込んだ文書と表示確認用の見出し・本文文字列
   * @returns 文書の見出しと本文が表示されるまで待つPromise
   */
  async function expectRealDocRendered(doc: (typeof REAL_DOCS)[number]) {
    // 1. 実リポジトリの文書ツリーを読み込み、対象ファイルを選択する
    render(
      <MemoryRouter initialEntries={[`/admin/docs?path=${encodeURIComponent(doc.path)}`]}>
        <AdminDocs />
      </MemoryRouter>,
    )

    // 2. 選択中の実ファイルをAPIモック経由で取得し、見出しと実本文が描画されるのを待つ
    expect(await screen.findByRole('heading', { name: doc.heading })).toBeInTheDocument()
    await waitFor(() => expect(api.docs.content).toHaveBeenCalledWith(doc.path))
    // renderedMarkdown: AdminDocsがMarkdownから生成した本文コンテナ。
    const renderedMarkdown = document.querySelector('.docs-markdown')
    expect(renderedMarkdown).toBeInTheDocument()
    // 3. この文書に期待する見出し・識別文字列が描画本文に含まれることを1件ずつ確認する
    for (const text of doc.expected) {
      expect(renderedMarkdown).toHaveTextContent(text)
    }
  }

  it('モジュール構成の実本文をMarkdownとして表示する', async () => {
    await expectRealDocRendered(REAL_DOCS[0])
  })

  it('フロントエンドロジックの実本文をMarkdownとして表示する', async () => {
    await expectRealDocRendered(REAL_DOCS[1])
  })

  it('プロジェクト全体リファクタリング計画の実本文をMarkdownとして表示する', async () => {
    await expectRealDocRendered(REAL_DOCS[2])
  })
})
