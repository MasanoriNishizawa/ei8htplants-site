import { useCallback, useEffect, useRef, useState } from 'react'

/** useSectionSpy が返す値 */
export interface SectionSpy {
  /** いま画面の中央付近にあるセクションの id（まだ無いときは空文字） */
  active: string
  /** セクションの要素に付ける ref を作る。例: ref={sectionRef('concept')} */
  sectionRef: (id: string) => (el: HTMLElement | null) => void
  /** サブナビのリンクに付けるクリック処理を作る。リンク先へ滑らかにスクロールする */
  scrollTo: (id: string) => (e: React.MouseEvent) => void
}

/**
 * ブランドページのサブナビ用フック。
 * 各セクションの中央付近が画面に入ったら、そのセクションをサブナビで「選択中」にする（IntersectionObserver）。
 * あわせて、サブナビのリンクを押したときの滑らかなスクロールも提供する
 * @param ids - 見張るセクションの id の配列（ページ内で固定の定数を渡す）
 * @returns active・sectionRef・scrollTo
 */
export function useSectionSpy(ids: readonly string[]): SectionSpy {
  // 選択中のセクションの id
  const [active, setActive] = useState('')
  // id ごとのセクション要素
  const refs = useRef<Record<string, HTMLElement | null>>({})
  // 配列そのものではなく中身で取り直しを決めるための文字列
  const idsKey = ids.join('|')

  useEffect(() => {
    // テスト環境（jsdom）など IntersectionObserver が無い環境では何もしない
    if (typeof IntersectionObserver === 'undefined') return
    // 画面の上から 55% の位置（中央より少し下）を横切っているセクションを選択中にする
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id) })
      },
      { rootMargin: '-55% 0px -45% 0px' },
    )
    // 描画済みのセクション要素を見張る
    idsKey.split('|').forEach((id) => {
      const el = refs.current[id]
      if (el) obs.observe(el)
    })
    // 画面を離れる・id が変わるときは見張りをやめる
    return () => obs.disconnect()
  }, [idsKey])

  // id ごとの ref コールバックを作る。描画のたびに作り直さないよう useCallback で固定する
  const sectionRef = useCallback(
    (id: string) => (el: HTMLElement | null) => { refs.current[id] = el },
    [],
  )

  // リンクの id ごとのクリック処理を作る
  const scrollTo = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      // 既定のアンカー移動（瞬間移動・URL に # が付く）を止めて、滑らかにスクロールする
      e.preventDefault()
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    },
    [],
  )

  return { active, sectionRef, scrollTo }
}
