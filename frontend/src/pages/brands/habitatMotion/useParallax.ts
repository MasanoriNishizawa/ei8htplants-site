import { useEffect, useRef } from 'react'

/** 1回のスクロールでずらす量の上限（px）。速さの大きい要素が大きく飛び出さないようにする */
const MAX_SHIFT = 240

/**
 * スクロールに合わせて要素を縦にずらす（逆向きのパララックス。参考サイトの vue-prlx の reverse に相当）。
 * 要素の中心が画面の中心にあるときにずれ 0 で、画面の下にあるときは上へ、上にあるときは下へずらすので、
 * ページのスクロールより遅れて動き、奥にふわっと浮いて見える。
 * 再描画を避けるため state は使わず、requestAnimationFrame の中で style.transform を直接書き換える。
 * @param speed - 動く速さ（0.1 なら、画面の中心からの距離の 10% だけずらす。負の値なら向きが逆になる）
 * @param disabled - true ならずらさない（動きを減らす設定のとき）
 * @returns ずらす要素に付ける ref
 */
export function useParallax<T extends HTMLElement>(speed: number, disabled: boolean) {
  // ずらす要素
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    // 1. 止めているときは、ずれを消して終わる
    if (disabled) {
      element.style.transform = ''
      return
    }
    // 今かけているずれ（px）。位置を測るときに差し引いて、ずれる前の位置を求める
    let current = 0
    // 次のフレームで計算する予約の番号（0 なら予約なし）
    let frame = 0

    /**
     * 要素の位置からずれを計算して transform に書く。
     * @returns なし
     */
    const update = () => {
      frame = 0
      // 2. ずれる前の要素の中心と、画面の中心の距離を測る
      const rect = element.getBoundingClientRect()
      const center = rect.top - current + rect.height / 2
      const distance = center - window.innerHeight / 2
      // 3. 距離に速さを掛けて、逆向きにずらす（上限で抑える）
      current = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, distance * speed))
      element.style.transform = `translate3d(0, ${current.toFixed(1)}px, 0)`
    }
    /**
     * スクロール・画面サイズの変更のたびに、次のフレームでの計算を1回だけ予約する。
     * @returns なし
     */
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }

    // 4. 最初の位置を計算し、スクロールと画面サイズの変更を監視する
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // 5. 画面を離れるときに監視と予約をやめる
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [speed, disabled])

  return ref
}
