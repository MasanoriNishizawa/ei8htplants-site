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
  // 文字列全体が時間帯形式かを確かめ、開始時刻と終了時刻を取り出す。
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

/**
 * 時間の文字の最初の時刻（「11:00」「9:30」「13時」「13時30分」など）を取り出す正規表現（数字・区切りは半角に直してから使う）
 * - コロンの形は分を 2 桁必須にする（「9:」「9:xx」は読み取らない）
 * - 「時」の形は分を省ける（「13時」は 13:00）。ただし省いたとみなすのは、「時」のあとに数字が続かないときだけ
 *   （「9時123分」「9時 999分」のような不正な分を、0 分と読み替えないため）
 * - 長い数字の途中（「123:00」の「23:00」など）は読み取らないよう、時の前が数字でないことと、分のあとが数字でないことを確かめる
 * - 古い Safari でも動くよう、後ろ読み（(?<!…)）は使わず、時の前の 1 文字を「先頭か数字以外」として読む
 * グループ: [1][2] がコロンの形の時・分、[3][4] が「時」の形の時・分
 */
const FIRST_TIME_RE = /(?:^|[^\d])(\d{1,2})\s*:\s*(\d{2})(?!\d)|(?:^|[^\d])(\d{1,2})\s*時(?:\s*(\d{1,2})(?!\d)\s*分?|(?!\s*\d))/

/**
 * 時間枠の表示（例「11:00〜12:00」「9:30〜」「13時」「１３：００」）から、最初の時刻を 0 時からの分で読み取る
 * 1. 全角の数字・コロンを半角に直す
 * 2. 最初の「時:分」「時時」「時時分」を探す
 * 3. 時は 0〜23、分は 0〜59 のときだけ使う
 * @param label - 時間枠の表示
 * @returns 0 時からの分（読み取れなければ null）
 */
export function parseStartMinutes(label: string): number | null {
  // 1. 全角の数字（０〜９）とコロン（：）を半角にする
  /** 半角にそろえた表示 */
  const normalized = label
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
  // 2. 最初の時刻
  const m = normalized.match(FIRST_TIME_RE)
  if (!m) return null
  /** 時（コロンの形なら [1]、「時」の形なら [3]） */
  const h = Number(m[1] ?? m[3])
  /** 分（コロンの形なら [2]。「時」の形で分が無ければ 0） */
  const min = m[1] !== undefined ? Number(m[2]) : m[4] === undefined ? 0 : Number(m[4])
  // 3. あり得ない時刻は読み取れなかったことにする
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * 時間枠を、表示の最初の時刻の早い順に並べ直す（安定な並べ替え。id などの中身は変えない）
 * - 時刻を読み取れない枠は、元の順番のまま末尾にまとめる
 * - 同じ時刻どうしは元の順番を保つ
 * @param sessions - 時間枠の入力
 * @returns 並べ直した一覧。並びが変わらないときは null（呼び出し側は何もしない）
 */
export function sortSessionsByTime(sessions: SessionInput[]): SessionInput[] | null {
  // 1. 元の位置と読み取った時刻を組にする
  /** [元の位置, 時刻（読み取れなければ null）, 枠] の一覧 */
  const keyed = sessions.map((s, i) => ({ i, t: parseStartMinutes(s.time_label), s }))
  // 2. 時刻のある枠は早い順（同じなら元の順）、読み取れない枠は末尾に元の順
  keyed.sort((a, b) => {
    if (a.t === null && b.t === null) return a.i - b.i
    if (a.t === null) return 1
    if (b.t === null) return -1
    return a.t - b.t || a.i - b.i
  })
  // 3. 並びが変わらなければ null
  if (keyed.every((k, idx) => k.i === idx)) return null
  return keyed.map((k) => k.s)
}

/**
 * 一覧の 1 件を 1 つ上・1 つ下へ動かす（端から外へは動かさない）
 * @param list - 一覧
 * @param index - 動かす位置
 * @param direction - -1 で上へ、1 で下へ
 * @returns 動かした新しい一覧（動かせなければ元の一覧）
 */
export function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  /** 入れ替える相手の位置 */
  const target = index + direction
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list
  /** 入れ替えた一覧 */
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
