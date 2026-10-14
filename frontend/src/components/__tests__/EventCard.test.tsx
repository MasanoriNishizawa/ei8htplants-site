import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EventCard from '../EventCard'
import type { Event } from '../../lib/api'

function renderCard(event: Event, props: { isNext?: boolean; isHome?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <EventCard event={event} {...props} />
    </MemoryRouter>
  )
}

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'ev-1',
  slug: 'test-event',
  name: 'Test Event',
  start_date: '2099-06-01',
  end_date: '2099-06-03',
  time: '10:00〜17:00',
  location: '代々木公園',
  booth_number: null,
  address: null,
  official_url: null,
  brands: [],
  has_workshop: false,
  ws_requires_reservation: false,
  is_past: false,
  display_order: 1,
  images: [],
  page_content: null,
  daily_times: null,
  ...overrides,
})

const THREE_IMAGES = [
  { id: 'i1', url: 'https://example.com/a.jpg', display_order: 1 },
  { id: 'i2', url: 'https://example.com/b.jpg', display_order: 2 },
  { id: 'i3', url: 'https://example.com/c.jpg', display_order: 3 },
]

describe('EventCard 画像ナビゲーション', () => {
  it('初期表示は最初の画像', () => {
    renderCard(makeEvent({ images: THREE_IMAGES }))
    const img = screen.getByRole('img', { name: 'Test Event' })
    expect(img).toHaveAttribute('src', THREE_IMAGES[0].url)
  })

  it('次へボタンで2枚目に進む', () => {
    renderCard(makeEvent({ images: THREE_IMAGES }))
    fireEvent.click(screen.getByText('❯'))
    const img = screen.getByRole('img', { name: 'Test Event' })
    expect(img).toHaveAttribute('src', THREE_IMAGES[1].url)
  })

  it('末尾から次へで先頭に循環する', () => {
    renderCard(makeEvent({ images: THREE_IMAGES }))
    fireEvent.click(screen.getByText('❯'))
    fireEvent.click(screen.getByText('❯'))
    fireEvent.click(screen.getByText('❯'))
    const img = screen.getByRole('img', { name: 'Test Event' })
    expect(img).toHaveAttribute('src', THREE_IMAGES[0].url)
  })

  it('先頭から前へで末尾に循環する', () => {
    renderCard(makeEvent({ images: THREE_IMAGES }))
    fireEvent.click(screen.getByText('❮'))
    const img = screen.getByRole('img', { name: 'Test Event' })
    expect(img).toHaveAttribute('src', THREE_IMAGES[2].url)
  })

  it('画像が1枚のときナビゲーションボタンは表示されない', () => {
    renderCard(makeEvent({ images: [THREE_IMAGES[0]] }))
    expect(screen.queryByText('❯')).toBeNull()
    expect(screen.queryByText('❮')).toBeNull()
  })
})

describe('EventCard formatDate', () => {
  it('単日イベント', () => {
    renderCard(makeEvent({ start_date: '2099-06-01', end_date: null }))
    expect(screen.getByText('2099年6月1日')).toBeDefined()
  })

  it('同月の複数日: 末尾は日のみ', () => {
    renderCard(makeEvent({ start_date: '2099-06-01', end_date: '2099-06-03' }))
    expect(screen.getByText('2099年6月1日〜3日')).toBeDefined()
  })

  it('月をまたぐ場合は両端をフル表記', () => {
    renderCard(makeEvent({ start_date: '2099-05-30', end_date: '2099-06-02' }))
    expect(screen.getByText('2099年5月30日〜2099年6月2日')).toBeDefined()
  })
})

// ---- formatDailyTimes 関連のテスト ----
// EventCard 内部の formatDailyTimes 関数の動作をレンダリング結果で確認する
describe('EventCard formatDailyTimes', () => {
  it('daily_times が設定されているイベントで時刻文字列が表示される', () => {
    // 1日分の daily_times → その時刻がそのまま表示される
    renderCard(makeEvent({
      time: null,
      daily_times: { '2099-06-01': '10:00〜16:00' },
    }))
    expect(screen.getByText('10:00〜16:00')).toBeDefined()
  })

  it('daily_times の全日時間が同じ場合は単一時間だけ表示される', () => {
    // 複数日でも全日同じ時間 → 時間のみ（「M/D」形式にならない）
    renderCard(makeEvent({
      time: null,
      daily_times: {
        '2099-06-01': '10:00〜16:00',
        '2099-06-02': '10:00〜16:00',
      },
    }))
    expect(screen.getByText('10:00〜16:00')).toBeDefined()
    // 「6/1」「6/2」のような日付プレフィックスは表示されない
    expect(screen.queryByText(/6\/1/)).toBeNull()
  })

  it('daily_times の日毎時間が異なる場合は「M/D（曜）時間」形式で複数表示される', () => {
    // 日毎に時間が異なる → 各日の情報が改行（\n）で結合されて pre-line スタイルで表示される
    renderCard(makeEvent({
      time: null,
      daily_times: {
        '2026-10-24': '10:00〜16:30',
        '2026-10-25': '10:00〜16:00',
      },
    }))
    // 月/日 + 曜日 + 時間の形式で2日分が改行区切りで表示される（曜日は . で任意マッチ）
    // getByText は DOM テキストから改行を除去してマッチするため、各行を個別に確認する
    expect(screen.getByText(/10\/24（.）10:00〜16:30/)).toBeDefined()
    expect(screen.getByText(/10\/25（.）10:00〜16:00/)).toBeDefined()
  })

  it('time が null で daily_times も null のとき時刻が表示されない', () => {
    // time も daily_times もない → HH:MM 形式のテキストが一切表示されない
    renderCard(makeEvent({ time: null, daily_times: null }))
    // HH:MM 形式（例: 10:00）が含まれる要素が存在しないことを確認
    expect(screen.queryByText(/\d{2}:\d{2}/)).toBeNull()
  })
})
