/*
 * 未保存の変更を共有する Context と、その中身の型
 * 部品（UnsavedChangesProvider.tsx）とフック（UnsavedChanges.ts）の両方が使うため、別のファイルに置く
 */
import { createContext } from 'react'

/** Context で配る操作一式 */
export interface UnsavedChangesContextValue {
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
export const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)
