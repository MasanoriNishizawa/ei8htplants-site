/*
 * イベントの保存（イベント本体と時間枠を 1 回で保存）で返る 409 を読み取る関数。
 * 409 の本文: { detail: "予約が入っている日時を…", conflicts: [{ date, time_label, count }] }
 * （detail の中に conflicts が入って返る形も読めるようにしておく）
 */
import { ApiError } from '../../../lib/api'
import type { SessionConflict, SessionConflictBody } from '../../../lib/apiTypes'
import { formatShortDateDow } from '../../../lib/wsDates'

/** conflicts が無い 409 のときに出す既定の案内 */
const DEFAULT_CONFLICT_DETAIL = '予約が入っている日時を変更・削除しようとしています。先に予約をキャンセルするか、別の日時へ変更してください。'

/**
 * 値が conflicts の 1 件の形か
 * @param v - 確かめる値
 * @returns SessionConflict の形なら true
 */
function isConflict(v: unknown): v is SessionConflict {
  if (typeof v !== 'object' || v === null) return false
  /** 項目を読むための見方 */
  const o = v as Record<string, unknown>
  return (o.date === null || typeof o.date === 'string')
    && (o.time_label === null || typeof o.time_label === 'string')
    && typeof o.count === 'number'
    && (o.participants === undefined || o.participants === null || typeof o.participants === 'number')
}

/**
 * 本文から conflicts の一覧を取り出す（本文の直下・detail の中のどちらでも）
 * @param body - 応答の本文（または detail）
 * @returns conflicts（無ければ null）
 */
function pickConflicts(body: unknown): SessionConflict[] | null {
  if (typeof body !== 'object' || body === null) return null
  /** 項目を読むための見方 */
  const o = body as Record<string, unknown>
  return Array.isArray(o.conflicts) ? o.conflicts.filter(isConflict) : null
}

/**
 * 保存の失敗が「予約が入っている日時を消そうとした」409 なら、案内と conflicts を返す
 * 1. ApiError の 409 だけを見る
 * 2. 本文の直下、無ければ detail の中から conflicts を探す
 * 3. 案内の文は detail の文字列（detail の中の detail）、無ければ既定の文
 * @param err - 保存の catch で受け取った値
 * @returns 409 の内容（それ以外のエラーは null）
 */
export function parseSessionConflicts(err: unknown): SessionConflictBody | null {
  // 1. 409 以外は扱わない
  if (!(err instanceof ApiError) || err.status !== 409) return null
  // 2. conflicts
  /** 移し先の無い予約 */
  const conflicts = pickConflicts(err.body) ?? pickConflicts(err.detail) ?? []
  // 3. 案内の文
  /** detail の中に入っている文（detail がオブジェクトの形のとき） */
  const nested = typeof err.detail === 'object' && err.detail !== null ? (err.detail as Record<string, unknown>).detail : undefined
  /** 画面に出す案内 */
  const detail = typeof err.detail === 'string' ? err.detail : typeof nested === 'string' ? nested : DEFAULT_CONFLICT_DETAIL
  return { detail, conflicts }
}

/**
 * conflicts の 1 件を「7/3（金） 13:00〜 に予約 2 件・3 名」の形にする
 * - 日付の無い予約は「日付なし」、時間枠の無い予約は「時間指定なし」
 * - 参加人数の合計が返っていれば「・N 名」を足す
 * @param c - conflicts の 1 件
 * @returns 表示用の文字列
 */
export function formatSessionConflict(c: SessionConflict): string {
  /** 日付の表示 */
  const date = c.date ? formatShortDateDow(c.date, 'ja') : '日付なし'
  /** 時間の表示 */
  const time = c.time_label ?? '時間指定なし'
  /** 人数の表示（返っていなければ出さない） */
  const people = typeof c.participants === 'number' ? `・${c.participants} 名` : ''
  return `${date} ${time} に予約 ${c.count} 件${people}`
}
