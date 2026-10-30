/**
 * EventWorkshopField の表示と親フォームへの操作通知を確かめる。
 * 1. WS の有無で予約要否とセッション欄の表示を切り替える
 * 2. セッションの追加・削除・時間・定員変更を callback へ渡す
 * 3. 開催時間帯に応じて自動設定を無効・有効にする
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import EventWorkshopField from '../eventForm/EventWorkshopField'
import type { SessionInput } from '../eventTime'

/** コンポーネントへ渡す標準 props。各テストで必要な値だけを上書きする。 */
function renderField(overrides: Partial<React.ComponentProps<typeof EventWorkshopField>> = {}) {
  /** callback が呼ばれた引数を検証するための mock 関数一式 */
  const callbacks = {
    onWorkshopChange: vi.fn(),
    onReservationChange: vi.fn(),
    onAddSession: vi.fn(),
    onAutoSetSessions: vi.fn(),
    onRemoveSession: vi.fn(),
    onSessionChange: vi.fn(),
  }
  /** 初期表示で使うセッション。呼び出し側が指定した場合はその値を優先する。 */
  const props = {
    hasWorkshop: true,
    requiresReservation: true,
    sessions: [] as SessionInput[],
    canAutoSetSessions: false,
    labelStyle: {} as React.CSSProperties,
    inputStyle: {} as React.CSSProperties,
    ...callbacks,
    ...overrides,
  }

  return { ...render(<EventWorkshopField {...props} />), callbacks }
}

describe('EventWorkshopField — ワークショップ・セッション入力', () => {
  it('WSなしでは予約要否とセッション欄を隠し、WSありでは表示して変更を通知する', () => {
    const sessions: SessionInput[] = [{ time_label: '10:00〜11:00', max_participants: 8 }]
    const { rerender, callbacks } = renderField({ hasWorkshop: false, sessions })

    // 1. WSがない場合、予約要否とセッション関連の入力を表示しない。
    expect(screen.getByRole('checkbox', { name: 'ワークショップあり' })).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: '予約必要' })).toBeNull()
    expect(screen.queryByText('WSセッション（各回の時間・定員）')).toBeNull()

    // 2. 親へWSありを通知し、親の更新後には予約要否とセッション欄が表示される。
    fireEvent.click(screen.getByRole('checkbox', { name: 'ワークショップあり' }))
    expect(callbacks.onWorkshopChange).toHaveBeenCalledWith(true)
    rerender(
      <EventWorkshopField
        hasWorkshop
        requiresReservation
        sessions={sessions}
        canAutoSetSessions={false}
        labelStyle={{}}
        inputStyle={{}}
        {...callbacks}
      />,
    )
    expect(screen.getByRole('checkbox', { name: '予約必要' })).toBeChecked()
    expect(screen.getByText('WSセッション（各回の時間・定員）')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '1回目の時間' })).toHaveValue('10:00〜11:00')
    expect(screen.getByRole('spinbutton', { name: '1回目の定員' })).toHaveValue(8)

    // 3. 予約要否の切り替えも boolean 値を親へ渡す。
    fireEvent.click(screen.getByRole('checkbox', { name: '予約必要' }))
    expect(callbacks.onReservationChange).toHaveBeenCalledWith(false)
  })

  it('追加・時間変更・定員変更・削除の各操作を親 callback へ渡す', () => {
    const sessions: SessionInput[] = [{ time_label: '10:00〜11:00', max_participants: 8 }]
    const { callbacks } = renderField({ sessions })

    // 1. 空の行を追加する操作を親へ通知する。
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))
    expect(callbacks.onAddSession).toHaveBeenCalledTimes(1)

    // 2. 1回目の時間と定員を変え、位置・項目名・変換後の値を通知する。
    fireEvent.change(screen.getByRole('textbox', { name: '1回目の時間' }), { target: { value: '11:00〜12:00' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: '1回目の定員' }), { target: { value: '12' } })
    expect(callbacks.onSessionChange).toHaveBeenNthCalledWith(1, 0, 'time_label', '11:00〜12:00')
    expect(callbacks.onSessionChange).toHaveBeenNthCalledWith(2, 0, 'max_participants', 12)

    // 3. 表示中の1回目の削除操作を親へ通知する。
    fireEvent.click(screen.getByRole('button', { name: '1回目のセッションを消す' }))
    expect(callbacks.onRemoveSession).toHaveBeenCalledWith(0)
  })

  it('時間帯がないと自動設定を無効にし、時間帯があれば有効にして操作を通知する', () => {
    const { rerender, callbacks } = renderField({ canAutoSetSessions: false })

    // 1. 開催時間帯がないときは自動設定ボタンを押せない。
    const autoSetButton = screen.getByRole('button', { name: '自動設定' })
    expect(autoSetButton).toBeDisabled()
    fireEvent.click(autoSetButton)
    expect(callbacks.onAutoSetSessions).not.toHaveBeenCalled()

    // 2. 時間帯がある props へ更新すると押せるようになり、押下を親へ通知する。
    rerender(
      <EventWorkshopField
        hasWorkshop
        requiresReservation
        sessions={[]}
        canAutoSetSessions
        labelStyle={{}}
        inputStyle={{}}
        {...callbacks}
      />,
    )
    expect(autoSetButton).toBeEnabled()
    fireEvent.click(autoSetButton)
    expect(callbacks.onAutoSetSessions).toHaveBeenCalledTimes(1)
  })
})
