/**
 * AdminEvents ページのテスト
 *
 * 1. イベント一覧に「管理情報」リンクが表示されること
 *    - 各イベント行に「管理情報」ボタンが表示される
 *    - リンク先が /admin/events/:id/admin-info になっている
 * 2. 各イベント行に「画像DL」リンクが表示され、リンク先が /admin/events/:id/images になっている
 * 3. ローディング中の表示
 * 4. イベントがないときの表示
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminEvents from '../Events'
import { api } from '../../../lib/api'
import type { Event, Reservation } from '../../../lib/api'

// api モジュールのモック。実装は保持せず api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: {
        list: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      reserve: {
        list: vi.fn(),
      },
    },
  }
})

// ---- テスト用モックデータ ----

/**
 * テスト用のイベントデータ（今後のイベントとして使う）
 */
const MOCK_EVENT: Event = {
  id: 'event-admin-1',
  slug: 'admin-test-event',
  name: '管理情報テストイベント',
  start_date: '2099-06-01',
  end_date: null,
  time: '10:00〜17:00',
  location: 'テスト会場',
  booth_number: null,
  address: null,
  official_url: null,
  brands: ['ei8ht plants'],
  has_workshop: false,
  ws_requires_reservation: false,
  is_past: false,
  display_order: 1,
  images: [],
  page_content: null,
  daily_times: null,
}

/**
 * AdminEvents ページを MemoryRouter でラップしてレンダリングするヘルパー
 */
function renderAdminEventsPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/events']}>
      <Routes>
        <Route path="/admin/events" element={<AdminEvents />} />
      </Routes>
    </MemoryRouter>
  )
}

// ---- テストスイート ----

describe('AdminEvents ページ — 管理情報リンク', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセットしてデフォルト値を設定する
    vi.mocked(api.events.list).mockReset()
    vi.mocked(api.reserve.list).mockReset()

    // 今後のイベント（past=false）は MOCK_EVENT を返し、過去（past=true）は空配列を返す
    vi.mocked(api.events.list).mockImplementation((past = false) =>
      Promise.resolve(past ? [] : [MOCK_EVENT])
    )
    // 予約は空配列を返す
    vi.mocked(api.reserve.list).mockResolvedValue([] as Reservation[])
  })

  it('データ読み込み後に「管理情報」リンクが表示される', async () => {
    // イベント一覧に「管理情報」というテキストのリンクが表示されることを確認する
    renderAdminEventsPage()
    await waitFor(() => {
      expect(screen.getByText('管理情報')).toBeDefined()
    })
  })

  it('「管理情報」リンクの href に /admin/events/:id/admin-info が含まれる', async () => {
    // リンクの href が正しい管理情報ページ URL になっていることを確認する
    renderAdminEventsPage()
    await waitFor(() => {
      const link = screen.getByRole('link', { name: '管理情報' })
      expect(link.getAttribute('href')).toContain(`/admin/events/${MOCK_EVENT.id}/admin-info`)
    })
  })

  it('「管理情報」リンクに加えて「編集」「収支」「サイト」リンクも表示される', async () => {
    // 各種リンクが揃って表示されることを確認する
    renderAdminEventsPage()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '編集' })).toBeDefined()
      expect(screen.getByRole('link', { name: '管理情報' })).toBeDefined()
      expect(screen.getByRole('link', { name: '収支' })).toBeDefined()
      expect(screen.getByRole('link', { name: 'サイト' })).toBeDefined()
    })
  })

  it('「画像DL」リンクが表示され、href が /admin/events/:id/images になる', async () => {
    // 画像ダウンロードページへのリンクが正しい URL を指していることを確認する
    renderAdminEventsPage()
    const link = await screen.findByRole('link', { name: '画像DL' })
    expect(link.getAttribute('href')).toBe(`/admin/events/${MOCK_EVENT.id}/images`)
  })

  it('「画像DL」リンクは「管理情報」リンクの直後に並ぶ', async () => {
    // 同じ行の中で 管理情報 → 画像DL の順に並んでいることを確認する
    renderAdminEventsPage()
    const info = await screen.findByRole('link', { name: '管理情報' })
    const dl = screen.getByRole('link', { name: '画像DL' })
    expect(info.nextElementSibling).toBe(dl)
  })

  it('今後と過去の両方にイベントがあると、それぞれの行に「画像DL」リンクが出る', async () => {
    // 過去イベントの行にも画像DLリンクがあることを確認する
    const pastEvent: Event = { ...MOCK_EVENT, id: 'event-past-1', name: '過去のテストイベント', start_date: '2000-01-01', is_past: true }
    vi.mocked(api.events.list).mockImplementation((past = false) =>
      Promise.resolve(past ? [pastEvent] : [MOCK_EVENT])
    )
    renderAdminEventsPage()
    await waitFor(() => expect(screen.getAllByRole('link', { name: '画像DL' })).toHaveLength(2))
    const hrefs = screen.getAllByRole('link', { name: '画像DL' }).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([`/admin/events/${MOCK_EVENT.id}/images`, '/admin/events/event-past-1/images'])
  })

  it('ローディング中は「読み込み中...」が表示される', () => {
    // データ取得が完了する前はローディングメッセージが表示されることを確認する
    vi.mocked(api.events.list).mockReturnValue(new Promise(() => {})) // 永遠に保留
    vi.mocked(api.reserve.list).mockReturnValue(new Promise(() => {}))
    renderAdminEventsPage()
    expect(screen.getByText('読み込み中...')).toBeDefined()
  })

  it('今後のイベントのイベント名が表示される', async () => {
    // イベント名がリストに表示されることを確認する
    renderAdminEventsPage()
    await waitFor(() => {
      expect(screen.getByText('管理情報テストイベント')).toBeDefined()
    })
  })
})

describe('AdminEvents ページ — 予約管理（印刷・CSV）ボタン', () => {
  /** ワークショップのあるイベント（予約管理のボタンが出る） */
  const WS_EVENT: Event = { ...MOCK_EVENT, id: 'event-ws-1', name: 'WSありのイベント', has_workshop: true }
  /** ワークショップの無いイベント（ボタンが出ない） */
  const NO_WS_EVENT: Event = { ...MOCK_EVENT, id: 'event-nows-1', name: 'WSなしのイベント', has_workshop: false }

  beforeEach(() => {
    // 今後のイベントに WS あり・なしを 1 件ずつ並べる。過去は空
    vi.mocked(api.events.list).mockReset()
    vi.mocked(api.reserve.list).mockReset()
    vi.mocked(api.events.list).mockImplementation((past = false) =>
      Promise.resolve(past ? [] : [WS_EVENT, NO_WS_EVENT])
    )
    vi.mocked(api.reserve.list).mockResolvedValue([] as Reservation[])
  })

  it('ワークショップのあるイベントの行にだけ「予約管理（印刷・CSV）」が出る（WS なしの行には出ない）', async () => {
    renderAdminEventsPage()
    await waitFor(() => expect(screen.getByText('WSなしのイベント')).toBeInTheDocument())
    expect(screen.getAllByRole('link', { name: '予約管理（印刷・CSV）' })).toHaveLength(1)
  })

  it('「予約管理（印刷・CSV）」のリンク先がそのイベントの予約画面（/admin/events/:id/reservations）になる', async () => {
    renderAdminEventsPage()
    const link = await screen.findByRole('link', { name: '予約管理（印刷・CSV）' })
    expect(link).toHaveAttribute('href', `/admin/events/${WS_EVENT.id}/reservations`)
  })

  it('「予約管理（印刷・CSV）」を押すとイベント別の予約画面へ移動する', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/events']}>
        <Routes>
          <Route path="/admin/events" element={<AdminEvents />} />
          {/* 移動先のダミー */}
          <Route path="/admin/events/:id/reservations" element={<div>イベント別の予約画面</div>} />
        </Routes>
      </MemoryRouter>
    )
    const link = await screen.findByRole('link', { name: '予約管理（印刷・CSV）' })
    link.click()
    expect(await screen.findByText('イベント別の予約画面')).toBeInTheDocument()
  })

  it('WS ありのイベントには一覧の絞り込みの「予約」リンク（/admin/reservations?event_id=）も並んで出る', async () => {
    renderAdminEventsPage()
    const link = await screen.findByRole('link', { name: /^予約( \d+件)?$/ })
    expect(link).toHaveAttribute('href', `/admin/reservations?event_id=${WS_EVENT.id}`)
  })
})
