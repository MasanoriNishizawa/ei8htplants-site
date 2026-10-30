/**
 * 価格計算の種類
 * - production: 生産。販売価格 = 卸価格の 2 倍
 * - purchase: 仕入れ。目標原価率から推奨価格を計算
 * - seedling: 実生（ei8ht plants・Habitat Oides だけ）。上代 = 種子 20 粒の値段（Habitat Oides は + 鉢）
 */
export type PriceCalcMode = 'production' | 'purchase' | 'seedling'

/** 価格計算で登録した記録 1 件 */
export interface PriceCalcEntry {
  /** 記録の ID */
  id: string
  /** ブランド */
  brand: string
  /** 植物名 */
  plant_name: string
  /** 鉢の作家名（鉢なしは null） */
  pot_artist_name: string | null
  /** 原価（円） */
  cost: number
  /** 販売価格（円） */
  selling_price: number
  /** 計算の種類（生産・仕入れ）。種類を保存する前（021 マイグレーションより前）の記録は null */
  mode: PriceCalcMode | null
  /** 登録した日時（ISO 形式） */
  created_at: string
}

/** 価格計算の記録を登録するときに送る内容 */
export interface PriceCalcEntryBody {
  /** ブランド */
  brand: string
  /** 植物名 */
  plant_name: string
  /** 鉢の作家名（鉢なしは null） */
  pot_artist_name: string | null
  /** 原価（円） */
  cost: number
  /** 販売価格（円） */
  selling_price: number
  /** 計算の種類（生産・仕入れ）。省略すると null で保存される */
  mode?: PriceCalcMode | null
}
