/**
 * 管理画面「設計書」（pages/admin/AdminDocs.tsx）の URL（?path=）との連動のテスト
 * - 目次で設計書を選ぶと URL の ?path= に入る
 * - ?path= を直接開くと、その設計書が開く（目次も選択中になる）
 * - ブラウザの戻る・進むで前・次の設計書に切り替わる（戻り切ると未選択の案内に戻る）
 * - 本文の .md リンクでも ?path= が変わり、戻るで元の設計書に戻れる
 * - 同じ設計書を選び直しても履歴は増えない（戻ると選ぶ前の画面になる）
 * - doc/ の外を指す ?path=（サーバーが 404）を開くと本文は出さずにエラーを出す
 * 履歴は MemoryRouter で持ち、画面の外に置いた部品で今の URL を表示・戻る・進むを行う。api.docs はモック
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import AdminDocs from '../AdminDocs'
import { api } from '../../../lib/api'

// api.docs だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return { ...actual, api: { docs: { tree: vi.fn(), content: vi.fn() } } }
})

/** 設計書のツリー（2 つのフォルダに 1 ファイルずつ） */
const TREE = [
  { type: 'dir' as const, name: '01_BD', path: '01_BD', children: [{ type: 'file' as const, name: '01_概要.md', path: '01_BD/01_概要.md' }] },
  { type: 'dir' as const, name: '02_DD', path: '02_DD', children: [{ type: 'file' as const, name: '06_API仕様.md', path: '02_DD/06_API仕様.md' }] },
]

/** パス → 本文。01_概要 から 06_API仕様 へのリンクを持つ */
const CONTENTS: Record<string, string> = {
  '01_BD/01_概要.md': '# 概要\n\n[API 仕様へ](../02_DD/06_API仕様.md)',
  '02_DD/06_API仕様.md': '# API 仕様\n\n本文',
}

/** 今の URL（pathname + search）を出し、戻る・進むのボタンを持つ部品（ブラウザの戻る・進むの代わり） */
function HistoryProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <p data-testid="search">{decodeURIComponent(location.search)}</p>
      <button type="button" onClick={() => navigate(-1)}>履歴を戻る</button>
      <button type="button" onClick={() => navigate(1)}>履歴を進む</button>
    </div>
  )
}

/**
 * 設計書の画面を開く
 * @param url - 最初に開く URL
 * @returns render の結果
 */
function renderAt(url = '/admin/docs') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <HistoryProbe />
      <Routes>
        <Route path="/admin/docs" element={<AdminDocs />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 今の URL のクエリ */
const search = () => screen.getByTestId('search').textContent

beforeEach(() => {
  vi.mocked(api.docs.tree).mockReset().mockResolvedValue(TREE)
  vi.mocked(api.docs.content).mockReset().mockImplementation((path: string) =>
    CONTENTS[path] ? Promise.resolve(CONTENTS[path]) : Promise.reject(new Error('404 Not Found')),
  )
  // jsdom には scrollIntoView が無いので空の関数にする
  Element.prototype.scrollIntoView = vi.fn()
})

/**
 * 目次で設計書を選ぶ（フォルダを開いてからファイルを押す）
 * @param folder - フォルダ名
 * @param file - ファイルの表示名（.md を除く）
 */
async function pick(folder: string, file: string) {
  const fileButton = screen.queryByRole('button', { name: file })
  if (!fileButton) fireEvent.click(await screen.findByRole('button', { name: new RegExp(folder) }))
  fireEvent.click(await screen.findByRole('button', { name: file }))
}

describe('AdminDocs の ?path=', () => {
  it('目次で設計書を選ぶと URL の ?path= に入り、本文が出る', async () => {
    renderAt()
    expect(search()).toBe('')
    await pick('01_BD', '01_概要')
    expect(await screen.findByRole('heading', { name: '概要' })).toBeInTheDocument()
    expect(search()).toBe('?path=01_BD/01_概要.md')
  })

  it('?path= を直接開くとその設計書が開き、目次でも選択中になる', async () => {
    renderAt(`/admin/docs?path=${encodeURIComponent('02_DD/06_API仕様.md')}`)
    expect(await screen.findByRole('heading', { name: 'API 仕様' })).toBeInTheDocument()
    expect(api.docs.content).toHaveBeenCalledWith('02_DD/06_API仕様.md')
    // 選択中のファイルを含むフォルダは自動で開き、ファイルが aria-current になる
    expect(await screen.findByRole('button', { name: '06_API仕様' })).toHaveAttribute('aria-current', 'true')
  })

  it('戻るで前の設計書に、さらに戻ると未選択に、進むでまた次の設計書に切り替わる', async () => {
    renderAt()
    await pick('01_BD', '01_概要')
    await screen.findByRole('heading', { name: '概要' })
    await pick('02_DD', '06_API仕様')
    await screen.findByRole('heading', { name: 'API 仕様' })
    // 1. 戻る → 01_概要
    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    expect(await screen.findByRole('heading', { name: '概要' })).toBeInTheDocument()
    expect(search()).toBe('?path=01_BD/01_概要.md')
    // 2. さらに戻る → 未選択の案内
    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    await waitFor(() => expect(search()).toBe(''))
    expect(screen.queryByRole('heading', { name: '概要' })).toBeNull()
    expect(screen.getByText(/ファイルを選択してください/)).toBeInTheDocument()
    // 3. 進む → 01_概要
    fireEvent.click(screen.getByRole('button', { name: '履歴を進む' }))
    expect(await screen.findByRole('heading', { name: '概要' })).toBeInTheDocument()
  })

  it('本文の .md リンクでも ?path= が変わり、戻るで元の設計書に戻る', async () => {
    renderAt(`/admin/docs?path=${encodeURIComponent('01_BD/01_概要.md')}`)
    fireEvent.click(await screen.findByRole('link', { name: 'API 仕様へ' }))
    expect(await screen.findByRole('heading', { name: 'API 仕様' })).toBeInTheDocument()
    expect(search()).toBe('?path=02_DD/06_API仕様.md')
    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    expect(await screen.findByRole('heading', { name: '概要' })).toBeInTheDocument()
  })

  it('同じ設計書を選び直しても読み込み直さず、履歴も増えない（戻ると選ぶ前に戻る）', async () => {
    renderAt()
    await pick('01_BD', '01_概要')
    await screen.findByRole('heading', { name: '概要' })
    fireEvent.click(screen.getByRole('button', { name: '01_概要' }))
    fireEvent.click(screen.getByRole('button', { name: '01_概要' }))
    expect(api.docs.content).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    await waitFor(() => expect(search()).toBe(''))
  })

  it('doc/ の外を指す ?path=（サーバーが 404）を開くと本文は出さずにエラーを出す', async () => {
    renderAt(`/admin/docs?path=${encodeURIComponent('../backend/.env')}`)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(api.docs.content).toHaveBeenCalledWith('../backend/.env')
    expect(document.querySelector('.docs-markdown')).toBeNull()
  })
})

describe('AdminDocs のエラーの出し分け', () => {
  /** 目次の欄（aside） */
  const tocArea = () => document.querySelector('aside.admin-docs-toc') as HTMLElement
  /** 本文の欄（aside の次の要素） */
  const bodyArea = () => tocArea().nextElementSibling as HTMLElement

  it('目次の取得に失敗すると、目次の欄にエラーが出て、本文の欄には出ない', async () => {
    vi.mocked(api.docs.tree).mockRejectedValue(new Error('500'))
    renderAt()
    const alert = await screen.findByRole('alert')
    expect(tocArea()).toContainElement(alert)
    expect(bodyArea().querySelector('[role="alert"]')).toBeNull()
  })

  it('本文の取得に失敗すると、本文の欄にエラーが出て、目次の欄には出ない（目次は使える）', async () => {
    renderAt(`/admin/docs?path=${encodeURIComponent('99_無い/無い.md')}`)
    const alert = await screen.findByRole('alert')
    expect(bodyArea()).toContainElement(alert)
    expect(tocArea().querySelector('[role="alert"]')).toBeNull()
    expect(screen.getByRole('button', { name: /01_BD/ })).toBeInTheDocument()
  })

  it('目次と本文の両方に失敗すると、それぞれの欄に 1 つずつ出る', async () => {
    vi.mocked(api.docs.tree).mockRejectedValue(new Error('500'))
    renderAt(`/admin/docs?path=${encodeURIComponent('99_無い/無い.md')}`)
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    expect(tocArea().querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(bodyArea().querySelectorAll('[role="alert"]')).toHaveLength(1)
  })

  it('本文のエラーのあと戻るで未選択に戻ると、本文のエラーが消えて案内に戻る', async () => {
    renderAt()
    // 1. 無いファイルを開く（目次からは選べないので、本文の失敗を起こすため content を失敗させる）
    vi.mocked(api.docs.content).mockRejectedValueOnce(new Error('500'))
    await pick('01_BD', '01_概要')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    // 2. 戻るで未選択に戻る
    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText(/ファイルを選択してください/)).toBeInTheDocument()
  })

  it('本文のエラーのあと別の設計書を選ぶと、エラーが消えて本文が出る', async () => {
    vi.mocked(api.docs.content).mockRejectedValueOnce(new Error('500'))
    renderAt()
    await pick('01_BD', '01_概要')
    await screen.findByRole('alert')
    await pick('02_DD', '06_API仕様')
    expect(await screen.findByRole('heading', { name: 'API 仕様' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
