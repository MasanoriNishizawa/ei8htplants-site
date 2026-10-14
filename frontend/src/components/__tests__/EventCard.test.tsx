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

// ---- isHome レイアウトのテスト ----
describe('EventCard isHome レイアウト', () => {
  it('isHome=true のとき /events へのリンクが含まれる', () => {
    // ホームページ用レイアウトでは画像部分が /events へのリンクでラップされる
    renderCard(makeEvent({ images: THREE_IMAGES }), { isHome: true })
    // href="/events" の a タグが存在することを確認する
    const link = screen.getByRole('link', { name: /Test Event/ })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('/events')
  })

  it('isHome=false のとき全体リンクは表示されない', () => {
    // 通常レイアウトでは画像が独立して表示され /events への a タグは存在しない
    renderCard(makeEvent({ images: THREE_IMAGES }), { isHome: false })
    // /events へのリンクが存在しないことを確認する
    const links = document.querySelectorAll('a[href="/events"]')
    expect(links.length).toBe(0)
  })
})

// ---- ブランドバッジのテスト ----
describe('EventCard brands', () => {
  it('brands が設定されているときブランドバッジが表示される', () => {
    // brands フィールドに値があるとき各ブランド名がバッジとして表示される
    renderCard(makeEvent({ brands: ['ei8ht plants', 'Habitat Oides'] }))
    expect(screen.getByText('ei8ht plants')).toBeDefined()
    expect(screen.getByText('Habitat Oides')).toBeDefined()
  })

  it('brands が空のときブランドバッジが表示されない', () => {
    // brands が [] のときブランドセクションが存在しない
    renderCard(makeEvent({ brands: [] }))
    expect(screen.queryByText('ei8ht plants')).toBeNull()
  })
})

// ---- 場所情報のテスト ----
describe('EventCard 場所情報', () => {
  it('booth_number が設定されているときブース番号が表示される', () => {
    // booth_number フィールドがあるときは「ブース: XXX」という形式で表示される
    renderCard(makeEvent({ booth_number: 'A-05' }))
    expect(screen.getByText(/ブース: A-05/)).toBeDefined()
  })

  it('booth_number が null のときブース表示がない', () => {
    // booth_number が null のときはブース行が存在しない
    renderCard(makeEvent({ booth_number: null }))
    expect(screen.queryByText(/ブース:/)).toBeNull()
  })

  it('address が設定されているとき Google Maps リンクが表示される', () => {
    // address が設定されているとき Google Maps へのリンクが表示される
    renderCard(makeEvent({ address: '東京都渋谷区道玄坂1-1-1' }))
    const mapsLink = screen.getByRole('link', { name: '東京都渋谷区道玄坂1-1-1' })
    expect(mapsLink).toBeDefined()
    expect(mapsLink.getAttribute('href')).toContain('google.com/maps')
  })

  it('official_url が設定されているとき公式サイトリンクが表示される', () => {
    // official_url が設定されているとき「公式サイト」というリンクが表示される
    renderCard(makeEvent({ official_url: 'https://example.com/event' }))
    const siteLink = screen.getByRole('link', { name: '公式サイト' })
    expect(siteLink).toBeDefined()
    expect(siteLink.getAttribute('href')).toBe('https://example.com/event')
  })

  it('official_url が null のとき公式サイトリンクが表示されない', () => {
    // official_url が null のときは「公式サイト」リンクが存在しない
    renderCard(makeEvent({ official_url: null }))
    expect(screen.queryByRole('link', { name: '公式サイト' })).toBeNull()
  })
})

// ---- ワークショップセクションのテスト ----
describe('EventCard ワークショップセクション', () => {
  it('has_workshop=true のときワークショップセクションが表示される', () => {
    // has_workshop=true のとき "Habitat Style Workshop" の文字が表示される
    renderCard(makeEvent({ has_workshop: true }))
    expect(screen.getByText('Habitat Style Workshop')).toBeDefined()
  })

  it('has_workshop=false のときワークショップセクションが表示されない', () => {
    // has_workshop=false のとき Workshop セクションが存在しない
    renderCard(makeEvent({ has_workshop: false }))
    expect(screen.queryByText('Habitat Style Workshop')).toBeNull()
  })

  it('ws_requires_reservation=true かつ is_past=false のとき予約ボタンが表示される', () => {
    // 予約が必要（ws_requires_reservation=true）かつ未終了（is_past=false）なら予約リンクが表示される
    renderCard(makeEvent({
      has_workshop: true,
      ws_requires_reservation: true,
      is_past: false,
      start_date: '2099-06-01',
    }))
    expect(screen.getByText('ワークショップを予約する')).toBeDefined()
  })

  it('ws_requires_reservation=false のとき予約ボタンが表示されない', () => {
    // 予約不要のときは予約ボタンが表示されない
    renderCard(makeEvent({
      has_workshop: true,
      ws_requires_reservation: false,
    }))
    expect(screen.queryByText('ワークショップを予約する')).toBeNull()
  })

  it('is_past=true のとき予約ボタンが表示されない', () => {
    // 終了済みイベントでは予約ボタンが表示されない
    renderCard(makeEvent({
      has_workshop: true,
      ws_requires_reservation: true,
      is_past: true,
    }))
    expect(screen.queryByText('ワークショップを予約する')).toBeNull()
  })

  it('has_workshop=true のとき画像上に Workshop バッジが表示される', () => {
    // has_workshop=true で画像がある場合、画像右上に "Workshop" バッジが表示される
    renderCard(makeEvent({
      has_workshop: true,
      images: [THREE_IMAGES[0]],
    }))
    expect(screen.getByText('Workshop')).toBeDefined()
  })
})

// ---- 詳細リンクのテスト ----
describe('EventCard 詳細を見るリンク', () => {
  it('page_content が設定されているとき「詳細を見る」リンクが表示される', () => {
    // page_content が null でない（空オブジェクトでも）ときに「詳細を見る」ボタンが表示される
    renderCard(makeEvent({ page_content: {} }))
    expect(screen.getByText('詳細を見る')).toBeDefined()
  })

  it('page_content が null のとき「詳細を見る」リンクが表示されない', () => {
    // page_content が null のとき詳細ボタンが存在しない
    renderCard(makeEvent({ page_content: null }))
    expect(screen.queryByText('詳細を見る')).toBeNull()
  })

  it('「詳細を見る」リンクが /events/:slug に遷移する', () => {
    // slug が設定されているとき /events/<slug> へのリンクになる
    renderCard(makeEvent({ slug: 'my-event', page_content: {} }))
    const link = screen.getByText('詳細を見る').closest('a')
    expect(link?.getAttribute('href')).toBe('/events/my-event')
  })
})

// ---- 緊急バッジのテスト ----
// 注: バッジは imageSection（images.length > 0 のとき）の内部にのみ表示される

/** 今日から n 日後の日付文字列（YYYY-MM-DD）をローカルタイムゾーンで返す */
function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('EventCard 緊急バッジ', () => {
  const ONE_IMAGE = [{ id: 'i1', url: 'https://example.com/a.jpg', display_order: 1 }]

  it('start_date が今日のとき「本日開催」バッジが表示される', () => {
    // days=0 のとき「本日開催」バッジが表示される
    renderCard(makeEvent({ start_date: daysFromNow(0), is_past: false, images: ONE_IMAGE }))
    expect(screen.getByText('本日開催')).toBeDefined()
  })

  it('start_date が7日以内のとき「あと〇日」バッジが表示される', () => {
    // days が 1〜7 のとき「あと〇日」バッジが表示される
    renderCard(makeEvent({ start_date: daysFromNow(3), is_past: false, images: ONE_IMAGE }))
    expect(screen.getByText('あと3日')).toBeDefined()
  })

  it('start_date が8日以上先のときバッジが表示されない', () => {
    // days > 7 のとき緊急バッジは表示されない
    renderCard(makeEvent({ start_date: '2099-06-01', is_past: false, images: ONE_IMAGE }))
    expect(screen.queryByText(/あと\d+日/)).toBeNull()
    expect(screen.queryByText('本日開催')).toBeNull()
    expect(screen.queryByText('開催中')).toBeNull()
  })

  it('start が過去かつ end が今日以降のとき「開催中」バッジが表示される', () => {
    // startD < today <= endD のとき「開催中」バッジが表示される
    renderCard(makeEvent({
      start_date: daysFromNow(-2),
      end_date: daysFromNow(2),
      is_past: false,
      images: ONE_IMAGE,
    }))
    expect(screen.getByText('開催中')).toBeDefined()
  })
})
