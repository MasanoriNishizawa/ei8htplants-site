/**
 * EventBrandSelector（イベント販売ブランドの選択 UI）のテスト
 *
 * FE-CO-01: ブランドの正式名・標準順と fieldset の legend
 * FE-CO-02: 選択済みブランドの checkbox 表示
 * FE-CO-03: ブランドを選択・解除した際の onToggle 通知
 * FE-CO-04: controlled props の再描画に伴う checked 表示の更新
 *
 * フォーム全体の dirty 判定や保存動作は EventForm.test.tsx で確認する。
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BRAND_NAMES } from '../../../lib/brands'
import EventBrandSelector from '../EventBrandSelector'

/** ブランド選択 UI に渡す選択状態と変更通知 callback */
interface RenderBrandSelectorOptions {
  /** 現在選択されているブランドの正式名 */
  selectedBrands?: string[]
  /** ブランド選択・解除を親へ通知する mock callback */
  onToggle?: (brand: string) => void
}

/**
 * ブランド選択 UI を描画し、再描画関数と通知 callback を返す。
 * @param options - 選択中のブランドと任意の変更通知 callback
 * @returns 描画結果と使用した変更通知 callback
 */
function renderBrandSelector({ selectedBrands = [], onToggle = vi.fn<(brand: string) => void>() }: RenderBrandSelectorOptions = {}) {
  /** controlled な選択状態でブランド選択 UI を描画する */
  const view = render(
    <EventBrandSelector selectedBrands={selectedBrands} labelStyle={{}} onToggle={onToggle} />,
  )

  return { ...view, onToggle }
}

describe('EventBrandSelector — イベント販売ブランドの選択', () => {
  it('FE-CO-01 ブランドを表示すると正式名順で「販売ブランド」のfieldsetにまとまる', () => {
    // 1. 未選択状態でブランド選択 UI を表示する
    renderBrandSelector()
    /** 「販売ブランド」の legend を持つ fieldset */
    const brandGroup = screen.getByRole('group', { name: '販売ブランド' })
    /** fieldset 内に表示された checkbox と、それぞれの label の文字列 */
    const displayedBrands = within(brandGroup)
      .getAllByRole('checkbox')
      .map((checkbox) => checkbox.closest('label')?.textContent?.trim())

    // 2. legend とブランド名の正式表記・標準の並び順が一致することを確かめる
    expect(within(brandGroup).getByText('販売ブランド', { selector: 'legend' })).toBeInTheDocument()
    expect(displayedBrands).toEqual(BRAND_NAMES)
  })

  it('FE-CO-02 選択済みブランドを渡すと対応するcheckboxが選択状態になる', () => {
    // 1. 先頭と末尾のブランドを選択済みとして表示する
    renderBrandSelector({ selectedBrands: [BRAND_NAMES[0], BRAND_NAMES[2]] })
    /** 販売ブランドの fieldset */
    const brandGroup = screen.getByRole('group', { name: '販売ブランド' })

    // 2. 選択済みと未選択の checkbox が props と同じ状態であることを確かめる
    expect(within(brandGroup).getByRole('checkbox', { name: BRAND_NAMES[0] })).toBeChecked()
    expect(within(brandGroup).getByRole('checkbox', { name: BRAND_NAMES[1] })).not.toBeChecked()
    expect(within(brandGroup).getByRole('checkbox', { name: BRAND_NAMES[2] })).toBeChecked()
  })

  it('FE-CO-03 ブランドを選択または解除するとonToggleにブランド名を一度通知する', () => {
    // 1. 先頭ブランドだけを選択した状態で変更通知を監視する
    const onToggle = vi.fn<(brand: string) => void>()
    renderBrandSelector({ selectedBrands: [BRAND_NAMES[0]], onToggle })
    /** 選択操作の対象となる2番目のブランド checkbox */
    const unselectedBrand = screen.getByRole('checkbox', { name: BRAND_NAMES[1] })
    /** 解除操作の対象となる選択済みブランド checkbox */
    const selectedBrand = screen.getByRole('checkbox', { name: BRAND_NAMES[0] })

    // 2. 未選択ブランドを選択すると、対象の正式名で一度通知されることを確かめる
    fireEvent.click(unselectedBrand)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenLastCalledWith(BRAND_NAMES[1])

    // 3. callback の履歴を分けてから選択済みブランドを解除し、同様に一度通知されることを確かめる
    onToggle.mockClear()
    fireEvent.click(selectedBrand)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith(BRAND_NAMES[0])
  })

  it('FE-CO-04 controlled propsをrerenderするとchecked表示が新しい選択に追従する', () => {
    // 1. 先頭ブランドだけが選択された状態で表示する
    const { rerender, onToggle } = renderBrandSelector({ selectedBrands: [BRAND_NAMES[0]] })
    /** controlled props の更新後も同じ selector 内で状態を確認する fieldset */
    const brandGroup = screen.getByRole('group', { name: '販売ブランド' })

    // 2. 親から2番目のブランドが選択された props を渡して再描画する
    rerender(<EventBrandSelector selectedBrands={[BRAND_NAMES[1]]} labelStyle={{}} onToggle={onToggle} />)

    // 3. checkbox の表示が親から受け取った新しい選択状態に追従することを確かめる
    expect(within(brandGroup).getByRole('checkbox', { name: BRAND_NAMES[0] })).not.toBeChecked()
    expect(within(brandGroup).getByRole('checkbox', { name: BRAND_NAMES[1] })).toBeChecked()
  })
})
