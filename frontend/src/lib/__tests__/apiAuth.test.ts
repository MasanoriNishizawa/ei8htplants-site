// api.ts の認証つきリクエスト（authRequest・upload・uploadVideo）が付けるトークンの分岐のテスト
//   1. Supabase のセッションあり → そのセッションの JWT を付ける
//   2. セッションなし + ログイン省略モード（SKIP_ADMIN_AUTH）→ ダミートークンを付ける
//   3. セッションなし + 通常 → fetch せずに「401 Unauthorized」を投げる
// supabase と devAuth はテストごとに値を切り替えられるようモックし、fetch はスパイで受けて送られたヘッダーを確かめる
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** テストごとに切り替えるモックの状態 */
const state = vi.hoisted(() => ({
  /** getSession が返すアクセストークン（null ならセッションなし） */
  token: null as string | null,
  /** SKIP_ADMIN_AUTH の値 */
  skip: false,
  /** supabase クライアント自体が無い（環境変数未設定）状態にするか */
  noClient: false,
}))

// supabase: state.token に応じてセッションを返す。state.noClient なら null（未設定）
vi.mock('../supabase', () => ({
  get supabase() {
    if (state.noClient) return null
    return {
      auth: {
        getSession: async () => ({
          data: { session: state.token ? { access_token: state.token } : null },
        }),
      },
    }
  },
}))

// devAuth: SKIP_ADMIN_AUTH を state.skip で切り替える
vi.mock('../devAuth', () => ({
  get SKIP_ADMIN_AUTH() { return state.skip },
  DEV_SKIP_AUTH_TOKEN: 'dev-skip-admin-auth',
}))

import { api } from '../api'

/** fetch のスパイ */
let fetchSpy: ReturnType<typeof vi.spyOn>

/**
 * n 回目の fetch 呼び出しで送られた Authorization ヘッダーを取り出す
 * @param n - 呼び出しの番号（0 始まり）
 * @returns Authorization ヘッダーの値
 */
function authHeaderOf(n = 0): string | undefined {
  const init = fetchSpy.mock.calls[n][1] as RequestInit
  const headers = init.headers as Record<string, string>
  return headers?.Authorization
}

describe('認証つきリクエストのトークン', () => {
  beforeEach(() => {
    // 1. 状態を初期化する
    state.token = null
    state.skip = false
    state.noClient = false
    // 2. fetch を差し替える（どの URL にも 200 と JSON を返す）
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('セッションがあれば、その JWT を Authorization に付けて送る', async () => {
    state.token = 'real-jwt'
    await api.reserve.list()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(authHeaderOf()).toBe('Bearer real-jwt')
  })

  it('イベントの管理APIもセッションJWTをAuthorizationに付けて送る', async () => {
    state.token = 'event-admin-jwt'
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ event_id: 'ev-1', sales: 12000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await api.events.getFinances('ev-1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/events/ev-1/finances')
    expect(authHeaderOf()).toBe('Bearer event-admin-jwt')
  })

  it('イベントの公開APIはAuthorizationを付けずに送る', async () => {
    await api.events.list()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/events?past=false')
    expect(authHeaderOf()).toBeUndefined()
  })

  it('ギャラリーの管理APIはセッションJWTをAuthorizationに付けて送る', async () => {
    state.token = 'gallery-admin-jwt'
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({
        id: 'gallery-1',
        url: 'https://example.com/gallery.jpg',
        alt: '植物の写真',
        brand: 'hue',
        display_order: 3,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await api.gallery.add({ url: 'https://example.com/gallery.jpg', alt: '植物の写真', brand: 'hue' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/gallery')
    expect(authHeaderOf()).toBe('Bearer gallery-admin-jwt')
  })

  it('セッションがあれば、ログイン省略モードでもダミーではなく JWT を付ける', async () => {
    state.token = 'real-jwt'
    state.skip = true
    await api.contact.list()
    expect(authHeaderOf()).toBe('Bearer real-jwt')
  })

  it('セッションが無くログイン省略モードなら、ダミートークンを付けて送る', async () => {
    state.skip = true
    await api.reserve.list()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(authHeaderOf()).toBe('Bearer dev-skip-admin-auth')
  })

  it('supabase が未設定（null）でもログイン省略モードならダミートークンを付けて送る', async () => {
    state.noClient = true
    state.skip = true
    await api.orders.list()
    expect(authHeaderOf()).toBe('Bearer dev-skip-admin-auth')
  })

  it('セッションが無く通常モードなら、fetch せずに 401 Unauthorized を投げる', async () => {
    await expect(api.reserve.list()).rejects.toThrow('401 Unauthorized')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('supabase が未設定（null）で通常モードなら、fetch せずに 401 Unauthorized を投げる', async () => {
    state.noClient = true
    await expect(api.contact.list()).rejects.toThrow('401 Unauthorized')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('画像アップロード（upload）も同じ分岐: ログイン省略モードならダミートークンで送る', async () => {
    state.skip = true
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ url: 'https://example.com/a.jpg' }), { status: 200 })
    )
    const url = await api.upload(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    expect(url).toBe('https://example.com/a.jpg')
    expect(authHeaderOf()).toBe('Bearer dev-skip-admin-auth')
  })

  it('画像アップロード（upload）はセッションなし・通常モードなら 401 を投げて送らない', async () => {
    await expect(api.upload(new File(['x'], 'a.jpg'))).rejects.toThrow('401 Unauthorized')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('動画アップロード（uploadVideo）もセッションがあれば JWT、無ければ省略モードでダミーを付ける', async () => {
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ url: 'https://example.com/v.mp4' }), { status: 200 })
    )
    // 1. セッションあり
    state.token = 'real-jwt'
    await api.uploadVideo(new File(['x'], 'v.mp4', { type: 'video/mp4' }))
    expect(authHeaderOf(0)).toBe('Bearer real-jwt')
    // 2. セッションなし + 省略モード
    state.token = null
    state.skip = true
    await api.uploadVideo(new File(['x'], 'v.mp4', { type: 'video/mp4' }))
    expect(authHeaderOf(1)).toBe('Bearer dev-skip-admin-auth')
    // 3. セッションなし + 通常モード
    state.skip = false
    await expect(api.uploadVideo(new File(['x'], 'v.mp4'))).rejects.toThrow('401 Unauthorized')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
