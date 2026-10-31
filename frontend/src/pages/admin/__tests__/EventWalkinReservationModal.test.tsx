/**
 * イベント別の当日参加モーダルが入力状態に応じて表示し、操作を親へ伝えることを確かめる。
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import EventWalkinReservationModal from '../EventWalkinReservationModal'
import type { Event, WsSession } from '../../../lib/api'

/** テストで使う複数日開催イベント。 */
const MULTI_DAY_EVENT = { start_date: '2026-11-01', end_date: '2026-11-02' } as Event
/** 時間枠選択肢。 */
const SESSIONS: WsSession[] = [
  { id: 'session-1', event_id: 'event-1', time_label: '10:00〜11:00', max_participants: 5, reserved_count: 0, display_order: 1 },
]
/** エラー表示に使う共有スタイル。 */
const ERROR_STYLE = { color: 'red' }

/** モーダルを表示し、callback を検証するための操作を返す。 */
function renderModal(overrides: Partial<React.ComponentProps<typeof EventWalkinReservationModal>> = {}) {
  const props: React.ComponentProps<typeof EventWalkinReservationModal> = {
    event: MULTI_DAY_EVENT,
    sessions: SESSIONS,
    walkinSession: '',
    walkinTime: '',
    walkinParticipants: 1,
    walkinDate: '2026-11-01',
    walkinSaving: false,
    walkinError: '',
    errorBoxStyle: ERROR_STYLE,
    onClose: vi.fn(),
    onSessionChange: vi.fn(),
    onTimeChange: vi.fn(),
    onParticipantsChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
  render(<EventWalkinReservationModal {...props} />)
  return props
}

describe('EventWalkinReservationModal（イベント別の当日参加）', () => {
  it('複数日イベントでは参加日を表示し、時間枠と人数の変更を親へ伝える', () => {
    const props = renderModal()
    const dialog = screen.getByRole('dialog', { name: '当日参加を追加' })

    expect(within(dialog).getByText('2026-11-01')).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: '時間枠' })).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('combobox', { name: '時間枠' }), { target: { value: 'session-1' } })
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: '参加人数' }), { target: { value: '3' } })

    expect(props.onSessionChange).toHaveBeenCalledWith('session-1')
    expect(props.onParticipantsChange).toHaveBeenCalledWith(3)
  })

  it('単日イベントでは参加日を隠し、時間枠が無い場合は自由入力を親へ伝える', () => {
    const props = renderModal({
      event: { start_date: '2026-11-01', end_date: '2026-11-01' } as Event,
      sessions: [],
    })
    const dialog = screen.getByRole('dialog', { name: '当日参加を追加' })
    const timeInput = within(dialog).getByRole('textbox', { name: '時間枠' })

    expect(within(dialog).queryByText('参加日')).not.toBeInTheDocument()
    fireEvent.change(timeInput, { target: { value: '13:00〜14:00' } })
    expect(props.onTimeChange).toHaveBeenCalledWith('13:00〜14:00')
    expect(within(dialog).getByRole('button', { name: '登録' })).toBeEnabled()
  })

  it('時間枠が無い場合は自由入力を空のままでも登録callbackへ渡せる', () => {
    const onSubmit = vi.fn()
    renderModal({ sessions: [], onSubmit })
    fireEvent.click(screen.getByRole('button', { name: '登録' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('参加人数が空または1未満になっても1以上を親へ伝える', () => {
    const props = renderModal()
    const participants = screen.getByRole('spinbutton', { name: '参加人数' })

    fireEvent.change(participants, { target: { value: '0' } })
    fireEvent.change(participants, { target: { value: '' } })

    expect(props.onParticipantsChange).toHaveBeenNthCalledWith(1, 1)
    expect(props.onParticipantsChange).toHaveBeenNthCalledWith(2, 1)
  })

  it('時間枠未選択または保存中は登録を無効にし、操作を送らない', () => {
    const onSubmit = vi.fn()
    const { rerender } = render(<EventWalkinReservationModal {...renderProps({ onSubmit })} />)
    const submit = screen.getByRole('button', { name: '登録' })

    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    rerender(<EventWalkinReservationModal {...renderProps({ walkinSession: 'session-1', walkinSaving: true, onSubmit })} />)
    expect(screen.getByRole('button', { name: '登録中...' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '登録中...' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('エラーを表示し、キャンセルまたは背景クリックで閉じるcallbackを呼ぶ', () => {
    const onClose = vi.fn()
    const props = renderModal({ walkinError: '登録に失敗しました', onClose })
    const dialog = screen.getByRole('dialog', { name: '当日参加を追加' })

    expect(within(dialog).getByRole('alert')).toHaveTextContent('登録に失敗しました')
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(props.errorBoxStyle).toBe(ERROR_STYLE)
  })
})

/** JSX 再描画テスト用に既定値を含む props を作る。 */
function renderProps(overrides: Partial<React.ComponentProps<typeof EventWalkinReservationModal>> = {}) {
  return {
    event: MULTI_DAY_EVENT,
    sessions: SESSIONS,
    walkinSession: '',
    walkinTime: '',
    walkinParticipants: 1,
    walkinDate: '2026-11-01',
    walkinSaving: false,
    walkinError: '',
    errorBoxStyle: ERROR_STYLE,
    onClose: vi.fn(),
    onSessionChange: vi.fn(),
    onTimeChange: vi.fn(),
    onParticipantsChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
}
