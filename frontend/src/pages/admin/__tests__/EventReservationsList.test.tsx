/** EventReservationsList のカード表示・詳細選択と PC 表のステータス通知を確認する */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { STATUS_COLORS } from '../../../lib/reservationConstants'
import EventReservationsList from '../EventReservationsList'
import type { ReservationWithTime } from '../eventReservationExports'

describe('EventReservationsList — レスポンシブ予約一覧', () => {
  it('予約をカードとテーブルに表示し、詳細選択とステータス変更を親へ通知する', () => {
    /** カード・表の内容と親 callback の引数を確認する予約 */
    const reservation = {
      id: 'r-list',
      event_id: 'ev-1',
      name: '表示確認さん',
      email: 'list@example.com',
      phone: '090-1234-5678',
      participants: 2,
      note: null,
      status: 'pending',
      session_id: 's-1',
      bring_plant: true,
      bring_pot: false,
      preferred_date: '2026-11-01',
      preferred_time: null,
      session_time: '14:00〜15:00',
      created_at: '2026-10-30T00:00:00Z',
      email_failed: null,
    } as ReservationWithTime
    /** モバイルカードから親へ渡される予約を記録する */
    const onSelectReservation = vi.fn()
    /** PC 表のステータス変更要求を記録する */
    const onStatusUpdate = vi.fn()

    render(
      <EventReservationsList
        reservations={[reservation]}
        updatingId={null}
        onSelectReservation={onSelectReservation}
        onStatusUpdate={onStatusUpdate}
      />,
    )

    // 1. モバイル用カードに予約の要約と状態が表示され、選択予約が親へ渡る。
    const mobileCard = screen.getByLabelText('表示確認さん さんの予約の詳細を開く')
    expect(within(mobileCard).getByText('14:00〜15:00 / 2026-11-01 · 2名')).toBeInTheDocument()
    expect(within(mobileCard).getByText('受付済')).toBeInTheDocument()
    fireEvent.click(mobileCard)
    expect(onSelectReservation).toHaveBeenCalledWith(reservation)

    // 2. PC テーブルに予約情報を表示し、状態変更を ID と新しい状態で親へ渡す。
    const table = screen.getByRole('table')
    const reservationRow = within(table).getByRole('row', { name: /表示確認さん/ })
    expect(within(reservationRow).getByText('list@example.com')).toBeInTheDocument()
    expect(within(reservationRow).getByText('植物')).toBeInTheDocument()
    const statusSelect = within(reservationRow).getByRole('combobox', { name: '表示確認さん さんの予約のステータス' })
    fireEvent.change(statusSelect, { target: { value: 'cancelled' } })
    expect(onStatusUpdate).toHaveBeenCalledWith('r-list', 'cancelled')
  })

  it('未知の状態をfallback表示し、空一覧文言と更新中の選択不可を保つ', () => {
    /** 未知の状態を持つ予約。更新中 ID を一致させ、選択欄の無効化も確認する */
    const reservation = {
      id: 'r-unknown',
      event_id: 'ev-1',
      name: '未知状態さん',
      email: 'unknown@example.com',
      phone: null,
      participants: 1,
      note: null,
      status: 'archived',
      session_id: null,
      bring_plant: false,
      bring_pot: false,
      preferred_date: null,
      preferred_time: null,
      created_at: '2026-10-30T00:00:00Z',
      email_failed: null,
    } as ReservationWithTime

    const { rerender } = render(
      <EventReservationsList
        reservations={[reservation]}
        updatingId="r-unknown"
        onSelectReservation={vi.fn()}
        onStatusUpdate={vi.fn()}
      />,
    )

    // 1. 未知の状態は元のラベルを表示し、バッジ色は pending のfallbackを使う。
    const mobileCard = screen.getByLabelText('未知状態さん さんの予約の詳細を開く')
    const statusBadge = within(mobileCard).getByText('archived')
    expect(statusBadge).toHaveStyle({ color: STATUS_COLORS.pending.color })
    expect(within(screen.getByRole('table')).getByRole('combobox', { name: '未知状態さん さんの予約のステータス' })).toBeDisabled()

    // 2. 空一覧ではカードとテーブルのそれぞれに空状態を表示する。
    rerender(
      <EventReservationsList
        reservations={[]}
        updatingId={null}
        onSelectReservation={vi.fn()}
        onStatusUpdate={vi.fn()}
      />,
    )
    expect(screen.getAllByText('予約はありません。')).toHaveLength(2)
  })
})
