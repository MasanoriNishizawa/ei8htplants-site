/**
 * 公開のイベントページ（pages/EventSite.tsx）のテスト
 * 1. 写真の前へ・次へ（削除した EventCard のテストから、今も意味のある内容を移した）
 *    - 最初は 1 枚目・次へで 2 枚目・末尾から次へで先頭・先頭から前へで末尾・1 枚だけなら矢印は出ない
 * 2. 管理画面で保存した直後の印（localStorage の event_dirty_<id かスラッグ>）
 *    - URL の値・取得したイベントの id・スラッグのどの印でも、キャッシュを使わずに取り直し（cache: 'no-store'）、印を消す
 *    - 印が無ければ 1 回だけ普通に取る
 * 3. 会場の住所は page_content.venue.address を優先し、無ければ event.address（表示と地図の両方）
 * api.events.get はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import EventSite from '../EventSite'
import { api, type Event } from '../../lib/api'
import { LangProvider } from '../../lib/lang'

// api.events.get だけをモックする
vi.mock('../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/api')>()
  return { ...actual, api: { events: { get: vi.fn() } } }
})

/** 写真 3 枚 */
const THREE_IMAGES = [
  { id: 'i1', url: 'https://example.com/a.jpg', display_order: 1 },
  { id: 'i2', url: 'https://example.com/b.jpg', display_order: 2 },
  { id: 'i3', url: 'https://example.com/c.jpg', display_order: 3 },
]

/**
 * テスト用のイベントを作る
 * @param over - 上書きする項目
 * @returns イベント
 */
function makeEvent(over: Partial<Event> = {}): Event {
  return {
    id: 'ev-uuid', slug: 'green-market', name: 'Green Market', start_date: '2099-06-01', end_date: null,
    time: '10:00〜17:00', location: '代々木公園', booth_number: null, address: null, official_url: null,
    brands: [], has_workshop: false, ws_requires_reservation: false, is_past: false, display_order: 1,
    images: [], page_content: null, daily_times: null, ...over,
  } as Event
}

/**
 * /events/:id を開く
 * @param id - URL の id かスラッグ
 * @returns render の結果
 */
function renderAt(id: string) {
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={[`/events/${id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventSite />} />
        </Routes>
      </MemoryRouter>
    </LangProvider>,
  )
}

beforeEach(() => {
  vi.mocked(api.events.get).mockReset()
  localStorage.clear()
  localStorage.setItem('site-lang', 'ja')
})

describe('EventSite の写真の前へ・次へ', () => {
  /**
   *  いま表示している写真の URL
   * @returns 戻り値なし。
   */
  const currentSrc = () => screen.getByRole('img', { name: 'Green Market' }).getAttribute('src')

  beforeEach(() => {
    vi.mocked(api.events.get).mockResolvedValue(makeEvent({ images: THREE_IMAGES }))
  })

  it('最初は 1 枚目の写真が出る', async () => {
    renderAt('ev-uuid')
    await screen.findByRole('img', { name: 'Green Market' })
    expect(currentSrc()).toBe(THREE_IMAGES[0].url)
  })

  it('「次の写真」で 2 枚目に進む', async () => {
    renderAt('ev-uuid')
    fireEvent.click(await screen.findByRole('button', { name: '次の写真' }))
    expect(currentSrc()).toBe(THREE_IMAGES[1].url)
  })

  it('末尾から「次の写真」で先頭に戻る', async () => {
    renderAt('ev-uuid')
    const next = await screen.findByRole('button', { name: '次の写真' })
    fireEvent.click(next)
    fireEvent.click(next)
    fireEvent.click(next)
    expect(currentSrc()).toBe(THREE_IMAGES[0].url)
  })

  it('先頭から「前の写真」で末尾に回る', async () => {
    renderAt('ev-uuid')
    fireEvent.click(await screen.findByRole('button', { name: '前の写真' }))
    expect(currentSrc()).toBe(THREE_IMAGES[2].url)
  })

  it('写真が 1 枚のときは前へ・次へのボタンが出ない', async () => {
    vi.mocked(api.events.get).mockResolvedValue(makeEvent({ images: [THREE_IMAGES[0]] }))
    renderAt('ev-uuid')
    await screen.findByRole('img', { name: 'Green Market' })
    expect(screen.queryByRole('button', { name: '次の写真' })).toBeNull()
    expect(screen.queryByRole('button', { name: '前の写真' })).toBeNull()
  })

  it('blob: の写真（保存前のプレビュー）は出さない', async () => {
    vi.mocked(api.events.get).mockResolvedValue(makeEvent({ images: [{ id: 'b', url: 'blob:x', display_order: 0 }, THREE_IMAGES[0]] }))
    renderAt('ev-uuid')
    await screen.findByRole('img', { name: 'Green Market' })
    expect(currentSrc()).toBe(THREE_IMAGES[0].url)
    expect(screen.queryByRole('button', { name: '次の写真' })).toBeNull()
  })
})

describe('EventSite の保存直後の取り直し（event_dirty_ の印）', () => {
  /**
   *  api.events.get の 2 番目の引数（fetch の指定）の一覧
   * @returns 戻り値なし。
   */
  const optsOfCalls = () => vi.mocked(api.events.get).mock.calls.map((c) => c[1])

  beforeEach(() => {
    vi.mocked(api.events.get).mockResolvedValue(makeEvent())
  })

  it('印が無ければ 1 回だけ普通に取る（no-store を付けない）', async () => {
    renderAt('green-market')
    await screen.findByRole('heading', { level: 1, name: 'Green Market' })
    expect(api.events.get).toHaveBeenCalledTimes(1)
    expect(optsOfCalls()).toEqual([undefined])
  })

  it('URL の値（スラッグ）の印があると、最初から no-store で取り、印を消す', async () => {
    localStorage.setItem('event_dirty_green-market', '1')
    renderAt('green-market')
    await screen.findByRole('heading', { level: 1, name: 'Green Market' })
    expect(api.events.get).toHaveBeenCalledTimes(1)
    expect(api.events.get).toHaveBeenCalledWith('green-market', { cache: 'no-store' })
    expect(localStorage.getItem('event_dirty_green-market')).toBeNull()
  })

  it('URL の値の印で取り直したとき、同じイベントの id の印も一緒に消す', async () => {
    localStorage.setItem('event_dirty_green-market', '1')
    localStorage.setItem('event_dirty_ev-uuid', '1')
    renderAt('green-market')
    await screen.findByRole('heading', { level: 1, name: 'Green Market' })
    expect(api.events.get).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('event_dirty_ev-uuid')).toBeNull()
  })

  it('スラッグの URL で開き、取得したイベントの id の印があると、no-store で取り直して印を消す', async () => {
    // 管理画面は id で印を立てる
    localStorage.setItem('event_dirty_ev-uuid', '1')
    renderAt('green-market')
    await screen.findByRole('heading', { level: 1, name: 'Green Market' })
    await waitFor(() => expect(api.events.get).toHaveBeenCalledTimes(2))
    expect(optsOfCalls()).toEqual([undefined, { cache: 'no-store' }])
    expect(localStorage.getItem('event_dirty_ev-uuid')).toBeNull()
  })

  it('id の URL で開き、取得したイベントのスラッグの印があっても、no-store で取り直して印を消す', async () => {
    localStorage.setItem('event_dirty_green-market', '1')
    renderAt('ev-uuid')
    await screen.findByRole('heading', { level: 1, name: 'Green Market' })
    await waitFor(() => expect(api.events.get).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.events.get).mock.calls[1]).toEqual(['ev-uuid', { cache: 'no-store' }])
    expect(localStorage.getItem('event_dirty_green-market')).toBeNull()
  })

  it('印は 1 回使うと消えるので、もう一度開いたときは普通に取る', async () => {
    localStorage.setItem('event_dirty_ev-uuid', '1')
    const first = renderAt('ev-uuid')
    await screen.findByRole('heading', { level: 1, name: 'Green Market' })
    first.unmount()
    vi.mocked(api.events.get).mockClear()
    renderAt('ev-uuid')
    await screen.findByRole('heading', { level: 1, name: 'Green Market' })
    expect(optsOfCalls()).toEqual([undefined])
  })
})

describe('EventSite の会場の住所', () => {
  /**
   *  地図（iframe）の src
   * @returns 戻り値なし。
   */
  const mapSrc = () => screen.getByTitle('会場の地図').getAttribute('src') ?? ''

  it('page_content.venue.address があればそれを表示し、地図もその住所で出す（event.address より優先）', async () => {
    vi.mocked(api.events.get).mockResolvedValue(makeEvent({
      address: '東京都渋谷区A',
      page_content: { venue: { address: '東京都目黒区B', access: '駅から徒歩5分' } },
    } as Partial<Event>))
    renderAt('ev-uuid')
    expect(await screen.findByText('東京都目黒区B')).toBeInTheDocument()
    expect(screen.queryByText('東京都渋谷区A')).toBeNull()
    expect(screen.getByText('駅から徒歩5分')).toBeInTheDocument()
    expect(mapSrc()).toContain(`q=${encodeURIComponent('東京都目黒区B')}`)
  })

  it('page_content.venue.address が無ければ event.address を表示し、地図もその住所で出す', async () => {
    vi.mocked(api.events.get).mockResolvedValue(makeEvent({ address: '東京都渋谷区A', page_content: { venue: {} } } as Partial<Event>))
    renderAt('ev-uuid')
    expect(await screen.findByText('東京都渋谷区A')).toBeInTheDocument()
    expect(mapSrc()).toContain(`q=${encodeURIComponent('東京都渋谷区A')}`)
  })

  it('page_content.venue.address が空文字のときも event.address を使う', async () => {
    vi.mocked(api.events.get).mockResolvedValue(makeEvent({ address: '東京都渋谷区A', page_content: { venue: { address: '' } } } as Partial<Event>))
    renderAt('ev-uuid')
    expect(await screen.findByText('東京都渋谷区A')).toBeInTheDocument()
  })

  it('どちらの住所も無ければ会場（Venue）と地図は出ない', async () => {
    vi.mocked(api.events.get).mockResolvedValue(makeEvent({ address: null, page_content: null }))
    renderAt('ev-uuid')
    await screen.findByRole('heading', { level: 1, name: 'Green Market' })
    expect(screen.queryByText('Venue')).toBeNull()
    expect(screen.queryByTitle('会場の地図')).toBeNull()
  })
})

describe('EventSite の写真が読み込めないとき', () => {
  /**
   *  読み込みに失敗させる写真の img
   * @returns 戻り値なし。
   */
  const photo = () => screen.getByRole('img', { name: 'Green Market' })

  beforeEach(() => {
    vi.mocked(api.events.get).mockResolvedValue(makeEvent({ images: THREE_IMAGES }))
  })

  it('読み込めないと 3:4 の枠に「写真を読み込めませんでした」を出し、拡大表示のボタンは出ない', async () => {
    renderAt('ev-uuid')
    fireEvent.error(await screen.findByRole('img', { name: 'Green Market' }))
    const message = await screen.findByText('写真を読み込めませんでした')
    expect(message).toHaveStyle({ aspectRatio: '3/4' })
    // 案内の枠は role="img"・名前はイベント名（読み上げでは写真の代わりになる）。<img> 要素は出さない
    expect(screen.getByRole('img', { name: 'Green Market' })).toBe(message)
    expect(document.querySelector('img[alt="Green Market"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Green Market の写真を拡大表示' })).toBeNull()
  })

  it('読み込めない写真を押しても拡大表示は開かない', async () => {
    renderAt('ev-uuid')
    fireEvent.error(await screen.findByRole('img', { name: 'Green Market' }))
    fireEvent.click(await screen.findByText('写真を読み込めませんでした'))
    expect(screen.queryByRole('button', { name: '閉じる' })).toBeNull()
  })

  it('次の写真が読み込めれば普通に表示し、拡大表示のボタンも出る', async () => {
    renderAt('ev-uuid')
    fireEvent.error(await screen.findByRole('img', { name: 'Green Market' }))
    fireEvent.click(screen.getByRole('button', { name: '次の写真' }))
    expect(photo()).toHaveAttribute('src', THREE_IMAGES[1].url)
    expect(screen.getByRole('button', { name: 'Green Market の写真を拡大表示' })).toBeInTheDocument()
  })

  it('読み込めなかった写真に戻ると、また案内を出す（失敗は覚えておく）', async () => {
    renderAt('ev-uuid')
    fireEvent.error(await screen.findByRole('img', { name: 'Green Market' }))
    fireEvent.click(screen.getByRole('button', { name: '次の写真' }))
    fireEvent.click(screen.getByRole('button', { name: '前の写真' }))
    expect(screen.getByText('写真を読み込めませんでした')).toBeInTheDocument()
  })

  it('英語表示では「Photo could not be loaded」', async () => {
    localStorage.setItem('site-lang', 'en')
    renderAt('ev-uuid')
    fireEvent.error(await screen.findByRole('img', { name: 'Green Market' }))
    expect(await screen.findByText('Photo could not be loaded')).toBeInTheDocument()
  })
})
