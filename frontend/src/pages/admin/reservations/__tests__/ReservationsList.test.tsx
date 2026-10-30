/** ReservationsList のカード・テーブル表示と親画面への操作通知を確認する */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ReservationsList from '../ReservationsList'
import type { ReservationWithTime } from '../../reservationPrint'
import { formatJstDate } from '../../../../lib/localDate'

/** 全イベント一覧で表示する予約。表示項目を一意にしてカード・表の双方を確認する */
const RESERVATION = {
  id: 'r-list',
  event_id: 'ev-1',
  name: '表示確認さん',
  email: 'list@example.com',
  phone: '090-1234-5678',
  participants: 2,
  note: '窓際の席を希望',
  status: 'pending',
  session_id: 's-1',
  bring_plant: true,
  bring_pot: true,
  preferred_date: '2099-06-01',
  preferred_time: null,
  session_time: '14:00〜15:00',
  created_at: '2099-05-01T00:00:00Z',
  email_failed: null,
} as ReservationWithTime

/** 全イベント表示とイベント絞り込みの両方で使う表示名対応表 */
const EVENTS_MAP = new Map([['ev-1', 'テストイベント']])

/** 共通の表示条件で一覧を描画する */
function renderList(
  reservations: ReservationWithTime[],
  options: { showEventColumn?: boolean; updatingId?: string | null } = {},
) {
  const onSelectReservation = vi.fn()
  const onStatusUpdate = vi.fn()
  render(
    <ReservationsList
      reservations={reservations}
      showEventColumn={options.showEventColumn ?? true}
      eventsMap={EVENTS_MAP}
      updatingId={options.updatingId ?? null}
      onSelectReservation={onSelectReservation}
      onStatusUpdate={onStatusUpdate}
    />,
  )
  return { onSelectReservation, onStatusUpdate }
}

describe('ReservationsList — 全イベント予約一覧', () => {
  it('予約が0件のとき、モバイルカードとPCテーブルの両方に空一覧案内を表示する', () => {
    renderList([])

    expect(screen.getAllByText('予約はありません。')).toHaveLength(2)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('全イベント表示ではイベント列とカード内イベント名を表示する', () => {
    renderList([RESERVATION], { showEventColumn: true })

    expect(screen.getByRole('columnheader', { name: 'イベント' })).toBeInTheDocument()
    const card = screen.getByLabelText('表示確認さん さんの予約の詳細を開く')
    expect(within(card).getByText((_, element) => element?.textContent?.startsWith('テストイベント') ?? false, { selector: 'span' })).toBeInTheDocument()
    expect(within(card).getByText((_, element) => element?.textContent?.replace(/\s+/g, ' ').trim() === 'テストイベント · 14:00〜15:00 / 2099-06-01 · 2名')).toBeInTheDocument()
    const row = within(screen.getByRole('table')).getByRole('row', { name: /表示確認さん/ })
    expect(within(row).getByText('テストイベント')).toBeInTheDocument()
  })

  it('イベント絞り込み時はイベント列とカード内イベント名を表示しない', () => {
    renderList([RESERVATION], { showEventColumn: false })

    expect(screen.queryByRole('columnheader', { name: 'イベント' })).not.toBeInTheDocument()
    const card = screen.getByLabelText('表示確認さん さんの予約の詳細を開く')
    expect(within(card).getByText((_, element) => element?.textContent?.replace(/\s+/g, ' ').trim() === '14:00〜15:00 / 2099-06-01 · 2名')).toBeInTheDocument()
    expect(within(card).queryByText(/テストイベント/)).not.toBeInTheDocument()
    const row = within(screen.getByRole('table')).getByRole('row', { name: /表示確認さん/ })
    expect(within(row).queryByText('テストイベント')).not.toBeInTheDocument()
  })

  it('カードとテーブルに予約者・連絡先・日時・人数・持込・備考・状態を表示する', () => {
    renderList([RESERVATION])

    const card = screen.getByLabelText('表示確認さん さんの予約の詳細を開く')
    expect(within(card).getByText('表示確認さん')).toBeInTheDocument()
    expect(within(card).getByText('受付済')).toBeInTheDocument()

    const table = screen.getByRole('table')
    const row = within(table).getByRole('row', { name: /表示確認さん/ })
    expect(within(row).getByText(formatJstDate(RESERVATION.created_at))).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: RESERVATION.email })).toHaveAttribute('href', `mailto:${RESERVATION.email}`)
    expect(within(row).getByText(RESERVATION.phone!)).toBeInTheDocument()
    expect(within(row).getByText(RESERVATION.preferred_date!)).toBeInTheDocument()
    expect(within(row).getByText(RESERVATION.session_time!)).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(within(row).getByText('植物・鉢')).toBeInTheDocument()
    expect(within(row).getByText(RESERVATION.note!)).toBeInTheDocument()
    expect(within(row).getByText('受付済', { selector: 'span' })).toBeInTheDocument()
  })

  it('email_failedの予約はカードとテーブルにメール未送信を表示する', () => {
    const reservation = { ...RESERVATION, email_failed: true } as ReservationWithTime
    renderList([reservation])

    expect(screen.getAllByText('メール未送信')).toHaveLength(2)
  })

  it('カード選択で対象予約を選択callbackへ渡す', () => {
    const { onSelectReservation } = renderList([RESERVATION])

    fireEvent.click(screen.getByLabelText('表示確認さん さんの予約の詳細を開く'))

    expect(onSelectReservation).toHaveBeenCalledTimes(1)
    expect(onSelectReservation).toHaveBeenCalledWith(RESERVATION)
  })

  it('ステータス変更で予約IDと値を状態変更callbackへ渡す', () => {
    const { onStatusUpdate } = renderList([RESERVATION])
    const statusSelect = screen.getByRole('combobox', { name: '表示確認さん さんの予約のステータス' })

    fireEvent.change(statusSelect, { target: { value: 'cancelled' } })

    expect(onStatusUpdate).toHaveBeenCalledWith('r-list', 'cancelled')
  })

  it('更新中の予約だけ状態selectを無効にし、他行は操作可能にする', () => {
    const otherReservation = { ...RESERVATION, id: 'r-other', name: '別予約さん' } as ReservationWithTime
    renderList([RESERVATION, otherReservation], { updatingId: RESERVATION.id })

    expect(screen.getByRole('combobox', { name: '表示確認さん さんの予約のステータス' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '別予約さん さんの予約のステータス' })).toBeEnabled()
  })
})
