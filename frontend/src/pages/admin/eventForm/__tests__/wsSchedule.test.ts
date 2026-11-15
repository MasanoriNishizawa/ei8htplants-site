/**
 * イベント登録画面の「ワークショップの実施日と日ごとの時間枠」の計算（pages/admin/eventForm/wsSchedule.ts）のテスト
 * - startDateSelection: 全日程 → 日を選ぶ。全部の日を選び、各日に共通の枠を写す（id も残す）
 * - collapseToCommon: 日を選ぶ → 全日程。最初の日の枠を共通の枠にし、消える枠（時間が入っているもの）を数える
 * - splitLoadedSessions: 読み込んだ枠を共通の枠と日ごとの枠に分ける（display_order の順）
 * - effectiveWsDates: 開催期間から外れた日を除き、昇順にする
 * - buildSessionsPayload: 保存で送る枠（WS なしは空・全日程は共通の枠・日を選ぶは session_date つきで、同じ id は最初の日だけ）
 * - copySessionsWithoutId: ほかの日へのコピーで id を外す
 * - wsScheduleSnapshot: 未保存の判定に使う値（日を選ぶが効いていなければ空にそろえる）
 * 純粋な関数だけなので、API・画面は使わない
 */
import { describe, it, expect } from 'vitest'
import type { WsSession } from '../../../../lib/apiTypes'
import type { SessionInput } from '../../eventTime'
import {
  buildSessionsPayload,
  collapseToCommon,
  copySessionsWithoutId,
  effectiveWsDates,
  reconcileLoadedSessions,
  splitLoadedSessions,
  startDateSelection,
  wsScheduleSnapshot,
} from '../wsSchedule'

/** 開催期間（3 日間） */
const DATES = ['2027-07-01', '2027-07-02', '2027-07-03']
/** 既存の共通の枠（1 つは保存済みで id あり、1 つは新しい枠） */
const COMMON: SessionInput[] = [
  { id: 's-1', time_label: '11:00〜12:00', max_participants: 6 },
  { time_label: '13:00〜14:00', max_participants: 4 },
]

describe('startDateSelection（全日程 → 実施する日を選ぶ）', () => {
  it('FE-EP-01 開催期間の全部の日を選び、各日に共通の枠を写す（保存済みの枠の id はどの日にも残す）', () => {
    const { wsDates, dailySessions } = startDateSelection(DATES, COMMON)
    expect(wsDates).toEqual(DATES)
    DATES.forEach((d) => {
      expect(dailySessions[d]).toEqual([
        { id: 's-1', time_label: '11:00〜12:00', max_participants: 6 },
        { time_label: '13:00〜14:00', max_participants: 4 },
      ])
    })
  })

  it('FE-EP-02 写した枠は元の配列・ほかの日と別のもの（1 日分を書き換えても、ほかの日・共通の枠は変わらない）', () => {
    const { wsDates, dailySessions } = startDateSelection(DATES, COMMON)
    dailySessions['2027-07-01'][0].time_label = '変更'
    wsDates.pop()
    expect(dailySessions['2027-07-02'][0].time_label).toBe('11:00〜12:00')
    expect(COMMON[0].time_label).toBe('11:00〜12:00')
    expect(DATES).toHaveLength(3)
  })

  it('FE-EP-03 共通の枠が 0 件なら、各日も枠なし（空の配列）になる', () => {
    const { dailySessions } = startDateSelection(DATES, [])
    expect(dailySessions).toEqual({ '2027-07-01': [], '2027-07-02': [], '2027-07-03': [] })
  })
})

describe('collapseToCommon（実施する日を選ぶ → 全日程）', () => {
  /** 日ごとの枠（7/2 は時間が空の行を 1 つ含む） */
  const DAILY = {
    '2027-07-01': [{ id: 'a', time_label: '10:00〜11:00', max_participants: 5 }],
    '2027-07-02': [
      { time_label: '12:00〜13:00', max_participants: 5 },
      { time_label: '  ', max_participants: 5 },
    ],
    '2027-07-03': [{ time_label: '14:00〜15:00', max_participants: 5 }],
  }

  it('FE-EP-04 最初の日（日付の昇順）の枠が共通の枠になり、ほかの日の時間の入った枠の数が lostCount になる', () => {
    // 選んだ順に関係なく、日付の早い 7/1 が元になる
    const { sessions, lostCount } = collapseToCommon(['2027-07-03', '2027-07-01', '2027-07-02'], DAILY)
    expect(sessions).toEqual([{ id: 'a', time_label: '10:00〜11:00', max_participants: 5 }])
    // 7/2 の時間が空の行は数えない（7/2 の 1 件 + 7/3 の 1 件）
    expect(lostCount).toBe(2)
  })

  it('FE-EP-05 1 日だけ選んでいるときは消える枠は 0 件', () => {
    const { sessions, lostCount } = collapseToCommon(['2027-07-03'], DAILY)
    expect(sessions).toEqual([{ time_label: '14:00〜15:00', max_participants: 5 }])
    expect(lostCount).toBe(0)
  })

  it('FE-EP-06 1 日も選んでいなければ、共通の枠は空・消える枠は 0 件', () => {
    expect(collapseToCommon([], DAILY)).toEqual({ sessions: [], lostCount: 0 })
  })

  it('FE-EP-07 選んだ日に枠の項目が無い（未設定）ときも空の扱いで落ちない', () => {
    expect(collapseToCommon(['2027-07-05', '2027-07-06'], {})).toEqual({ sessions: [], lostCount: 0 })
  })
})

describe('splitLoadedSessions（読み込んだ枠の振り分け）', () => {
  /** 時間枠を 1 件作る */
  const ws = (over: Partial<WsSession>): WsSession => ({
    id: 'x', event_id: 'ev', time_label: '', max_participants: 5, reserved_count: 0, display_order: 0, ...over,
  })

  it('FE-EP-08 session_date の無い枠は共通の枠、ある枠はその日の枠に分ける（display_order の順。reserved_count などは落とす）', () => {
    const { common, daily } = splitLoadedSessions([
      ws({ id: 'd2b', time_label: '14:00', display_order: 3, session_date: '2027-07-02' }),
      ws({ id: 'c1', time_label: '10:00', display_order: 0, session_date: null }),
      ws({ id: 'd2a', time_label: '13:00', display_order: 1, session_date: '2027-07-02', reserved_count: 3 }),
      ws({ id: 'd4', time_label: '15:00', display_order: 2, session_date: '2027-07-04' }),
      ws({ id: 'c2', time_label: '11:00', display_order: 4 }),
    ])
    expect(common).toEqual([
      { id: 'c1', time_label: '10:00', max_participants: 5 },
      { id: 'c2', time_label: '11:00', max_participants: 5 },
    ])
    expect(daily).toEqual({
      '2027-07-02': [
        { id: 'd2a', time_label: '13:00', max_participants: 5 },
        { id: 'd2b', time_label: '14:00', max_participants: 5 },
      ],
      '2027-07-04': [{ id: 'd4', time_label: '15:00', max_participants: 5 }],
    })
  })

  it('FE-EP-09 枠が 0 件なら共通も日ごとも空', () => {
    expect(splitLoadedSessions([])).toEqual({ common: [], daily: {} })
  })
})

describe('effectiveWsDates（開催期間に入っている選んだ日）', () => {
  it('FE-EP-10 開催期間から外れた日を除き、開催期間の順（昇順）に並べる', () => {
    expect(effectiveWsDates(['2027-07-03', '2027-06-30', '2027-07-01'], DATES)).toEqual(['2027-07-01', '2027-07-03'])
  })

  it('FE-EP-11 開催期間が空（1 日のイベント）なら空になる', () => {
    expect(effectiveWsDates(['2027-07-01'], [])).toEqual([])
  })
})

describe('buildSessionsPayload（保存で送る枠）', () => {
  it('FE-EP-12 WS なしなら、枠があっても空（全部消す）', () => {
    expect(buildSessionsPayload({
      hasWorkshop: false, selectActive: true, wsDates: ['2027-07-01'], common: COMMON,
      daily: { '2027-07-01': COMMON },
    })).toEqual([])
  })

  it('FE-EP-13 全日程なら共通の枠を session_date なしで送り、時間が空の行は送らない（日ごとの枠は送らない）', () => {
    const payload = buildSessionsPayload({
      hasWorkshop: true, selectActive: false, wsDates: [], common: [...COMMON, { time_label: ' ', max_participants: 3 }],
      daily: { '2027-07-01': [{ time_label: '9:00', max_participants: 1 }] },
    })
    expect(payload).toEqual(COMMON)
    payload.forEach((s) => expect(s).not.toHaveProperty('session_date'))
  })

  it('FE-EP-14 日を選ぶなら、選んだ日の枠に session_date を付け、選んだ日の順に並べる（選んでいない日の枠・時間が空の行は送らない）', () => {
    const payload = buildSessionsPayload({
      hasWorkshop: true, selectActive: true, wsDates: ['2027-07-01', '2027-07-03'], common: COMMON,
      daily: {
        '2027-07-01': [{ id: 'a', time_label: '10:00', max_participants: 5 }, { time_label: '', max_participants: 5 }],
        '2027-07-02': [{ time_label: '選んでいない日', max_participants: 5 }],
        '2027-07-03': [{ time_label: '14:00', max_participants: 2 }],
      },
    })
    expect(payload).toEqual([
      { id: 'a', time_label: '10:00', max_participants: 5, session_date: '2027-07-01' },
      { time_label: '14:00', max_participants: 2, session_date: '2027-07-03' },
    ])
  })

  it('FE-EP-15 同じ id が 2 つ以上の日にあるときは、最初の日の分だけ id を残し、ほかの日は新しい枠（id なし）として送る', () => {
    // 全日程 → 日を選ぶ に切り替えた直後の形（各日に s-1 の写しがある）
    const { wsDates, dailySessions } = startDateSelection(DATES, COMMON)
    const payload = buildSessionsPayload({ hasWorkshop: true, selectActive: true, wsDates, common: COMMON, daily: dailySessions })
    expect(payload).toHaveLength(6)
    /** id を持って送る枠 */
    const withId = payload.filter((s) => s.id)
    expect(withId).toEqual([{ id: 's-1', time_label: '11:00〜12:00', max_participants: 6, session_date: '2027-07-01' }])
    expect(payload.map((s) => s.session_date)).toEqual([
      '2027-07-01', '2027-07-01', '2027-07-02', '2027-07-02', '2027-07-03', '2027-07-03',
    ])
  })

  it('FE-EP-16 最初の日を外したときは、残った最初の日で既存の枠の id を引き継ぐ', () => {
    const { dailySessions } = startDateSelection(DATES, COMMON)
    const payload = buildSessionsPayload({
      hasWorkshop: true, selectActive: true, wsDates: ['2027-07-02', '2027-07-03'], common: COMMON, daily: dailySessions,
    })
    expect(payload.filter((s) => s.id)).toEqual([
      { id: 's-1', time_label: '11:00〜12:00', max_participants: 6, session_date: '2027-07-02' },
    ])
  })

  it('FE-EP-17 選んだ日に枠が 0 件（時間指定なし）のときは、その日の分は何も送らない', () => {
    expect(buildSessionsPayload({
      hasWorkshop: true, selectActive: true, wsDates: ['2027-07-01', '2027-07-02'], common: [],
      daily: { '2027-07-01': [] },
    })).toEqual([])
  })
})

describe('copySessionsWithoutId（ほかの日の枠をコピー）', () => {
  it('FE-EP-18 時間・定員だけを写し、id は外す（元の配列は変えない）', () => {
    const copied = copySessionsWithoutId(COMMON)
    expect(copied).toEqual([
      { time_label: '11:00〜12:00', max_participants: 6 },
      { time_label: '13:00〜14:00', max_participants: 4 },
    ])
    copied[0].time_label = '変更'
    expect(COMMON[0]).toEqual({ id: 's-1', time_label: '11:00〜12:00', max_participants: 6 })
  })
})

describe('wsScheduleSnapshot（未保存の判定に使う値）', () => {
  it('FE-EP-19 日を選ぶが効いていなければ、選んだ日・日ごとの枠に関係なく同じ値（mode: all・空）になる', () => {
    expect(wsScheduleSnapshot(false, ['2027-07-01'], { '2027-07-01': COMMON })).toEqual({ mode: 'all', dates: [], daily: {} })
    expect(wsScheduleSnapshot(false, [], {})).toEqual({ mode: 'all', dates: [], daily: {} })
  })

  it('FE-EP-20 日を選ぶが効いていれば、選んだ日の枠だけを持つ（選んでいない日の枠は比べない。枠の無い日は空の配列）', () => {
    expect(wsScheduleSnapshot(true, ['2027-07-01', '2027-07-03'], {
      '2027-07-01': COMMON,
      '2027-07-02': [{ time_label: '外した日', max_participants: 1 }],
    })).toEqual({ mode: 'select', dates: ['2027-07-01', '2027-07-03'], daily: { '2027-07-01': COMMON, '2027-07-03': [] } })
  })
})

describe('reconcileLoadedSessions（読み込んだ枠と実施日の設定の食い違いの補正。2026-11-13 追加）', () => {
  /** 時間枠を 1 件作る */
  const ws = (over: Partial<WsSession>): WsSession => ({
    id: 'x', event_id: 'ev', time_label: '', max_participants: 5, reserved_count: 0, display_order: 0, ...over,
  })

  it('FE-EP-21 全日程で日付つきの枠が無ければ、全部を共通の枠にし、案内は出さない', () => {
    const r = reconcileLoadedSessions([ws({ id: 'a', time_label: '10:00' }), ws({ id: 'b', time_label: '11:00', display_order: 1 })], false, [])
    expect(r).toEqual({ common: [{ id: 'a', time_label: '10:00', max_participants: 5 }, { id: 'b', time_label: '11:00', max_participants: 5 }], daily: {}, notices: [] })
  })

  it('FE-EP-22 全日程なのに日付つきの枠が残っていれば、同じ時間を 1 つにまとめて共通の枠にし、案内を出す', () => {
    const r = reconcileLoadedSessions([
      ws({ id: 'a', time_label: '10:00', session_date: '2027-07-02', display_order: 0 }),
      ws({ id: 'b', time_label: '10:00', session_date: '2027-07-03', display_order: 1 }),
      ws({ id: 'c', time_label: '11:00', display_order: 2 }),
    ], false, [])
    expect(r.common).toEqual([{ id: 'a', time_label: '10:00', max_participants: 5 }, { id: 'c', time_label: '11:00', max_participants: 5 }])
    expect(r.daily).toEqual({})
    expect(r.notices).toEqual(['全日程で実施するイベントに日付つきの枠（7/2 10:00、7/3 10:00）が残っていたため、共通の枠としてまとめて表示しています。'])
  })

  it('FE-EP-23 日を選ぶのに共通の枠が残っていれば、各実施日へコピーし（同じ時間の枠がある日はコピーしない）、案内を出す', () => {
    const r = reconcileLoadedSessions([
      ws({ id: 'd2', time_label: '10:00', session_date: '2027-07-02', display_order: 0 }),
      ws({ id: 'c', time_label: '10:00', display_order: 1 }),
    ], true, ['2027-07-02', '2027-07-04'])
    expect(r.daily).toEqual({
      '2027-07-02': [{ id: 'd2', time_label: '10:00', max_participants: 5 }],
      '2027-07-04': [{ id: 'c', time_label: '10:00', max_participants: 5 }],
    })
    expect(r.notices).toEqual(['日を選んで実施するイベントに全日程で共通の枠（10:00）が残っていたため、各実施日にコピーして表示しています。'])
  })

  it('FE-EP-24 実施日でない日の枠は表示できないので、保存すると消える案内を出す', () => {
    const r = reconcileLoadedSessions([
      ws({ id: 'd2', time_label: '10:00', session_date: '2027-07-02' }),
      ws({ id: 'd3', time_label: '12:00', session_date: '2027-07-03', display_order: 1 }),
    ], true, ['2027-07-02'])
    expect(r.daily).toEqual({ '2027-07-02': [{ id: 'd2', time_label: '10:00', max_participants: 5 }] })
    expect(r.notices).toEqual(['実施日でない日の枠（7/3 12:00）が残っています。このまま保存すると消えます（予約が入っていれば保存は止まります）。'])
  })

  it('FE-EP-25 食い違いが無ければ（日を選ぶ・その日の枠だけ）案内は出さず、枠の無い実施日は空の配列', () => {
    const r = reconcileLoadedSessions([ws({ id: 'd2', time_label: '10:00', session_date: '2027-07-02' })], true, ['2027-07-02', '2027-07-04'])
    expect(r.daily).toEqual({ '2027-07-02': [{ id: 'd2', time_label: '10:00', max_participants: 5 }], '2027-07-04': [] })
    expect(r.notices).toEqual([])
  })
})
