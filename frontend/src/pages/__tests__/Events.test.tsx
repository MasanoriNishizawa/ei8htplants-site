/**
 * Events ページのユニットテスト
 *
 * - api.events.list を vi.mock でモックして本番 DB への接続を防ぐ
 * - MemoryRouter で useSearchParams を使えるようにする
 * - 開催予定・過去イベントの切り替えとフィルター初期状態を確認する
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Events from '../Events'
import { api } from '../../lib/api'
import type { Event } from '../../lib/api'

// api モジュール全体をモックし、本番 API への接続を完全に遮断する
vi.mock('../../lib/api', () => ({
  api: {
    events: {
      // list は各テストで mockResolvedValue で上書きする
      list: vi.fn(),
    },
  },
}))

/**
 * テスト用イベントデータのファクトリ関数
 * @param overrides - 上書きするフィールド
 * @returns 戻り値なし。
 */
const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'ev-1',
  slug: 'test-event',
  name: 'テストイベント',
  start_date: '2099-09-01',
  end_date: null,
  time: '10:00〜17:00',
  location: 'テスト会場',
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

describe('Events ページ', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセットして呼び出し履歴を初期化する
    vi.mocked(api.events.list).mockReset()
  })

  it('イベント一覧ページがレンダリングされる（"Events" 見出しが表示される）', async () => {
    // ページに "Events" という h1 見出しが表示されることを確認する
    vi.mocked(api.events.list).mockResolvedValue([])
    render(
      <MemoryRouter initialEntries={['/events']}>
        <Events />
      </MemoryRouter>
    )
    // h1 は同期的に表示される（useEffect より前にレンダリングされる）
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
    expect(screen.getByText('Events')).toBeDefined()
  })

  it('API からイベントを取得してイベント名が表示される', async () => {
    // api.events.list が返すイベント名が画面に表示されることを確認する
    const events = [
      makeEvent({ id: 'ev-1', name: '春のフラワーフェア' }),
      makeEvent({ id: 'ev-2', name: '夏の多肉植物展', start_date: '2099-10-01' }),
    ]
    vi.mocked(api.events.list).mockResolvedValue(events)
    render(
      <MemoryRouter initialEntries={['/events']}>
        <Events />
      </MemoryRouter>
    )
    // データ取得完了後にイベント名が表示される
    await waitFor(() => {
      expect(screen.getByText('春のフラワーフェア')).toBeDefined()
      expect(screen.getByText('夏の多肉植物展')).toBeDefined()
    })
  })

  it('イベントが空のとき「予定されているイベントはありません。」と表示される', async () => {
    // 空配列が返ったとき、未開催イベントなしメッセージが表示される
    vi.mocked(api.events.list).mockResolvedValue([])
    render(
      <MemoryRouter initialEntries={['/events']}>
        <Events />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('予定されているイベントはありません。')).toBeDefined()
    })
  })

  it('?page=past で "Past Events" 見出しが表示される', async () => {
    // URL クエリパラメータ page=past のとき "Past Events" ページが表示される
    vi.mocked(api.events.list).mockResolvedValue([])
    render(
      <MemoryRouter initialEntries={['/events?page=past']}>
        <Events />
      </MemoryRouter>
    )
    expect(screen.getByText('Past Events')).toBeDefined()
  })

  it('?page=past でイベントが空のとき「過去のイベントはありません。」と表示される', async () => {
    // 過去イベントページで空配列のとき、過去イベントなしメッセージが表示される
    vi.mocked(api.events.list).mockResolvedValue([])
    render(
      <MemoryRouter initialEntries={['/events?page=past']}>
        <Events />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('過去のイベントはありません。')).toBeDefined()
    })
  })

  it('ローディング中は「読み込み中...」が表示される', async () => {
    // API が解決される前（保留中）はローディングメッセージが表示される
    vi.mocked(api.events.list).mockReturnValue(new Promise(() => {})) // 永遠に保留
    render(
      <MemoryRouter initialEntries={['/events']}>
        <Events />
      </MemoryRouter>
    )
    expect(screen.getByText('読み込み中...')).toBeDefined()
  })

  it('api.events.list は isPast=false で呼ばれる（開催予定ページ）', async () => {
    // 開催予定ページでは past=false で API が呼ばれることを確認する
    vi.mocked(api.events.list).mockResolvedValue([])
    render(
      <MemoryRouter initialEntries={['/events']}>
        <Events />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(vi.mocked(api.events.list)).toHaveBeenCalledWith(false)
    })
  })

  it('api.events.list は isPast=true で呼ばれる（過去ページ）', async () => {
    // 過去イベントページでは past=true で API が呼ばれることを確認する
    vi.mocked(api.events.list).mockResolvedValue([])
    render(
      <MemoryRouter initialEntries={['/events?page=past']}>
        <Events />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(vi.mocked(api.events.list)).toHaveBeenCalledWith(true)
    })
  })
})
