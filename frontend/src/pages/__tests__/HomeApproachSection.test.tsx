/**
 * 公式ホームの「OUR APPROACH」表示部品を、親から渡す見出し・本文・action要素で描画することを確認する。
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomeApproachSection from '../HomeApproachSection'

describe('HomeApproachSection の表示', () => {
  it('親から渡した見出し・本文・紹介リンクを画面に表示する', () => {
    // 変数の内容: actionHref: 親から渡す紹介リンクの遷移先。
    const actionHref = '/official/concept'

    // 1. 見出し・本文・リンクをReactNodeとして受け取る部品を描画する。
    render(
      <HomeApproachSection
        title={<>植物を育て、<em>景色を仕立てる。</em></>}
        description="ひとつの植物から、部屋の景色や人とのつながりまで提案します。"
        action={<a href={actionHref}>私たちについて <span aria-hidden="true">↗</span></a>}
      />,
    )

    // 2. セクションの見出しと本文、親が作ったリンク文言・URLが表示されることを確かめる。
    expect(screen.getByText('02 / OUR APPROACH')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '植物を育て、景色を仕立てる。' })).toBeInTheDocument()
    expect(screen.getByText('ひとつの植物から、部屋の景色や人とのつながりまで提案します。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '私たちについて' })).toHaveAttribute('href', actionHref)
  })
})
