import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseTimeRange, TimeRangeSelect } from '../EventForm'

describe('parseTimeRange', () => {
  it('〜区切りを正しくパースする', () => {
    expect(parseTimeRange('10:00〜16:00')).toEqual(['10:00', '16:00'])
  })

  it('半角チルダ区切りをパースする', () => {
    expect(parseTimeRange('10:00~16:30')).toEqual(['10:00', '16:30'])
  })

  it('ハイフン区切りをパースする', () => {
    expect(parseTimeRange('10:00-16:00')).toEqual(['10:00', '16:00'])
  })

  it('空文字は ["",""] を返す', () => {
    expect(parseTimeRange('')).toEqual(['', ''])
  })

  it('不正な形式は ["",""] を返す', () => {
    expect(parseTimeRange('10:00')).toEqual(['', ''])
    expect(parseTimeRange('テスト')).toEqual(['', ''])
  })
})

describe('TimeRangeSelect', () => {
  it('開始と終了を両方選ぶと onChange が合成値で呼ばれる', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeRangeSelect value="" onChange={onChange} />)

    const [startSel, endSel] = screen.getAllByRole('combobox')
    await user.selectOptions(startSel, '10:00')
    await user.selectOptions(endSel, '16:00')

    expect(onChange).toHaveBeenLastCalledWith('10:00〜16:00')
  })

  it('開始だけ選んでも onChange は呼ばれない（片側のみでは保存しない）', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeRangeSelect value="" onChange={onChange} />)

    const [startSel] = screen.getAllByRole('combobox')
    await user.selectOptions(startSel, '10:00')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('終了だけ選んでも onChange は呼ばれない', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeRangeSelect value="" onChange={onChange} />)

    const [, endSel] = screen.getAllByRole('combobox')
    await user.selectOptions(endSel, '16:00')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('既存の値がプルダウンに正しく表示される', () => {
    render(<TimeRangeSelect value="10:00〜16:30" onChange={vi.fn()} />)
    const [startSel, endSel] = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(startSel.value).toBe('10:00')
    expect(endSel.value).toBe('16:30')
  })
})
