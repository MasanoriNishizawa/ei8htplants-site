/**
 * WS の時間枠の並べ替えに使う関数（pages/admin/eventTime.ts の parseStartMinutes・sortSessionsByTime・moveItem）のテスト（2026-11-16 追加）
 * - parseStartMinutes: 表示の最初の時刻を 0 時からの分で読む（全角・「時」「時分」の形も読む。コロンの形は分を 2 桁必須。
 *   長い数字の途中からは読まない。「時」の形で分を省いたとみなすのは、「時」のあとに数字が続かないときだけ。
 *   あり得ない時刻・時刻の無い表示は null）
 * - sortSessionsByTime: 早い順に並べる（同じ時刻は元の順・読めない枠は元の順のまま末尾・id などは変えない・変わらなければ null）
 * - moveItem: 1 つ上・1 つ下へ動かす（端から外へは動かさない・元の配列は変えない）
 * 純粋な関数だけなので、API・画面は使わない
 */
import { describe, it, expect } from 'vitest'
import { moveItem, parseStartMinutes, sortSessionsByTime, type SessionInput } from '../eventTime'

describe('parseStartMinutes（最初の時刻を分で読む）', () => {
  it.each([
    ['11:00〜12:00', 660],
    ['9:30〜', 570],
    ['13時', 780],
    ['13時30分', 810],
    ['１３：００', 780],
    ['13時30', 810],
    [' 9:05 ', 545],
    ['0:00', 0],
    ['0時', 0],
    ['第2部 14:00〜', 840],
    ['10:00-11:00', 600],
    ['9時〜', 540],
    ['13時 30分', 810],
    // 「半」は分として読まない（「9時」のところまでで 9:00）
    ['9時半', 540],
  ])('FE-EX-01 「%s」は %i 分と読む', (label, expected) => {
    expect(parseStartMinutes(label)).toBe(expected)
  })

  it.each([
    ['午後'],
    ['9:'],
    ['9:xx'],
    ['123:00'],
    ['24:00'],
    ['〜'],
    ['13:60'],
    // 「時」のあとに 3 桁以上の数字が続くときは、分を省いたとみなさない（「9時123分」を 9:00 にしない）
    ['9時123分'],
    ['9時999分'],
    ['9時 999分'],
    [''],
  ])('FE-EX-02 「%s」は読み取れず null', (label) => {
    expect(parseStartMinutes(label)).toBeNull()
  })
})

describe('sortSessionsByTime（時間順に並べる）', () => {
  /** 枠を 1 件作る */
  const s = (time_label: string, id?: string): SessionInput => (id ? { id, time_label, max_participants: 5 } : { time_label, max_participants: 5 })

  it('FE-EX-03 早い順に並べ、id・定員などの中身はそのまま保つ', () => {
    const a = s('13:00〜14:00', 'a'); const b = s('9:30〜10:30', 'b'); const c = { ...s('11時'), max_participants: 8 }
    expect(sortSessionsByTime([a, b, c])).toEqual([b, c, a])
    // 同じもの（参照）を並べ替えるだけ
    expect(sortSessionsByTime([a, b, c])?.[0]).toBe(b)
  })

  it('FE-EX-04 同じ時刻の枠は元の順を保つ', () => {
    const x = s('11:00', 'x'); const y = s('11:00〜11:30', 'y'); const early = s('10:00', 'e')
    expect(sortSessionsByTime([x, y, early])).toEqual([early, x, y])
  })

  it('FE-EX-05 読めない枠は元の順のまま末尾にまとめる', () => {
    const n1 = s('未定', 'n1'); const t = s('15:00', 't'); const n2 = s('午後', 'n2'); const u = s('10:00', 'u')
    expect(sortSessionsByTime([n1, t, n2, u])).toEqual([u, t, n1, n2])
  })

  it('FE-EX-06 すでに時間順なら null（並びが変わらない）。0 件・1 件・読めない枠だけでも null', () => {
    expect(sortSessionsByTime([s('9:00'), s('10:00'), s('未定')])).toBeNull()
    expect(sortSessionsByTime([])).toBeNull()
    expect(sortSessionsByTime([s('10:00')])).toBeNull()
    expect(sortSessionsByTime([s('未定'), s('午後')])).toBeNull()
  })

  it('FE-EX-07 元の配列は変えない', () => {
    const list = [s('13:00', 'a'), s('9:00', 'b')]
    sortSessionsByTime(list)
    expect(list.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('moveItem（1 つ上・下へ動かす）', () => {
  it('FE-EX-08 上へ・下へ入れ替える（元の配列は変えない）', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('FE-EX-09 先頭を上へ・末尾を下へ・範囲外の位置は動かさず、元の一覧をそのまま返す', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 0, -1)).toBe(list)
    expect(moveItem(list, 2, 1)).toBe(list)
    expect(moveItem(list, -1, 1)).toBe(list)
    expect(moveItem(list, 3, -1)).toBe(list)
    expect(moveItem([], 0, 1)).toEqual([])
  })
})
