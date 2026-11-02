import { useEffect, useState } from 'react'

/** 「動きを減らす」設定を調べるメディアクエリ */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * 今の「動きを減らす」設定を、その場で読み取る（state の初期値や、最初の描画の判断に使う）。
 * matchMedia が使えない環境（テストの jsdom など）では「減らさない」とみなす。
 * @returns OS / ブラウザで「視差効果を減らす」が有効なら true
 */
export function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * `prefers-reduced-motion: reduce` が有効かどうかを返し、設定の変更にも追従する。
 * 有効なときは、スプラッシュ・パララックス・スライダーの自動切り替え・画像の出方の演出を止める。
 * @returns 動きを減らす設定が有効なら true
 */
export function usePrefersReducedMotion(): boolean {
  // 動きを減らす設定が有効かどうか（最初の描画から正しい値にするため、初期値はその場で読む）
  const [reduced, setReduced] = useState(readPrefersReducedMotion)

  useEffect(() => {
    // 1. matchMedia が使えない環境では何もしない
    if (typeof window.matchMedia !== 'function') return
    // 2. 設定が変わったら state を更新する
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    /**
     * 設定の変更を state に反映する。
     * @returns なし
     */
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    // 3. 画面を離れるときに監視をやめる
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}
