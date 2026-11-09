/** 実際の BrowserRouter と履歴を使い、取消後の URL・state・ルーターの一致を確かめる回帰テスト。外部 API は使用しない。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { UnsavedChangesProvider, useUnsavedChanges } from '../UnsavedChanges'
import { installHistoryGuard } from '../historyGuard'

/**
 * location を購読しない編集画面を用意する。
 * @returns 未保存の編集画面の表示。
 */
function EditorWithoutLocation() {
  useUnsavedChanges(true)
  return <div>未保存の編集内容</div>
}

/**
 * 編集画面とは別に、ルーターが認識している場所を表示する。
 * @returns パス・ハッシュ・key・利用者 state の表示。
 */
function LocationView() {
  // location: React Router が現在認識している場所。
  const location = useLocation()
  return <output data-testid="router-location">{JSON.stringify(location)}</output>
}

/**
 * 実ブラウザと同じルーターと、location 非購読の編集画面を描画する。
 * @returns なし。
 */
function renderEditor(): void {
  // 1. 本番と同様にルーターより先に履歴ガードを登録する。
  installHistoryGuard()
  render(<BrowserRouter><UnsavedChangesProvider><EditorWithoutLocation /><LocationView /></UnsavedChangesProvider></BrowserRouter>)
}

/**
 * URL・履歴 state・ルーターが保存済みの編集場所と一致することを確かめる。
 * @param href - 編集場所のパスとハッシュ。
 * @param state - 編集場所の履歴 state。
 * @returns なし。
 */
function expectMatchingLocation(href: string, state: { idx: number; key: string; usr: object }): void {
  expect(window.location.pathname + window.location.search + window.location.hash).toBe(href)
  expect(window.history.state).toEqual(state)
  expect(JSON.parse(screen.getByTestId('router-location').textContent ?? '{}')).toMatchObject({
    pathname: href.split('#')[0], hash: href.includes('#') ? `#${href.split('#')[1]}` : '',
    key: state.key, state: state.usr,
  })
  expect(screen.getByText('未保存の編集内容')).toBeVisible()
}

afterEach(() => {
  // 1. ガードとルーターを外し、確認ダイアログのモックを戻す。
  cleanup()
  vi.restoreAllMocks()
})

describe('未保存変更の取消と BrowserRouter の整合性', () => {
  it('idx なしの項目への移動を取り消したあと、さらに古い idx ありの項目へ戻って取り消しても編集場所が一致する', async () => {
    // 1. 実際の履歴に、番号なしのハッシュ項目を含む5つの項目を積む。
    window.history.replaceState({ idx: 0, key: 'a', usr: null }, '', '/admin/a')
    window.history.pushState(null, '', '/admin/a#h')
    window.history.pushState({ idx: 1, key: 'b', usr: null }, '', '/admin/b')
    window.history.pushState({ idx: 2, key: 'c', usr: null }, '', '/admin/c')
    // savedState: 最後の編集画面を復元するときに保持すべき利用者 state と key。
    const savedState = { idx: 3, key: 'editor', usr: { draft: '残す' } }
    window.history.pushState(savedState, '', '/admin/editor')
    renderEditor()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    // 2. 番号なしの項目への戻る操作を取り消し、元の編集場所を積み直す。
    await act(async () => { window.history.go(-3) })
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    expectMatchingLocation('/admin/editor', savedState)
    // 3. 積み直しで消えた項目数を含む古い idx に戻っても、範囲外の go をせず編集場所へ復元する。
    await act(async () => { window.history.go(-2) })
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2))
    expectMatchingLocation('/admin/editor', savedState)
  })

  it('location 非購読の画面でハッシュが変わったあと、idx なしの別パスへの移動を取り消すとハッシュと state も一致する', async () => {
    // 1. 編集画面を表示したあと、ルーターにハッシュの移動を伝える。
    window.history.replaceState({ idx: 5, key: 'before-hash', usr: null }, '', '/admin/editor')
    renderEditor()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    // hashState: ハッシュ移動後に保存されるべき key と利用者 state。
    const hashState = { idx: 6, key: 'after-hash', usr: { anchor: 'x' } }
    await act(async () => {
      window.history.pushState(hashState, '', '/admin/editor#x')
      window.dispatchEvent(new PopStateEvent('popstate', { state: hashState }))
    })
    expectMatchingLocation('/admin/editor#x', hashState)
    expect(confirm).not.toHaveBeenCalled()
    // 2. 番号なしの別パスへの移動を取り消し、フック自体がハッシュ移動後の場所を記録できたことを確かめる。
    await act(async () => {
      window.history.replaceState(null, '', '/admin/outside')
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(confirm).toHaveBeenCalledTimes(1)
    expectMatchingLocation('/admin/editor#x', hashState)
  })
})
