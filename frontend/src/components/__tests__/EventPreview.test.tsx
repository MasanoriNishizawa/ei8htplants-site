/**
 * EventPreview コンポーネントのユニットテスト
 *
 * EventCard と同様のグリッド表示用カード。
 * - イベント名・開催日・時刻・ワークショップバッジの表示を確認する
 * - `formatDailyTimes` の動作もレンダリング結果で確認する
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EventPreview from '../EventPreview'
import type { Event } from '../../lib/api'

/**
 * EventPreview を MemoryRouter でラップしてレンダリングするヘルパー
 * @param event - 表示するイベントデータ
 * @param horizontal - 水平レイアウトを使うか（デフォルト: false）
 */
function renderPreview(event: Event, horizontal = false) {
  return render(
    <MemoryRouter>
      <EventPreview event={event} horizontal={horizontal} />
    </MemoryRouter>
  )
}

/**
 * テスト用イベントのベースデータを生成する
 * @param overrides - 上書きするフィールド
 */
const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'ev-preview-1',
  slug: 'preview-event',
  name: 'プレビューテストイベント',
  start_date: '2099-08-10',
  end_date: '2099-08-12',
  time: '11:00〜17:00',
  location: '渋谷ヒカリエ',
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

// 表示確認用のサンプル画像
const SAMPLE_IMAGE = { id: 'img-1', url: 'https://example.com/preview.jpg', display_order: 1 }

describe('EventPreview コンポーネント', () => {
  it('イベント名が表示される', () => {
    // h3 要素にイベント名が表示されることを確認する
    renderPreview(makeEvent())
    expect(screen.getByText('プレビューテストイベント')).toBeDefined()
  })

  it('開催日が表示される（複数日・同月）', () => {
    // start_date と end_date が同月なら「YYYY年M月D日〜D日」形式で表示される
    renderPreview(makeEvent({ start_date: '2099-08-10', end_date: '2099-08-12' }))
    expect(screen.getByText('2099年8月10日〜12日')).toBeDefined()
  })

  it('開催日が表示される（単日）', () => {
    // end_date が null のとき「YYYY年M月D日」のみが表示される
    renderPreview(makeEvent({ start_date: '2099-08-10', end_date: null }))
    expect(screen.getByText('2099年8月10日')).toBeDefined()
  })

  it('time が表示される', () => {
    // event.time が設定されているとき時刻文字列が表示される
    renderPreview(makeEvent({ time: '11:00〜17:00' }))
    expect(screen.getByText('11:00〜17:00')).toBeDefined()
  })

  it('daily_times が設定されているとき時刻が表示される（全日同じ時間）', () => {
    // 全日同じ時間の場合は時間文字列のみが表示される
    renderPreview(makeEvent({
      time: null,
      daily_times: { '2099-08-10': '10:00〜16:00', '2099-08-11': '10:00〜16:00' },
    }))
    expect(screen.getByText('10:00〜16:00')).toBeDefined()
  })

  it('daily_times の日毎時間が異なる場合は「M/D（曜）時間」形式で表示される', () => {
    // 日毎に時間が異なる場合は複数日の情報が1行で表示される
    renderPreview(makeEvent({
      time: null,
      daily_times: {
        '2026-10-24': '10:00〜16:30',
        '2026-10-25': '11:00〜16:00',
      },
    }))
    // 月/日 + 曜日 + 時間の形式（曜日はタイムゾーン非依存の正規表現で確認）
    // daily_times は改行区切りなので各行を個別に確認する
    expect(screen.getByText(/10\/24（.）10:00〜16:30/)).toBeDefined()
    expect(screen.getByText(/10\/25（.）11:00〜16:00/)).toBeDefined()
  })

  it('time も daily_times もないとき時刻が表示されない', () => {
    // time と daily_times がともに null のとき HH:MM 形式のテキストが表示されない
    renderPreview(makeEvent({ time: null, daily_times: null }))
    expect(screen.queryByText(/\d{2}:\d{2}/)).toBeNull()
  })

  it('ワークショップバッジが画像上に表示される（has_workshop: true, images あり）', () => {
    // 画像があり has_workshop=true の場合、画像上に "Workshop" バッジが表示される
    renderPreview(makeEvent({
      has_workshop: true,
      images: [SAMPLE_IMAGE],
    }))
    expect(screen.getByText('Workshop')).toBeDefined()
  })

  it('has_workshop が false のときワークショップバッジが表示されない', () => {
    // has_workshop=false の場合、"Workshop" バッジが存在しない
    renderPreview(makeEvent({
      has_workshop: false,
      images: [SAMPLE_IMAGE],
    }))
    expect(screen.queryByText('Workshop')).toBeNull()
  })

  it('開催地名が表示される', () => {
    // location フィールドが情報ブロックに表示される
    renderPreview(makeEvent({ location: 'テスト会場名' }))
    expect(screen.getByText('テスト会場名')).toBeDefined()
  })

  it('月をまたぐ日付は両端をフル表記で表示される（日本語）', () => {
    // 異なる月にまたがる場合「YYYY年M月D日〜YYYY年M月D日」形式で表示される
    renderPreview(makeEvent({ start_date: '2099-05-30', end_date: '2099-06-02' }))
    expect(screen.getByText('2099年5月30日〜2099年6月2日')).toBeDefined()
  })
})

// ---- 画像スライダーのテスト ----
const TWO_IMAGES = [
  { id: 'p1', url: 'https://example.com/p1.jpg', display_order: 1 },
  { id: 'p2', url: 'https://example.com/p2.jpg', display_order: 2 },
]

describe('EventPreview 画像スライダー', () => {
  it('複数画像のとき ❯・❮ ボタンが表示される', () => {
    // 2枚以上の画像がある場合、前・次のナビゲーションボタンが表示される
    renderPreview(makeEvent({ images: TWO_IMAGES }))
    expect(screen.getByText('❯')).toBeDefined()
    expect(screen.getByText('❮')).toBeDefined()
  })

  it('❯ ボタンをクリックすると2枚目の画像に変わる', () => {
    // 次へボタンで表示画像インデックスが 1 に進む
    renderPreview(makeEvent({ images: TWO_IMAGES }))
    fireEvent.click(screen.getByText('❯'))
    const img = screen.getByRole('img', { name: 'プレビューテストイベント' })
    expect(img.getAttribute('src')).toBe(TWO_IMAGES[1].url)
  })

  it('❮ ボタンで先頭から末尾に循環する', () => {
    // 先頭のとき前へボタンを押すと末尾の画像に循環する
    renderPreview(makeEvent({ images: TWO_IMAGES }))
    fireEvent.click(screen.getByText('❮'))
    const img = screen.getByRole('img', { name: 'プレビューテストイベント' })
    expect(img.getAttribute('src')).toBe(TWO_IMAGES[1].url)
  })

  it('画像が1枚のときナビゲーションボタンが表示されない', () => {
    // 1枚だけのときは前・次ボタンを表示しない
    renderPreview(makeEvent({ images: [TWO_IMAGES[0]] }))
    expect(screen.queryByText('❯')).toBeNull()
    expect(screen.queryByText('❮')).toBeNull()
  })
})

// ---- 場所・リンク情報のテスト ----
describe('EventPreview 場所・リンク情報', () => {
  it('address が設定されているとき Google Maps リンクが表示される', () => {
    // address フィールドがあるとき Google Maps へのリンクが表示される
    renderPreview(makeEvent({ address: '東京都渋谷区道玄坂1-1-1' }))
    const link = screen.getByRole('link', { name: '東京都渋谷区道玄坂1-1-1' })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toContain('google.com/maps')
  })

  it('official_url が設定されているとき公式サイトリンクが表示される', () => {
    // official_url があるとき「公式サイト」リンクが表示される
    renderPreview(makeEvent({ official_url: 'https://example.com/official' }))
    const link = screen.getByRole('link', { name: '公式サイト' })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('https://example.com/official')
  })

  it('official_url が null のとき公式サイトリンクが表示されない', () => {
    // official_url が null のとき「公式サイト」リンクが存在しない
    renderPreview(makeEvent({ official_url: null }))
    expect(screen.queryByRole('link', { name: '公式サイト' })).toBeNull()
  })
})

// ---- hasPageContent（詳細を見る）のテスト ----
describe('EventPreview 詳細を見るリンク', () => {
  it('page_content に concept があるとき「詳細を見る」が表示される', () => {
    // hasPageContent が true になるような page_content があるとき「詳細を見る」が表示される
    renderPreview(makeEvent({ page_content: { concept: 'コンセプトテキスト' } }))
    // 「詳細を見る」リンクがページ内に存在することを確認する（複数ある可能性あり）
    const links = screen.getAllByText('詳細を見る')
    expect(links.length).toBeGreaterThan(0)
  })

  it('page_content が null のとき「詳細を見る」が表示されない', () => {
    // page_content が null のとき hasPageContent=false になり詳細ボタンが表示されない
    renderPreview(makeEvent({ page_content: null }))
    expect(screen.queryByText('詳細を見る')).toBeNull()
  })

  it('page_content に hero.tagline があるとき「詳細を見る」が表示される', () => {
    // hero.tagline があるとき hasPageContent が true になる（line 51 のカバレッジ）
    renderPreview(makeEvent({ page_content: { hero: { tagline: 'キャッチフレーズ' } } }))
    const links = screen.getAllByText('詳細を見る')
    expect(links.length).toBeGreaterThan(0)
  })

  it('「詳細を見る」リンクが /events/:slug を指す', () => {
    // slug が設定されているとき /events/<slug> へのリンクになる
    renderPreview(makeEvent({ slug: 'my-preview', page_content: { concept: 'テスト' } }))
    const link = screen.getAllByText('詳細を見る')[0].closest('a')
    expect(link?.getAttribute('href')).toBe('/events/my-preview')
  })
})

// ---- ワークショップセクションのテスト ----
describe('EventPreview ワークショップセクション', () => {
  it('has_workshop=true かつ is_past=true のときワークショップ終了メッセージが表示される', () => {
    // 終了済みのワークショップイベントでは「ワークショップを開催しました」と表示される
    renderPreview(makeEvent({ has_workshop: true, is_past: true }))
    expect(screen.getByText(/ワークショップを開催しました/)).toBeDefined()
  })

  it('has_workshop=true かつ is_past=false かつ ws_requires_reservation=true のとき予約リンクが表示される', () => {
    // 未終了・予約必要なワークショップでは「Habitat Style Workshop を予約する」リンクが表示される
    renderPreview(makeEvent({
      has_workshop: true,
      is_past: false,
      ws_requires_reservation: true,
      start_date: '2099-08-10',
      id: 'ev-ws-1',
    }))
    const link = screen.getByText('Habitat Style Workshop を予約する')
    expect(link).toBeDefined()
    // リンク先が /reserve?event_id=<id> であることを確認する
    const anchor = link.closest('a')
    expect(anchor?.getAttribute('href')).toContain('/reserve?event_id=ev-ws-1')
  })

  it('has_workshop=true かつ ws_requires_reservation=false のとき予約リンクもメッセージも表示されない', () => {
    // 予約不要のワークショップは予約リンクを表示しない（is_past=false）
    renderPreview(makeEvent({
      has_workshop: true,
      is_past: false,
      ws_requires_reservation: false,
    }))
    expect(screen.queryByText(/Habitat Style Workshop を予約する/)).toBeNull()
    expect(screen.queryByText(/ワークショップを開催しました/)).toBeNull()
  })
})
