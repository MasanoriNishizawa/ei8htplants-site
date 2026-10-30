/** EventAdminInfo の宿泊・出店料入力欄を表示する子コンポーネントのテスト */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import EventAdminInfoStayBoothFields from '../EventAdminInfoStayBoothFields'

describe('EventAdminInfoStayBoothFields — 宿泊・出店料フォーム', () => {
  it('受け取った宿泊・出店料の値を表示し、各入力変更を親のcallbackへ渡す', () => {
    const onHotelNameChange = vi.fn()
    const onHotelFeeChange = vi.fn()
    const onBoothFeeChange = vi.fn()
    const onBoothFeePayMethodChange = vi.fn()
    const onBoothFeeDueChange = vi.fn()
    const onBoothFeePaidChange = vi.fn()

    render(
      <EventAdminInfoStayBoothFields
        hotelName="宿泊ホテルA"
        hotelFee={8800}
        boothFee={15000}
        boothFeePayMethod="事前振込"
        boothFeeDue="2026-11-30"
        boothFeePaid
        inputStyle={{}}
        labelStyle={{}}
        onHotelNameChange={onHotelNameChange}
        onHotelFeeChange={onHotelFeeChange}
        onBoothFeeChange={onBoothFeeChange}
        onBoothFeePayMethodChange={onBoothFeePayMethodChange}
        onBoothFeeDueChange={onBoothFeeDueChange}
        onBoothFeePaidChange={onBoothFeePaidChange}
      />,
    )

    expect(screen.getByLabelText('ホテル名')).toHaveValue('宿泊ホテルA')
    expect(screen.getByLabelText('宿泊料金')).toHaveValue(8800)
    expect(screen.getByLabelText('出店料')).toHaveValue(15000)
    expect(screen.getByLabelText('支払い方法')).toHaveValue('事前振込')
    expect(screen.getByLabelText('支払い期限')).toHaveValue('2026-11-30')
    expect(screen.getByRole('checkbox', { name: '支払い済み' })).toBeChecked()

    fireEvent.change(screen.getByLabelText('ホテル名'), { target: { value: '宿泊ホテルB' } })
    fireEvent.change(screen.getByLabelText('宿泊料金'), { target: { value: '9200' } })
    fireEvent.change(screen.getByLabelText('出店料'), { target: { value: '18000' } })
    fireEvent.change(screen.getByLabelText('支払い方法'), { target: { value: 'その他' } })
    fireEvent.change(screen.getByLabelText('支払い期限'), { target: { value: '2026-12-15' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '支払い済み' }))

    expect(onHotelNameChange).toHaveBeenCalledWith('宿泊ホテルB')
    expect(onHotelFeeChange).toHaveBeenCalledWith(9200)
    expect(onBoothFeeChange).toHaveBeenCalledWith(18000)
    expect(onBoothFeePayMethodChange).toHaveBeenCalledWith('その他')
    expect(onBoothFeeDueChange).toHaveBeenCalledWith('2026-12-15')
    expect(onBoothFeePaidChange).toHaveBeenCalledWith(false)

    fireEvent.change(screen.getByLabelText('ホテル名'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('宿泊料金'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('出店料'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('支払い方法'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('支払い期限'), { target: { value: '' } })

    expect(onHotelNameChange).toHaveBeenLastCalledWith(null)
    expect(onHotelFeeChange).toHaveBeenLastCalledWith(null)
    expect(onBoothFeeChange).toHaveBeenLastCalledWith(null)
    expect(onBoothFeePayMethodChange).toHaveBeenLastCalledWith(null)
    expect(onBoothFeeDueChange).toHaveBeenLastCalledWith(null)
  })
})
