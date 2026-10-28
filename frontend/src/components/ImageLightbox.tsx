import { useEffect, useRef } from 'react'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useT } from '../lib/lang'
import { SWIPE_THRESHOLD_PX } from '../lib/constants'

/** ImageLightbox に渡す値 */
interface Props {
  /** 表示する画像の URL の配列 */
  images: string[]
  /** 今表示している画像の位置 */
  index: number
  /** 閉じるときに呼ぶ */
  onClose: () => void
  /** 表示する画像を変えるときに呼ぶ（新しい位置を渡す） */
  onChange: (i: number) => void
  /** 画像の説明（読み上げ用）。省略時は空（装飾扱い） */
  alt?: string
}

/**
 * 画像をフルスクリーンで表示するライトボックスコンポーネント。
 * 開いたら閉じるボタンへフォーカスを移し、閉じたら開く前にフォーカスがあった要素（写真のボタンなど）へ戻す。
 * Esc で閉じる・左右の矢印キーで前後の画像へ移る。表示中はページのスクロールを止める
 * @param images - 表示する画像 URL 配列
 * @param index - 現在表示中の画像インデックス
 * @param onClose - ライトボックスを閉じるコールバック
 * @param onChange - 画像インデックス変更コールバック
 * @param alt - 画像の説明（省略可）
 * @returns 画面全体を覆う拡大表示
 */
export default function ImageLightbox({ images, index, onClose, onChange, alt = '' }: Props) {
  // 閉じる・前後移動ボタンと画像説明のアクセシビリティ文言を翻訳する関数
  const t = useT()
  // スワイプを始めた位置（横方向）
  const touchX = useRef<number | null>(null)
  // 閉じるボタン（開いたときにフォーカスを移す先）
  const closeRef = useRef<HTMLButtonElement>(null)
  // いちばん新しい前後移動・閉じる処理。キー操作の登録を開いたときの 1 回で済ませつつ、最新の index で動かすため
  const handlersRef = useRef({ onClose, prev: () => {}, next: () => {} })
  // 画像の枚数と、前後へ移る処理（端では反対の端へ回り込む）
  const n = images.length
  /** 前の画像へ移動し、先頭なら最後の画像へ戻る。
   * @returns なし。移動先の画像番号を onChange に渡す
   */
  const prev = () => onChange((index - 1 + n) % n)
  /** 次の画像へ移動し、最後なら最初の画像へ戻る。
   * @returns なし。移動先の画像番号を onChange に渡す
   */
  const next = () => onChange((index + 1) % n)
  useEffect(() => { handlersRef.current = { onClose, prev, next } })

  // 表示中はページのスクロールを止める（メニューなどと同時に止めても正しく戻る共通フック）
  useBodyScrollLock(true)

  // 開いたときのフォーカス移動と、閉じたときの戻し、キーボード操作（Esc・矢印）
  useEffect(() => {
    // 1. 開く前にフォーカスがあった要素を覚えて、閉じるボタンへ移す
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    // 2. キー操作を受け付ける
    /**
     * Esc で閉じ、左右の矢印キーで前後の画像へ移る。
     * Esc は preventDefault で「受け取り済み」の印を付け、後ろにある編集のモーダルなど（useEscapeToClose）まで一緒に閉じないようにする
     * @param e - 押されたキーを含むキーボードイベント
     * @returns なし。キーに応じて閉じる処理または画像移動を行う
     */
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handlersRef.current.onClose()
      }
      if (e.key === 'ArrowLeft') handlersRef.current.prev()
      if (e.key === 'ArrowRight') handlersRef.current.next()
    }
    // 捕捉（capture）の段階で聞き、window で後から聞いているほかの部品より先に受け取る
    window.addEventListener('keydown', handle, true)
    // 3. 閉じたらキー操作をやめ、覚えておいた要素へフォーカスを戻す
    return () => {
      window.removeEventListener('keydown', handle, true)
      opener?.focus()
    }
  }, [])

  // 丸い前後ボタンの見た目
  const btn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff',
    width: 48, height: 48, borderRadius: '50%', cursor: 'pointer',
    fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  }

  return (
    // 画面全体を覆う暗い背景。背景を押すと閉じる
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('画像の拡大表示', 'Image viewer')}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.93)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {n > 1 && (
        // 上部の「何枚目 / 全部で何枚」
        <div style={{ position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: '2px', pointerEvents: 'none' }}>
          {index + 1} / {n}
        </div>
      )}

      {/* 閉じるボタン。クリックが外側の背景（onClick={onClose}）に伝わると onClose が2回呼ばれるため、伝播を止めてから1回だけ閉じる */}
      <button
        ref={closeRef}
        type="button"
        aria-label={t('閉じる', 'Close')}
        onClick={e => { e.stopPropagation(); onClose() }}
        style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', padding: '6px 10px', lineHeight: 1, opacity: 0.7 }}
      >✕</button>

      {/* 拡大した画像。押しても閉じないよう伝播を止める。左右にスワイプすると前後の画像へ移る */}
      <img
        src={images[index]}
        alt={alt}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touchX.current === null) return
          // 指を動かした横の距離（左へ動かすと正）
          const d = touchX.current - e.changedTouches[0].clientX
          if (d > SWIPE_THRESHOLD_PX) next()
          else if (d < -SWIPE_THRESHOLD_PX) prev()
          touchX.current = null
        }}
        draggable={false}
        style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', display: 'block', userSelect: 'none' }}
      />

      {/* 前後の画像へ移る丸いボタン（2 枚以上のときだけ。写真の上下の真ん中に置く） */}
      {n > 1 && (
        <>
          <button type="button" aria-label={t('前の画像', 'Previous image')} onClick={e => { e.stopPropagation(); prev() }} style={{ ...btn, position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)' }}>&#10094;</button>
          <button type="button" aria-label={t('次の画像', 'Next image')} onClick={e => { e.stopPropagation(); next() }} style={{ ...btn, position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)' }}>&#10095;</button>
        </>
      )}

      {n > 1 && (
        // 下部の点（押すとその画像へ移る）
        <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={t(`${i + 1}枚目の画像`, `Image ${i + 1}`)}
              aria-current={i === index ? 'true' : undefined}
              onClick={e => { e.stopPropagation(); onChange(i) }}
              style={{ width: 7, height: 7, borderRadius: '50%', padding: 0, border: 'none', cursor: 'pointer', background: i === index ? '#fff' : 'rgba(255,255,255,0.3)' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
