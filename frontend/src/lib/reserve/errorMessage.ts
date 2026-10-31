import { ApiError } from '../api'

/** 現在の表示言語に合わせる翻訳関数 */
type Translate = <T>(ja: T, en: T) => T

/** 予約受付の終了を示すAPI detail。サーバー側の文言との照合に使う */
const RESERVE_CLOSED_DETAILS = [
  'このイベントの予約受付は終了しています',
  'この日の予約受付は終了しています',
]

/** 予約日または時間枠の不一致を示すAPI detail */
const RESERVE_MISMATCH_DETAILS = [
  '予約日がイベントの開催期間外です',
  'ワークショップの時間枠が正しくありません',
]

/**
 * 予約送信時のHTTP 400エラーを、detailの種類と表示言語に応じた案内文へ変換する。
 * 1. 文字列detailが受付終了・日付や時間枠の不一致に一致するか判定する
 * 2. 日本語では既存のサーバー文言を保ち、英語では対応する案内文を返す
 * 3. 未知のdetailやApiError以外は、日付と時間を選び直す案内へ戻す
 * @param err - 予約送信処理のcatchで受け取った値
 * @param t - 日本語と英語の文言から現在の表示言語を選ぶ関数
 * @returns 予約画面に表示するエラー案内
 */
export function reserve400Message(err: unknown, t: Translate): string {
  // detailが文字列の場合だけ分類に使い、それ以外の形式は未知として扱う
  const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : ''
  if (RESERVE_CLOSED_DETAILS.includes(detail)) {
    return t(detail, 'Reservations for this date or event are closed. Please choose another date or event.')
  }
  if (RESERVE_MISMATCH_DETAILS.includes(detail)) {
    return t(detail, 'The selected date or time does not match this event. Please choose the date and time again.')
  }
  return t('選んだ日付または時間がこのイベントの予約枠と合いません。日付と時間を選び直してください。', 'The selected date or time does not match this event. Please choose the date and time again.')
}
