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
