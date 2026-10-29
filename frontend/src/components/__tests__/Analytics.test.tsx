import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import Analytics from '../Analytics'
import * as analytics from '../../lib/analytics'

// 外部（Google）には接続しないよう、タグの読み込みと送信を偽物に差し替える
// 管理者のログイン判定（hasAdminSession）も偽物にし、テストごとに結果を決める
vi.mock('../../lib/analytics', () => ({
  hasAdminSession: vi.fn(),
  isAnalyticsEnabled: vi.fn(),
  loadGtag: vi.fn(),
  // GA4 の送信を止める／再開する（window['ga-disable-<測定ID>']）も偽物にして呼ばれ方だけ確かめる
  setAnalyticsDisabled: vi.fn(),
  trackPageView: vi.fn(),
}))

/**
 * Analytics を置いた2ページだけの小さなアプリを描画する
 * @param start - 最初に開くパス
 * @returns レンダリング結果
 */
function renderApp(start = '/') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Analytics />
      <Routes>
        <Route path="/" element={<Link to="/shop?tab=new">ショップへ</Link>} />
        <Route
          path="/shop"
          element={
            <>
              <p>ショップ</p>
              <Link to="/">トップへ</Link>
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('Analytics', () => {
  beforeEach(() => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReset()
    vi.mocked(analytics.loadGtag).mockReset()
    vi.mocked(analytics.trackPageView).mockReset()
    // 特に指定しないテストは「管理画面にログインしていないブラウザ」として扱う
    vi.mocked(analytics.hasAdminSession).mockReset()
    vi.mocked(analytics.hasAdminSession).mockReturnValue(false)
    vi.mocked(analytics.setAnalyticsDisabled).mockReset()
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

  it('管理画面のログイン情報があると、本番サイトでもタグを読み込まず何も送らない', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(true)
    vi.mocked(analytics.hasAdminSession).mockReturnValue(true)
    renderApp('/')
    // ブラウザの localStorage を調べている
    expect(analytics.hasAdminSession).toHaveBeenCalledWith(window.localStorage)
    expect(analytics.loadGtag).not.toHaveBeenCalled()
    expect(analytics.trackPageView).not.toHaveBeenCalled()

    // 画面遷移しても送らない
    fireEvent.click(screen.getByText('ショップへ'))
    expect(screen.getByText('ショップ')).toBeInTheDocument()
    expect(analytics.loadGtag).not.toHaveBeenCalled()
    expect(analytics.trackPageView).not.toHaveBeenCalled()
  })

  it('管理画面のログイン情報が無ければ、従来どおりタグを読み込んでページビューを送る', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(true)
    vi.mocked(analytics.hasAdminSession).mockReturnValue(false)
    renderApp('/')
    expect(analytics.loadGtag).toHaveBeenCalled()
    expect(analytics.trackPageView).toHaveBeenCalledTimes(1)
    expect(analytics.trackPageView).toHaveBeenLastCalledWith('/', '', expect.any(String))
  })

  it('画面遷移の途中でログインするとそれ以降は送らず、ログアウトするとまた送る', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(true)
    // 1. 最初はログインしていない → 送る
    renderApp('/')
    expect(analytics.trackPageView).toHaveBeenCalledTimes(1)

    // 2. 途中でログイン情報が保存された → 次の画面からは送らない
    vi.mocked(analytics.hasAdminSession).mockReturnValue(true)
    fireEvent.click(screen.getByText('ショップへ'))
    expect(screen.getByText('ショップ')).toBeInTheDocument()
    expect(analytics.trackPageView).toHaveBeenCalledTimes(1)

    // 3. ログアウトでログイン情報が消えた → 次の画面からまた送る
    vi.mocked(analytics.hasAdminSession).mockReturnValue(false)
    fireEvent.click(screen.getByText('トップへ'))
    expect(analytics.trackPageView).toHaveBeenCalledTimes(2)
    expect(analytics.trackPageView).toHaveBeenLastCalledWith('/', '', expect.any(String))
  })

  it('本番サイト以外では、ログイン判定もせず何も送らない', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(false)
    vi.mocked(analytics.hasAdminSession).mockReturnValue(false)
    renderApp('/')
    expect(analytics.hasAdminSession).not.toHaveBeenCalled()
    expect(analytics.loadGtag).not.toHaveBeenCalled()
    expect(analytics.trackPageView).not.toHaveBeenCalled()
  })

  it('window.localStorage を読むだけで例外が出る環境でも落ちず、一般の訪問者として送信する', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(true)
    // 1. window.localStorage を、読むと例外を投げる getter に差し替える（Cookie を全てブロックした環境を再現）
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      /**
       * localStorage が読み取れないブラウザー環境を再現する getter。
       * @returns 値を返さず SecurityError を投げる。
       */
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
    })
    try {
      // 2. 描画しても例外にならず、画面が表示される
      expect(() => renderApp('/')).not.toThrow()
      expect(screen.getByText('ショップへ')).toBeInTheDocument()
      // 3. 管理者ではないものとして、送信を止めずにタグを読み込み、ページビューを送る
      expect(analytics.hasAdminSession).not.toHaveBeenCalled()
      expect(analytics.setAnalyticsDisabled).toHaveBeenLastCalledWith(false)
      expect(analytics.loadGtag).toHaveBeenCalled()
      expect(analytics.trackPageView).toHaveBeenCalledTimes(1)
      expect(analytics.trackPageView).toHaveBeenLastCalledWith('/', '', expect.any(String))
      // 4. 画面遷移しても送り続ける
      fireEvent.click(screen.getByText('ショップへ'))
      expect(analytics.trackPageView).toHaveBeenCalledTimes(2)
      expect(analytics.trackPageView).toHaveBeenLastCalledWith('/shop', '?tab=new', expect.any(String))
    } finally {
      // 5. 他のテストに影響しないよう元に戻す
      if (original) Object.defineProperty(window, 'localStorage', original)
      else delete (window as unknown as Record<string, unknown>).localStorage
    }
  })

  it('ログイン中は setAnalyticsDisabled(true)、ログイン情報が無ければ setAnalyticsDisabled(false) を呼ぶ', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(true)
    // 1. ログイン中 → 送信を止める
    vi.mocked(analytics.hasAdminSession).mockReturnValue(true)
    const { unmount } = renderApp('/')
    expect(analytics.setAnalyticsDisabled).toHaveBeenCalledTimes(1)
    expect(analytics.setAnalyticsDisabled).toHaveBeenLastCalledWith(true)
    unmount()

    // 2. ログインしていない → 送信を止めない
    vi.mocked(analytics.setAnalyticsDisabled).mockReset()
    vi.mocked(analytics.hasAdminSession).mockReturnValue(false)
    renderApp('/')
    expect(analytics.setAnalyticsDisabled).toHaveBeenCalledTimes(1)
    expect(analytics.setAnalyticsDisabled).toHaveBeenLastCalledWith(false)
  })

  it('画面遷移の途中でログインすると setAnalyticsDisabled(true)、ログアウトすると setAnalyticsDisabled(false) を呼ぶ', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(true)
    // 1. 最初はログインしていない → false
    renderApp('/')
    expect(analytics.setAnalyticsDisabled).toHaveBeenLastCalledWith(false)

    // 2. 途中でログイン → 次の画面で true（送信を止める）
    vi.mocked(analytics.hasAdminSession).mockReturnValue(true)
    fireEvent.click(screen.getByText('ショップへ'))
    expect(analytics.setAnalyticsDisabled).toHaveBeenCalledTimes(2)
    expect(analytics.setAnalyticsDisabled).toHaveBeenLastCalledWith(true)

    // 3. ログアウト → 次の画面で false（送信を再開）
    vi.mocked(analytics.hasAdminSession).mockReturnValue(false)
    fireEvent.click(screen.getByText('トップへ'))
    expect(analytics.setAnalyticsDisabled).toHaveBeenCalledTimes(3)
    expect(analytics.setAnalyticsDisabled).toHaveBeenLastCalledWith(false)
  })

  it('本番サイト以外では setAnalyticsDisabled を呼ばない', () => {
    vi.mocked(analytics.isAnalyticsEnabled).mockReturnValue(false)
    renderApp('/')
    fireEvent.click(screen.getByText('ショップへ'))
    expect(analytics.setAnalyticsDisabled).not.toHaveBeenCalled()
  })
})
