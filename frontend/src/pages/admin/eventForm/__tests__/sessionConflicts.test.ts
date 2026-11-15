/**
 * イベントの保存で返る 409（予約が入っている日時を消そうとした）の読み取り（pages/admin/eventForm/sessionConflicts.ts）のテスト（2026-11-13 追加）
 * - parseSessionConflicts: ApiError の 409 だけを読む。conflicts は本文の直下・detail の中のどちらでも読める。
 *   形の違う項目は捨てる。案内の文は detail の文字列（detail の中の detail）、無ければ既定の文
 * - formatSessionConflict: 「7/2（金） 11:00〜12:00 に予約 2 件」の形（日付の無い予約は「日付なし」、時間枠の無い予約は「時間指定なし」、
 *   参加人数が返っていれば「・3 名」を足す。2026-11-13 に time_label の null と participants を追加）
 * 純粋な関数だけなので、API・画面は使わない
 */
import { describe, it, expect } from 'vitest'
import { ApiError } from '../../../../lib/api'
import { formatSessionConflict, parseSessionConflicts } from '../sessionConflicts'

/** サーバーの 409 の案内 */
const DETAIL = '予約が入っている日時を変更・削除しようとしています。先に予約をキャンセルするか、別の日時へ変更してください。'
/** 移し先の無い予約 1 件 */
const CONFLICT = { date: '2027-07-02', time_label: '11:00〜12:00', count: 2 }

describe('parseSessionConflicts', () => {
  it('FE-EU-01 本文の直下に conflicts がある 409 は、detail と conflicts を返す', () => {
    const err = new ApiError(409, `409 ${DETAIL}`, DETAIL, { detail: DETAIL, conflicts: [CONFLICT] })
    expect(parseSessionConflicts(err)).toEqual({ detail: DETAIL, conflicts: [CONFLICT] })
  })

  it('FE-EU-02 detail の中に detail と conflicts が入った形（FastAPI の HTTPException(detail={...})）も読める', () => {
    const err = new ApiError(409, '409', { detail: DETAIL, conflicts: [CONFLICT] }, { detail: { detail: DETAIL, conflicts: [CONFLICT] } })
    expect(parseSessionConflicts(err)).toEqual({ detail: DETAIL, conflicts: [CONFLICT] })
  })

  it('FE-EU-03 conflicts の中の形の違う項目（count が数でない・time_label が無いなど）は捨てる。date が null の予約は残す', () => {
    const err = new ApiError(409, '409', DETAIL, {
      conflicts: [CONFLICT, { date: null, time_label: '13:00', count: 1 }, { date: '2027-07-02', count: 1 }, { date: '2027-07-02', time_label: 'x', count: '1' }, null],
    })
    expect(parseSessionConflicts(err)?.conflicts).toEqual([CONFLICT, { date: null, time_label: '13:00', count: 1 }])
  })

  it('FE-EU-04 conflicts も detail の文字も無い 409 は、既定の案内と空の一覧', () => {
    expect(parseSessionConflicts(new ApiError(409, '409', null, null))).toEqual({ detail: DETAIL, conflicts: [] })
  })

  it('FE-EU-05 409 以外（422・500・ApiError でない値）は null', () => {
    expect(parseSessionConflicts(new ApiError(422, '422', 'bad', { conflicts: [CONFLICT] }))).toBeNull()
    expect(parseSessionConflicts(new ApiError(500, '500', 'err'))).toBeNull()
    expect(parseSessionConflicts(new Error('409'))).toBeNull()
    expect(parseSessionConflicts({ status: 409 })).toBeNull()
  })
})

describe('formatSessionConflict', () => {
  it('FE-EU-06 「7/2（金） 11:00〜12:00 に予約 2 件」の形になる', () => {
    expect(formatSessionConflict(CONFLICT)).toBe('7/2（金） 11:00〜12:00 に予約 2 件')
  })

  it('FE-EU-07 日付の無い予約は「日付なし」', () => {
    expect(formatSessionConflict({ date: null, time_label: '13:00〜14:00', count: 1 })).toBe('日付なし 13:00〜14:00 に予約 1 件')
  })
})

describe('parseSessionConflicts・formatSessionConflict（時間枠なし・参加人数。2026-11-13 追加）', () => {
  it('FE-EU-08 time_label が null（時間枠なしの予約）・participants つきの項目も読み取る（participants が数でない項目は捨てる）', () => {
    const err = new ApiError(409, '409', DETAIL, {
      conflicts: [
        { date: '2027-07-04', time_label: null, count: 2, participants: 3 },
        { date: null, time_label: null, count: 1, participants: null },
        { date: '2027-07-02', time_label: '11:00〜12:00', count: 1, participants: '2' },
      ],
    })
    expect(parseSessionConflicts(err)?.conflicts).toEqual([
      { date: '2027-07-04', time_label: null, count: 2, participants: 3 },
      { date: null, time_label: null, count: 1, participants: null },
    ])
  })

  it('FE-EU-09 time_label が null なら「時間指定なし」と出す', () => {
    expect(formatSessionConflict({ date: '2027-07-04', time_label: null, count: 2 })).toBe('7/4（日） 時間指定なし に予約 2 件')
  })

  it('FE-EU-10 date も time_label も null なら「日付なし 時間指定なし」と出す', () => {
    expect(formatSessionConflict({ date: null, time_label: null, count: 1 })).toBe('日付なし 時間指定なし に予約 1 件')
  })

  it('FE-EU-11 participants が返っていれば「予約 2 件・3 名」と人数を足す', () => {
    expect(formatSessionConflict({ date: '2027-07-02', time_label: '11:00〜12:00', count: 2, participants: 3 })).toBe('7/2（金） 11:00〜12:00 に予約 2 件・3 名')
    expect(formatSessionConflict({ date: null, time_label: null, count: 1, participants: 2 })).toBe('日付なし 時間指定なし に予約 1 件・2 名')
  })

  it('FE-EU-12 participants が無い・null なら人数は出さない（0 名は出す）', () => {
    expect(formatSessionConflict({ date: '2027-07-02', time_label: '11:00〜12:00', count: 2, participants: null })).toBe('7/2（金） 11:00〜12:00 に予約 2 件')
    expect(formatSessionConflict({ date: '2027-07-02', time_label: '11:00〜12:00', count: 2 })).toBe('7/2（金） 11:00〜12:00 に予約 2 件')
    expect(formatSessionConflict({ date: '2027-07-02', time_label: '11:00〜12:00', count: 0, participants: 0 })).toBe('7/2（金） 11:00〜12:00 に予約 0 件・0 名')
  })
})
