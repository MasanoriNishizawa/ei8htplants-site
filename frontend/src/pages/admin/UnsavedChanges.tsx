/*
 * 管理画面の「保存していない変更」を画面の外（サイドメニューなど）に知らせる仕組み
 *
 * App.tsx は BrowserRouter（データルーターではない）を使っているため、React Router の useBlocker は使えない。
 * そこで次の形にしている。
 * - AdminLayout が UnsavedChangesProvider で中身を包む
 * - 編集画面は useUnsavedChanges(isDirty) を呼ぶだけで「未保存の変更がある」ことを登録できる
 *   （同時に、再読み込み・タブを閉じるときのブラウザの確認（beforeunload）も出す）
 * - サイドメニューのリンクは useConfirmLeave() で受け取った関数を押したときに呼び、未保存なら確認ダイアログを出す
 *
 * Provider の外（単体テストなどで編集画面だけを描画したとき）でも、登録は何もせずに動く（beforeunload だけ効く）
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, type ReactNode } from 'react'

/** 未保存の変更があるまま別の画面へ移ろうとしたときに出す確認の文言 */
export const UNSAVED_LEAVE_MESSAGE = '保存していない変更があります。破棄して移動しますか？'

/** Context で配る操作一式 */
interface UnsavedChangesContextValue {
  /**
   * 画面ごとの未保存の状態を登録・更新する
   * @param key - 登録した画面を見分けるキー（useId で作る）
   * @param dirty - 未保存の変更があるかどうか
   */
  setDirty: (key: string, dirty: boolean) => void
  /**
   * 登録を外す（画面を閉じたとき）
   * @param key - setDirty で使ったキー
   */
  unregister: (key: string) => void
  /**
   * 未保存の変更がある画面が1つでもあるかどうか
   * @returns 1つでもあれば true
   */
  hasUnsaved: () => boolean
}

/** 未保存の変更を共有する Context。Provider の外では null（登録は何もしない） */
const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

/**
 * 管理画面の中で「未保存の変更」を集めて共有する Provider。AdminLayout の中身全体を包む
 * 状態は ref に持ち、登録・解除で画面全体を描画し直さないようにしている（確認が必要なのはリンクを押した瞬間だけのため）
 * @param props.children - 包む中身（サイドメニューとページ）
 * @returns Provider で包んだ中身
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  /** 未保存の変更がある画面のキーの集まり */
  const dirtyKeys = useRef<Set<string>>(new Set())

  const value = useMemo<UnsavedChangesContextValue>(() => ({
    setDirty: (key, dirty) => {
      if (dirty) dirtyKeys.current.add(key)
      else dirtyKeys.current.delete(key)
    },
    unregister: (key) => {
      dirtyKeys.current.delete(key)
    },
    hasUnsaved: () => dirtyKeys.current.size > 0,
  }), [])

  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

/**
 * 編集画面から「未保存の変更があるかどうか」を登録するフック。ほかの編集画面でも同じように使える
 * 1. Provider（AdminLayout）があれば、isDirty をサイドメニューの確認に使えるよう登録する
 * 2. 画面を閉じたら登録を外す
 * 3. 未保存の変更があるあいだは、再読み込み・タブを閉じるときにブラウザの確認（beforeunload）を出す
 * @param isDirty - 未保存の変更があるかどうか
 * @returns なし
 */
export function useUnsavedChanges(isDirty: boolean): void {
  const ctx = useContext(UnsavedChangesContext)
  /** この画面を見分けるキー（同じ画面を2つ開いても重ならない） */
  const key = useId()

  // 1. isDirty が変わるたびに登録内容を更新する
  useEffect(() => {
    ctx?.setDirty(key, isDirty)
  }, [ctx, key, isDirty])

  // 2. 画面を閉じたら登録を外す
  useEffect(() => {
    return () => ctx?.unregister(key)
  }, [ctx, key])

  // 3. 再読み込み・タブを閉じるときの確認
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 古いブラウザは returnValue の設定で確認を出す
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])
}

/**
 * 別の画面へ移る前に、未保存の変更があれば確認ダイアログを出す関数を返すフック（サイドメニューのリンクで使う）
 * @returns 確認関数。移動してよければ true（未保存の変更がない、または「OK」を押した）、やめるなら false
 */
export function useConfirmLeave(): () => boolean {
  const ctx = useContext(UnsavedChangesContext)
  return useCallback(() => {
    if (!ctx || !ctx.hasUnsaved()) return true
    return window.confirm(UNSAVED_LEAVE_MESSAGE)
  }, [ctx])
}
