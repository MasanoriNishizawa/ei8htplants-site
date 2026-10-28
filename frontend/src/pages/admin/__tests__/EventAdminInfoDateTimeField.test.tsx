/**
 * EventAdminInfoDateTimeField の表示と入力 callback のテスト
 *
 * 1. 搬入・搬出のラベルと日付入力のアクセシブル名
 * 2. 時（06〜22）・分（00〜55、5分刻み）の選択肢
 * 3. 日付・時・分の各変更値が対応する callback に渡ること
 * 4. 時・分が同じ時刻グループに含まれること
 *
 * 日時の保存形式やページ側の dirty 判定は EventAdminInfo.test.tsx と E2E で確認する。
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EventAdminInfoDateTimeField from '../EventAdminInfoDateTimeField'

/** 搬入・搬出で共通して使う日時の入力値 */
const EMPTY_DATE_TIME = {
  date: '',
  hour: '',
  minute: '',
}

/**
 * 指定ラベルの日時入力部品を表示し、入力値と各変更 callback を返す。
 * @param label - 搬入日時または搬出日時のラベル
 * @returns 描画結果と callback のモック
 */
function renderDateTimeField(label: string) {
  /** 日付変更時に呼び出される callback のモック */
  const onDateChange = vi.fn()
  /** 時変更時に呼び出される callback のモック */
  const onHourChange = vi.fn()
  /** 分変更時に呼び出される callback のモック */
  const onMinuteChange = vi.fn()
  /** label ごとに一意になる日付 input の id */
  const dateInputId = label === '搬入日時' ? 'carry-in-date' : 'carry-out-date'
  /** 搬入・搬出に対応する時 select のアクセシブル名 */
  const hourLabel = label === '搬入日時' ? '搬入の時' : '搬出の時'
  /** 搬入・搬出に対応する分 select のアクセシブル名 */
  const minuteLabel = label === '搬入日時' ? '搬入の分' : '搬出の分'

  /** 対象日時入力部品を Testing Library で描画する */
  const view = render(
    <EventAdminInfoDateTimeField
      id={dateInputId}
      label={label}
      {...EMPTY_DATE_TIME}
      hourLabel={hourLabel}
      minuteLabel={minuteLabel}
      inputStyle={{}}
      labelStyle={{}}
      onDateChange={onDateChange}
      onHourChange={onHourChange}
      onMinuteChange={onMinuteChange}
    />,
  )

  return { ...view, onDateChange, onHourChange, onMinuteChange, dateInputId }
}

describe('EventAdminInfoDateTimeField — 日時入力の表示と操作', () => {
  it.each(['搬入日時', '搬出日時'])('%s ラベルが日付入力のアクセシブル名になる', (label) => {
    // 1. 対象の日時入力部品を描画する
    const { dateInputId } = renderDateTimeField(label)

    // 2. 表示ラベルが、指定された id の日付入力と関連付いていることを確かめる
    expect(screen.getByText(label)).toHaveAttribute('for', dateInputId)
    expect(screen.getByLabelText(label)).toHaveAttribute('id', dateInputId)
  })

  it.each([
    { label: '搬入日時', hourName: '搬入の時', minuteName: '搬入の分' },
    { label: '搬出日時', hourName: '搬出の時', minuteName: '搬出の分' },
  ])('$label の時・分にアクセシブルな名前が付く', ({ label, hourName, minuteName }) => {
    // 1. 対象の日時入力部品を描画する
    renderDateTimeField(label)

    // 2. 時・分の select がラベルを持ち、select として取得できることを確かめる
    expect(screen.getByRole('combobox', { name: hourName })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: minuteName })).toBeInTheDocument()
  })

  it.each(['搬入日時', '搬出日時'])('%s の時は06から22まで連続した選択肢になる', (label) => {
    // 1. 時の選択欄を表示する
    renderDateTimeField(label)
    /** 時の select。アクセシブル名で対象を特定する */
    const hourSelect = screen.getByRole('combobox', { name: label === '搬入日時' ? '搬入の時' : '搬出の時' })
    /** 時の select に含まれる選択肢 */
    const hourOptions = within(hourSelect).getAllByRole('option').map((option) => option.textContent)

    // 2. 06〜22 の17個が順番どおり並び、先頭・末尾も含まれることを確かめる
    expect(hourOptions).toEqual(['--', ...Array.from({ length: 17 }, (_, index) => String(index + 6).padStart(2, '0'))])
  })

  it.each(['搬入日時', '搬出日時'])('%s の分は00から55まで5分刻みの選択肢になる', (label) => {
    // 1. 分の選択欄を表示する
    renderDateTimeField(label)
    /** 分の select。アクセシブル名で対象を特定する */
    const minuteSelect = screen.getByRole('combobox', { name: label === '搬入日時' ? '搬入の分' : '搬出の分' })
    /** 分の select に含まれる選択肢 */
    const minuteOptions = within(minuteSelect).getAllByRole('option').map((option) => option.textContent)

    // 2. 00〜55 の12個が5分刻みで並ぶことを確かめる
    expect(minuteOptions).toEqual(['--', ...Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))])
  })

  it.each([
    { label: '搬入日時', dateInputId: 'carry-in-date' },
    { label: '搬出日時', dateInputId: 'carry-out-date' },
  ])('$label の日付・時・分を変更すると各 callback に選択値を渡す', ({ label, dateInputId }) => {
    // 1. callback を用意した日時入力部品を表示する
    const { onDateChange, onHourChange, onMinuteChange } = renderDateTimeField(label)
    /** 日付入力。ラベルを使って対象を特定する */
    const dateInput = screen.getByLabelText(label)
    /** 時の select。搬入・搬出のラベルから対象を特定する */
    const hourSelect = screen.getByRole('combobox', { name: label === '搬入日時' ? '搬入の時' : '搬出の時' })
    /** 分の select。搬入・搬出のラベルから対象を特定する */
    const minuteSelect = screen.getByRole('combobox', { name: label === '搬入日時' ? '搬入の分' : '搬出の分' })

    // 2. 日付・時・分をそれぞれ変更する
    fireEvent.change(dateInput, { target: { value: '2099-11-14' } })
    fireEvent.change(hourSelect, { target: { value: '08' } })
    fireEvent.change(minuteSelect, { target: { value: '35' } })

    // 3. 各変更 callback が対応する値で一度ずつ呼ばれたことを確かめる
    expect(onDateChange).toHaveBeenCalledTimes(1)
    expect(onDateChange).toHaveBeenCalledWith('2099-11-14')
    expect(onHourChange).toHaveBeenCalledTimes(1)
    expect(onHourChange).toHaveBeenCalledWith('08')
    expect(onMinuteChange).toHaveBeenCalledTimes(1)
    expect(onMinuteChange).toHaveBeenCalledWith('35')
    expect(dateInput).toHaveAttribute('id', dateInputId)
  })

  it.each([
    { label: '搬入日時', hourName: '搬入の時', minuteName: '搬入の分' },
    { label: '搬出日時', hourName: '搬出の時', minuteName: '搬出の分' },
  ])('$label の時・分 select は同じ表示グループにまとまる', ({ label, hourName, minuteName }) => {
    // 1. 対象の日時入力部品を描画する
    renderDateTimeField(label)
    /** 狭い画面でも時・分を離さない flex wrapper 内の時 select */
    const hourSelect = screen.getByRole('combobox', { name: hourName })
    /** 狭い画面でも時・分を離さない flex wrapper 内の分 select */
    const minuteSelect = screen.getByRole('combobox', { name: minuteName })

    // 2. 時・分の select が共通の親要素に含まれることを確かめる
    expect(hourSelect.parentElement).not.toBeNull()
    expect(minuteSelect.parentElement).toBe(hourSelect.parentElement)
  })

  it('controlled propsが変わると日付・時・分の表示値も更新される', () => {
    // 1. 空の値で日時入力部品を描画する
    const { rerender } = renderDateTimeField('搬入日時')

    // 2. 親から受け取る controlled props を新しい日付・時・分で更新する
    rerender(
      <EventAdminInfoDateTimeField
        id="carry-in-date"
        label="搬入日時"
        date="2099-11-14"
        hour="08"
        minute="35"
        hourLabel="搬入の時"
        minuteLabel="搬入の分"
        inputStyle={{}}
        labelStyle={{}}
        onDateChange={vi.fn()}
        onHourChange={vi.fn()}
        onMinuteChange={vi.fn()}
      />,
    )

    // 3. 日付 input と時・分 select が親の値に追従していることを確かめる
    expect(screen.getByLabelText('搬入日時')).toHaveValue('2099-11-14')
    expect(screen.getByRole('combobox', { name: '搬入の時' })).toHaveValue('08')
    expect(screen.getByRole('combobox', { name: '搬入の分' })).toHaveValue('35')
  })
})
