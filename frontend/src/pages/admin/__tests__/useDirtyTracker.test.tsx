/**
 * 書きかけ保護の部品（pages/admin/UnsavedChanges.ts）の単体テスト
 * - useDirtyTracker: 基準の値と今の値を比べて未保存かを判定する
 *   - 読み込み前（基準なし）・読み込み直後は確認なし、入力すると確認あり、元に戻すと確認なし
 *   - 保存に成功して基準を置き直すと確認なし、保存に失敗した（基準を置き直さない）ときは保護が残る
 * - confirmLeaveIfDirty・confirmDiscard: 未保存のときだけ決まった文言で confirm を出す
 * - dirtySnapshotJson: '' と null と undefined を同じ「未入力」として扱う
 * - useEscapeToClose: 開いているときだけ Esc で閉じる。preventDefault 済み・日本語の変換中の Esc は無視する
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, fireEvent } from '@testing-library/react'
import {
  confirmDiscard,
  confirmLeaveIfDirty,
  dirtySnapshotJson,
  useDirtyTracker,
  useEscapeToClose,
  UNSAVED_CLOSE_MESSAGE,
  UNSAVED_LEAVE_MESSAGE,
} from '../UnsavedChanges'

/** テストで使う入力欄の値の形 */
type Form = { name: string; price: number }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDirtyTracker', () => {
  it('基準を渡さない（読み込み前）あいだは、値が変わっても未保存にならない', () => {
    const { result, rerender } = renderHook(({ v }) => useDirtyTracker<Form>(v), { initialProps: { v: { name: '', price: 0 } } })
    expect(result.current.isDirty).toBe(false)
    rerender({ v: { name: '入力', price: 0 } })
    expect(result.current.isDirty).toBe(false)
  })

  it('読み込み直後に resetBaseline で基準を置くと確認なし、入力すると未保存、元の値に戻すとまた確認なし', () => {
    const loaded: Form = { name: '鉢', price: 1000 }
    const { result, rerender } = renderHook(({ v }) => useDirtyTracker<Form>(v), { initialProps: { v: loaded } })
    // 1. 読み込み直後
    act(() => result.current.resetBaseline(loaded))
    expect(result.current.isDirty).toBe(false)
    // 2. 入力
    rerender({ v: { name: '鉢', price: 1200 } })
    expect(result.current.isDirty).toBe(true)
    // 3. 元の値に戻す
    rerender({ v: { name: '鉢', price: 1000 } })
    expect(result.current.isDirty).toBe(false)
  })

  it('initial を渡す（新規作成のフォーム）と最初からそれが基準になる', () => {
    const empty: Form = { name: '', price: 0 }
    const { result, rerender } = renderHook(({ v }) => useDirtyTracker<Form>(v, empty), { initialProps: { v: empty } })
    expect(result.current.isDirty).toBe(false)
    rerender({ v: { name: 'a', price: 0 } })
    expect(result.current.isDirty).toBe(true)
  })

  it('保存に成功して resetBaseline() を引数なしで呼ぶと、今の値が基準になり確認なしになる', () => {
    const { result, rerender } = renderHook(({ v }) => useDirtyTracker<Form>(v, { name: '', price: 0 }), {
      initialProps: { v: { name: '', price: 0 } },
    })
    rerender({ v: { name: '保存する値', price: 500 } })
    expect(result.current.isDirty).toBe(true)
    act(() => result.current.resetBaseline())
    expect(result.current.isDirty).toBe(false)
  })

  it('保存に失敗した（基準を置き直さない）ときは、未保存のままで保護が残る', () => {
    const { result, rerender } = renderHook(({ v }) => useDirtyTracker<Form>(v, { name: '', price: 0 }), {
      initialProps: { v: { name: '', price: 0 } },
    })
    rerender({ v: { name: '保存に失敗', price: 1 } })
    // 保存の失敗では resetBaseline を呼ばない
    rerender({ v: { name: '保存に失敗', price: 1 } })
    expect(result.current.isDirty).toBe(true)
  })

  it('入れ子のオブジェクト・配列の中身の違いも未保存として見分ける', () => {
    // 入れ子の配列とオブジェクトを含め、比較対象の形を固定するテスト用型
    type Deep = { list: string[]; nested: { a: number } }
    const base: Deep = { list: ['x'], nested: { a: 1 } }
    const { result, rerender } = renderHook(({ v }) => useDirtyTracker<Deep>(v, base), { initialProps: { v: base } })
    rerender({ v: { list: ['x', 'y'], nested: { a: 1 } } })
    expect(result.current.isDirty).toBe(true)
    rerender({ v: { list: ['x'], nested: { a: 2 } } })
    expect(result.current.isDirty).toBe(true)
    rerender({ v: { list: ['x'], nested: { a: 1 } } })
    expect(result.current.isDirty).toBe(false)
  })
})

describe('confirmLeaveIfDirty', () => {
  it('未保存でなければ confirm を出さずに true', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    expect(confirmLeaveIfDirty(false)).toBe(true)
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('未保存なら移動の文言で confirm を出し、OK なら true・キャンセルなら false', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false)
    expect(confirmLeaveIfDirty(true)).toBe(true)
    expect(confirmLeaveIfDirty(true)).toBe(false)
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_LEAVE_MESSAGE)
    expect(UNSAVED_LEAVE_MESSAGE).toBe('保存していない変更があります。破棄して移動しますか？')
  })
})

describe('confirmDiscard', () => {
  it('未保存でなければ confirm を出さずに true、未保存なら閉じる文言で confirm を出す', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    expect(confirmDiscard(false)).toBe(true)
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(confirmDiscard(true)).toBe(false)
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CLOSE_MESSAGE)
  })
})

describe('dirtySnapshotJson', () => {
  it('項目の値が null・空文字・undefined・項目なしのどれでも同じ文字列になる', () => {
    const a = dirtySnapshotJson({ name: '鉢', note: null })
    expect(dirtySnapshotJson({ name: '鉢', note: '' })).toBe(a)
    expect(dirtySnapshotJson({ name: '鉢', note: undefined })).toBe(a)
    expect(dirtySnapshotJson({ name: '鉢' })).toBe(a)
  })

  it('入れ子の項目でも null と空文字を同じに扱う', () => {
    expect(dirtySnapshotJson({ venue: { address: null } })).toBe(dirtySnapshotJson({ venue: { address: '' } }))
  })

  it('空白 1 文字や 0・false は未入力と区別する', () => {
    const empty = dirtySnapshotJson({ v: null })
    expect(dirtySnapshotJson({ v: ' ' })).not.toBe(empty)
    expect(dirtySnapshotJson({ v: 0 })).not.toBe(empty)
    expect(dirtySnapshotJson({ v: false })).not.toBe(empty)
  })

  it('値そのものが null・空文字・undefined なら空文字になる', () => {
    expect(dirtySnapshotJson(null)).toBe('')
    expect(dirtySnapshotJson('')).toBe('')
    expect(dirtySnapshotJson(undefined)).toBe('')
  })

  it('配列の並び順の違いは別の値として扱う（並び順に意味の無い配列は呼ぶ側で並べ替える）', () => {
    expect(dirtySnapshotJson({ brands: ['a', 'b'] })).not.toBe(dirtySnapshotJson({ brands: ['b', 'a'] }))
  })

  it('useDirtyTracker でも、読み込みが null の項目を入力して消すと未保存にならない', () => {
    // null を初期値に持つ項目だけを使うテスト用フォーム型
    type F = { note: string | null }
    const { result, rerender } = renderHook(({ v }) => useDirtyTracker<F>(v), { initialProps: { v: { note: null } as F } })
    act(() => result.current.resetBaseline({ note: null }))
    rerender({ v: { note: 'メモ' } })
    expect(result.current.isDirty).toBe(true)
    rerender({ v: { note: '' } })
    expect(result.current.isDirty).toBe(false)
  })
})

describe('useEscapeToClose', () => {
  it('開いているときに Esc を押すと onEscape が呼ばれる', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeToClose(true, onEscape))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('閉じているときは Esc を押しても呼ばれない', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeToClose(false, onEscape))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('Esc 以外のキーでは呼ばれない', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeToClose(true, onEscape))
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('日本語の変換中（isComposing）の Esc では呼ばれない', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeToClose(true, onEscape))
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('ほかの部品が preventDefault で受け取り済みの Esc では呼ばれない', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeToClose(true, onEscape))
    // 先に登録した部品（写真の拡大表示など）が受け取る
    /**
     * Esc キーイベントを受け取り済みにして、後続のハンドラーへ伝えないテスト用処理。
     * @param e - preventDefault を設定するキーボードイベント
     * @returns 戻り値なし。
     */
    const first = (e: KeyboardEvent) => e.preventDefault()
    document.body.addEventListener('keydown', first)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    document.body.removeEventListener('keydown', first)
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('閉じたあとは聞かなくなり、最新の onEscape が呼ばれる', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ open, cb }) => useEscapeToClose(open, cb), { initialProps: { open: true, cb: first } })
    rerender({ open: true, cb: second })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    rerender({ open: false, cb: second })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(second).toHaveBeenCalledTimes(1)
  })
})
