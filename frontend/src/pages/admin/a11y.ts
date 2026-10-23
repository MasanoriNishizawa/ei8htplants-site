/*
 * 管理画面のアクセシビリティの小さな共通部品
 *
 * 一覧の行やカードのように、中に見出しやバッジ・別のボタンを含むため <button> にしにくい要素を
 * 「押せる要素」としてキーボード（Tab で移動・Enter / Space で押す）と読み上げに対応させる
 */
import type { KeyboardEvent, MouseEvent } from 'react'

/** clickableProps が返す、要素に付ける属性一式 */
export interface ClickableProps {
  /** 読み上げにボタンと伝える役割（常に 'button'） */
  role: 'button'
  /** Tab キーで選べるようにする順番（0 = 文書の並び順） */
  tabIndex: number
  /** クリックされたときの処理 */
  onClick: (e: MouseEvent<HTMLElement>) => void
  /** Enter・Space キーで押したときの処理 */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
  /** 開閉する要素のとき、開いているかどうか（開閉しない要素では付けない） */
  'aria-expanded'?: boolean
}

/**
 * div などを「押せる要素」にする属性を作る
 * 1. role="button" と tabIndex=0 で、読み上げにボタンと伝え Tab で選べるようにする
 * 2. クリックと、Enter・Space キーで onActivate を呼ぶ（Space はページのスクロールを止める）
 * 3. 中にある別のボタン・リンク・入力欄でのキー操作は、その部品に任せて反応しない
 * @param onActivate - 押されたときの処理
 * @param expanded - 開閉する要素なら、開いているかどうか（aria-expanded に入れる）。開閉しないなら省略
 * @returns 要素にそのまま展開して付ける属性
 */
export function clickableProps(onActivate: () => void, expanded?: boolean): ClickableProps {
  return {
    // 1. ボタンとして扱わせる
    role: 'button',
    tabIndex: 0,
    // 2. クリック
    onClick: () => onActivate(),
    // 2. 3. キー操作
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
    ...(expanded === undefined ? {} : { 'aria-expanded': expanded }),
  }
}
