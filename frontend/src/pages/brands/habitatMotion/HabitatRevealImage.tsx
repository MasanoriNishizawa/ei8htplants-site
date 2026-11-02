import HabitatPlaceholder from './HabitatPlaceholder'
import { useInView } from './useInView'

/**
 * 画像の出方の種類
 * - overlay   : 白い幕が上へ縮み、中の画像が拡大した状態から元の大きさへ戻りながら現れる（参考サイトの img-overlay）
 * - brightness: 白く飛んだ明るさから、元の明るさへ戻りながら現れる（参考サイトの brimg）
 */
export type HabitatRevealVariant = 'overlay' | 'brightness'

/** HabitatRevealImage の引数 */
interface HabitatRevealImageProps {
  /** 表示する画像の URL。null なら大きさを保った空の枠（placeholder）を出す */
  src: string | null
  /** 画像の代替テキスト（飾りの画像は ''） */
  alt: string
  /** 空の枠の data-testid に使う枠のキー（site_assets の枠でない画像は省略可） */
  slotKey?: string
  /** 出方の種類（既定は overlay） */
  variant?: HabitatRevealVariant
  /** true なら演出せず、最初から表示した状態にする（動きを減らす設定のとき） */
  reduced: boolean
  /** 外枠に付ける追加のクラス（大きさ・縦横比を決める） */
  className?: string
}

/**
 * 画面に入ったときに一度だけ演出つきで現れる画像。
 * 1. 外枠を IntersectionObserver（rootMargin 5px・threshold 0）で監視する
 * 2. 画面に入ったら is-visible を付け、CSS の transition で出す（一度出たら戻さない）
 * 3. 画像がない枠は placeholder を出す
 * @param props.src - 表示する画像の URL（null なら placeholder）
 * @param props.alt - 画像の代替テキスト
 * @param props.slotKey - 空の枠の data-testid に使う枠のキー
 * @param props.variant - 出方の種類
 * @param props.reduced - 演出を止めるか
 * @param props.className - 外枠に付ける追加のクラス
 * @returns 演出つきの画像の外枠
 */
export default function HabitatRevealImage({ src, alt, slotKey, variant = 'overlay', reduced, className }: HabitatRevealImageProps) {
  // 外枠の ref と、一度でも画面に入ったか
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: '5px', threshold: 0, disabled: reduced })

  // 外枠のクラス（出方の種類と、表示済みかどうか）
  const classes = [
    'habitat-reveal',
    `habitat-reveal--${variant}`,
    inView ? 'is-visible' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <div ref={ref} className={classes} data-testid="habitat-reveal" data-revealed={inView ? 'true' : 'false'}>
      {src
        ? <img src={src} alt={alt} loading="lazy" decoding="async" />
        : <HabitatPlaceholder slotKey={slotKey ?? 'unknown'} className="habitat-placeholder--fill" />}
    </div>
  )
}
