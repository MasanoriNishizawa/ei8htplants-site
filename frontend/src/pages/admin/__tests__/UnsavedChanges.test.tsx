/**
 * UnsavedChanges.tsx（未保存の変更を管理画面全体で共有する仕組み）のテスト
 *
 * 確かめること:
 * 1. Provider の中: useUnsavedChanges(true) の画面があると useConfirmLeave が confirm を出し、OK/キャンセルの結果を返す
 * 2. 未保存の画面が無い・false に戻した・画面を閉じた ときは confirm を出さず true
 * 3. 2つの画面が登録しているときは、両方 false になるまで確認が続く
 * 4. Provider の外: 登録しても何もせず、useConfirmLeave は常に true（confirm を出さない）
 * 5. beforeunload: 未保存のあいだだけ preventDefault され、Provider の有無に関係なく効く
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { UnsavedChangesProvider, useConfirmLeave, useUnsavedChanges, UNSAVED_LEAVE_MESSAGE } from '../UnsavedChanges'

/**
 *  編集画面の代わり。チェックボックスで未保存の状態を切り替える
 * @param label - 表示ラベル
 * @param initial - 初期状態
 * @returns チェックボックスで未保存状態を切り替える編集ラベル
 */
function Editor({ label, initial = false }: { label: string; initial?: boolean }) {
  // チェックボックスで切り替える未保存状態
  const [dirty, setDirty] = useState(initial)
  useUnsavedChanges(dirty)
  return (
    <label>
      <input type="checkbox" checked={dirty} onChange={(e) => setDirty(e.target.checked)} />
      {label}
    </label>
  )
}

/**
 *  useConfirmLeave の結果を画面に出すボタン
 * @returns 確認処理の結果を表示する移動ボタンと結果欄
 */
function LeaveButton() {
  const confirmLeave = useConfirmLeave()
  // 「移動」ボタンを押した後に確認処理の結果を表示する文字列
  const [result, setResult] = useState('未押下')
  return (
    <>
      <button onClick={() => setResult(String(confirmLeave()))}>移動</button>
      <span data-testid="result">{result}</span>
    </>
  )
}

/**
 *  Provider の中に編集画面（表示の切り替え可）と移動ボタンを置く
 * @param withProvider - Provider を描画するかどうか
 * @param editors - 未保存状態を切り替える編集画面のラベル一覧
 * @returns Provider の有無と編集画面数を指定できるテスト用ツリー
 */
function Harness({ withProvider = true, editors = ['A'] }: { withProvider?: boolean; editors?: string[] }) {
  // 編集画面を閉じる操作をテストするための表示状態
  const [shown, setShown] = useState(true)
  const body = (
    <>
      <button onClick={() => setShown(false)}>編集画面を閉じる</button>
      {shown && editors.map((e) => <Editor key={e} label={e} />)}
      <LeaveButton />
    </>
  )
  return withProvider ? <UnsavedChangesProvider>{body}</UnsavedChangesProvider> : body
}

/**
 *  移動ボタンを押して結果の文字を返す
 * @returns 画面に描画された移動結果の文字列
 */
function pressLeave(): string {
  fireEvent.click(screen.getByRole('button', { name: '移動' }))
  return screen.getByTestId('result').textContent ?? ''
}

/**
 *  beforeunload を発火し、preventDefault されたかを返す
 * @returns beforeunload が preventDefault された場合は true
 */
function fireBeforeUnload(): boolean {
  const ev = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(ev)
  return ev.defaultPrevented
}

describe('UnsavedChanges（Provider の中）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('未保存の変更が無ければ confirm を出さずに移動してよい（true）', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<Harness />)
    expect(pressLeave()).toBe('true')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('未保存の変更があると決まった文言で confirm を出し、キャンセルなら false を返す', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('A'))
    expect(pressLeave()).toBe('false')
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_LEAVE_MESSAGE)
    expect(UNSAVED_LEAVE_MESSAGE).toBe('保存していない変更があります。破棄して移動しますか？')
  })

  it('未保存の変更があって OK を押すと true を返す', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('A'))
    expect(pressLeave()).toBe('true')
  })

  it('未保存の状態を false に戻すと confirm を出さない', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('A'))
    fireEvent.click(screen.getByLabelText('A'))
    expect(pressLeave()).toBe('true')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('未保存のまま編集画面を閉じると登録が外れて confirm を出さない', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('A'))
    fireEvent.click(screen.getByRole('button', { name: '編集画面を閉じる' }))
    expect(pressLeave()).toBe('true')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('2つの画面のうち片方だけ未保存でも確認が出て、両方 false になると出ない', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Harness editors={['A', 'B']} />)
    fireEvent.click(screen.getByLabelText('A'))
    fireEvent.click(screen.getByLabelText('B'))
    // A を戻しても B が未保存
    fireEvent.click(screen.getByLabelText('A'))
    expect(pressLeave()).toBe('false')
    // B も戻すと確認なし
    fireEvent.click(screen.getByLabelText('B'))
    expect(pressLeave()).toBe('true')
    expect(confirmSpy).toHaveBeenCalledTimes(1)
  })

  it('未保存のあいだだけ beforeunload が止められる', () => {
    render(<Harness />)
    expect(fireBeforeUnload()).toBe(false)
    fireEvent.click(screen.getByLabelText('A'))
    expect(fireBeforeUnload()).toBe(true)
    fireEvent.click(screen.getByLabelText('A'))
    expect(fireBeforeUnload()).toBe(false)
  })

  it('未保存のまま画面を閉じると beforeunload の登録も外れる', () => {
    const { unmount } = render(<Harness />)
    fireEvent.click(screen.getByLabelText('A'))
    unmount()
    expect(fireBeforeUnload()).toBe(false)
  })
})

describe('UnsavedChanges（Provider の外）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Provider が無くても編集画面はエラーにならず、移動の確認は常に true で confirm を出さない', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<Harness withProvider={false} />)
    fireEvent.click(screen.getByLabelText('A'))
    expect(pressLeave()).toBe('true')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('Provider が無くても未保存のあいだは beforeunload が止められる', () => {
    render(<Harness withProvider={false} />)
    fireEvent.click(screen.getByLabelText('A'))
    expect(fireBeforeUnload()).toBe(true)
  })
})
