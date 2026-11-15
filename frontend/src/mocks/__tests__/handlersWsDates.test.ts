/**
 * MSW のモック（src/mocks/handlers.ts）の、イベントと時間枠を 1 回で保存する動き（applySessions）のテスト（2026-11-13 追加）
 * 使うモック: mock-ws-dates（7/1〜7/4 開催・7/2 と 7/4 だけ実施。7/2 の 11:00〜12:00 は mock-ws-dates-s1 で、
 * そこに MOCK_RESERVATIONS の予約 2 名が入っている）
 * - 予約の入っている枠を残して保存すると、予約はその枠のまま
 * - 全日程に変えると、予約は同じ時間の共通の枠へ付け替わり、予約済みの人数も数え直す
 * - 予約の入っている 7/2 を外すと 409（conflicts つき）で、イベントも枠も変わらない
 * - 日を選ぶのに日付の無い枠・全日程なのに日付つきの枠は 422
 * - 作成（POST）でも枠を一緒に保存する
 * fetch はテストの環境の MSW（src/mocks/node.ts の server）が受け取る。テストごとに初期状態に戻る（setup.ts の resetSavedMockData）
 */
import { describe, it, expect } from 'vitest'
import { MOCK_EVENTS } from '../data'
import type { Reservation, WsSession } from '../../lib/api'

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

/** 元のイベント（mock-ws-dates） */
const BASE = MOCK_EVENTS.find((e) => e.id === 'mock-ws-dates')!

/**
 * PUT /api/events/mock-ws-dates で送る本文を作る（イベントの項目は元のまま）
 * @param over - 上書きする項目（ws_dates・sessions など）
 * @returns 送る本文
 */
function body(over: Record<string, unknown>) {
  return JSON.stringify({
    name: BASE.name, slug: BASE.slug, start_date: BASE.start_date, end_date: BASE.end_date, time: BASE.time,
    location: BASE.location, booth_number: BASE.booth_number, address: BASE.address, official_url: BASE.official_url,
    brands: BASE.brands, has_workshop: true, ws_requires_reservation: true, daily_times: null,
    ws_dates: BASE.ws_dates, image_urls: [], ...over,
  })
}

/** 予約の一覧（mock-ws-dates の分） */
const reservations = async () => (await call('/api/reserves?event_id=mock-ws-dates')).body as Reservation[]
/** 時間枠の一覧（mock-ws-dates の全部） */
const sessions = async () => (await call('/api/events/mock-ws-dates/sessions')).body as WsSession[]

describe('MSW のイベントと時間枠の 1 回の保存（applySessions）', () => {
  it('FE-EW-01 予約の入っている枠（id つき）を残して保存すると、予約はその枠のままで予約済みの人数も 2 名になる', async () => {
    const res = await call('/api/events/mock-ws-dates', {
      method: 'PUT',
      body: body({ sessions: [{ id: 'mock-ws-dates-s1', time_label: '11:00〜12:00', max_participants: 6, session_date: '2027-07-02' }] }),
    })
    expect(res.status).toBe(200)
    expect((await reservations())[0].session_id).toBe('mock-ws-dates-s1')
    const list = await sessions()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'mock-ws-dates-s1', reserved_count: 2, session_date: '2027-07-02' })
  })

  it('FE-EW-02 全日程に変えると、予約は同じ時間の共通の枠へ付け替わる', async () => {
    const res = await call('/api/events/mock-ws-dates', {
      method: 'PUT',
      body: body({ ws_dates: null, sessions: [{ time_label: '11:00〜12:00', max_participants: 6 }] }),
    })
    expect(res.status).toBe(200)
    const list = await sessions()
    expect(list).toHaveLength(1)
    expect(list[0].session_date).toBeNull()
    expect(list[0].reserved_count).toBe(2)
    expect((await reservations())[0].session_id).toBe(list[0].id)
    expect(((await call('/api/events/mock-ws-dates')).body as { ws_dates: unknown }).ws_dates).toBeNull()
  })

  it('FE-EW-03 予約の入っている 7/2 を外すと 409（conflicts に日付・時間・件数）で、イベントも枠も予約も変わらない', async () => {
    const before = await sessions()
    const res = await call('/api/events/mock-ws-dates', {
      method: 'PUT',
      body: body({ ws_dates: ['2027-07-03', '2027-07-04'], sessions: [{ time_label: '11:00〜12:00', max_participants: 6, session_date: '2027-07-03' }] }),
    })
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      detail: '予約が入っている日時を変更・削除しようとしています。先に予約をキャンセルするか、別の日時へ変更してください。',
      conflicts: [{ date: '2027-07-02', time_label: '11:00〜12:00', count: 1 }],
    })
    expect(((await call('/api/events/mock-ws-dates')).body as { ws_dates: string[] }).ws_dates).toEqual(['2027-07-02', '2027-07-04'])
    expect(await sessions()).toEqual(before)
    expect((await reservations())[0].session_id).toBe('mock-ws-dates-s1')
  })

  it('FE-EW-04 キャンセル済みの予約しか無い枠は、外しても 409 にならず予約の枠が外れる', async () => {
    // 予約をキャンセルにしてから 7/2 を外す
    await call('/api/reserves/mock-reservation-ws-dates-1', { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })
    const res = await call('/api/events/mock-ws-dates', {
      method: 'PUT',
      body: body({ ws_dates: ['2027-07-03', '2027-07-04'], sessions: [] }),
    })
    expect(res.status).toBe(200)
    expect((await reservations())[0].session_id).toBeNull()
  })

  it('FE-EW-05 日を選ぶイベントに日付の無い枠・実施日でない日の枠を送ると 422 で、何も変わらない', async () => {
    const before = await sessions()
    const noDate = await call('/api/events/mock-ws-dates', {
      method: 'PUT', body: body({ sessions: [{ time_label: '9:00〜10:00', max_participants: 3 }] }),
    })
    expect(noDate.status).toBe(422)
    const otherDay = await call('/api/events/mock-ws-dates', {
      method: 'PUT', body: body({ sessions: [{ time_label: '9:00〜10:00', max_participants: 3, session_date: '2027-07-03' }] }),
    })
    expect(otherDay.status).toBe(422)
    expect(await sessions()).toEqual(before)
  })

  it('FE-EW-06 全日程のイベントに日付つきの枠を送ると 422', async () => {
    const res = await call('/api/events/mock-ws-dates', {
      method: 'PUT', body: body({ ws_dates: null, sessions: [{ time_label: '9:00〜10:00', max_participants: 3, session_date: '2027-07-02' }] }),
    })
    expect(res.status).toBe(422)
  })

  it('FE-EW-07 sessions を送らない更新では、枠も予約も変えない（今までの形の互換）', async () => {
    const before = await sessions()
    const res = await call('/api/events/mock-ws-dates', { method: 'PUT', body: body({ name: '名前だけ変える' }) })
    expect(res.status).toBe(200)
    expect(await sessions()).toEqual(before)
  })

  it('FE-EW-08 作成（POST）でも、送った枠を session_date つきで保存する', async () => {
    const res = await call('/api/events', {
      method: 'POST',
      body: body({ sessions: [{ time_label: '10:00〜11:00', max_participants: 4, session_date: '2027-07-04' }] }),
    })
    expect(res.status).toBe(200)
    /** 作ったイベントの id */
    const id = (res.body as { id: string }).id
    const list = (await call(`/api/events/${id}/sessions`)).body as WsSession[]
    expect(list).toEqual([expect.objectContaining({ time_label: '10:00〜11:00', max_participants: 4, session_date: '2027-07-04', reserved_count: 0 })])
  })

  it('FE-EW-09 作成で枠が誤っていれば（日を選ぶのに日付なし）422 で、イベントも作らない', async () => {
    const before = ((await call('/api/events')).body as unknown[]).length
    const res = await call('/api/events', {
      method: 'POST', body: body({ name: '作らないイベント', sessions: [{ time_label: '10:00〜11:00', max_participants: 4 }] }),
    })
    expect(res.status).toBe(422)
    expect(((await call('/api/events')).body as unknown[]).length).toBe(before)
  })
})
