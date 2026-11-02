import { useEffect, useState } from 'react'
import { readPrefersReducedMotion } from './usePrefersReducedMotion'

/** 一度出したことを覚えておく sessionStorage のキー（タブを閉じるまで、もう一度は出さない） */
export const HABITAT_SPLASH_STORAGE_KEY = 'habitat-oides-splash-shown'

/** 白い幕が縮み終わるまでの時間（ms）。CSS の habitat-splash-curtain（1.8s）と合わせる */
const LEAVE_DURATION = 1800

/** 読み込みが終わらなくても、演出を強制的に始めるまでの最長の待ち時間（ms）。
 * 画像が重いときに白い画面のまま長く待たせないよう 3 秒にする（load がそれより早く来れば、そこで進める） */
const MAX_WAIT = 3000

/**
 * 段階
 * - waiting: 白い全画面だけを出し、ページの読み込みを待っている
 * - leaving: ロゴが下から上がって抜け、白い幕が上へ縮んでいる（本文が後から浮かび上がる）
 * - done   : 演出が終わって、スプラッシュを消した
 */
export type HabitatSplashPhase = 'waiting' | 'leaving' | 'done'

/**
 * このセッションでスプラッシュを出すべきかを判定する。
 * 動きを減らす設定のとき・このタブですでに出したとき・sessionStorage が使えないときは出さない。
 * @returns 出すなら true
 */
export function shouldShowHabitatSplash(): boolean {
  if (readPrefersReducedMotion()) return false
  try {
    return window.sessionStorage.getItem(HABITAT_SPLASH_STORAGE_KEY) !== '1'
  } catch {
    // プライベートモードなどで sessionStorage が使えないときは、毎回出すのを避けて出さない
    return false
  }
}

/**
 * スプラッシュの段階を管理する（最初に出すかどうかの判定、読み込み待ち、演出、終了）。
 * 1. 出さない場合（disabled のときを含む）は最初から done
 * 2. 出す場合は sessionStorage に記録し、ページの読み込み（load）を待つ。最長 3 秒で強制的に進める（load が早く来れば、そこで進める）
 * 3. leaving にして、1.8 秒後に done にする
 * @param disabled - true なら出さない（管理画面のプレビューの編集モード。sessionStorage にも記録しない）。最初の描画の値だけを使う
 * @returns 今の段階
 */
export function useHabitatSplashPhase(disabled = false): HabitatSplashPhase {
  // 今の段階（最初の描画で本文がちらっと見えないよう、出すかどうかは初期値で決める）
  const [phase, setPhase] = useState<HabitatSplashPhase>(() => (!disabled && shouldShowHabitatSplash() ? 'waiting' : 'done'))

  // 1. 読み込みを待って leaving に進める
  useEffect(() => {
    if (phase !== 'waiting') return
    // このタブで出したことを記録する（途中で再読み込みしても、もう一度は出さない）
    try { window.sessionStorage.setItem(HABITAT_SPLASH_STORAGE_KEY, '1') } catch { /* 記録できなくても演出は続ける */ }
    /**
     * 演出を始める。
     * @returns なし
     */
    const start = () => setPhase('leaving')
    // 読み込みがすでに終わっていれば、次のフレームですぐ始める
    if (document.readyState === 'complete') {
      const frame = window.requestAnimationFrame(start)
      return () => window.cancelAnimationFrame(frame)
    }
    // 読み込みの終わり（load）か、最長の待ち時間のどちらか早いほうで始める
    window.addEventListener('load', start, { once: true })
    const timer = window.setTimeout(start, MAX_WAIT)
    return () => {
      window.removeEventListener('load', start)
      window.clearTimeout(timer)
    }
  }, [phase])

  // 2. 白い幕が縮み終わったらスプラッシュを消す
  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = window.setTimeout(() => setPhase('done'), LEAVE_DURATION)
    return () => window.clearTimeout(timer)
  }, [phase])

  return phase
}
