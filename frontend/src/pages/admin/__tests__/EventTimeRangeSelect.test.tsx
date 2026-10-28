/**
 * EventTimeRangeSelect の表示・操作・アクセシビリティを確認するテスト。
 * 1. 開始と終了の選択値を合成して通知する。
 * 2. 親から受け取る value の変更を選択欄へ反映する。
 * 3. labelPrefix と id を各選択欄へ正しく設定する。
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TimeRangeSelect from '../EventTimeRangeSelect'

describe('TimeRangeSelect', () => {
  it('FE-H-06 開始と終了を選ぶと onChange が合成値で呼ばれる', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeRangeSelect value="" onChange={onChange} />)

    // 1. 開始と終了を選び、選択結果が保存形式で通知されることを確かめる。
    const startSelect = screen.getByRole('combobox', { name: '開始時刻' })
    const endSelect = screen.getByRole('combobox', { name: '終了時刻' })
    await user.selectOptions(startSelect, '10:00')
    await user.selectOptions(endSelect, '16:00')

    expect(onChange).toHaveBeenLastCalledWith('10:00〜16:00')
  })

  it('FE-H-07 開始だけ選んでも onChange は呼ばれない', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeRangeSelect value="" onChange={onChange} />)

    // 1. 終了が未選択のままなら、部分的な時間帯は通知されないことを確かめる。
    await user.selectOptions(screen.getByRole('combobox', { name: '開始時刻' }), '10:00')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('FE-H-08 終了だけ選んでも onChange は呼ばれない', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeRangeSelect value="" onChange={onChange} />)

    // 1. 開始が未選択のままなら、部分的な時間帯は通知されないことを確かめる。
    await user.selectOptions(screen.getByRole('combobox', { name: '終了時刻' }), '16:00')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('FE-H-09 既存値を開始と終了の選択欄に表示する', () => {
    render(<TimeRangeSelect value="10:00〜16:30" onChange={vi.fn()} />)

    // 1. 受け取った時間帯の開始・終了それぞれが選択値になることを確かめる。
    expect((screen.getByRole('combobox', { name: '開始時刻' }) as HTMLSelectElement).value).toBe('10:00')
    expect((screen.getByRole('combobox', { name: '終了時刻' }) as HTMLSelectElement).value).toBe('16:30')
  })

  it('FE-H-10 親から value が変更されると開始と終了の選択欄も同期する', () => {
    const onChange = vi.fn()
    const { rerender } = render(<TimeRangeSelect value="10:00〜16:00" onChange={onChange} />)

    // 1. 親の値を変更し、両方の選択欄が新しい値へ追従することを確かめる。
    rerender(<TimeRangeSelect value="11:30〜18:00" onChange={onChange} />)

    expect((screen.getByRole('combobox', { name: '開始時刻' }) as HTMLSelectElement).value).toBe('11:30')
    expect((screen.getByRole('combobox', { name: '終了時刻' }) as HTMLSelectElement).value).toBe('18:00')
  })

  it('FE-H-11 labelPrefix を読み上げラベルに付け、id を開始欄へ設定する', () => {
    render(
      <TimeRangeSelect
        value=""
        onChange={vi.fn()}
        id="saturday-time-start"
        labelPrefix="土曜日の"
      />,
    )

    // 1. 接頭辞が開始・終了の読み上げ名に付き、id が開始欄と結び付くことを確かめる。
    const startSelect = screen.getByRole('combobox', { name: '土曜日の開始時刻' })
    const endSelect = screen.getByRole('combobox', { name: '土曜日の終了時刻' })
    expect(startSelect).toHaveAttribute('id', 'saturday-time-start')
    expect(endSelect).not.toHaveAttribute('id', 'saturday-time-start')
  })

  it('FE-H-12 既存値から開始時刻を解除すると空文字を通知する', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeRangeSelect value="10:00〜16:00" onChange={onChange} />)

    // 1. 開始欄の未選択肢を選び、親へ空の時間帯が通知されることを確かめる。
    await user.selectOptions(screen.getByRole('combobox', { name: '開始時刻' }), '')

    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('FE-H-13 既存値から終了時刻を解除すると空文字を通知する', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeRangeSelect value="10:00〜16:00" onChange={onChange} />)

    // 1. 終了欄の未選択肢を選び、親へ空の時間帯が通知されることを確かめる。
    await user.selectOptions(screen.getByRole('combobox', { name: '終了時刻' }), '')

    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
