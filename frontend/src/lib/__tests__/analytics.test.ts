import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GA_MEASUREMENT_ID, hasAdminSession, isAnalyticsEnabled, isExcludedPath, sanitizeSearch, setAnalyticsDisabled, trackPageView } from '../analytics'

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

/**
 * テスト用の保存領域（localStorage の代わり）を作る
 * @param entries - 最初に入れておくキーと値
 * @returns Storage と同じ形の偽物
 */
function makeStorage(entries: Record<string, string>): Storage {
  // 保存している中身（キー → 値）
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
}

describe('hasAdminSession', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('Supabase のログイン情報のキー（sb-<プロジェクト>-auth-token）に値があると true になる', () => {
    expect(hasAdminSession(makeStorage({ 'sb-abcdef-auth-token': '{"access_token":"x"}' }))).toBe(true)
    // 他のキーと混ざっていても見つける
    expect(
      hasAdminSession(makeStorage({ lang: 'ja', 'other-app': '1', 'sb-abcdef-auth-token': 'x' }))
    ).toBe(true)
  })

  it('実際の window.localStorage でもログイン情報を入れると true、消すと false になる', () => {
    expect(hasAdminSession(window.localStorage)).toBe(false)
    window.localStorage.setItem('sb-proj-auth-token', 'x')
    expect(hasAdminSession(window.localStorage)).toBe(true)
    window.localStorage.removeItem('sb-proj-auth-token')
    expect(hasAdminSession(window.localStorage)).toBe(false)
  })

  it('ログイン情報のキーがあっても値が空なら false になる', () => {
    expect(hasAdminSession(makeStorage({ 'sb-abcdef-auth-token': '' }))).toBe(false)
  })

  it('似た名前のキー（-code-verifier 付き・プロジェクト名が空・別アプリ）だけなら false になる', () => {
    expect(hasAdminSession(makeStorage({ 'sb-abcdef-auth-token-code-verifier': 'x' }))).toBe(false)
    expect(hasAdminSession(makeStorage({ 'sb--auth-token': 'x' }))).toBe(false)
    expect(hasAdminSession(makeStorage({ 'auth-token': 'x', 'myapp-auth-token': 'x', 'xsb-a-auth-token': 'x' }))).toBe(false)
  })

  it('キーが1つも無ければ false になる', () => {
    expect(hasAdminSession(makeStorage({}))).toBe(false)
  })

  it('保存領域の length がエラーを投げると false になる（例外を外に出さない）', () => {
    const storage = makeStorage({ 'sb-abcdef-auth-token': 'x' })
    Object.defineProperty(storage, 'length', {
      get() {
        throw new Error('SecurityError')
      },
    })
    expect(() => hasAdminSession(storage)).not.toThrow()
    expect(hasAdminSession(storage)).toBe(false)
  })

  it('保存領域の key がエラーを投げると false になる（例外を外に出さない）', () => {
    const storage = makeStorage({ 'sb-abcdef-auth-token': 'x' })
    storage.key = () => {
      throw new Error('SecurityError')
    }
    expect(() => hasAdminSession(storage)).not.toThrow()
    expect(hasAdminSession(storage)).toBe(false)
  })
})

describe('setAnalyticsDisabled', () => {
  // GA4 公式のオプトアウト用のフラグ名（window['ga-disable-<測定ID>']）
  const flag = `ga-disable-${GA_MEASUREMENT_ID}`
  // window をフラグの読み書きができる形として扱う
  const win = window as unknown as Record<string, unknown>

  afterEach(() => {
    delete win[flag]
  })

  it('true を渡すと window["ga-disable-G-HCVVDNYL94"] が true、false を渡すと false になる', () => {
    // 1. フラグ名が本番の測定 ID と一致している
    expect(flag).toBe('ga-disable-G-HCVVDNYL94')
    // 2. true で送信を止める
    setAnalyticsDisabled(true)
    expect(win[flag]).toBe(true)
    // 3. false で送信を再開する（ログアウト後）
    setAnalyticsDisabled(false)
    expect(win[flag]).toBe(false)
  })
})
