import { findPageImageSlot } from '../lib/pageImageSlots'
import { usePageImageEdit } from '../lib/pageImageEdit'
// 編集モードの枠（hover の枠線・ラベル）の CSS。編集モードでしか要素を出さないので、公開ページの見た目には影響しない
import './pageImageSlotTarget.css'

/** PageImageSlotTarget の引数 */
interface PageImageSlotTargetProps {
  /** 枠のキー（例: 'ei8ht-hero'）。ラベルは lib/pageImageSlots.ts の定義から引く */
  slotKey: string
  /** true なら画像のない枠（ラベルを常に出して、空いている枠だと分かるようにする） */
  empty?: boolean
  /**
   * true なら、同じ画像を別の場所にも出している「2つ目以降」の枠。
   * data-testid とボタン名（読み上げ）を付けず、Tab でも選ばない（同じ名前のボタンが並ばないようにする）。
   * クリックで同じ枠を選べるのは同じ
   */
  secondary?: boolean
  /**
   * true なら、リンク（a 要素）の中に置く枠。リンクの中にボタンを入れないよう span で出し、Tab でも選ばない。
   * secondary と違い、本体の枠なので data-testid は付ける（キーボードでは編集画面の「枠の一覧」から選べる）
   */
  insideLink?: boolean
  /** 置き場所に合わせた追加のクラス（重なりの順などを変えるとき） */
  className?: string
}

/**
 * 管理画面「ページ画像の編集」のプレビューで、差し替えられる画像の上に重ねる透明なボタン。
 * ふつうの公開ページ（編集モードでないとき）は何も出さない。
 * 1. 親の要素（position が static 以外）いっぱいに広げて、画像の上に重ねる
 * 2. hover・キーボードで選んだときに枠線とラベル（枠の label）を出す。選んでいる枠は枠線を出したままにする
 * 3. クリックで、編集画面に「この枠を選んだ」と知らせる（ページのリンクなどの動きは止める）
 * @param props.slotKey - 枠のキー
 * @param props.empty - 画像のない枠か
 * @param props.secondary - 同じ画像の2つ目以降の枠か
 * @param props.insideLink - リンクの中に置く本体の枠か
 * @param props.className - 追加のクラス
 * @returns 編集モードなら枠のボタン、そうでなければ null
 */
export default function PageImageSlotTarget({ slotKey, empty = false, secondary = false, insideLink = false, className }: PageImageSlotTargetProps) {
  // 編集モードの値（ふつうの公開ページでは null）
  const edit = usePageImageEdit()
  if (!edit?.editMode) return null
  // 枠の名前（定義にないキーならキーをそのまま出す）
  const label = findPageImageSlot(slotKey)?.label ?? slotKey
  // 今選んでいる枠か
  const selected = edit.selectedKey === slotKey
  // 見た目のクラス（空の枠・選択中・置き場所ごとの追加）
  const classes = [
    'page-edit-target',
    empty ? 'page-edit-target--empty' : '',
    selected ? 'is-selected' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  /**
   * 枠を選ぶ。ページのリンク（枠がリンクの中にあるとき）へ移動しないよう、既定の動きと伝わりを止める。
   * @param event - クリックのイベント
   * @returns なし
   */
  const select = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    edit.onSelectSlot(slotKey)
  }

  // 2つ目以降の枠・リンクの中の枠: 読み上げ・Tab の対象から外した span（リンクの中にボタンを入れないためでもある）。
  // リンクの中の本体の枠だけは、テストで探せるよう data-testid を付ける
  if (secondary || insideLink) {
    return (
      <span
        className={classes}
        data-page-edit-target=""
        data-slot-key={slotKey}
        data-testid={secondary ? undefined : `editable-slot-${slotKey}`}
        aria-hidden="true"
        onClick={select}
      >
        <span className="page-edit-target-label">{label}</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      className={classes}
      data-page-edit-target=""
      data-slot-key={slotKey}
      data-testid={`editable-slot-${slotKey}`}
      aria-label={`${label}を変更`}
      aria-pressed={selected}
      onClick={select}
    >
      <span className="page-edit-target-label" aria-hidden="true">{label}</span>
    </button>
  )
}
