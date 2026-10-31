/** ReservationDetailSheet の表示内容と親画面へ返す操作を確認する */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ReservationDetailSheet from '../ReservationDetailSheet'
import type { ReservationWithTime } from '../../reservationPrint'

/** 詳細シートの基本表示と任意項目を確認する予約データ */
const RESERVATION = {
  id: 'r-detail-sheet',
  event_id: 'ev-detail-sheet',
  name: '詳細確認さん',
  email: 'detail@example.com',
  phone: '090-1234-5678',
  participants: 2,
  note: '入口近くを希望',
  status: 'pending',
  session_id: 's-detail-sheet',
  bring_plant: true,
  bring_pot: true,
  preferred_date: '2099-06-01',
  preferred_time: null,
  session_time: '14:00〜15:00',
  created_at: '2099-05-01T00:00:00Z',
  email_failed: null,
} as ReservationWithTime

/**
 * 標準条件で詳細シートを描画し、親画面へ返す callback を取得する。
 * @param reservation 詳細表示に使う予約データ
 * @param options イベント名とステータス更新中かどうか
 * @returns 描画に使った閉じる callback とステータス変更 callback
 */
function renderSheet(
  reservation: ReservationWithTime = RESERVATION,
  options: { eventName?: string; updating?: boolean } = {},
) {
  const onClose = vi.fn()
  const onStatusChange = vi.fn()
  render(
    <ReservationDetailSheet
      reservation={reservation}
      eventName={options.eventName}
      updating={options.updating ?? false}
      onClose={onClose}
      onStatusChange={onStatusChange}
    />,
  )
  return { onClose, onStatusChange }
}

describe('ReservationDetailSheet — 全イベント予約詳細', () => {
  it('全イベント表示では対象イベント名を詳細に表示する', () => {
    renderSheet(RESERVATION, { eventName: 'Green Market 2027' })

    const dialog = screen.getByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })
    const eventRow = within(dialog).getByText('イベント').parentElement
    expect(eventRow).not.toBeNull()
    expect(within(eventRow!).getByText('Green Market 2027')).toBeInTheDocument()
  })

  it('イベント名が渡されない場合はイベント行を省略する', () => {
    renderSheet()

    expect(screen.queryByText('イベント')).not.toBeInTheDocument()
  })

  it('.invalid のメールアドレスは伏せてハイフンで表示する', () => {
    const reservation = { ...RESERVATION, email: 'walkin@guest.invalid' } as ReservationWithTime
    renderSheet(reservation)

    const dialog = screen.getByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })
    const emailRow = within(dialog).getByText('メール').parentElement
    expect(emailRow).not.toBeNull()
    expect(within(emailRow!).getByText('-')).toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: reservation.email })).not.toBeInTheDocument()
  })

  it('任意項目が未入力なら電話・希望日・予約時間・備考の行を省略する', () => {
    const reservation = {
      ...RESERVATION,
      phone: null,
      preferred_date: null,
      preferred_time: null,
      session_time: undefined,
      note: null,
    } as ReservationWithTime
    renderSheet(reservation)

    const dialog = screen.getByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })
    for (const label of ['電話', '希望日', '予約時間', '備考']) {
      expect(within(dialog).queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('植物と鉢の持ち込みがない場合は持込欄に「なし」と表示する', () => {
    const reservation = { ...RESERVATION, bring_plant: false, bring_pot: false } as ReservationWithTime
    renderSheet(reservation)

    const dialog = screen.getByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })
    const bringRow = within(dialog).getByText('持込').parentElement
    expect(bringRow).not.toBeNull()
    expect(within(bringRow!).getByText('なし')).toBeInTheDocument()
  })

  it('閉じるボタンを押すと親画面の閉じるcallbackを呼ぶ', () => {
    const { onClose } = renderSheet()

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('暗幕を押すと親画面の閉じるcallbackを呼ぶ', () => {
    const { onClose } = renderSheet()
    const dialog = screen.getByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })

    fireEvent.click(dialog.parentElement!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('詳細シート内を押しても親画面の閉じるcallbackを呼ばない', () => {
    const { onClose } = renderSheet()
    const dialog = screen.getByRole('dialog', { name: '詳細確認さん さんの予約の詳細' })

    fireEvent.click(dialog)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('ステータスを選ぶと選択値を親画面のcallbackへ渡す', () => {
    const { onStatusChange } = renderSheet()

    fireEvent.change(screen.getByRole('combobox', { name: 'ステータス' }), { target: { value: 'cancelled' } })

    expect(onStatusChange).toHaveBeenCalledWith('cancelled')
  })

  it('ステータス更新中は選択欄を無効にする', () => {
    renderSheet(RESERVATION, { updating: true })

    expect(screen.getByRole('combobox', { name: 'ステータス' })).toBeDisabled()
  })
})
