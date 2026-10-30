/** 鉢の作家（価格計算で鉢代の内訳に使う） */
export interface PotArtist {
  /** 作家の ID */
  id: string
  /** 作家名 */
  name: string
  /** 登録した日時（ISO 形式） */
  created_at: string
}
