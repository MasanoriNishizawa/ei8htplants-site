/*
 * イベントの開催時間（「10:00〜17:00」の形の文字列）を扱う関数と定数
 * イベントの編集画面（EventForm.tsx）で使う。部品のファイルから分けて、開発中の画面の自動更新（Fast Refresh）が効くようにしている
 */
import { WS_AUTO_SESSION_CAPACITY, WS_SLOT_MINUTES } from '../../lib/constants'

/** 時間帯の文字列（「10:00〜17:00」。区切りは 〜 ~ - のどれでもよい）から開始・終了の時・分を取り出す正規表現 */
const TIME_RANGE_RE = /(\d{1,2}):(\d{2})\s*[〜~-]\s*(\d{1,2}):(\d{2})/

/** 時間帯の文字列の全体が「開始〜終了」だけでできているかを確かめる正規表現（開始・終了の「HH:MM」を取り出す） */
const TIME_RANGE_EXACT_RE = /^(\d{1,2}:\d{2})\s*[〜~-]\s*(\d{1,2}:\d{2})$/

/** WS の時間枠 1 回分の入力（id は既存のセッションだけ持つ） */
export type SessionInput = { id?: string; time_label: string; max_participants: number }

/**
 * 時刻の選択肢（"8:00" のような形）を一定の間隔で作る
 * @param fromMin - 最初の時刻（0 時からの分）
 * @param toMin - 最後の時刻（0 時からの分。これも含む）
 * @param step - 間隔（分）
 * @returns 時刻の文字列の一覧
 */
function genTimes(fromMin: number, toMin: number, step = 30): string[] {
  /** 作った時刻の文字列の一覧 */
  const times: string[] = []
  for (let m = fromMin; m <= toMin; m += step) {
    times.push(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`)
  }
  return times
}

/** 開始時刻の選択肢（8:00〜14:00、30 分刻み） */
export const TIME_START_OPTIONS = genTimes(8 * 60, 14 * 60)
/** 終了時刻の選択肢（12:00〜22:00、30 分刻み） */
export const TIME_END_OPTIONS = genTimes(12 * 60, 22 * 60)

/**
 * 「10:00〜17:00」の形の文字列を開始・終了に分ける（区切りは 〜 ~ - のどれでもよい）
 * @param value - 時間帯の文字列
 * @returns [開始, 終了]。形が合わなければ ['', '']
 */
export function parseTimeRange(value: string): [string, string] {
  const m = value.match(TIME_RANGE_EXACT_RE)
  return m ? [m[1], m[2]] : ['', '']
}

/**
 * 開催時間の文字列に「開始〜終了」の時間帯が含まれているか（WS の時間枠の自動作成ボタンを押せるかどうか）
 * @param time - 開催時間の文字列
 * @returns 含まれていれば true
 */
export function hasTimeRange(time: string): boolean {
  return TIME_RANGE_RE.test(time)
}

/**
 * 分（0 時から）を「09:00」の形にする
 * @param m - 0 時からの分
 * @returns HH:MM
 */
function formatHm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * 開催時間から WS の時間枠を 1 時間刻みで作る
 * 開始・終了の 1 時間ずつは準備・片付けとして空け、そのあいだを WS_SLOT_MINUTES 分ずつの枠にする（定員は WS_AUTO_SESSION_CAPACITY 人）
 * 例: '10:00〜17:00' → 11:00〜12:00、12:00〜13:00、…、15:00〜16:00
 * @param time - 開催時間の文字列
 * @returns 時間枠の一覧（時間帯が読み取れない・枠が作れないときは空配列）
 */
export function buildAutoSessions(time: string): SessionInput[] {
  // 1. 開催時間から開始・終了の時刻を読み取る（読み取れなければ枠は作らない）
  const match = time.match(TIME_RANGE_RE)
  if (!match) return []
  /** 開催の開始時刻（0 時からの分） */
  const eventStart = parseInt(match[1]) * 60 + parseInt(match[2])
  /** 開催の終了時刻（0 時からの分） */
  const eventEnd = parseInt(match[3]) * 60 + parseInt(match[4])
  /** 作った時間枠の一覧 */
  const generated: SessionInput[] = []
  // 2. 開始 1 枠ぶん後から、終了 1 枠ぶん前に収まるところまで、枠を順に作る
  for (let t = eventStart + WS_SLOT_MINUTES; t + WS_SLOT_MINUTES <= eventEnd - WS_SLOT_MINUTES; t += WS_SLOT_MINUTES) {
    generated.push({ time_label: `${formatHm(t)}〜${formatHm(t + WS_SLOT_MINUTES)}`, max_participants: WS_AUTO_SESSION_CAPACITY })
  }
  return generated
}
