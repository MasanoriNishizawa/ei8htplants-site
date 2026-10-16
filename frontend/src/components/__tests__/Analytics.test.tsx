import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import Analytics from '../Analytics'
import * as analytics from '../../lib/analytics'

// 外部（Google）には接続しないよう、タグの読み込みと送信を偽物に差し替える
vi.mock('../../lib/analytics', () => ({
  isAnalyticsEnabled: vi.fn(),
  loadGtag: vi.fn(),
  trackPageView: vi.fn(),
}))

/**
 * Analytics を置いた2ページだけの小さなアプリを描画する
 * @param start - 最初に開くパス
 */
function renderApp(start = '/') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Analytics />
      <Routes>
        <Route path="/" element={<Link to="/shop?tab=new">ショップへ</Link>} />
        <Route path="/shop" element={<p>ショップ</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Analytics', () => {
  beforeEach(() => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReset()
    vi.mocked(analytics.loadGtag).mockReset()
    vi.mocked(analytics.trackPageView).mockReset()
  })

  it('本番サイトでは、最初の画面と画面遷移のたびにページビューを送る', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(true)
    renderApp('/')
    expect(analytics.loadGtag).toHaveBeenCalled()
    expect(analytics.trackPageView).toHaveBeenCalledTimes(1)
    expect(analytics.trackPageView).toHaveBeenLastCalledWith('/', '', expect.any(String))

    fireEvent.click(screen.getByText('ショップへ'))
    // 画面遷移1回につき送信は1回（重複して送らない）
    expect(analytics.trackPageView).toHaveBeenCalledTimes(2)
    expect(analytics.trackPageView).toHaveBeenLastCalledWith('/shop', '?tab=new', expect.any(String))
  })

  it('本番サイト以外ではタグを読み込まず、何も送らない', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(false)
    renderApp('/')
    expect(analytics.loadGtag).not.toHaveBeenCalled()
    expect(analytics.trackPageView).not.toHaveBeenCalled()
  })

  it('画面には何も表示しない', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(false)
    const { container } = render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    )
    expect(container).toBeEmptyDOMElement()
  })
})
