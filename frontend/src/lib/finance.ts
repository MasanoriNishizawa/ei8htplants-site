/*
 * イベントの収支の計算（純粋関数）
 *
 * 管理画面の「収支」（EventFinance・Finances）・「WS 集計」・「手伝い支払い」で使う。
 * 以前は lib/api.ts にあったが、API 呼び出しと計算を分けるためここへ移した（api.ts からも再 export している）
 */
import type { EventFinances } from './api'
import { parseLocalDate } from './localDate'
import {
  FUEL_EFFICIENCY_KM_PER_L,
  HELPER_SALES_SHARE_RATE,
  HELPER_WS_SHARE_RATE,
  WS_FEE_YEN,
  WS_MATERIAL_COST_YEN,
} from './constants'

/** computeFinances の計算結果 */
export interface ComputedFinances {
  /** 交通費（往復の距離 ÷ 燃費 × ガソリン単価） */
  transport: number
  /** WS 売上（参加人数 × 参加費） */
  wsSales: number
  /** WS 資材費（参加人数 × 資材費） */
  wsCost: number
  /** 支出の合計（出店料・交通費・高速代・宿泊費・その他） */
  totalExpense: number
  /** 純利益（支払いフラグありなら手伝いへの支払いも引いた額） */
  net: number
  /** 手伝いへの支払いのうち売上利益の分 */
  salesShare: number
  /** 手伝いへの支払いのうち WS 売上の分 */
  wsShare: number
  /** 手伝いへの支払いの合計 */
  paymentAmount: number
}

/**
 * 日付の文字列から会計年度（4 月始まり）を返す。例: 2026-02-01 → 2025
 * 日付だけの文字列は現地の日付として読む（UTC として読んで前日になるのを防ぐ）
 * @param dateStr - 日付（YYYY-MM-DD）
 * @returns 会計年度（その年度が始まる年）
 */
export function fiscalYear(dateStr: string): number {
  // 日付文字列をローカル日付として扱い、月と年を取り出す
  const d = parseLocalDate(dateStr)
  // 1〜12 の月
  const month = d.getMonth() + 1
  return month >= 4 ? d.getFullYear() : d.getFullYear() - 1
}

/**
 * イベントの収支データから交通費・WS の売上と資材費・純利益・手伝いへの支払いを計算する
 * 1. 交通費と支出の合計を出す
 * 2. ワークショップがあれば WS 売上・資材費を出す
 * 3. 支払いフラグがあれば手伝いへの支払い（売上利益 × 20% + WS 売上 × 70%）を出して純利益から引く
 * @param fin - イベントの収支データ
 * @param hasWorkshop - ワークショップを開くイベントなら true
 * @returns 計算結果
 */
export function computeFinances(fin: EventFinances, hasWorkshop: boolean): ComputedFinances {
  // 1. 交通費 = 往復の距離 ÷ 燃費 × ガソリン単価
  const transport = Math.round((fin.distance * 2 / FUEL_EFFICIENCY_KM_PER_L) * fin.gas_price)
  // 支出の合計 = 出店料 + 交通費 + 高速代 + 宿泊費 + その他
  const totalExpense = fin.booth_fee + transport + fin.expressway_toll + fin.accommodation + fin.other_expenses
  // 2. WS 売上・資材費（ワークショップが無いイベントは 0）
  const wsSales = hasWorkshop ? fin.ws_participants * WS_FEE_YEN : 0
  const wsCost = hasWorkshop ? fin.ws_participants * WS_MATERIAL_COST_YEN : 0
  // 支払い前の純利益 = 売上 − 支出 − WS 資材費
  const net = fin.sales - totalExpense - wsCost

  // 3. 支払いフラグあり: (売上 - WS売上 - 支出) × 20% + WS売上 × 70%。マイナスの場合もそのまま反映する
  if (fin.payment_flag) {
    const salesShare = Math.round((fin.sales - wsSales - totalExpense) * HELPER_SALES_SHARE_RATE)
    const wsShare = Math.round(wsSales * HELPER_WS_SHARE_RATE)
    const paymentAmount = salesShare + wsShare
    return { transport, wsSales, wsCost, totalExpense, net: net - paymentAmount, salesShare, wsShare, paymentAmount }
  }

  return { transport, wsSales, wsCost, totalExpense, net, salesShare: 0, wsShare: 0, paymentAmount: 0 }
}
