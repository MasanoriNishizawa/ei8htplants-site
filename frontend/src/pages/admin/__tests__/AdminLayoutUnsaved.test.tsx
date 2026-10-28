/**
 * AdminLayout のサイドメニュー・ログアウトでの「未保存の変更」の確認のテスト
 *
 * 確かめること:
 * 1. 編集画面に未保存の変更があるとき、サイドメニューの別のリンクを押すと確認が出る
 *    - キャンセル: 画面は移らず、入力も残る
 *    - OK: 画面が移る
 * 2. 未保存の変更が無ければ確認を出さずに移る
 * 3. 今いる画面と同じリンク・「分析 ↗」（別タブ）は確認しない
 * 4. ログアウト: 未保存ならキャンセルでログアウトしない（signOut を呼ばない）、OK でログアウトする
 * 5. lazy 化に伴う Suspense: 中身が読み込み中でもサイドメニューは表示されている
 * 6. Ctrl・Cmd・Shift・Alt を押しながら・左ボタン以外のクリックは、未保存でも確認を出さず、
 *    クリックの既定の動き（新しいタブで開くなど）を止めない。モバイルのメニューも閉じない
 *
 * Supabase のクライアントはモックにして、本番の認証サーバーには接続しない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { lazy, useState } from 'react'
import AdminLayout from '../AdminLayout'
import { useUnsavedChanges, UNSAVED_LEAVE_MESSAGE } from '../UnsavedChanges'
import { supabase } from '../../../lib/supabase'

// Supabase クライアントのモック（ログイン済み）
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { email: 'admin@example.com' } } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
}))

/**
 *  編集画面の代わり。入力すると未保存になる
 * @returns 表示する React 要素。
 */
function FakeEditor() {
  // テスト用入力欄の値。空でないときに未保存として扱う
  const [value, setValue] = useState('')
  useUnsavedChanges(value !== '')
  return <input aria-label="メモ" value={value} onChange={(e) => setValue(e.target.value)} />
}

/**
 *  今のパスを出す部品
 * @returns 表示する React 要素。
 */
function PathProbe() {
  const { pathname } = useLocation()
  return <div data-testid="path">{pathname}</div>
}

/** いつまでも読み込みが終わらない lazy ページ（Suspense の確認用） */
const NeverPage = lazy(() => new Promise<{ default: () => null }>(() => {}))

/**
 * AdminLayout を描画する
 * @param path - 最初に開くパス
 * @returns 処理結果。
 */
function renderLayout(path = '/admin/articles') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<div>ダッシュボードの中身</div>} />
          <Route path="events" element={<div>イベントの中身</div>} />
          <Route path="articles" element={<FakeEditor />} />
          <Route path="slow" element={<NeverPage />} />
        </Route>
      </Routes>
      <PathProbe />
    </MemoryRouter>,
  )
}

/**
 *  サイドメニュー（aside）の中のリンクを名前で取り出す
 * @param name - 名前
 * @returns 非同期処理の結果を返す Promise。
 */
async function sideLink(name: string | RegExp) {
  await screen.findByRole('link', { name: 'ダッシュボード' })
  return within(screen.getByRole('complementary')).getByRole('link', { name })
}

describe('AdminLayout の未保存の変更の確認', () => {
  beforeEach(() => {
    vi.mocked(supabase!.auth.signOut).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('未保存の変更があるときにメニューで別の画面を押し、キャンセルすると移動せず入力も残る', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderLayout()
    const link = await sideLink('イベント')
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '書きかけ' } })
    fireEvent.click(link)
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_LEAVE_MESSAGE)
    expect(screen.getByTestId('path')).toHaveTextContent('/admin/articles')
    expect(screen.getByLabelText('メモ')).toHaveValue('書きかけ')
    expect(screen.queryByText('イベントの中身')).not.toBeInTheDocument()
  })

  it('未保存の変更があるときに OK を押すと移動する', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderLayout()
    const link = await sideLink('イベント')
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '書きかけ' } })
    fireEvent.click(link)
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('path')).toHaveTextContent('/admin/events')
    expect(await screen.findByText('イベントの中身')).toBeInTheDocument()
  })

  it('移動したあとは登録が外れ、次のメニュー操作では確認が出ない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderLayout()
    fireEvent.change(await screen.findByLabelText('メモ'), { target: { value: '書きかけ' } })
    fireEvent.click(await sideLink('イベント'))
    await screen.findByText('イベントの中身')
    fireEvent.click(await sideLink('ダッシュボード'))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/admin$/)
  })

  it('未保存の変更が無ければ確認を出さずに移動する', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderLayout()
    fireEvent.click(await sideLink('イベント'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('path')).toHaveTextContent('/admin/events')
  })

  it('今いる画面と同じリンクを押しても確認しない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderLayout()
    const link = await sideLink('記事管理')
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '書きかけ' } })
    fireEvent.click(link)
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('path')).toHaveTextContent('/admin/articles')
  })

  it('「分析 ↗」（別タブのリンク）は未保存でも確認しない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderLayout()
    const link = await sideLink(/分析/)
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '書きかけ' } })
    fireEvent.click(link)
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByLabelText('メモ')).toHaveValue('書きかけ')
  })

  it('未保存でログアウトを押しキャンセルすると、ログアウトしない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderLayout()
    await sideLink('イベント')
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '書きかけ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_LEAVE_MESSAGE)
    expect(supabase!.auth.signOut).not.toHaveBeenCalled()
    expect(screen.getByLabelText('メモ')).toHaveValue('書きかけ')
  })

  it('未保存でログアウトを押し OK するとログアウトしてログイン画面になる', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderLayout()
    await sideLink('イベント')
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '書きかけ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(supabase!.auth.signOut).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'ログイン' })).toBeInTheDocument()
  })

  it('未保存の変更が無ければ確認なしでログアウトする', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderLayout()
    await sideLink('イベント')
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(supabase!.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('中身のページが読み込み中でもサイドメニューは表示されている', async () => {
    renderLayout('/admin/slow')
    expect(await sideLink('イベント')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
  })

  describe.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd（meta）', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['中ボタン', { button: 1 }],
    ['右ボタン', { button: 2 }],
  ])('%s を使ったクリック', (_label, init) => {
    it('未保存でも確認を出さず、クリックの既定の動きを止めない（画面も移らず入力が残る）', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      renderLayout()
      const link = await sideLink('イベント')
      fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '書きかけ' } })
      // fireEvent は preventDefault されなかったとき true を返す
      const notPrevented = fireEvent.click(link, init)
      expect(notPrevented).toBe(true)
      expect(confirmSpy).not.toHaveBeenCalled()
      // React Router も修飾キー付きのクリックは扱わないので、今の画面のまま（ブラウザが新しいタブなどで開く）
      expect(screen.getByTestId('path')).toHaveTextContent('/admin/articles')
      expect(screen.getByLabelText('メモ')).toHaveValue('書きかけ')
    })

    it('モバイルのメニューを開いていても閉じない', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      renderLayout()
      const link = await sideLink('イベント')
      fireEvent.click(screen.getByRole('button', { name: 'メニューを開く', hidden: true }))
      const aside = screen.getByRole('complementary')
      expect(aside.className).toContain('drawer-open')
      fireEvent.click(link, init)
      expect(aside.className).toContain('drawer-open')
    })
  })

  it('修飾キーなしの左クリックでは今までどおり確認が出てキャンセルで止まる（比較用）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderLayout()
    const link = await sideLink('イベント')
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '書きかけ' } })
    const notPrevented = fireEvent.click(link, { button: 0 })
    expect(notPrevented).toBe(false)
    expect(confirmSpy).toHaveBeenCalledTimes(1)
  })

  it('未保存でなければ左クリックでメニューが閉じて移動する（比較用）', async () => {
    renderLayout()
    const link = await sideLink('イベント')
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く', hidden: true }))
    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('drawer-open')
    fireEvent.click(link)
    expect(aside.className).not.toContain('drawer-open')
    expect(screen.getByTestId('path')).toHaveTextContent('/admin/events')
  })
})
