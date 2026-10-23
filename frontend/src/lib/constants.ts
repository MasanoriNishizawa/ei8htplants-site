/*
 * 画面と計算で共通に使う数値の定数
 *
 * 同じ数値を画面の説明文と計算の両方に書いていると、片方だけ変えて食い違うことがあるため、ここにまとめる。
 * 値を変えるときは、サーバー（backend/app/routes/reserve.py など）の上限・計算と合っているかも確かめる
 */

/** ワークショップの参加費（1 人あたり・円）。予約ページの料金表示と、収支の WS 売上の計算に使う */
export const WS_FEE_YEN = 1000

/** ワークショップの資材費（1 人あたり・円）。収支の WS 資材費と、WS 集計の手伝い金額の計算に使う */
export const WS_MATERIAL_COST_YEN = 700

/** 手伝いへの支払いのうち、売上利益（売上 − WS 売上 − 支出）に掛ける割合（20%） */
export const HELPER_SALES_SHARE_RATE = 0.2

/** 手伝いへの支払いのうち、WS 売上に掛ける割合（70%） */
export const HELPER_WS_SHARE_RATE = 0.7

/** 交通費の計算に使う車の燃費（km / L）。交通費 = 往復の距離 ÷ 燃費 × ガソリン単価 */
export const FUEL_EFFICIENCY_KM_PER_L = 10

/** 1 回の予約で選べる最大の人数（サーバーの上限 1〜10 人と同じ） */
export const RESERVE_MAX_PARTICIPANTS = 10

/**
 * 注文（Checkout）・予約（Reserve）の入力欄の最大文字数。
 * サーバーの入力チェック（backend/app/routes/orders.py の OrderBody・reserve.py の ReserveBody の max_length）と同じ値にし、
 * 上限を超えた入力で 422 になる前に、入力欄の時点で止める
 */
export const INPUT_MAX_LENGTH = {
  /** お名前 */
  name: 100,
  /** 電話番号 */
  phone: 30,
  /** 郵便番号 */
  postalCode: 10,
  /** 市区町村 */
  city: 100,
  /** 番地・建物名（address_line1・address_line2 共通） */
  address: 200,
  /** 備考 */
  note: 2000,
} as const

/** 写真のスワイプで前後に切り替えるのに必要な横の移動量（px）。これより小さい動きはタップとみなす */
export const SWIPE_THRESHOLD_PX = 40

/** WS の時間枠を自動で作るときの 1 枠の長さ（分）。開始・終了の 1 時間ずつは準備・片付けとして空ける */
export const WS_SLOT_MINUTES = 60

/** WS の時間枠を自動で作るときの 1 枠の定員（人） */
export const WS_AUTO_SESSION_CAPACITY = 4

/** WS の時間枠を手で 1 行足したときの定員の初期値（人） */
export const WS_DEFAULT_SESSION_CAPACITY = 10

/**
 * 割合を「20%」の形にする（説明文に定数の値を出す用）
 * @param rate - 割合（0.2 など）
 * @returns パーセントの文字列
 */
export function percentLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`
}
