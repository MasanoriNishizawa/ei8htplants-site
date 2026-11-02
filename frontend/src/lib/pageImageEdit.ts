/*
 * 管理画面「ページ画像の編集」のプレビュー（/admin/page-preview/:brand）で、公開ページを「編集モード」にする仕組み
 *
 * - プレビューの画面（pages/admin/PagePreview.tsx）が PageImageEditContext.Provider で公開ページを包む
 * - 公開ページ・部品は usePageImageEdit() で値を受け取り、編集モードのときだけ次のようにする
 *   - 草稿の URL（draftUrls）を、保存した URL の代わりに使う
 *   - 動き（スプラッシュ・画像の出方・パララックス・スライダーの自動切り替え）を止める
 *   - 差し替えられる画像に PageImageSlotTarget（hover で枠線とラベル、クリックで枠を選ぶ）を重ねる
 * - Provider の外（ふつうの公開ページ）では null が返り、今までと同じ動きになる
 *
 * 親（編集画面）とプレビュー（iframe の中）は window.postMessage でやり取りする。メッセージの形もここで決める。
 */
import { createContext, useContext } from 'react'
import type { PageImageBrand } from './pageImageSlots'

/** 編集モードで公開ページに配る値 */
export interface PageImageEditValue {
  /** 編集モードか（Provider の中では true） */
  editMode: boolean
  /**
   * 草稿の URL（キー → URL）。保存した値に、編集画面での変更を重ねたもの。
   * '' は「画像を外した」（localSrc があればそちら、なければ空の枠）。含まれないキーは、保存した値をそのまま使う
   */
  draftUrls: Readonly<Record<string, string>>
  /** 編集画面で選んでいる枠のキー（選んでいなければ null） */
  selectedKey: string | null
  /**
   * 枠を選んだときに呼ぶ関数（プレビューの中で枠をクリックしたとき）
   * @param key - 選んだ枠のキー
   */
  onSelectSlot: (key: string) => void
}

/** 編集モードの値を配る Context。Provider の外（ふつうの公開ページ）では null */
export const PageImageEditContext = createContext<PageImageEditValue | null>(null)

/**
 * 編集モードの値を受け取る。
 * @returns 編集モードの値。ふつうの公開ページでは null
 */
export function usePageImageEdit(): PageImageEditValue | null {
  return useContext(PageImageEditContext)
}

/**
 * 編集モードかどうかだけを受け取る（動きを止めるかの判断に使う）。
 * @returns 編集モードなら true
 */
export function usePageImageEditMode(): boolean {
  return useContext(PageImageEditContext)?.editMode === true
}

/* ---- 親（編集画面）とプレビュー（iframe）の間のメッセージ ---- */

/** 親 → プレビュー: 草稿の URL と、選んでいる枠を伝える */
export interface PageEditorStateMessage {
  type: 'page-editor:state'
  /** 編集しているブランド（プレビューのブランドと違えば無視する） */
  brand: PageImageBrand
  /** 草稿の URL（キー → URL） */
  draftUrls: Record<string, string>
  /** 選んでいる枠のキー（選んでいなければ null） */
  selectedKey: string | null
  /** true なら、選んだ枠が見えるところまでプレビューをスクロールする（編集画面の枠の一覧から選んだとき） */
  reveal: boolean
}

/** プレビュー → 親: 準備ができた（Context を配り、メッセージを受け取れるようになった） */
export interface PageEditorReadyMessage {
  type: 'page-editor:ready'
  /** プレビューしているブランド */
  brand: PageImageBrand
}

/** プレビュー → 親: 枠をクリックして選んだ */
export interface PageEditorSelectMessage {
  type: 'page-editor:select'
  /** プレビューしているブランド */
  brand: PageImageBrand
  /** 選んだ枠のキー */
  key: string
}

/** 親とプレビューの間でやり取りするメッセージ */
export type PageEditorMessage = PageEditorStateMessage | PageEditorReadyMessage | PageEditorSelectMessage

/**
 * 受け取ったデータが、このやり取りのメッセージかを確かめる（ほかの拡張機能などのメッセージを無視するため）。
 * 中身の形（文字列か・オブジェクトか）まで確かめる。
 * @param data - MessageEvent.data
 * @returns このやり取りのメッセージなら true
 */
export function isPageEditorMessage(data: unknown): data is PageEditorMessage {
  // 1. オブジェクトで、type が文字列でなければ違う
  if (typeof data !== 'object' || data === null) return false
  const record = data as Record<string, unknown>
  if (typeof record.type !== 'string' || typeof record.brand !== 'string') return false
  // 2. 種類ごとに、必要な項目の形を確かめる
  switch (record.type) {
    case 'page-editor:ready':
      return true
    case 'page-editor:select':
      return typeof record.key === 'string'
    case 'page-editor:state':
      return typeof record.draftUrls === 'object' && record.draftUrls !== null
        && (record.selectedKey === null || typeof record.selectedKey === 'string')
        && typeof record.reveal === 'boolean'
    default:
      return false
  }
}
