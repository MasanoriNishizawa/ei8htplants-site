/**
 * EventPreview コンポーネントのユニットテスト
 *
 * EventCard と同様のグリッド表示用カード。
 * - イベント名・開催日・時刻・ワークショップバッジの表示を確認する
 * - `formatDailyTimes` の動作もレンダリング結果で確認する
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
