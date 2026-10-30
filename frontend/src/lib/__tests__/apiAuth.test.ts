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

  it('取扱店の管理APIはセッションJWTをAuthorizationに付けて送る', async () => {
    state.token = 'stockist-admin-jwt'
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({
        id: 'stockist-1',
        name: '植物店',
        area: '東京',
        address: '東京都',
        url: 'https://example.com',
        brands: ['hue'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await api.stockists.add({ name: '植物店', area: '東京', address: '東京都', url: 'https://example.com', brands: ['hue'] })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/stockists')
    expect(authHeaderOf()).toBe('Bearer stockist-admin-jwt')
  })

  it('サイト画像の保存APIはセッションJWTをAuthorizationに付けて送る', async () => {
    state.token = 'site-asset-admin-jwt'
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ key: 'hue/hero image', url: 'https://example.com/hero.jpg' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await api.siteAssets.save('hue/hero image', 'https://example.com/hero.jpg')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/site-assets/hue%2Fhero%20image')
    expect(authHeaderOf()).toBe('Bearer site-asset-admin-jwt')
  })

  it('FE-AG-15: チャット履歴の管理APIはセッションJWTをAuthorizationに付けて送る', async () => {
    state.token = 'chat-log-admin-jwt'

    await api.chatLogs.list()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/chat-logs')
    expect(authHeaderOf()).toBe('Bearer chat-log-admin-jwt')
  })

  it('FE-AG-16: チャット履歴の管理APIは通常モードでセッションが無いと送信せず401を投げる', async () => {
    await expect(api.chatLogs.list()).rejects.toThrow('401 Unauthorized')

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('FE-AG-17: コラボレーションの公開一覧はAuthorizationを付けずに送る', async () => {
    await api.collaborations.list()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/collaborations')
    expect(authHeaderOf()).toBeUndefined()
  })

  it('FE-AG-18: コラボレーションの管理追加APIはセッションJWTをAuthorizationに付ける', async () => {
    state.token = 'collaboration-admin-jwt'
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ id: 'collab-1', title: '植物と器の展示' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await api.collaborations.add({ title: '植物と器の展示' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/collaborations')
    expect(authHeaderOf()).toBe('Bearer collaboration-admin-jwt')
  })

  it('FE-AG-19: コラボレーションの管理削除APIはセッションJWTをAuthorizationに付ける', async () => {
    // 1. 管理者セッションに設定するJWTを用意し、削除成功のJSONを返すようにする。
    state.token = 'collaboration-delete-admin-jwt'
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // 2. コラボレーションの削除APIを実行する。
    await api.collaborations.delete('collab-1')

    // 3. 対象URLへ1回だけ送信し、セッションJWTを付けたことを確かめる。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/collaborations/collab-1')
    expect(authHeaderOf()).toBe('Bearer collaboration-delete-admin-jwt')
  })

  it('FE-AG-20: メディア掲載の公開一覧はAuthorizationを付けずに送る', async () => {
    // 1. 公開一覧の応答を返すモックのまま、メディア掲載一覧を取得する。
    const result = await api.mediaAppearances.list()

    // 2. 公開一覧URLへ1回だけ送信し、認証ヘッダーを付けないことを確かめる。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/media-appearances')
    expect(authHeaderOf()).toBeUndefined()
    expect(result).toEqual([])
  })

  it('FE-AG-21: メディア掲載の管理追加APIはセッションJWTをAuthorizationに付ける', async () => {
    // 1. 管理者セッションのJWTと追加後に返るレコードを用意する。
    state.token = 'media-appearance-admin-jwt'
    const response = {
      id: 'media-1',
      title: '植物のある暮らし',
      youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
      description: null,
      published_at: null,
      display_order: 0,
      created_at: '2026-10-30T00:00:00Z',
    }
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // 2. 管理画面向けの追加APIを実行する。
    const result = await api.mediaAppearances.add({
      title: response.title,
      youtube_url: response.youtube_url,
    })

    // 3. 追加URLへの送信にセッションJWTが使われ、応答が返ることを確かめる。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/media-appearances')
    expect(authHeaderOf()).toBe('Bearer media-appearance-admin-jwt')
    expect(result).toEqual(response)
  })

  it('FE-AG-22: メディア掲載の管理削除APIはセッションJWTをAuthorizationに付ける', async () => {
    // 1. 削除用の管理者JWTと、削除成功の応答を用意する。
    state.token = 'media-appearance-delete-admin-jwt'
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // 2. 指定したメディア掲載の削除APIを実行する。
    const result = await api.mediaAppearances.delete('media-2')

    // 3. 対象URLへのDELETEと、セッションJWT付きの送信を確かめる。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/media-appearances/media-2')
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
    expect(authHeaderOf()).toBe('Bearer media-appearance-delete-admin-jwt')
    expect(result).toEqual({ ok: true })
  })

  it('FE-AG-23: 設計書本文の取得APIはセッションJWTをAuthorizationに付ける', async () => {
    // 1. 設計書本文の取得に使う管理者JWTとMarkdown応答を用意する。
    state.token = 'docs-content-admin-jwt'
    const markdown = '# API仕様\n\n設計書本文'
    fetchSpy.mockImplementation(async () => ({
      ok: true,
      text: async () => markdown,
    } as Response))

    // 2. 日本語の相対パスを指定して、認証付き本文APIを呼び出す。
    const path = '02_DD/仕様書.md'
    const result = await api.docs.content(path)

    // 3. エンコード済みURLへ1回だけ送信し、セッションJWTと本文を受け取ることを確かめる。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe(`/api/docs/content?path=${encodeURIComponent(path)}`)
    expect(authHeaderOf()).toBe('Bearer docs-content-admin-jwt')
    expect(result).toBe(markdown)
  })

  it('FE-AG-24: 設計書ツリーの取得APIはセッションJWTをAuthorizationに付ける', async () => {
    // 1. 管理者セッションのJWTと、JSON形式の設計書ツリー応答を用意する。
    state.token = 'docs-tree-admin-jwt'
    /** ツリー取得後に画面へ渡されるフォルダーとファイルの一覧 */
    const tree = [{
      type: 'dir',
      name: '02_DD',
      path: '02_DD',
      children: [{ type: 'file', name: '仕様.md', path: '02_DD/仕様.md' }],
    }]
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify(tree), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // 2. 認証が必要な設計書ツリーAPIを呼び出す。
    const result = await api.docs.tree()

    // 3. ツリーURLへ1回だけ送信し、JWT付きJSON応答を返すことを確かめる。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/docs/tree')
    expect(authHeaderOf()).toBe('Bearer docs-tree-admin-jwt')
    expect(result).toEqual(tree)
  })

  it('FE-AG-25: 鉢作家の公開一覧はAuthorizationを付けずに送る', async () => {
    // 1. 空の一覧応答を使って公開APIから鉢作家一覧を取得する。
    const result = await api.potArtists.list()

    // 2. 公開一覧URLに1回だけ送信し、Authorizationが無いことを確かめる。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/pot-artists')
    expect(authHeaderOf()).toBeUndefined()
    expect(result).toEqual([])
  })

  it('FE-AG-26: 鉢作家の追加APIはセッションJWTをAuthorizationに付ける', async () => {
    // 1. 管理者JWTと追加成功時のJSON応答を用意する。
    state.token = 'pot-artist-add-admin-jwt'
    const artist = { id: 'artist-1', name: '山田陶房', created_at: '2026-10-30T00:00:00Z' }
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify(artist), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // 2. 認証付きで鉢作家を追加する。
    const result = await api.potArtists.add(artist.name)

    // 3. POST先とBearer JWT、サーバーが返した登録結果を確認する。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/pot-artists')
    expect(authHeaderOf()).toBe('Bearer pot-artist-add-admin-jwt')
    expect(result).toEqual(artist)
  })

  it('FE-AG-27: 鉢作家の削除APIはセッションJWTをAuthorizationに付ける', async () => {
    // 1. 管理者JWTと削除成功のJSON応答を用意する。
    state.token = 'pot-artist-delete-admin-jwt'
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // 2. 指定したIDの鉢作家を認証付きで削除する。
    const id = 'artist-2'
    const result = await api.potArtists.delete(id)

    // 3. 削除URLとHTTPメソッド、Bearer JWTおよび成功応答を確認する。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe(`/api/pot-artists/${id}`)
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
    expect(authHeaderOf()).toBe('Bearer pot-artist-delete-admin-jwt')
    expect(result).toEqual({ ok: true })
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
