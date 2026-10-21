/**
 * dashboardFormat.ts（管理画面ダッシュボードの絞り込み・並べ替え・表示用の関数）のテスト
 *
 * 確かめること:
 * - daysBetween / addDays: 月・年・うるう年をまたいでも正しい。不正な日付は null
 * - dueStatus: 期限切れ・今日（soon）・7日後（soon）・8日後（later）・未設定（none）の境界
 * - formatDueRemaining: 「今日まで」「あとN日」「N日超過」
 * - isPaymentPending / selectPendingPayments: 対象の絞り込みと急ぐ順の並び
 * - selectUpcomingCarryIns: 今日〜60日後に始まるものだけ、開始日順
 * - formatEventPeriod: 期間の表示
 */
import { describe, it, expect } from 'vitest'
import type { AdminInfoDashboardItem } from '../../../lib/api'
import {
  addDays,
  daysBetween,
  dueStatus,
  DUE_SOON_DAYS,
  formatDueRemaining,
  formatEventPeriod,
  isPaymentPending,
  selectPendingPayments,
  selectUpcomingCarryIns,
  UPCOMING_DAYS,
} from '../dashboardFormat'

/** テストの「今日」 */
const TODAY = '2026-10-21'

/**
 * ダッシュボードの1件を作る（over で上書き）
 * @param over - 上書きする項目
 * @returns テスト用の1件
 */
function item(over: Partial<AdminInfoDashboardItem> = {}): AdminInfoDashboardItem {
  return {
    event_id: 'e1',
    name: 'イベント',
    start_date: '2026-11-01',
    end_date: null,
    location: '東京',
    carry_in_time: null,
    carry_out_time: null,
    hotel_name: null,
    booth_fee: null,
    booth_fee_pay_method: null,
    booth_fee_due: null,
    booth_fee_paid: false,
    ...over,
  }
}

describe('daysBetween', () => {
  it('同じ日なら 0 になる', () => {
    expect(daysBetween(TODAY, TODAY)).toBe(0)
  })

  it('3日後なら 3、3日前なら -3 になる', () => {
    expect(daysBetween('2026-10-21', '2026-10-24')).toBe(3)
    expect(daysBetween('2026-10-24', '2026-10-21')).toBe(-3)
  })

  it('月をまたいでも正しく数える', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3)
  })

  it('年をまたいでも正しく数える', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
  })

  it('うるう年の2月29日をまたいでも正しく数える', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1)
  })

  it('不正な日付・存在しない日付・時刻付きは null になる', () => {
    expect(daysBetween('2026-02-30', TODAY)).toBeNull()
    expect(daysBetween(TODAY, '2026-13-01')).toBeNull()
    expect(daysBetween(TODAY, 'abc')).toBeNull()
    expect(daysBetween(TODAY, '')).toBeNull()
    expect(daysBetween(TODAY, '2026-10-21T09:00')).toBeNull()
    expect(daysBetween('2026/10/21', TODAY)).toBeNull()
  })
})

describe('addDays', () => {
  it('60日後は 2026-12-20 になる', () => {
    expect(addDays(TODAY, 60)).toBe('2026-12-20')
  })

  it('年末から足すと翌年になる', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('負の数で前に戻る', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('0日なら同じ日になる', () => {
    expect(addDays(TODAY, 0)).toBe(TODAY)
  })

  it('不正な日付なら null になる', () => {
    expect(addDays('2026-02-29', 1)).toBeNull()
    expect(addDays('', 1)).toBeNull()
  })
})

describe('dueStatus', () => {
  it('期限が昨日なら overdue になる', () => {
    expect(dueStatus('2026-10-20', TODAY)).toBe('overdue')
  })

  it('期限が今日なら soon になる', () => {
    expect(dueStatus(TODAY, TODAY)).toBe('soon')
  })

  it(`期限が ${DUE_SOON_DAYS} 日後なら soon、8日後なら later になる`, () => {
    expect(DUE_SOON_DAYS).toBe(7)
    expect(dueStatus('2026-10-28', TODAY)).toBe('soon')
    expect(dueStatus('2026-10-29', TODAY)).toBe('later')
  })

  it('月・年をまたぐ期限でも日数で判定する', () => {
    expect(dueStatus('2027-01-03', '2026-12-28')).toBe('soon')
    expect(dueStatus('2027-01-05', '2026-12-28')).toBe('later')
    expect(dueStatus('2026-12-31', '2027-01-01')).toBe('overdue')
  })

  it('期限が null・undefined・空・不正なら none になる', () => {
    expect(dueStatus(null, TODAY)).toBe('none')
    expect(dueStatus(undefined, TODAY)).toBe('none')
    expect(dueStatus('', TODAY)).toBe('none')
    expect(dueStatus('2026-02-30', TODAY)).toBe('none')
    expect(dueStatus('そのうち', TODAY)).toBe('none')
  })
})

describe('formatDueRemaining', () => {
  it('期限が今日なら「今日まで」になる', () => {
    expect(formatDueRemaining(TODAY, TODAY)).toBe('今日まで')
  })

  it('期限が3日後なら「あと3日」になる', () => {
    expect(formatDueRemaining('2026-10-24', TODAY)).toBe('あと3日')
  })

  it('期限が2日前なら「2日超過」になる', () => {
    expect(formatDueRemaining('2026-10-19', TODAY)).toBe('2日超過')
  })

  it('期限が未設定・不正なら null になる', () => {
    expect(formatDueRemaining(null, TODAY)).toBeNull()
    expect(formatDueRemaining('', TODAY)).toBeNull()
    expect(formatDueRemaining('abc', TODAY)).toBeNull()
  })
})

describe('isPaymentPending', () => {
  it('未払いで出店料が 0 より大きければ対象になる', () => {
    expect(isPaymentPending(item({ booth_fee: 1 }))).toBe(true)
  })

  it('未払いで期限だけ入っていれば対象になる', () => {
    expect(isPaymentPending(item({ booth_fee_due: '2026-10-30' }))).toBe(true)
  })

  it('出店料 0 円で期限なしなら対象外、期限ありなら対象になる', () => {
    expect(isPaymentPending(item({ booth_fee: 0 }))).toBe(false)
    expect(isPaymentPending(item({ booth_fee: 0, booth_fee_due: '2026-10-30' }))).toBe(true)
  })

  it('支払い済みなら出店料・期限があっても対象外になる', () => {
    expect(isPaymentPending(item({ booth_fee: 5000, booth_fee_due: '2026-10-30', booth_fee_paid: true }))).toBe(false)
  })

  it('出店料も期限も無ければ対象外になる', () => {
    expect(isPaymentPending(item())).toBe(false)
  })
})

describe('selectPendingPayments', () => {
  it('期限切れ → 7日以内 → それ以降 → 期限なし の順に並び、対象外は除かれる', () => {
    const items = [
      item({ event_id: 'none', booth_fee: 1000, booth_fee_due: null, start_date: '2026-11-10' }),
      item({ event_id: 'later', booth_fee: 1000, booth_fee_due: '2026-11-30' }),
      item({ event_id: 'paid', booth_fee: 1000, booth_fee_due: '2026-10-01', booth_fee_paid: true }),
      item({ event_id: 'soon', booth_fee: 1000, booth_fee_due: '2026-10-25' }),
      item({ event_id: 'overdue', booth_fee: 1000, booth_fee_due: '2026-10-01' }),
      item({ event_id: 'zero', booth_fee: 0 }),
    ]
    expect(selectPendingPayments(items, TODAY).map((i) => i.event_id)).toEqual(['overdue', 'soon', 'later', 'none'])
  })

  it('同じ状態の中では期限の早い順、期限なしどうしは開始日の早い順になる', () => {
    const items = [
      item({ event_id: 'soon-b', booth_fee: 1, booth_fee_due: '2026-10-27' }),
      item({ event_id: 'soon-a', booth_fee: 1, booth_fee_due: TODAY }),
      item({ event_id: 'none-b', booth_fee: 1, start_date: '2026-12-01' }),
      item({ event_id: 'none-a', booth_fee: 1, start_date: '2026-11-01' }),
      item({ event_id: 'over-b', booth_fee: 1, booth_fee_due: '2026-10-20' }),
      item({ event_id: 'over-a', booth_fee: 1, booth_fee_due: '2026-09-01' }),
    ]
    expect(selectPendingPayments(items, TODAY).map((i) => i.event_id)).toEqual([
      'over-a', 'over-b', 'soon-a', 'soon-b', 'none-a', 'none-b',
    ])
  })

  it('不正な期限は期限なしとして最後に並ぶ', () => {
    const items = [
      item({ event_id: 'bad', booth_fee: 1, booth_fee_due: '2026-02-30' }),
      item({ event_id: 'later', booth_fee: 1, booth_fee_due: '2027-01-01' }),
    ]
    expect(selectPendingPayments(items, TODAY).map((i) => i.event_id)).toEqual(['later', 'bad'])
  })

  it('元の配列の順番は変えない', () => {
    const items = [
      item({ event_id: 'b', booth_fee: 1, booth_fee_due: '2026-11-30' }),
      item({ event_id: 'a', booth_fee: 1, booth_fee_due: '2026-10-01' }),
    ]
    selectPendingPayments(items, TODAY)
    expect(items.map((i) => i.event_id)).toEqual(['b', 'a'])
  })

  it('空の配列なら空の配列を返す', () => {
    expect(selectPendingPayments([], TODAY)).toEqual([])
  })
})

describe('selectUpcomingCarryIns', () => {
  it(`開始日が今日〜${UPCOMING_DAYS}日後のものだけを開始日順に返す`, () => {
    const items = [
      item({ event_id: 'day61', start_date: '2026-12-21' }),
      item({ event_id: 'day60', start_date: '2026-12-20' }),
      item({ event_id: 'today', start_date: TODAY }),
      item({ event_id: 'yesterday', start_date: '2026-10-20', end_date: '2026-10-22' }),
      item({ event_id: 'day10', start_date: '2026-10-31' }),
    ]
    expect(selectUpcomingCarryIns(items, TODAY).map((i) => i.event_id)).toEqual(['today', 'day10', 'day60'])
  })

  it('日数を指定するとその範囲になる', () => {
    const items = [
      item({ event_id: 'd3', start_date: '2026-10-24' }),
      item({ event_id: 'd4', start_date: '2026-10-25' }),
    ]
    expect(selectUpcomingCarryIns(items, TODAY, 3).map((i) => i.event_id)).toEqual(['d3'])
  })

  it('年をまたぐ範囲でも正しく選ぶ', () => {
    const items = [item({ event_id: 'ny', start_date: '2027-01-15' })]
    expect(selectUpcomingCarryIns(items, '2026-12-01').map((i) => i.event_id)).toEqual(['ny'])
  })

  it('支払い済みかどうかに関係なく出す', () => {
    const items = [item({ event_id: 'paid', booth_fee: 1000, booth_fee_paid: true, start_date: '2026-11-01' })]
    expect(selectUpcomingCarryIns(items, TODAY)).toHaveLength(1)
  })

  it('今日が不正なら空の配列を返す', () => {
    expect(selectUpcomingCarryIns([item()], 'abc')).toEqual([])
  })
})

describe('formatEventPeriod', () => {
  it('1日だけなら開始日だけを曜日つきで表示する', () => {
    expect(formatEventPeriod('2026-10-24', null)).toBe('2026年10月24日（土）')
    expect(formatEventPeriod('2026-10-24', '2026-10-24')).toBe('2026年10月24日（土）')
  })

  it('同じ年の期間なら終了日の年を省く', () => {
    expect(formatEventPeriod('2026-10-24', '2026-10-25')).toBe('2026年10月24日（土）〜10月25日（日）')
  })

  it('年をまたぐ期間なら終了日にも年を付ける', () => {
    expect(formatEventPeriod('2026-12-31', '2027-01-01')).toBe('2026年12月31日（木）〜2027年1月1日（金）')
  })

  it('開始日が不正ならその文字列をそのまま返す', () => {
    expect(formatEventPeriod('未定', null)).toBe('未定')
  })

  it('終了日が不正なら開始日だけを表示する', () => {
    expect(formatEventPeriod('2026-10-24', 'xx')).toBe('2026年10月24日（土）')
  })
})
