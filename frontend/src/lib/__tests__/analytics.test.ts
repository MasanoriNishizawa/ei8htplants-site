import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GA_MEASUREMENT_ID, isAnalyticsEnabled, isExcludedPath, sanitizeSearch, trackPageView } from '../analytics'

describe('isAnalyticsEnabled', () => {
  it('本番ビルドかつ本番ドメインのときだけ有効になる', () => {
    expect(isAnalyticsEnabled('ei8htplants.com', true)).toBe(true)
    expect(isAnalyticsEnabled('www.ei8htplants.com', true)).toBe(true)
  })

  it('開発ビルドや本番以外のドメインでは無効（外部送信しない）', () => {
    expect(isAnalyticsEnabled('ei8htplants.com', false)).toBe(false)
    expect(isAnalyticsEnabled('localhost', true)).toBe(false)
    expect(isAnalyticsEnabled('ei8htplants-site.onrender.com', true)).toBe(false)
  })
})

describe('isExcludedPath', () => {
  it('管理画面は計測しない', () => {
    expect(isExcludedPath('/admin')).toBe(true)
    expect(isExcludedPath('/admin/events/1/finances')).toBe(true)
  })

  it('公開ページは計測する（/admin で始まるだけの別ページも誤って除外しない）', () => {
    expect(isExcludedPath('/')).toBe(false)
    expect(isExcludedPath('/shop/abc')).toBe(false)
    expect(isExcludedPath('/administrator')).toBe(false)
  })
})

describe('sanitizeSearch', () => {
  it('送ってよいクエリ（page・event_id・utm_〜）だけを残す', () => {
    expect(sanitizeSearch('?page=past')).toBe('?page=past')
    expect(sanitizeSearch('?event_id=1&id=secret&utm_source=instagram')).toBe('?event_id=1&utm_source=instagram')
  })

  it('それ以外のクエリはすべて外し、何も残らなければ空文字にする', () => {
    expect(sanitizeSearch('?id=secret')).toBe('')
    expect(sanitizeSearch('?token=a&email=b%40example.com')).toBe('')
    expect(sanitizeSearch('')).toBe('')
  })
})

describe('trackPageView', () => {
  // 送信内容を記録する偽の gtag
  const gtag = vi.fn()

  beforeEach(() => {
    gtag.mockClear()
    window.gtag = gtag
  })

  afterEach(() => {
    delete window.gtag
  })

  it('パス・クエリ・タイトルを付けて page_view を送り、自動のイベントにも同じ URL を使わせる', () => {
    trackPageView('/reserve', '?event_id=1', '予約 | ei8ht plants')
    expect(gtag).toHaveBeenNthCalledWith(1, 'set', { page_location: `${window.location.origin}/reserve?event_id=1` })
    expect(gtag).toHaveBeenNthCalledWith(2, 'event', 'page_view', {
      page_location: `${window.location.origin}/reserve?event_id=1`,
      page_path: '/reserve?event_id=1',
      page_title: '予約 | ei8ht plants',
    })
    expect(gtag).toHaveBeenCalledTimes(2)
  })

  it('予約キャンセルのトークン（/cancel?id=…）は送らない', () => {
    trackPageView('/cancel', '?id=secret-token-123', '予約キャンセル | ei8ht plants')
    expect(JSON.stringify(gtag.mock.calls)).not.toContain('secret-token-123')
    expect(gtag).toHaveBeenLastCalledWith('event', 'page_view', expect.objectContaining({ page_path: '/cancel' }))
  })

  it('管理画面では送らない', () => {
    trackPageView('/admin/orders', '', '管理')
    expect(gtag).not.toHaveBeenCalled()
  })

  it('タグを読み込んでいないときは何もしない（エラーにならない）', () => {
    delete window.gtag
    expect(() => trackPageView('/', '', 'ei8ht plants')).not.toThrow()
  })

  it('測定 ID が GA4 の形式', () => {
    expect(GA_MEASUREMENT_ID).toMatch(/^G-[A-Z0-9]+$/)
  })
})

describe('loadGtag', () => {
  beforeEach(() => {
    // 前のテストで足したタグと gtag を消し、モジュールを読み込み直す（読み込み済みの印をリセットする）
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((el) => el.remove())
    delete window.gtag
    delete window.dataLayer
    vi.resetModules()
  })

  it('タグを1回だけ読み込み、自動のページビューを止めて設定する', async () => {
    const { loadGtag } = await import('../analytics')
    loadGtag()
    loadGtag()
    const scripts = document.head.querySelectorAll('script[src*="googletagmanager"]')
    expect(scripts).toHaveLength(1)
    expect((scripts[0] as HTMLScriptElement).src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`)
    expect((scripts[0] as HTMLScriptElement).async).toBe(true)
    // dataLayer には js と config の2つだけが積まれる（2回目の呼び出しでは増えない）
    const calls = (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>))
    expect(calls).toHaveLength(2)
    expect(calls[1][0]).toBe('config')
    expect(calls[1][1]).toBe(GA_MEASUREMENT_ID)
    expect(calls[1][2]).toMatchObject({ send_page_view: false })
  })

  it('最初の設定の URL からも秘密のクエリを外す', async () => {
    window.history.replaceState({}, '', '/cancel?id=secret-token-123')
    const { loadGtag } = await import('../analytics')
    loadGtag()
    expect(JSON.stringify(window.dataLayer)).not.toContain('secret-token-123')
    window.history.replaceState({}, '', '/')
  })
})
