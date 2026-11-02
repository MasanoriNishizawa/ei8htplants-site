import { useEffect, useRef, useState } from 'react'

/** useInView の設定 */
interface UseInViewOptions {
  /** 画面の枠をどれだけ広げて判定するか（IntersectionObserver の rootMargin。参考サイトと同じ '5px' が既定） */
  rootMargin?: string
  /** どれだけ見えたら「入った」とするか（0 は 1px でも見えたら） */
  threshold?: number
  /** true なら監視せず、最初から「見えた」扱いにする（動きを減らす設定のときなど） */
  disabled?: boolean
}

/**
 * 要素が画面に入ったかを IntersectionObserver で調べる。一度入ったら true のまま戻さない（出方の演出は1回だけ）。
 * IntersectionObserver が使えない環境（古いブラウザやテストの jsdom）では、最初から true にする。
 * @param options - 判定の設定（rootMargin・threshold・disabled）
 * @returns ref: 監視する要素に付ける ref / inView: 一度でも画面に入ったら true
 */
export function useInView<T extends Element>({ rootMargin = '5px', threshold = 0, disabled = false }: UseInViewOptions = {}) {
  // 監視する要素
  const ref = useRef<T | null>(null)
  // 一度でも画面に入ったか（入ったら true のまま）
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    // 1. 演出を止めているとき・すでに入ったとき・監視の仕組みがないときは何もしない（下の inView で true にする）
    const element = ref.current
    if (disabled || entered || !element || typeof IntersectionObserver === 'undefined') return
    // 2. 要素が画面に入ったら true にして、監視をやめる
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setEntered(true)
        observer.disconnect()
      }
    }, { rootMargin, threshold })
    observer.observe(element)
    // 3. 画面を離れるときに監視をやめる
    return () => observer.disconnect()
  }, [disabled, entered, rootMargin, threshold])

  // 監視の仕組みがない環境・演出を止めているときは、最初から「見えた」扱いにする
  const inView = entered || disabled || typeof IntersectionObserver === 'undefined'
  return { ref, inView }
}
