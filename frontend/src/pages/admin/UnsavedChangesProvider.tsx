import { useMemo, useRef, type ReactNode } from 'react'
import { UnsavedChangesContext, type UnsavedChangesContextValue } from './unsavedChangesContext'

/**
 * 管理画面の中で「未保存の変更」を集めて共有する Provider。AdminLayout の中身全体を包む
 * 状態は ref に持ち、登録・解除で画面全体を描画し直さないようにしている（確認が必要なのはリンクを押した瞬間だけのため）
 * （画面からは ./UnsavedChanges から import する。UnsavedChanges.ts がこのファイルを再 export している）
 * @param props.children - 包む中身（サイドメニューとページ）
 * @returns Provider で包んだ中身
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  /** 未保存の変更がある画面のキーの集まり */
  const dirtyKeys = useRef<Set<string>>(new Set())

  /** Context で配る操作一式（中身は ref を触るだけなので、一度だけ作って使い回す） */
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
