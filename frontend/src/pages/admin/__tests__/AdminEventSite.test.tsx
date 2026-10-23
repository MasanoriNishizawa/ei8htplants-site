/**
 * 管理画面のイベントページ編集（pages/admin/AdminEventSite.tsx）のテスト
 * - ギャラリー画像 URL の欄は入力中に空行を消さないので、末尾に改行を打てる。保存時に前後の空白と空行を除いて配列にする
 * - 読み込みに失敗すると文言と「再読み込み」が出て、編集フォームは出ない。「再読み込み」で読み直す
 * - 保存に失敗すると文言が出て、「保存中...」から「保存」に戻り、また押せる
 * - 保存に成功すると公開ページの取り直しの印（localStorage の event_dirty_<id>）を立てる
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminEventSite from '../AdminEventSite'
import { api, ApiError, type Event, type PageContent } from '../../../lib/api'

// 使う api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return { ...actual, api: { events: { get: vi.fn(), savePageContent: vi.fn() }, upload: vi.fn() } }
})

/** アーカイブ表示で、ギャラリーに 1 枚あるイベント */
const EVENT = {
  id: 'ev-1', slug: 'ev', name: '春のイベント', start_date: '2099-04-01', end_date: null, time: null, location: '会場',
  booth_number: null, address: null, official_url: null, brands: [], has_workshop: false, ws_requires_reservation: false,
  is_past: false, display_order: 1, images: [], daily_times: null,
  page_content: { archive: { enabled: true, title: '', message: '', gallery: ['https://example.com/1.jpg'] } },
} as unknown as Event

/**
 * 編集画面を開く
 * @returns render の結果
 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/events/ev-1/site']}>
      <Routes>
        <Route path="/admin/events/:id/site" element={<AdminEventSite />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** ギャラリー画像 URL の欄 */
const galleryArea = () => screen.getByLabelText('ギャラリー画像 URL（1行1URL）') as HTMLTextAreaElement

beforeEach(() => {
  vi.mocked(api.events.get).mockReset().mockResolvedValue(EVENT)
  vi.mocked(api.events.savePageContent).mockReset()
  localStorage.clear()
})

describe('AdminEventSite のギャラリー画像 URL', () => {
  it('保存済みのギャラリーが 1 行 1 URL で入る', async () => {
    renderPage()
    await screen.findByText('春のイベント')
    expect(galleryArea().value).toBe('https://example.com/1.jpg')
  })

  it('末尾に改行を打っても消えずに残る（次の URL を続けて入力できる）', async () => {
    renderPage()
    await screen.findByText('春のイベント')
    fireEvent.change(galleryArea(), { target: { value: 'https://example.com/1.jpg\n' } })
    expect(galleryArea().value).toBe('https://example.com/1.jpg\n')
    fireEvent.change(galleryArea(), { target: { value: 'https://example.com/1.jpg\n\nhttps://example.com/2.jpg' } })
    expect(galleryArea().value).toBe('https://example.com/1.jpg\n\nhttps://example.com/2.jpg')
  })

  it('保存すると、空行と前後の空白を除いた URL の配列が送られる', async () => {
    vi.mocked(api.events.savePageContent).mockResolvedValue(EVENT)
    renderPage()
    await screen.findByText('春のイベント')
    fireEvent.change(galleryArea(), { target: { value: '  https://example.com/1.jpg  \n\n\nhttps://example.com/2.jpg\n  \n' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.events.savePageContent).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(api.events.savePageContent).mock.calls[0][1] as PageContent
    expect(sent.archive?.gallery).toEqual(['https://example.com/1.jpg', 'https://example.com/2.jpg'])
  })

  it('保存に成功すると「保存しました」になり、公開ページの取り直しの印 event_dirty_<id> が立つ', async () => {
    vi.mocked(api.events.savePageContent).mockResolvedValue(EVENT)
    renderPage()
    await screen.findByText('春のイベント')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('button', { name: '保存しました' })).toBeInTheDocument()
    expect(localStorage.getItem('event_dirty_ev-1')).toBe('1')
  })
})

describe('AdminEventSite の失敗の表示', () => {
  it('読み込みに失敗すると文言と「再読み込み」が出て、編集フォーム（保存ボタン）は出ない', async () => {
    vi.mocked(api.events.get).mockRejectedValue(new ApiError(500, '500 Internal Server Error', null))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('イベントの読み込みに失敗しました（500 Internal Server Error）')
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  })

  it('「再読み込み」を押すと読み直し、成功すれば編集フォームが出る', async () => {
    vi.mocked(api.events.get).mockRejectedValueOnce(new Error('network')).mockResolvedValue(EVENT)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '再読み込み' }))
    expect(await screen.findByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(api.events.get).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('保存に失敗すると文言が出て、「保存中...」から「保存」に戻ってまた押せる。印は立たない', async () => {
    vi.mocked(api.events.savePageContent).mockRejectedValue(new ApiError(500, '500 Internal Server Error', null))
    renderPage()
    await screen.findByText('春のイベント')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました（500 Internal Server Error）')
    const button = screen.getByRole('button', { name: '保存' })
    expect(button).toBeEnabled()
    expect(screen.queryByText('保存中...')).toBeNull()
    expect(localStorage.getItem('event_dirty_ev-1')).toBeNull()
  })
})
