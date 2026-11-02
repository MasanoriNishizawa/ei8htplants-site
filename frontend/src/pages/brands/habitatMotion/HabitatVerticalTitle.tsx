import type { ReactNode } from 'react'

/** HabitatVerticalTitle の引数 */
interface HabitatVerticalTitleProps {
  /** 縦書きで出す大きな見出しの文字 */
  children: ReactNode
  /** 外側のレール（セクションの高さいっぱいに伸びる列）に付ける追加のクラス */
  className?: string
}

/**
 * セクションの端に、縦書きの大きな見出しを出す。
 * 外側のレールをセクションの高さいっぱいに伸ばし、中の見出しを position:sticky にするので、
 * セクションをスクロールしている間、見出しが画面の上に貼りついたままになる（参考サイトの縦書き見出し）。
 * 本文の見出しとは別の飾りなので、読み上げの対象から外す。
 * @param props.children - 縦書きで出す文字
 * @param props.className - レールに付ける追加のクラス
 * @returns 縦書き見出しのレール要素
 */
export default function HabitatVerticalTitle({ children, className }: HabitatVerticalTitleProps) {
  return (
    <div className={['habitat-vertical-rail', className].filter(Boolean).join(' ')} aria-hidden="true">
      <p className="habitat-vertical-title" data-testid="habitat-vertical-title">{children}</p>
    </div>
  )
}
