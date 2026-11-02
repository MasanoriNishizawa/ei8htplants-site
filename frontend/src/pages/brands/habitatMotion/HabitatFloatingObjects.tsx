import type { CSSProperties, ReactNode } from 'react'
import PageImageSlotTarget from '../../../components/PageImageSlotTarget'
import { usePageImageEditMode } from '../../../lib/pageImageEdit'
import HabitatRevealImage from './HabitatRevealImage'
import { useParallax } from './useParallax'

/** オブジェクト1つ分の置き方 */
interface FloatingLayout {
  /** 枠のキー（habitat-object-01〜06） */
  key: string
  /** 置く場所（stage: 見出しの周り / lower: 帯の下側） */
  area: 'stage' | 'lower'
  /** パララックスの速さ（大きいほど大きく遅れて動く） */
  speed: number
  /** 画像がないときの空の枠の縦横比（横 / 縦）。CSS 変数 --habitat-object-ratio に渡す */
  ratio: string
}

/**
 * オブジェクトの置き方の一覧（参考サイトの About 部分の img01〜img06-sp に合わせる）。
 * 位置と幅は CSS（habitatMotion.css の .habitat-floating-item--01 など）で決める。
 * - 01〜03: 見出しの周り（左上・右上・右寄り中段）
 * - 04・05: 帯の下側（左下・右下）
 * - 06    : スマホ表示のときだけ下側に出す
 */
const FLOATING_LAYOUTS: readonly FloatingLayout[] = [
  { key: 'habitat-object-01', area: 'stage', speed: 0.12, ratio: '7 / 9' },
  { key: 'habitat-object-02', area: 'stage', speed: 0.2, ratio: '4 / 3' },
  { key: 'habitat-object-03', area: 'stage', speed: 0.28, ratio: '1 / 1' },
  { key: 'habitat-object-04', area: 'lower', speed: 0.1, ratio: '3 / 2' },
  { key: 'habitat-object-05', area: 'lower', speed: 0.18, ratio: '3 / 4' },
  { key: 'habitat-object-06', area: 'lower', speed: 0.14, ratio: '4 / 3' },
]

/** FloatingItem の引数 */
interface FloatingItemProps {
  /** 置き方 */
  layout: FloatingLayout
  /** 表示する画像の URL（null なら空の枠） */
  src: string | null
  /** 動きを減らす設定か */
  reduced: boolean
}

/**
 * オブジェクト1つ。外側をパララックスで縦にずらし、中の画像には出方の演出（img-overlay）を重ねる。
 * @param props.layout - 置き方
 * @param props.src - 表示する画像の URL
 * @param props.reduced - 動きを減らす設定か
 * @returns オブジェクトの要素
 */
function FloatingItem({ layout, src, reduced }: FloatingItemProps) {
  // パララックスでずらす外側の要素
  const ref = useParallax<HTMLDivElement>(layout.speed, reduced)
  // 枠の番号（'01' など）。位置を決めるクラスに使う
  const number = layout.key.slice(-2)
  return (
    <div
      ref={ref}
      className={`habitat-floating-item habitat-floating-item--${number}`}
      style={{ '--habitat-object-ratio': layout.ratio } as CSSProperties}
      data-testid={`habitat-floating-item-${layout.key}`}
    >
      <HabitatRevealImage src={src} alt="" slotKey={layout.key} reduced={reduced} />
      {/* 管理画面のプレビュー（編集モード）のときだけ、オブジェクトの上に枠を重ねる */}
      <PageImageSlotTarget slotKey={layout.key} empty={!src} />
    </div>
  )
}

/** HabitatFloatingObjects の引数 */
interface HabitatFloatingObjectsProps {
  /** 帯の中央に貼りつける見出し（h2 など。呼び出し側の文言をそのまま使う） */
  heading: ReactNode
  /** キーから表示する画像の URL を返す関数（useHabitatMotionAssets の resolve） */
  resolve: (key: string) => string | null
  /** 動きを減らす設定か（true ならパララックスと出方の演出を止める） */
  reduced: boolean
}

/**
 * 中央の見出しの周りに、スクロールに合わせて浮かぶように動くオブジェクトを置く帯（参考サイトの About 部分）。
 * 1. 帯（stage）の中で見出しを position:sticky にし、帯をスクロールする間は画面に貼りつける
 * 2. 01〜03 を見出しの周りに絶対配置し、逆向きのパララックスで動かす
 * 3. 04〜06 を帯の下側に置く（06 はスマホ表示だけ）
 * 画像がない枠は、大きさを保った薄い枠を出す。
 * 管理画面のプレビュー（編集モード）では、見出しが手前のオブジェクトのクリックを邪魔しないよう、
 * 帯に habitat-floating--edit を付けて見出しの pointer-events を外す（habitatMotion.css）。
 * @param props.heading - 中央の見出し
 * @param props.resolve - キーから画像 URL を返す関数
 * @param props.reduced - 動きを減らす設定か
 * @returns 浮かぶオブジェクトの帯
 */
export default function HabitatFloatingObjects({ heading, resolve, reduced }: HabitatFloatingObjectsProps) {
  // 管理画面のプレビュー（編集モード）か
  const editMode = usePageImageEditMode()
  return (
    <div className={`habitat-floating${editMode ? ' habitat-floating--edit' : ''}`} data-testid="habitat-floating-objects">
      {/* 見出しの周り。見出しは帯の中で貼りつく */}
      <div className="habitat-floating-stage">
        <div className="habitat-floating-heading">{heading}</div>
        {FLOATING_LAYOUTS.filter(({ area }) => area === 'stage').map((layout) => (
          <FloatingItem key={layout.key} layout={layout} src={resolve(layout.key)} reduced={reduced} />
        ))}
      </div>
      {/* 帯の下側 */}
      <div className="habitat-floating-lower">
        {FLOATING_LAYOUTS.filter(({ area }) => area === 'lower').map((layout) => (
          <FloatingItem key={layout.key} layout={layout} src={resolve(layout.key)} reduced={reduced} />
        ))}
      </div>
    </div>
  )
}
