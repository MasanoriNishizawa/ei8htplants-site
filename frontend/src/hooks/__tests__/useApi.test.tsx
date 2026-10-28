/**
 * hooks/useApi.ts（公開ページの API 取得の共通フック）のテスト
 * - 成功・失敗で data・loading・error が分かれる
 * - deps が変わったとき、切り替え前の古い応答が後から届いても捨てる
 * - 取り直しのあいだは直前のデータを残す
 * - enabled: false のときは取得しない
 * - reload でもう一度取得する
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useApi } from '../useApi'

/**
 * 外から resolve・reject できる Promise を作る（応答の届く順番をテストで決めるため）
 * @returns promise と resolve・reject
 */
function deferred<T>() {
  // テストから Promise を完了・失敗させるための制御関数
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  // 外部から制御できる Promise 本体
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useApi', () => {
  it('最初は loading が true で、取得できると data が入り loading が false になる', async () => {
    // useApi の現在値を検査するレンダリング結果
    const { result } = renderHook(() => useApi(() => Promise.resolve(['a']), []))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(['a'])
    expect(result.current.error).toBeNull()
  })

  it('取得に失敗すると data は null・error にエラーが入る（Error でない値も Error にする）', async () => {
    // 失敗時のフック状態を検査するレンダリング結果
    const { result } = renderHook(() => useApi(() => Promise.reject('通信エラー'), []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('通信エラー')
  })

  it('deps が変わったあと、切り替え前の古い応答が後から届いても捨てて新しい応答だけを表示する', async () => {
    // 1. id ごとに応答を待たせておく
    const pending: Record<string, ReturnType<typeof deferred<string>>> = {
      old: deferred<string>(),
      new: deferred<string>(),
    }
    const { result, rerender } = renderHook(({ id }) => useApi(() => pending[id].promise, [id]), {
      initialProps: { id: 'old' },
    })
    // 2. 応答が届く前に id を切り替える
    rerender({ id: 'new' })
    // 3. 新しい応答が先に届く
    await act(async () => { pending.new.resolve('新しいデータ') })
    expect(result.current.data).toBe('新しいデータ')
    // 4. 古い応答が後から届いても上書きされない
    await act(async () => { pending.old.resolve('古いデータ') })
    expect(result.current.data).toBe('新しいデータ')
    expect(result.current.loading).toBe(false)
  })

  it('切り替え前の古いリクエストが後から失敗しても error にならない', async () => {
    // id ごとの通信結果をテストから制御する Promise
    const pending = { old: deferred<string>(), new: deferred<string>() }
    // 古いリクエストの後着失敗を検査するフック結果と再描画関数
    const { result, rerender } = renderHook(({ id }: { id: 'old' | 'new' }) => useApi(() => pending[id].promise, [id]), {
      initialProps: { id: 'old' as 'old' | 'new' },
    })
    rerender({ id: 'new' })
    await act(async () => { pending.new.resolve('ok') })
    await act(async () => { pending.old.reject(new Error('古い失敗')) })
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBe('ok')
  })

  it('取り直しのあいだは直前のデータを残したまま loading が true になる', async () => {
    // 2回目のリクエストを任意の時点で完了させる Promise
    const second = deferred<string>()
    // 各回の応答を切り替えて返す取得関数
    const fetcher = vi.fn<(id: number) => Promise<string>>()
      .mockResolvedValueOnce('1回目')
      .mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(({ id }) => useApi(() => fetcher(id), [id]), { initialProps: { id: 1 } })
    await waitFor(() => expect(result.current.data).toBe('1回目'))
    rerender({ id: 2 })
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBe('1回目')
    await act(async () => { second.resolve('2回目') })
    expect(result.current.data).toBe('2回目')
  })

  it('enabled が false のときは取得せず、data: null・loading: false・error: null のままになる', () => {
    // 呼び出されたかを数える取得関数
    const fetcher = vi.fn(() => Promise.resolve('x'))
    // 無効時の状態を検査するフック結果
    const { result } = renderHook(() => useApi(fetcher, [], { enabled: false }))
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ data: null, loading: false, error: null })
  })

  it('reload を呼ぶともう一度取得する', async () => {
    // 初回と再取得で異なる値を返す取得関数
    const fetcher = vi.fn<() => Promise<number>>().mockResolvedValueOnce(1).mockResolvedValueOnce(2)
    // reload 前後の値を検査するフック結果
    const { result } = renderHook(() => useApi(fetcher, []))
    await waitFor(() => expect(result.current.data).toBe(1))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('画面を離れたあと（アンマウント後）に応答が届いても例外にならない', async () => {
    // アンマウント後に遅れて応答させる Promise
    const d = deferred<string>()
    // 画面から取り外すための関数
    const { unmount } = renderHook(() => useApi(() => d.promise, []))
    unmount()
    await act(async () => { d.resolve('遅れた応答') })
  })
})
