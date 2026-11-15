/*
 * イベント登録画面（EventForm.tsx）の「ワークショップの実施日と日ごとの時間枠」を扱う関数。
 * 画面の部品から分けて、テストで中身だけを確かめられるようにしている（state は持たない純粋な関数だけ）
 *
 * 実施のしかた（WsDateMode）
 * - 'all'   : 全日程で実施（共通の枠）。ws_dates は null、時間枠は session_date なしで保存する
 * - 'select': 実施する日を選ぶ。ws_dates に選んだ日、時間枠はその日の session_date つきで保存する
 * 'select' が有効なのは「ワークショップあり」かつ「複数日のイベント」のときだけ。それ以外は 'all' として扱う
 */
import type { WsSession, WsSessionInput } from '../../../lib/apiTypes'
import type { SessionInput } from '../eventTime'

/** ワークショップの実施のしかた（'all': 全日程で共通の枠 / 'select': 実施する日を選ぶ） */
export type WsDateMode = 'all' | 'select'

/** 日付（YYYY-MM-DD）→ その日の時間枠の入力 */
export type DailySessions = Record<string, SessionInput[]>

/**
 * 時間枠の入力を、送信・比較に使う形に写す（id は持っているときだけ付ける）
 * @param s - 時間枠の入力
 * @returns 写した時間枠
 */
function cloneSession(s: SessionInput): SessionInput {
  return s.id ? { id: s.id, time_label: s.time_label, max_participants: s.max_participants } : { time_label: s.time_label, max_participants: s.max_participants }
}

/**
 * 時間枠の入力から id を外した写しを作る（ほかの日へのコピーで、同じ枠の id が2つの日に入らないようにする）
 * @param sessions - 時間枠の入力
 * @returns id を外した写し
 */
export function copySessionsWithoutId(sessions: SessionInput[]): SessionInput[] {
  return sessions.map((s) => ({ time_label: s.time_label, max_participants: s.max_participants }))
}

/**
 * 時間が入っている枠か（時間が空の行は保存しない）
 * @param s - 時間枠の入力
 * @returns 時間が入っていれば true
 */
function hasLabel(s: SessionInput): boolean {
  return s.time_label.trim() !== ''
}

/**
 * 「全日程」から「日を選ぶ」に切り替えたときの初期値を作る
 * 1. 開催期間の全部の日を選んだ状態にする
 * 2. 各日に今の共通の枠をコピーする。既存の枠の id はどの日の写しにも残し、保存のときに最初の日の分だけ使う
 *    （最初の日を外しても、残った日で既存の枠を引き継げるようにする。重複は buildSessionsPayload で外す）
 * @param dates - 開催期間の日付（YYYY-MM-DD）
 * @param common - 今の共通の枠
 * @returns 選んだ日と、日ごとの枠
 */
export function startDateSelection(dates: string[], common: SessionInput[]): { wsDates: string[]; dailySessions: DailySessions } {
  /** 日ごとの枠 */
  const dailySessions: DailySessions = {}
  dates.forEach((d) => {
    dailySessions[d] = common.map(cloneSession)
  })
  return { wsDates: [...dates], dailySessions }
}

/**
 * 「日を選ぶ」から「全日程」に戻したときの共通の枠を作る
 * 最初に選んでいた日（日付の昇順で最初）の枠を共通の枠にする。ほかの日の枠は消える
 * @param wsDates - 選んでいる日（開催期間に入っている日だけ）
 * @param dailySessions - 日ごとの枠
 * @returns 共通の枠と、消える枠の数（時間が入っている枠だけ数える）
 */
export function collapseToCommon(wsDates: string[], dailySessions: DailySessions): { sessions: SessionInput[]; lostCount: number } {
  /** 日付の昇順に並べた選んでいる日 */
  const sorted = [...wsDates].sort()
  /** 共通の枠の元にする日 */
  const first = sorted[0]
  /** 共通の枠 */
  const sessions = first ? (dailySessions[first] ?? []).map(cloneSession) : []
  /** 消える枠の数（最初の日以外で、時間が入っている枠） */
  const lostCount = sorted.slice(1).reduce((n, d) => n + (dailySessions[d] ?? []).filter(hasLabel).length, 0)
  return { sessions, lostCount }
}

/**
 * 編集で開いたときに、読み込んだ時間枠を共通の枠と日ごとの枠に分ける
 * @param sessions - 読み込んだ時間枠（GET /events/{id}/sessions。日付の指定なしで全部）
 * @returns 共通の枠（session_date なし）と、日ごとの枠
 */
export function splitLoadedSessions(sessions: WsSession[]): { common: SessionInput[]; daily: DailySessions } {
  /** 共通の枠 */
  const common: SessionInput[] = []
  /** 日ごとの枠 */
  const daily: DailySessions = {}
  // 表示順に並べてから振り分ける
  ;[...sessions].sort((a, b) => a.display_order - b.display_order).forEach((s) => {
    /** 画面の入力の形 */
    const input: SessionInput = { id: s.id, time_label: s.time_label, max_participants: s.max_participants }
    if (s.session_date) {
      daily[s.session_date] = [...(daily[s.session_date] ?? []), input]
    } else {
      common.push(input)
    }
  })
  return { common, daily }
}

/**
 * 「日を選ぶ」で、今の開催期間に入っている選んだ日だけを返す（開催期間を変えて外れた日は除く）
 * @param wsDates - 選んだ日
 * @param eventDates - 今の開催期間の日付
 * @returns 開催期間に入っている選んだ日（日付の昇順）
 */
export function effectiveWsDates(wsDates: string[], eventDates: string[]): string[] {
  /** 選んだ日 */
  const picked = new Set(wsDates)
  return eventDates.filter((d) => picked.has(d))
}

/**
 * 保存で送る時間枠を作る（時間が空の行は送らない）
 * - 'select' が有効: 選んだ日ごとの枠に session_date を付ける。同じ id が2つ以上の日にあるときは、最初の日の分だけ id を残す
 * - それ以外: 共通の枠を session_date なしで送る（今までと同じ形）
 * - ワークショップなし: 空（全部消す）
 * @param params.hasWorkshop - ワークショップありか
 * @param params.selectActive - 「日を選ぶ」が有効か
 * @param params.wsDates - 開催期間に入っている選んだ日
 * @param params.common - 共通の枠
 * @param params.daily - 日ごとの枠
 * @returns PUT /events/{id}/sessions に送る一覧
 */
export function buildSessionsPayload(params: {
  hasWorkshop: boolean
  selectActive: boolean
  wsDates: string[]
  common: SessionInput[]
  daily: DailySessions
}): WsSessionInput[] {
  const { hasWorkshop, selectActive, wsDates, common, daily } = params
  // 1. ワークショップなしは全部消す
  if (!hasWorkshop) return []
  // 2. 全日程は共通の枠（session_date を付けない）
  if (!selectActive) return common.filter(hasLabel)
  // 3. 日を選ぶは、選んだ日ごとに session_date を付ける（同じ id は最初の 1 回だけ残し、2 回目からは新しい枠として送る）
  /** すでに使った枠の id */
  const usedIds = new Set<string>()
  return wsDates.flatMap((d) => (daily[d] ?? []).filter(hasLabel).map((s) => {
    /** 送る 1 件（id は重複していなければ残す） */
    const item: WsSessionInput = { ...cloneSession(s), session_date: d }
    if (s.id && usedIds.has(s.id)) delete item.id
    else if (s.id) usedIds.add(s.id)
    return item
  }))
}

/**
 * 未保存の変更の判定に使う、実施日と日ごとの枠の値（「日を選ぶ」が有効でないときは空にそろえる）
 * @param selectActive - 「日を選ぶ」が有効か
 * @param wsDates - 開催期間に入っている選んだ日
 * @param daily - 日ごとの枠
 * @returns 比べるための値
 */
export function wsScheduleSnapshot(selectActive: boolean, wsDates: string[], daily: DailySessions): { mode: WsDateMode; dates: string[]; daily: DailySessions } {
  if (!selectActive) return { mode: 'all', dates: [], daily: {} }
  /** 選んだ日の枠だけ */
  const picked: DailySessions = {}
  wsDates.forEach((d) => { picked[d] = daily[d] ?? [] })
  return { mode: 'select', dates: wsDates, daily: picked }
}

/** 編集で開いたときの枠の振り分け結果（食い違いを補正したもの） */
export interface LoadedSchedule {
  /** 共通の枠（画面の「全日程」の枠） */
  common: SessionInput[]
  /** 日ごとの枠（「日を選ぶ」のとき。選んだ実施日の分だけ） */
  daily: DailySessions
  /** 食い違いを補正したときの案内（補正が無ければ空。1 件でもあれば「保存し直してください」と出す） */
  notices: string[]
}

/**
 * 時間枠の表示（例: 7/3（土）11:00〜12:00。日付の無い枠は表示名だけ）
 * @param s - 時間枠
 * @returns 表示用の文字列
 */
function describeSession(s: WsSession): string {
  if (!s.session_date) return s.time_label
  /** 日付の部分（月/日） */
  const [, m, d] = s.session_date.split('-').map(Number)
  return `${m}/${d} ${s.time_label}`
}

/**
 * 編集で開いたときに、読み込んだ枠を画面の形に振り分け、実施日の設定との食い違いを黙って捨てずに補正する
 * - 「日を選ぶ」のイベントに共通の枠（session_date なし）が残っている → 各実施日へコピーして表示する（同じ時間の枠がその日にあればコピーしない）
 * - 「日を選ぶ」のイベントに、実施日でない日の枠が残っている → 表示できないので案内に出す（保存すると消える）
 * - 「全日程」のイベントに日付つきの枠が残っている → 共通の枠としてまとめて表示する（同じ時間の枠は 1 つにする）
 * @param sessions - 読み込んだ時間枠（GET /events/{id}/sessions。日付の指定なしで全部）
 * @param selectActive - 「日を選ぶ」で開くか（WS あり・複数日・ws_dates あり）
 * @param wsDates - 実施日（開催期間に入っている日だけ。「全日程」なら空）
 * @returns 共通の枠・日ごとの枠・補正の案内
 */
export function reconcileLoadedSessions(sessions: WsSession[], selectActive: boolean, wsDates: string[]): LoadedSchedule {
  /** 共通の枠と日ごとの枠に分けたもの */
  const split = splitLoadedSessions(sessions)
  /** 補正の案内 */
  const notices: string[] = []
  /** 表示順に並べた枠 */
  const ordered = [...sessions].sort((a, b) => a.display_order - b.display_order)
  if (!selectActive) {
    // 1. 全日程: 日付つきの枠が無ければ、今までどおり全部を共通の枠にする（読み込んだ順のまま）
    if (!sessions.some((s) => s.session_date)) {
      return { common: sessions.map((s) => ({ id: s.id, time_label: s.time_label, max_participants: s.max_participants })), daily: {}, notices }
    }
    // 2. 日付つきの枠があれば、同じ時間の枠を 1 つにまとめて共通の枠にする
    /** まとめた共通の枠 */
    const common: SessionInput[] = []
    ordered.forEach((s) => {
      if (!common.some((c) => c.time_label === s.time_label)) common.push({ id: s.id, time_label: s.time_label, max_participants: s.max_participants })
    })
    notices.push(`全日程で実施するイベントに日付つきの枠（${ordered.filter((s) => s.session_date).map(describeSession).join('、')}）が残っていたため、共通の枠としてまとめて表示しています。`)
    return { common, daily: {}, notices }
  }
  // 3. 日を選ぶ: 実施日ごとに、その日の枠と、残っていた共通の枠のコピー
  /** 日ごとの枠 */
  const daily: DailySessions = {}
  wsDates.forEach((d) => {
    /** その日の枠 */
    const own = split.daily[d] ?? []
    daily[d] = [...own, ...split.common.filter((c) => !own.some((o) => o.time_label === c.time_label)).map(cloneSession)]
  })
  if (split.common.length > 0) {
    notices.push(`日を選んで実施するイベントに全日程で共通の枠（${split.common.map((s) => s.time_label).join('、')}）が残っていたため、各実施日にコピーして表示しています。`)
  }
  /** 実施日でない日の枠 */
  const orphans = ordered.filter((s) => s.session_date && !wsDates.includes(s.session_date))
  if (orphans.length > 0) {
    notices.push(`実施日でない日の枠（${orphans.map(describeSession).join('、')}）が残っています。このまま保存すると消えます（予約が入っていれば保存は止まります）。`)
  }
  return { common: split.common, daily, notices }
}
