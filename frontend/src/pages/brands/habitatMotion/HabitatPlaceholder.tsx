/** HabitatPlaceholder の引数 */
interface HabitatPlaceholderProps {
  /** 空いている枠のキー（data-testid に使う。例: 'habitat-object-02'） */
  slotKey: string
  /** 大きさ・位置を決める追加のクラス */
  className?: string
}

/**
 * 画像がまだない枠に、大きさだけ保った薄い枠を出す（文字は出さない）。
 * 管理画面で画像を保存するか、habitatMotionSlots.ts の localSrc を書くと、ここが画像に置き換わる。
 * @param props.slotKey - 空いている枠のキー
 * @param props.className - 大きさ・位置を決める追加のクラス
 * @returns 薄い枠の要素（読み上げの対象外）
 */
export default function HabitatPlaceholder({ slotKey, className }: HabitatPlaceholderProps) {
  return (
    <div
      className={['habitat-placeholder', className].filter(Boolean).join(' ')}
      data-testid={`habitat-placeholder-${slotKey}`}
      aria-hidden="true"
    />
  )
}
