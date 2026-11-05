/**
 * 開発用・テスト用の MSW のモック（src/mocks/handlers.ts）のテスト
 * - 収支を登録していないイベントの GET /api/events/:id/finances は本番と同じ既定値（ガソリン 170 円など）を返す
 * - 追加した API: 記事 1 件・Q&A の一覧と追加・チャットの履歴・時間枠の保存
 * - どのハンドラにも当たらない /api/* は 501 を返し、本物のバックエンドへ流れない
 * - テストごとに保存した値が初期状態に戻る（setup.ts の resetSavedMockData）
 * fetch はテストの環境の MSW（src/mocks/node.ts の server）が受け取る。本番には接続しない
 */
import { describe, it, expect } from 'vitest'

/**
 * モックの API を呼んで、ステータスと JSON の本文を返す
 * @param path - /api から始まるパス
 * @param init - fetch の指定（メソッド・本文）
 * @returns ステータスと本文
 */
async function call(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

describe('MSW の収支', () => {
  it('収支を登録していないイベントは、本番と同じ既定値に event_id を付けて返す', async () => {
    const { status, body } = await call('/api/events/mock-no-time/finances')
    expect(status).toBe(200)
    expect(body).toEqual({
      event_id: 'mock-no-time', sales: 0, booth_fee: 0, distance: 0, gas_price: 170, expressway_toll: 0,
      accommodation: 0, ws_participants: 0, payment_flag: false, ws_payment_done: false,
      other_expenses: 0, other_expenses_note: null, notes: null,
    })
  })

  it('登録済みのイベント（mock-past-1）は登録した収支を返す', async () => {
    const { body } = await call('/api/events/mock-past-1/finances')
    expect(body).toMatchObject({ event_id: 'mock-past-1', ws_participants: 8 })
  })
})

describe('MSW の追加された API', () => {
  it('記事を作ると 1 件の取得で同じ記事が返り、無い id は 404', async () => {
    const created = (await call('/api/articles', { method: 'POST', body: JSON.stringify({ title: 'テスト記事', is_published: true, image_urls: [], tags: [], product_ids: [] }) })).body as { id: string }
    const got = await call(`/api/articles/${created.id}`)
    expect(got.status).toBe(200)
    expect(got.body).toMatchObject({ id: created.id, title: 'テスト記事' })
    expect((await call('/api/articles/no-such-article')).status).toBe(404)
  })

  it('Q&A を追加すると一覧（?all=true）に入る。無効の Q&A は all なしの一覧に出ない', async () => {
    await call('/api/chat-qa', { method: 'POST', body: JSON.stringify({ question: '有効', answer: 'A', sort_order: 1, enabled: true }) })
    await call('/api/chat-qa', { method: 'POST', body: JSON.stringify({ question: '無効', answer: 'B', sort_order: 2, enabled: false }) })
    const all = (await call('/api/chat-qa?all=true')).body as { question: string }[]
    const enabled = (await call('/api/chat-qa')).body as { question: string }[]
    expect(all.map((q) => q.question)).toEqual(expect.arrayContaining(['有効', '無効']))
    expect(enabled.map((q) => q.question)).toContain('有効')
    expect(enabled.map((q) => q.question)).not.toContain('無効')
  })

  it('チャットの履歴はモックの 1 件を返す', async () => {
    const { status, body } = await call('/api/chat-logs')
    expect(status).toBe(200)
    expect(body).toHaveLength(1)
  })

  it('時間枠を保存すると id・表示順・予約 0 人を付けて返し、そのあとの GET でも同じ枠が返る', async () => {
    const put = await call('/api/events/mock-upcoming-1/sessions', {
      method: 'PUT',
      body: JSON.stringify({ sessions: [{ time_label: '11:00〜12:00', max_participants: 4 }, { time_label: '12:00〜13:00', max_participants: 4 }] }),
    })
    expect(put.status).toBe(200)
    const saved = put.body as { id: string; time_label: string; reserved_count: number; display_order: number }[]
    expect(saved.map((s) => [s.time_label, s.reserved_count, s.display_order])).toEqual([['11:00〜12:00', 0, 0], ['12:00〜13:00', 0, 1]])
    expect(saved.every((s) => typeof s.id === 'string' && s.id.length > 0)).toBe(true)
    expect((await call('/api/events/mock-upcoming-1/sessions')).body).toEqual(saved)
  })

  it('存在しないイベントの時間枠の保存は 404', async () => {
    const { status } = await call('/api/events/no-such-event/sessions', { method: 'PUT', body: JSON.stringify({ sessions: [] }) })
    expect(status).toBe(404)
  })

  it('テストが変わると保存した時間枠は消えている（初期状態に戻る）', async () => {
    expect((await call('/api/events/mock-upcoming-1/sessions')).body).toEqual([])
  })
})

describe('MSW に無い API', () => {
  it.each([
    ['GET', '/api/no-such-api'],
    ['POST', '/api/no-such-api/123'],
    ['DELETE', '/api/orders/xyz/items'],
  ])('%s %s は 501 で、どの API が足りないかを detail に書く', async (method, path) => {
    const { status, body } = await call(path, { method })
    expect(status).toBe(501)
    expect((body as { detail: string }).detail).toBe(`MSW のモックに無い API です: ${method} ${path}`)
  })
})

describe('MSW のサイト画像（一括取得・habitat-・ei8ht-・official- のキー）', () => {
  it('prefix=habitat- は14件（動く画像11枠＋ページ写真3枠）をキーの昇順で返し、初期値は hero-01 と object-01 だけ URL がある', async () => {
    const { status, body } = await call('/api/site-assets?prefix=habitat-')
    expect(status).toBe(200)
    const list = body as { key: string; url: string }[]
    expect(list).toHaveLength(14)
    expect(list.map(({ key }) => key)).toEqual(expect.arrayContaining(['habitat-world', 'habitat-workshop-photo', 'habitat-workshop-main']))
    expect(list.map(({ key }) => key)).not.toContain('habitat-sign')
    expect(list.map(({ key }) => key)).toEqual([...list.map(({ key }) => key)].sort())
    expect(list.filter(({ url }) => url).map(({ key }) => key)).toEqual(['habitat-hero-01', 'habitat-object-01'])
  })

  it('prefix=ei8ht- は3件（ei8ht-about-hero を含む）をキーの昇順ですべて空の URL で返す', async () => {
    const { body } = await call('/api/site-assets?prefix=ei8ht-')
    expect(body).toEqual([
      { key: 'ei8ht-about-hero', url: '' },
      { key: 'ei8ht-hero', url: '' },
      { key: 'ei8ht-wordmark', url: '' },
    ])
  })

  it('prefix=official- は公式サイトの4件をキーの昇順ですべて空の URL で返し、1件ずつも取得・保存できる', async () => {
    // 1. 一括取得は4件（ヒーロー1枠＋ブランド紹介3枠）
    const { status, body } = await call('/api/site-assets?prefix=official-')
    expect(status).toBe(200)
    expect(body).toEqual([
      { key: 'official-brand-ei8ht', url: '' },
      { key: 'official-brand-habitat', url: '' },
      { key: 'official-brand-hue', url: '' },
      { key: 'official-hero', url: '' },
    ])
    // 2. 1件の取得と保存（ほかのテストに影響しないよう、最後に空へ戻す）
    expect((await call('/api/site-assets/official-hero')).body).toEqual({ key: 'official-hero', url: '' })
    const saved = await call('/api/site-assets/official-hero', { method: 'PUT', body: JSON.stringify({ url: '/hero.jpg' }) })
    expect(saved).toEqual({ status: 200, body: { key: 'official-hero', url: '/hero.jpg' } })
    expect((await call('/api/site-assets?prefix=official-')).body).toContainEqual({ key: 'official-hero', url: '/hero.jpg' })
    await call('/api/site-assets/official-hero', { method: 'PUT', body: JSON.stringify({ url: '' }) })
    // 3. 定義にない official- のキーは 404
    expect((await call('/api/site-assets/official-unknown')).status).toBe(404)
  })

  it('prefix=hue-color- は hue-color-study を含めた7件を返す', async () => {
    const { body } = await call('/api/site-assets?prefix=hue-color-')
    const keys = (body as { key: string }[]).map(({ key }) => key)
    expect(keys).toHaveLength(7)
    expect(keys).toContain('hue-color-study')
  })

  it('prefix が空・当てはまるキーがないときは 404', async () => {
    expect((await call('/api/site-assets?prefix=')).status).toBe(404)
    expect((await call('/api/site-assets?prefix=nothing-')).status).toBe(404)
    expect((await call('/api/site-assets')).status).toBe(404)
  })

  it('habitat- と ei8ht- のキーは1件ずつ取得でき、知らないキーと枠から外したサインの habitat-sign は 404', async () => {
    expect((await call('/api/site-assets/habitat-object-02')).body).toEqual({ key: 'habitat-object-02', url: '' })
    expect((await call('/api/site-assets/habitat-sign')).status).toBe(404)
    expect((await call('/api/site-assets/ei8ht-hero')).body).toEqual({ key: 'ei8ht-hero', url: '' })
    expect((await call('/api/site-assets/habitat-object-07')).status).toBe(404)
  })

  it('PUT で保存した URL が1件取得と一括取得に反映され、知らないキーの PUT は 404', async () => {
    // 1. 保存する（このファイルのほかのテストに影響しないよう、最後に空へ戻す）
    const saved = await call('/api/site-assets/ei8ht-wordmark', { method: 'PUT', body: JSON.stringify({ url: '/logo.png' }) })
    expect(saved).toEqual({ status: 200, body: { key: 'ei8ht-wordmark', url: '/logo.png' } })
    expect((await call('/api/site-assets/ei8ht-wordmark')).body).toEqual({ key: 'ei8ht-wordmark', url: '/logo.png' })
    expect((await call('/api/site-assets?prefix=ei8ht-')).body).toContainEqual({ key: 'ei8ht-wordmark', url: '/logo.png' })
    // TODO: known issue — resetSavedMockData は habitat- / ei8ht- の保存値を初期状態に戻さないため、ここで手で戻す
    await call('/api/site-assets/ei8ht-wordmark', { method: 'PUT', body: JSON.stringify({ url: '' }) })
    // 2. 知らないキー
    expect((await call('/api/site-assets/habitat-unknown', { method: 'PUT', body: JSON.stringify({ url: '/x.png' }) })).status).toBe(404)
    // 3. 枠から外したサインのキーも保存できない
    expect((await call('/api/site-assets/habitat-sign', { method: 'PUT', body: JSON.stringify({ url: '/x.png' }) })).status).toBe(404)
  })
})
