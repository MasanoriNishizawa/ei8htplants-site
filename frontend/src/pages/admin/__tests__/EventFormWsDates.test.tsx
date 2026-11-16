/**
 * イベント登録画面（EventForm）の「ワークショップの実施日と日ごとの時間枠」の画面の動きのテスト（2026-11-13 追加）
 * - 複数日・WS ありのときだけ「全日程で実施（共通の枠）」「実施する日を選ぶ」の切り替えが出る
 * - 全日程 → 日を選ぶ: 全部の日を選び、各日に共通の枠を写す
 * - 日を選ぶ → 全日程: ほかの日の枠が消えるときは確認を出す（キャンセルなら切り替えない）
 * - 編集で ws_dates のあるイベントを開くと「日を選ぶ」で、日ごとの枠が出る
 * - 開催期間を変えると、外れた日を外す。1 日になったら全日程に戻し、最初の日の枠を共通の枠にする
 * - 選んだ日が 0 日なら保存しない（API を呼ばない）
 * - 未保存の判定（日を付けて外すだけなら変更なし、日ごとの枠を変えたら変更あり）
 * - 保存はイベントと枠を 1 回の update/create（本文の sessions）で送り、saveSessions は呼ばない
 * - 409（予約が入っている日時を消そうとした）なら、案内・移し先の無い予約の一覧・予約の画面へのリンクを出し、入力を残して未保存のまま
 * - 読み込んだ枠と実施日の設定が食い違うときは、補正した内容と案内を出す
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminEventForm from '../EventForm'
import { api, ApiError } from '../../../lib/api'
import type { Event, WsSession } from '../../../lib/api'

// API 呼び出しの関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: { get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getSessions: vi.fn(), saveSessions: vi.fn() },
      upload: vi.fn(),
    },
  }
})

/** 7/1（木）〜7/4（日）の 4 日間・WS あり・7/2 と 7/4 だけ実施するイベント */
const WS_EVENT: Event = {
  id: 'ws-ev', slug: 'ws-ev', name: 'Plants Weekend', start_date: '2027-07-01', end_date: '2027-07-04', time: '10:00〜17:00',
  location: '会場', booth_number: null, address: null, official_url: null, brands: ['ei8ht plants'], has_workshop: true,
  ws_requires_reservation: true, is_past: false, display_order: 1, images: [], page_content: null, daily_times: null,
  ws_dates: ['2027-07-02', '2027-07-04'],
}

/** 7/2 だけの枠 2 つ（7/4 は枠なし） */
const DAY2_SESSIONS: WsSession[] = [
  { id: 's-11', event_id: 'ws-ev', time_label: '11:00〜12:00', max_participants: 6, reserved_count: 0, display_order: 0, session_date: '2027-07-02' },
  { id: 's-13', event_id: 'ws-ev', time_label: '13:00〜14:00', max_participants: 4, reserved_count: 0, display_order: 1, session_date: '2027-07-02' },
]

/** 同じ 4 日間で全日程で実施（ws_dates なし）・共通の枠 1 つのイベント */
const ALL_EVENT: Event = { ...WS_EVENT, id: 'all-ev', ws_dates: null }
/** 共通の枠 */
const COMMON_SESSIONS: WsSession[] = [
  { id: 'c-1', event_id: 'all-ev', time_label: '15:00〜16:00', max_participants: 5, reserved_count: 0, display_order: 0, session_date: null },
]

/**
 * 編集画面を開き、読み込みが終わる（イベント名が入る）まで待つ
 * @param event - 開くイベント
 * @param sessions - 読み込む時間枠
 * @returns なし
 */
async function openEdit(event: Event, sessions: WsSession[]) {
  vi.mocked(api.events.get).mockResolvedValue(event)
  vi.mocked(api.events.getSessions).mockResolvedValue(sessions)
  render(
    <MemoryRouter initialEntries={[`/admin/events/${event.id}/edit`]}>
      <Routes>
        <Route path="/admin/events/:id/edit" element={<AdminEventForm />} />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByDisplayValue(event.name)).toBeInTheDocument())
}

/** 実施のしかたのラジオ */
const modeRadio = (name: '全日程で実施（共通の枠）' | '実施する日を選ぶ') =>
  within(screen.getByRole('radiogroup', { name: 'ワークショップの実施のしかた' })).getByRole('radio', { name })

/** 実施する日のチェック（例: 7月2日（金）） */
const dayBox = (label: string) => within(screen.getByRole('group', { name: '実施する日（1日以上）' })).getByRole('checkbox', { name: label })

/** 実施する日のチェックの名前を、選んでいるものだけ並べる */
const checkedDays = () =>
  within(screen.getByRole('group', { name: '実施する日（1日以上）' })).getAllByRole('checkbox')
    .filter((c) => (c as HTMLInputElement).checked)
    .map((c) => c.closest('label')?.textContent)

let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
})

afterEach(() => {
  confirmSpy.mockRestore()
})

describe('EventForm の実施日（編集で開いた状態）', () => {
  it('FE-EQ-01 ws_dates のあるイベントは「実施する日を選ぶ」で開き、選んだ日と日ごとの枠を出す（枠なしの日は案内）', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(modeRadio('実施する日を選ぶ')).toBeChecked())
    expect(checkedDays()).toEqual(['7月2日（金）', '7月4日（日）'])
    expect(dayBox('7月1日（木）')).not.toBeChecked()
    // 7/2 の枠
    const day2 = screen.getByRole('region', { name: '7月2日（金）の時間枠' })
    expect(within(day2).getByRole('textbox', { name: '7月2日（金）の1回目の時間' })).toHaveValue('11:00〜12:00')
    expect(within(day2).getByRole('textbox', { name: '7月2日（金）の2回目の時間' })).toHaveValue('13:00〜14:00')
    expect(within(day2).getByRole('spinbutton', { name: '7月2日（金）の2回目の定員' })).toHaveValue(4)
    // 7/4 は枠なし
    expect(within(screen.getByRole('region', { name: '7月4日（日）の時間枠' })).getByText('枠なし（時間指定なしで予約受付）')).toBeInTheDocument()
    // 共通の枠の欄は出ない
    expect(screen.queryByText('WSセッション（各回の時間・定員）')).toBeNull()
  })

  it('FE-EQ-02 ws_dates の無い複数日のイベントは「全日程で実施」で開き、共通の枠を出す', async () => {
    await openEdit(ALL_EVENT, COMMON_SESSIONS)
    await waitFor(() => expect(modeRadio('全日程で実施（共通の枠）')).toBeChecked())
    expect(screen.getByRole('textbox', { name: '1回目の時間' })).toHaveValue('15:00〜16:00')
    expect(screen.queryByRole('group', { name: '実施する日（1日以上）' })).toBeNull()
  })

  it('FE-EQ-03 1 日のイベント・WS なしのイベントでは、実施のしかたの切り替えを出さない', async () => {
    await openEdit({ ...ALL_EVENT, end_date: '2027-07-01' }, COMMON_SESSIONS)
    expect(screen.queryByRole('radiogroup', { name: 'ワークショップの実施のしかた' })).toBeNull()
    // WS ありに戻した複数日にすると出る → WS を外すと消える
    fireEvent.change(screen.getByLabelText('終了日'), { target: { value: '2027-07-04' } })
    expect(screen.getByRole('radiogroup', { name: 'ワークショップの実施のしかた' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'ワークショップあり' }))
    expect(screen.queryByRole('radiogroup', { name: 'ワークショップの実施のしかた' })).toBeNull()
  })
})

describe('EventForm の実施のしかたの切り替え', () => {
  it('FE-EQ-04 全日程 → 日を選ぶ にすると、全部の日を選び、各日に共通の枠を写す', async () => {
    await openEdit(ALL_EVENT, COMMON_SESSIONS)
    fireEvent.click(modeRadio('実施する日を選ぶ'))
    expect(checkedDays()).toEqual(['7月1日（木）', '7月2日（金）', '7月3日（土）', '7月4日（日）'])
    for (const d of ['7月1日（木）', '7月2日（金）', '7月3日（土）', '7月4日（日）']) {
      expect(screen.getByRole('textbox', { name: `${d}の1回目の時間` })).toHaveValue('15:00〜16:00')
      expect(screen.getByRole('spinbutton', { name: `${d}の1回目の定員` })).toHaveValue(5)
    }
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('FE-EQ-05 最後の 1 日は外せない（チェックが無効になる）', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(dayBox('7月4日（日）')).toBeChecked())
    fireEvent.click(dayBox('7月4日（日）'))
    expect(checkedDays()).toEqual(['7月2日（金）'])
    expect(dayBox('7月2日（金）')).toBeDisabled()
    expect(screen.queryByRole('region', { name: '7月4日（日）の時間枠' })).toBeNull()
  })

  it('FE-EQ-06 日を選ぶ → 全日程 で、ほかの日の枠が消えないとき（最初の日にしか枠が無い）は確認を出さず、最初の日の枠を共通の枠にする', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(modeRadio('実施する日を選ぶ')).toBeChecked())
    fireEvent.click(modeRadio('全日程で実施（共通の枠）'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(modeRadio('全日程で実施（共通の枠）')).toBeChecked()
    expect(screen.getByRole('textbox', { name: '1回目の時間' })).toHaveValue('11:00〜12:00')
    expect(screen.getByRole('textbox', { name: '2回目の時間' })).toHaveValue('13:00〜14:00')
  })

  it('FE-EQ-07 ほかの日の枠が消えるときは確認を出し、キャンセルなら「日を選ぶ」のまま枠も残る', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(modeRadio('実施する日を選ぶ')).toBeChecked())
    // 7/4 に枠を 1 つ足す
    fireEvent.click(screen.getByRole('button', { name: '7月4日（日）に枠を追加' }))
    fireEvent.change(screen.getByRole('textbox', { name: '7月4日（日）の1回目の時間' }), { target: { value: '10:00〜11:00' } })
    fireEvent.click(modeRadio('全日程で実施（共通の枠）'))
    expect(confirmSpy).toHaveBeenCalledWith('全日程で実施に切り替えると、7月2日（金）の枠を共通の枠にし、ほかの日の枠（1件）は消えます。よろしいですか？')
    expect(modeRadio('実施する日を選ぶ')).toBeChecked()
    expect(screen.getByRole('textbox', { name: '7月4日（日）の1回目の時間' })).toHaveValue('10:00〜11:00')
  })

  it('FE-EQ-08 確認で OK なら全日程に切り替わり、最初の日（7/2）の枠が共通の枠になる', async () => {
    confirmSpy.mockReturnValue(true)
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(modeRadio('実施する日を選ぶ')).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: '7月4日（日）に枠を追加' }))
    fireEvent.change(screen.getByRole('textbox', { name: '7月4日（日）の1回目の時間' }), { target: { value: '10:00〜11:00' } })
    fireEvent.click(modeRadio('全日程で実施（共通の枠）'))
    expect(modeRadio('全日程で実施（共通の枠）')).toBeChecked()
    expect(screen.getAllByRole('textbox', { name: /^\d回目の時間$/ }).map((i) => (i as HTMLInputElement).value)).toEqual(['11:00〜12:00', '13:00〜14:00'])
  })

  it('FE-EQ-09 「ほかの日の枠をコピー」で 7/2 の枠を 7/4 に写す（7/4 が空なら確認なし）', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    /** 7/4 のコピー元を選ぶ欄 */
    const copy = await screen.findByRole('combobox', { name: '7月4日（日）にほかの日の枠をコピー' })
    fireEvent.change(copy, { target: { value: '2027-07-02' } })
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '7月4日（日）の1回目の時間' })).toHaveValue('11:00〜12:00')
    expect(screen.getByRole('textbox', { name: '7月4日（日）の2回目の時間' })).toHaveValue('13:00〜14:00')
  })

  it('FE-EQ-10 コピー先に枠があるときは置き換えの確認を出し、キャンセルなら変えない', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    fireEvent.click(await screen.findByRole('button', { name: '7月4日（日）に枠を追加' }))
    fireEvent.change(screen.getByRole('textbox', { name: '7月4日（日）の1回目の時間' }), { target: { value: '10:00〜11:00' } })
    fireEvent.change(screen.getByRole('combobox', { name: '7月4日（日）にほかの日の枠をコピー' }), { target: { value: '2027-07-02' } })
    expect(confirmSpy).toHaveBeenCalledWith('7月4日（日）の枠（1件）を、7月2日（金）の枠で置き換えます。よろしいですか？')
    expect(screen.getByRole('textbox', { name: '7月4日（日）の1回目の時間' })).toHaveValue('10:00〜11:00')
    expect(screen.queryByRole('textbox', { name: '7月4日（日）の2回目の時間' })).toBeNull()
  })

  it('FE-EQ-11 その日の「自動設定」で、開催時間（10:00〜17:00）から 1 時間刻みの枠を作る', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    fireEvent.click(await screen.findByRole('button', { name: '7月4日（日）の枠を自動設定' }))
    /** 7/4 の枠の時間 */
    const labels = within(screen.getByRole('region', { name: '7月4日（日）の時間枠' }))
      .getAllByRole('textbox').map((i) => (i as HTMLInputElement).value)
    expect(labels.length).toBeGreaterThan(0)
    labels.forEach((l) => expect(l).toMatch(/^\d{1,2}:\d{2}〜\d{1,2}:\d{2}$/))
    // 7/2 の枠は変わらない
    expect(screen.getByRole('textbox', { name: '7月2日（金）の1回目の時間' })).toHaveValue('11:00〜12:00')
  })
})

describe('EventForm の開催期間の変更への追従', () => {
  it('FE-EQ-12 終了日を 7/3 にすると、期間から外れた 7/4 の選択と枠が消える', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(dayBox('7月4日（日）')).toBeChecked())
    fireEvent.change(screen.getByLabelText('終了日'), { target: { value: '2027-07-03' } })
    expect(checkedDays()).toEqual(['7月2日（金）'])
    expect(screen.queryByRole('checkbox', { name: '7月4日（日）' })).toBeNull()
    expect(screen.queryByRole('region', { name: '7月4日（日）の時間枠' })).toBeNull()
  })

  it('FE-EQ-13 1 日のイベントにすると全日程に戻し、最初に選んでいた日（7/2）の枠を共通の枠にする', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(modeRadio('実施する日を選ぶ')).toBeChecked())
    fireEvent.change(screen.getByLabelText('終了日'), { target: { value: '2027-07-01' } })
    expect(screen.queryByRole('radiogroup', { name: 'ワークショップの実施のしかた' })).toBeNull()
    expect(screen.getAllByRole('textbox', { name: /^\d回目の時間$/ }).map((i) => (i as HTMLInputElement).value)).toEqual(['11:00〜12:00', '13:00〜14:00'])
    // もう一度複数日に戻すと「全日程で実施」になっている
    fireEvent.change(screen.getByLabelText('終了日'), { target: { value: '2027-07-04' } })
    expect(modeRadio('全日程で実施（共通の枠）')).toBeChecked()
  })

  it('FE-EQ-14 選んだ日が開催期間から全部外れて 0 日になったら、保存せず（API を呼ばず）理由を出す', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(dayBox('7月4日（日）')).toBeChecked())
    // 7/2 だけにしてから、開始日を 7/3 にずらす（7/2 が外れて 0 日）
    fireEvent.click(dayBox('7月4日（日）'))
    fireEvent.change(screen.getByLabelText('開始日'), { target: { value: '2027-07-03' } })
    expect(checkedDays()).toEqual([])
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    expect(await screen.findByText('ワークショップを実施する日を1日以上選んでください')).toBeInTheDocument()
    expect(api.events.update).not.toHaveBeenCalled()
    expect(api.events.create).not.toHaveBeenCalled()
    expect(api.events.saveSessions).not.toHaveBeenCalled()
  })
})

describe('EventForm の実施日の未保存の判定', () => {
  it('FE-EQ-15 開いたまま何も変えなければ、「キャンセル」で確認は出ない', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(modeRadio('実施する日を選ぶ')).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('FE-EQ-16 日を付けて外すだけなら変更なし（確認なし）', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(dayBox('7月3日（土）')).not.toBeChecked())
    fireEvent.click(dayBox('7月3日（土）'))
    fireEvent.click(dayBox('7月3日（土）'))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('FE-EQ-17 実施日を変えると、「キャンセル」で破棄の確認が出る', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(dayBox('7月3日（土）')).not.toBeChecked())
    fireEvent.click(dayBox('7月3日（土）'))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenCalledWith('保存していない変更があります。破棄して移動しますか？')
  })

  it('FE-EQ-18 日ごとの枠の定員を変えると、「キャンセル」で破棄の確認が出る', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    fireEvent.change(await screen.findByRole('spinbutton', { name: '7月2日（金）の1回目の定員' }), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenCalledWith('保存していない変更があります。破棄して移動しますか？')
  })

  it('FE-EQ-19 全日程 → 日を選ぶ に切り替えただけでも変更ありになる', async () => {
    await openEdit(ALL_EVENT, COMMON_SESSIONS)
    fireEvent.click(modeRadio('実施する日を選ぶ'))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenCalledWith('保存していない変更があります。破棄して移動しますか？')
  })
})

describe('EventForm の保存（イベントと枠を 1 回で。2026-11-13 追加）', () => {
  it('FE-EQ-20 日を選ぶイベントを保存すると、update の本文に ws_dates と session_date つきの sessions を入れて 1 回で送り、saveSessions は呼ばない', async () => {
    vi.mocked(api.events.update).mockResolvedValue(WS_EVENT)
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(dayBox('7月3日（土）')).not.toBeChecked())
    // 7/3 を足して 7/2 の枠をコピーする（コピーした枠は id なし）
    fireEvent.click(dayBox('7月3日（土）'))
    fireEvent.change(screen.getByRole('combobox', { name: '7月3日（土）にほかの日の枠をコピー' }), { target: { value: '2027-07-02' } })
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    await waitFor(() => expect(api.events.update).toHaveBeenCalledTimes(1))
    const [id, body] = vi.mocked(api.events.update).mock.calls[0]
    expect(id).toBe('ws-ev')
    expect(body.ws_dates).toEqual(['2027-07-02', '2027-07-03', '2027-07-04'])
    expect(body.sessions).toEqual([
      { id: 's-11', time_label: '11:00〜12:00', max_participants: 6, session_date: '2027-07-02' },
      { id: 's-13', time_label: '13:00〜14:00', max_participants: 4, session_date: '2027-07-02' },
      { time_label: '11:00〜12:00', max_participants: 6, session_date: '2027-07-03' },
      { time_label: '13:00〜14:00', max_participants: 4, session_date: '2027-07-03' },
    ])
    expect(api.events.saveSessions).not.toHaveBeenCalled()
  })

  it('FE-EQ-21 全日程のイベントを保存すると、ws_dates は null・sessions は session_date なし', async () => {
    vi.mocked(api.events.update).mockResolvedValue(ALL_EVENT)
    await openEdit(ALL_EVENT, COMMON_SESSIONS)
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    await waitFor(() => expect(api.events.update).toHaveBeenCalledTimes(1))
    const body = vi.mocked(api.events.update).mock.calls[0][1]
    expect(body.ws_dates).toBeNull()
    expect(body.sessions).toEqual([{ id: 'c-1', time_label: '15:00〜16:00', max_participants: 5 }])
  })

  it('FE-EQ-22 409 なら案内・移し先の無い予約の一覧・予約の画面へのリンク（別のタブ）を出し、入力を残して未保存のまま', async () => {
    /** サーバーの 409 の案内 */
    const detail = '予約が入っている日時を変更・削除しようとしています。先に予約をキャンセルするか、別の日時へ変更してください。'
    vi.mocked(api.events.update).mockRejectedValue(new ApiError(409, `409 ${detail}`, detail, {
      detail, conflicts: [{ date: '2027-07-02', time_label: '11:00〜12:00', count: 2 }, { date: null, time_label: '13:00〜14:00', count: 1 }],
    }))
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(dayBox('7月4日（日）')).toBeChecked())
    // 7/2 を外して保存する
    fireEvent.click(dayBox('7月2日（金）'))
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    /** 409 の帯 */
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(detail)
    expect(within(alert).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '7/2（金） 11:00〜12:00 に予約 2 件',
      '日付なし 13:00〜14:00 に予約 1 件',
    ])
    /** 予約の画面へのリンク */
    const link = within(alert).getByRole('link', { name: 'このイベントの予約を見る（別のタブ）' })
    expect(link).toHaveAttribute('href', '/admin/events/ws-ev/reservations')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // 入力（7/2 を外した状態）は残り、保存ボタンもまた押せる。未保存なので「キャンセル」で確認が出る
    expect(checkedDays()).toEqual(['7月4日（日）'])
    expect(screen.getByRole('button', { name: '保存する' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenCalledWith('保存していない変更があります。破棄して移動しますか？')
  })

  it('FE-EQ-23 409 のあとに保存し直して成功すれば、409 の帯は消えて一覧へ移る', async () => {
    const detail = '予約が入っている日時を変更・削除しようとしています。'
    vi.mocked(api.events.update)
      .mockRejectedValueOnce(new ApiError(409, '409', detail, { detail, conflicts: [] }))
      .mockResolvedValueOnce(WS_EVENT)
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(screen.queryByRole('listitem')).toBeNull()
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    await waitFor(() => expect(api.events.update).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('FE-EQ-24 409 以外の失敗（500）は「保存に失敗しました」の帯で、一覧は出さない', async () => {
    vi.mocked(api.events.update).mockRejectedValue(new ApiError(500, '500 err', 'err'))
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました')
    expect(screen.queryByRole('link', { name: 'このイベントの予約を見る（別のタブ）' })).toBeNull()
  })

  it('FE-EQ-25 新規作成も create の本文に sessions を入れて 1 回で送り、saveSessions は呼ばない', async () => {
    vi.mocked(api.events.create).mockResolvedValue({ ...WS_EVENT, id: 'new' })
    render(
      <MemoryRouter initialEntries={['/admin/events/new']}>
        <Routes>
          <Route path="/admin/events/new" element={<AdminEventForm />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('イベント名'), { target: { value: '新しいイベント' } })
    fireEvent.change(screen.getByLabelText('開始日'), { target: { value: '2027-07-01' } })
    fireEvent.change(screen.getByLabelText('終了日'), { target: { value: '2027-07-02' } })
    fireEvent.change(screen.getByLabelText('会場名'), { target: { value: '会場' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'ワークショップあり' }))
    fireEvent.click(modeRadio('実施する日を選ぶ'))
    fireEvent.click(dayBox('7月1日（木）'))
    fireEvent.click(screen.getByRole('button', { name: '7月2日（金）に枠を追加' }))
    fireEvent.change(screen.getByRole('textbox', { name: '7月2日（金）の1回目の時間' }), { target: { value: '10:00〜11:00' } })
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    await waitFor(() => expect(api.events.create).toHaveBeenCalledTimes(1))
    const body = vi.mocked(api.events.create).mock.calls[0][0]
    expect(body.ws_dates).toEqual(['2027-07-02'])
    expect(body.sessions).toEqual([expect.objectContaining({ time_label: '10:00〜11:00', session_date: '2027-07-02' })])
    expect(body.sessions?.[0]).not.toHaveProperty('id')
    expect(api.events.saveSessions).not.toHaveBeenCalled()
  })
})

describe('EventForm の読み込み時の補正の案内（2026-11-13 追加）', () => {
  it('FE-EQ-26 日を選ぶイベントに共通の枠が残っていれば、各実施日にコピーして出し、案内と「保存し直して」を出す', async () => {
    await openEdit(WS_EVENT, [...DAY2_SESSIONS, { ...COMMON_SESSIONS[0], event_id: 'ws-ev', display_order: 5 }])
    /** 補正の案内の帯 */
    const status = await screen.findByText(/全日程で共通の枠（15:00〜16:00）が残っていたため/)
    expect(status.closest('[role="status"]')).toHaveTextContent('内容を確かめて、保存し直してください。')
    expect(screen.getByRole('textbox', { name: '7月4日（日）の1回目の時間' })).toHaveValue('15:00〜16:00')
    expect(screen.getByRole('textbox', { name: '7月2日（金）の3回目の時間' })).toHaveValue('15:00〜16:00')
  })

  it('FE-EQ-27 実施日でない日の枠が残っていれば、保存すると消える案内を出す', async () => {
    await openEdit(WS_EVENT, [...DAY2_SESSIONS, { ...DAY2_SESSIONS[0], id: 's-orphan', time_label: '16:00〜17:00', session_date: '2027-07-03', display_order: 9 }])
    expect(await screen.findByText('実施日でない日の枠（7/3 16:00〜17:00）が残っています。このまま保存すると消えます（予約が入っていれば保存は止まります）。')).toBeInTheDocument()
  })

  it('FE-EQ-28 食い違いが無ければ補正の案内は出ない', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    await waitFor(() => expect(modeRadio('実施する日を選ぶ')).toBeChecked())
    expect(screen.queryByText('内容を確かめて、保存し直してください。')).toBeNull()
  })
})

describe('EventForm の時間枠の並べ替え（2026-11-16 追加）', () => {
  /** 時間順になっていない共通の枠（id つき 2 つと id なし 1 つ） */
  const UNSORTED: WsSession[] = [
    { id: 'c-13', event_id: 'all-ev', time_label: '13:00〜14:00', max_participants: 4, reserved_count: 0, display_order: 0, session_date: null },
    { id: 'c-10', event_id: 'all-ev', time_label: '10:00〜11:00', max_participants: 6, reserved_count: 0, display_order: 1, session_date: null },
    { id: 'c-11', event_id: 'all-ev', time_label: '11:00〜12:00', max_participants: 5, reserved_count: 0, display_order: 2, session_date: null },
  ]
  /** 共通の枠の時間を上から並べる */
  const commonLabels = () => screen.getAllByRole('textbox', { name: /^\d回目の時間$/ }).map((i) => (i as HTMLInputElement).value)

  /**
   * 保存して、update に送った sessions を返す
   * @returns 送った sessions
   */
  async function saveAndGetSessions() {
    vi.mocked(api.events.update).mockResolvedValue(ALL_EVENT)
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    await waitFor(() => expect(api.events.update).toHaveBeenCalledTimes(1))
    return vi.mocked(api.events.update).mock.calls[0][1].sessions
  }

  it('FE-EQ-29 共通の枠で「↓」を押すと順番が入れ替わり、update の sessions の順が変わって id は保たれる', async () => {
    await openEdit(ALL_EVENT, UNSORTED)
    fireEvent.click(screen.getByRole('button', { name: '1行目を下へ' }))
    expect(commonLabels()).toEqual(['10:00〜11:00', '13:00〜14:00', '11:00〜12:00'])
    expect(await saveAndGetSessions()).toEqual([
      { id: 'c-10', time_label: '10:00〜11:00', max_participants: 6 },
      { id: 'c-13', time_label: '13:00〜14:00', max_participants: 4 },
      { id: 'c-11', time_label: '11:00〜12:00', max_participants: 5 },
    ])
  })

  it('FE-EQ-30 共通の枠で「時間順に並べる」を押すと早い順になり、id は保たれる', async () => {
    await openEdit(ALL_EVENT, UNSORTED)
    fireEvent.click(screen.getByRole('button', { name: '時間順に並べる' }))
    expect(commonLabels()).toEqual(['10:00〜11:00', '11:00〜12:00', '13:00〜14:00'])
    expect((await saveAndGetSessions())?.map((x) => x.id)).toEqual(['c-10', 'c-11', 'c-13'])
  })

  it('FE-EQ-31 並べ替えると未保存の変更になり、元の順に戻すと変更なしに戻る', async () => {
    await openEdit(ALL_EVENT, UNSORTED)
    fireEvent.click(screen.getByRole('button', { name: '2行目を上へ' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenCalledWith('保存していない変更があります。破棄して移動しますか？')
    confirmSpy.mockClear()
    // もう一度入れ替えて元の順に戻す
    fireEvent.click(screen.getByRole('button', { name: '2行目を上へ' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('FE-EQ-32 共通の枠が 1 件以下なら「時間順に並べる」を押せない', async () => {
    await openEdit(ALL_EVENT, COMMON_SESSIONS)
    expect(screen.getByRole('button', { name: '時間順に並べる' })).toBeDisabled()
  })

  it('FE-EQ-33 日ごとの枠で「↑」「時間順に並べる」を押すと、その日の順だけが変わり、update の sessions の順が変わって id は保たれる', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    // 7/2 の 2 行目（13:00）を上へ
    fireEvent.click(await screen.findByRole('button', { name: '7月2日（金）の2行目を上へ' }))
    expect(screen.getByRole('textbox', { name: '7月2日（金）の1回目の時間' })).toHaveValue('13:00〜14:00')
    expect(screen.getByRole('textbox', { name: '7月2日（金）の2回目の時間' })).toHaveValue('11:00〜12:00')
    vi.mocked(api.events.update).mockResolvedValue(WS_EVENT)
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })
    await waitFor(() => expect(api.events.update).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.events.update).mock.calls[0][1].sessions).toEqual([
      { id: 's-13', time_label: '13:00〜14:00', max_participants: 4, session_date: '2027-07-02' },
      { id: 's-11', time_label: '11:00〜12:00', max_participants: 6, session_date: '2027-07-02' },
    ])
  })

  it('FE-EQ-34 日ごとの「時間順に並べる」で、その日の枠を早い順に戻す', async () => {
    await openEdit(WS_EVENT, [DAY2_SESSIONS[1], { ...DAY2_SESSIONS[0], display_order: 2 }].map((x, i) => ({ ...x, display_order: i })))
    expect(await screen.findByRole('textbox', { name: '7月2日（金）の1回目の時間' })).toHaveValue('13:00〜14:00')
    fireEvent.click(screen.getByRole('button', { name: '7月2日（金）の枠を時間順に並べる' }))
    expect(screen.getByRole('textbox', { name: '7月2日（金）の1回目の時間' })).toHaveValue('11:00〜12:00')
    expect(screen.getByRole('textbox', { name: '7月2日（金）の2回目の時間' })).toHaveValue('13:00〜14:00')
    // 未保存の変更になる
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenCalledWith('保存していない変更があります。破棄して移動しますか？')
  })

  it('FE-EQ-35 日ごとの枠が 1 件以下の日は「時間順に並べる」を押せない（7/4 は枠なし）', async () => {
    await openEdit(WS_EVENT, DAY2_SESSIONS)
    expect(await screen.findByRole('button', { name: '7月4日（日）の枠を時間順に並べる' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '7月2日（金）の枠を時間順に並べる' })).toBeEnabled()
  })
})
