import { useEffect } from 'react'

/** 今スクロールを止めている部品の数。0 から 1 になったときだけ止め、0 に戻ったときだけ元に戻す */
let lockCount = 0
/** 最初に止める直前の document.body.style.overflow の値。全部が解除されたときにこの値へ戻す */
let savedOverflow = ''

/**
 * 表示中のあいだ、ページ本体（body）のスクロールを止めるフック（モバイルメニュー・写真の拡大表示など用）。
 * 参照カウント式なので、メニューを開いたまま写真を拡大するなど複数の部品が同時に止めても、
 * 最後の 1 つが閉じるまでスクロールは止まったままになり、途中で勝手に解除されない
 * @param active - true のあいだスクロールを止める
 * @returns なし。効果の解除処理は React Effect が管理する
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    // 1. 最初の 1 つだけが元の値を覚えてスクロールを止める
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount += 1
    // 2. 解除するときは数を減らし、0 になったら元の値へ戻す
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) document.body.style.overflow = savedOverflow
    }
  }, [active])
}
