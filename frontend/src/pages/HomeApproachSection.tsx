import type { ReactNode } from 'react'

/**
 * 公式サイトのホームにある「OUR APPROACH」紹介部分を表示する。
 * @param title - 言語に応じた見出し。改行や強調を含む表示要素。
 * @param description - 言語に応じた本文。
 * @param action - 親から渡される紹介ページへのリンク要素。
 * @returns アプローチ紹介セクション。
 */
export default function HomeApproachSection({
  title,
  description,
  action,
}: {
  /** 言語に応じた見出しを表示する要素 */
  title: ReactNode
  /** 言語に応じた紹介本文 */
  description: ReactNode
  /** 親が用意した紹介ページへのリンク要素 */
  action: ReactNode
}) {
  return (
    <section className="home-action">
      <div className="home-action-copy">
        <p className="home-section-index">02 / OUR APPROACH</p>
        <h2>{title}</h2>
        <p>{description}</p>
        {action}
      </div>
      <div className="home-action-mark" aria-hidden="true"><span>PLANTS</span><i /><b>∞</b></div>
    </section>
  )
}
