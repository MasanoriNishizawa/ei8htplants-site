import { useEffect, useRef, useState } from 'react'
import { useT } from '../../../lib/lang'
import { usePageImageEdit } from '../../../lib/pageImageEdit'
import PageImageSlotTarget from '../../../components/PageImageSlotTarget'
import HabitatPlaceholder from './HabitatPlaceholder'

/** 自動で次の画像へ切り替える間隔（ms）。参考サイトと同じ 3000ms */
export const HABITAT_HERO_INTERVAL = 3000

/** スライダーに出す画像1枚 */
export interface HabitatHeroSlide {
  /** 枠のキー（例: 'habitat-hero-01'） */
  key: string
  /** 表示する画像の URL。null は画像のない枠（管理画面のプレビューの編集モードでだけ渡す。空の枠を出す） */
  src: string | null
}

/** HabitatHeroSlider の引数 */
interface HabitatHeroSliderProps {
  /** 画像がある枠だけの一覧（表示順）。編集モードでは、画像のない枠も含めた全枠 */
  slides: HabitatHeroSlide[]
  /** true なら自動で切り替えず、フェードもしない（動きを減らす設定のとき） */
  reduced: boolean
  /** 画像が1枚もないときに出す空の枠のキー */
  emptySlotKey: string
}

/**
 * 番号を2桁の文字にする（1 → '01'）。
 * @param value - 1 始まりの番号
 * @returns 2桁にそろえた番号
 */
const pad2 = (value: number) => String(value).padStart(2, '0')

/**
 * 一番上の全画面の画像を、フェードで切り替えるスライダー（参考サイトの MV）。
 * 1. 画像を重ねて置き、表示中の1枚だけ opacity を 1 にする（切り替えは CSS の 400ms ease）
 * 2. 2枚以上あり、動きを減らす設定でなければ 3000ms ごとに次の画像へ進む（最後の次は最初へ戻る）
 * 3. マウスがヒーローの上にある間と、キーボードのフォーカスがヒーローの中にある間は、自動の切り替えを止める
 * 4. 2枚以上あるときだけ、右下に「Prev 01 / 05 Next」を出す（スマホでは矢印を隠して番号だけ）
 * 5. 0枚のときは大きさを保った空の枠を出す
 * 管理画面「ページ画像の編集」のプレビュー（編集モード）では、次のようにする。
 * - 呼び出し側が画像のない枠も含めた全枠を渡し、画像のない枠は空の枠を出す
 * - 自動では切り替えない（reduced も true で渡される）。前後のボタンはスマホ幅でも出す
 * - 編集画面で一番上の画像の枠を選んだら、そのスライドを表示する
 * - 表示中のスライドの枠に PageImageSlotTarget を重ねる
 * ヒーローの文言・ボタンは呼び出し側（HabitatOides）で上に重ねる。
 * @param props.slides - 画像がある枠だけの一覧
 * @param props.reduced - 動きを減らす設定か
 * @param props.emptySlotKey - 画像が1枚もないときの空の枠のキー
 * @returns 背景のスライダーと操作部分（フラグメント）
 */
export default function HabitatHeroSlider({ slides, reduced, emptySlotKey }: HabitatHeroSliderProps) {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()
  // 表示中の画像の番号（0 始まり）
  const [index, setIndex] = useState(0)
  // 画像の枚数
  const count = slides.length
  // 枚数が減ったとき（取得後に変わったときなど）に範囲外を指さないよう、表示に使う番号
  const current = count > 0 ? index % count : 0
  // 管理画面のプレビューの編集モードの値（ふつうの公開ページでは null）
  const edit = usePageImageEdit()
  // 編集モードか
  const editMode = edit?.editMode === true
  // 編集画面で選んでいる枠のキー（編集モードでないときは null）
  const selectedKey = editMode ? edit.selectedKey : null
  // 最後に表示を合わせた「選んでいる枠」（選び直したときだけスライドを合わせるため。描画中に比べて更新する）
  const [syncedKey, setSyncedKey] = useState<string | null>(null)
  if (selectedKey !== syncedKey) {
    setSyncedKey(selectedKey)
    // 選んだ枠がこのスライダーの枠なら、そのスライドを表示する
    const selectedIndex = slides.findIndex((slide) => slide.key === selectedKey)
    if (selectedIndex >= 0) setIndex(selectedIndex)
  }
  // 画像を重ねる外枠の要素（その親＝ヒーローのセクションで、マウスとフォーカスを見張るために使う）
  const slidesRef = useRef<HTMLDivElement | null>(null)
  // マウスがヒーローの上にあるか（true の間は自動の切り替えを止める）
  const [hovered, setHovered] = useState(false)
  // キーボードのフォーカスがヒーローの中（ヒーローのボタン・前後のボタンなど）にあるか（true の間は自動の切り替えを止める）
  const [focusWithin, setFocusWithin] = useState(false)
  // 自動で切り替える設定か（2枚以上で、動きを減らす設定でも編集モードでもないとき）。止めている間も true のまま
  const autoplay = count > 1 && !reduced && !editMode
  // 今まさに自動で切り替えを進めるか（自動で切り替える設定で、マウスもフォーカスもヒーローにないとき）
  const playing = autoplay && !hovered && !focusWithin

  // 1. マウスとフォーカスの見張り。
  //    スライダーの上には文言と暗い膜（呼び出し側の HabitatOides）が重なり、右下の操作も別の要素なので、
  //    画像の外枠ではなく、その親（ヒーローのセクション全体）で見張る。
  //    mouseover・mouseout・focusin・focusout は親まで伝わる（バブリングする）ので、子のどこに乗っても受け取れる
  useEffect(() => {
    // 見張る要素（ヒーローのセクション）。画像が0枚のとき（外枠がないとき）は何もしない
    const host = slidesRef.current?.parentElement
    if (!host) return
    /**
     * 相手の要素（移った先）がヒーローの中かを調べる。
     * @param target - mouseout・focusout の relatedTarget（移った先。画面の外などでは null）
     * @returns ヒーローの中なら true
     */
    const inside = (target: EventTarget | null) => target instanceof Node && host.contains(target)
    /** マウスがヒーローのどこかに乗ったら止める @returns なし */
    const onOver = () => setHovered(true)
    /**
     * マウスがヒーローの外へ出たら再開する（ヒーローの中の別の要素へ移っただけなら止めたまま）。
     * @param event - mouseout のイベント
     * @returns なし
     */
    const onOut = (event: MouseEvent) => { if (!inside(event.relatedTarget)) setHovered(false) }
    /** フォーカスがヒーローの中に入ったら止める @returns なし */
    const onFocusIn = () => setFocusWithin(true)
    /**
     * フォーカスがヒーローの外へ出たら再開する（中の別のボタンへ移っただけなら止めたまま）。
     * @param event - focusout のイベント
     * @returns なし
     */
    const onFocusOut = (event: FocusEvent) => { if (!inside(event.relatedTarget)) setFocusWithin(false) }
    host.addEventListener('mouseover', onOver)
    host.addEventListener('mouseout', onOut)
    host.addEventListener('focusin', onFocusIn)
    host.addEventListener('focusout', onFocusOut)
    return () => {
      host.removeEventListener('mouseover', onOver)
      host.removeEventListener('mouseout', onOut)
      host.removeEventListener('focusin', onFocusIn)
      host.removeEventListener('focusout', onFocusOut)
    }
  }, [count])

  // 2. 自動の切り替え。マウスやフォーカスで止めている間はタイマーを置かない（再開したら 3000ms 数え直す）。手で切り替えたとき（current が変わったとき）も、そこから 3000ms 数え直す
  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setIndex((current + 1) % count), HABITAT_HERO_INTERVAL)
    return () => window.clearTimeout(timer)
  }, [playing, current, count])

  /**
   * 前後の画像へ切り替える（端では反対の端へ回り込む）。
   * @param step - -1 なら前、1 なら次
   * @returns なし
   */
  const move = (step: number) => setIndex((current + step + count) % count)

  if (count === 0) {
    return <HabitatPlaceholder slotKey={emptySlotKey} className="habitat-placeholder--hero" />
  }

  return (
    <>
      {/* 背景の画像。重ねて置き、表示中の1枚だけを見せる。
          支援技術向けに「カルーセル」という種類の領域（role="region"・aria-roledescription・aria-label）として伝える。
          data-autoplay は自動で切り替える設定か、data-paused はマウス・フォーカスで止めているか */}
      <div
        ref={slidesRef}
        role="region"
        className={`habitat-hero-slides${reduced ? ' habitat-hero-slides--static' : ''}`}
        data-testid="habitat-hero-slides"
        data-autoplay={autoplay ? 'true' : 'false'}
        data-paused={autoplay && !playing ? 'true' : 'false'}
        aria-roledescription="carousel"
        aria-label={t('ブランドの写真', 'Brand photographs')}
      >
        {slides.map((slide, i) => slide.src ? (
          <img
            key={slide.key}
            className={`habitat-hero-image habitat-hero-slide${i === current ? ' is-active' : ''}`}
            src={slide.src}
            alt=""
            aria-hidden={i === current ? undefined : true}
            data-testid={`habitat-hero-slide-${slide.key}`}
            data-active={i === current ? 'true' : 'false'}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : (
          // 画像のない枠（編集モードでだけ渡される）: ヒーローいっぱいに空の枠を出す
          <div
            key={slide.key}
            className={`habitat-hero-image habitat-hero-slide${i === current ? ' is-active' : ''}`}
            aria-hidden="true"
            data-testid={`habitat-hero-slide-${slide.key}`}
            data-active={i === current ? 'true' : 'false'}
          >
            <HabitatPlaceholder slotKey={slide.key} className="habitat-placeholder--hero" />
          </div>
        ))}
      </div>
      {/* 編集モードのときだけ、表示中のスライドの枠を重ねる（ヒーローの文言より手前、右下の操作より奥） */}
      {editMode && slides[current] && (
        <PageImageSlotTarget slotKey={slides[current].key} empty={!slides[current].src} />
      )}
      {/* 右下の操作部分。2枚以上あるときだけ出す。編集モードでは押せるよう data-page-edit-allow を付け、スマホ幅でも矢印を出す */}
      {count > 1 && (
        <div
          className={`habitat-hero-controls${editMode ? ' habitat-hero-controls--edit' : ''}`}
          data-testid="habitat-hero-controls"
          data-page-edit-allow={editMode ? '' : undefined}
        >
          {/* 前後のボタン: 音声入力で見えている文字のまま押せるよう、読み上げ名（aria-label）にも見えている文字「Prev」「Next」を含める */}
          <button type="button" className="habitat-hero-arrow" onClick={() => move(-1)} aria-label={t('前の写真（Prev）', 'Prev (previous photo)')}>Prev</button>
          <span className="habitat-hero-counter" data-testid="habitat-hero-counter" aria-live={playing ? 'off' : 'polite'}>
            {pad2(current + 1)} <span aria-hidden="true">/</span> {pad2(count)}
          </span>
          <button type="button" className="habitat-hero-arrow" onClick={() => move(1)} aria-label={t('次の写真（Next）', 'Next (next photo)')}>Next</button>
        </div>
      )}
    </>
  )
}
