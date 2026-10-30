/** ギャラリーの画像 1 枚 */
export interface GalleryImage {
  /** 画像の ID */
  id: string
  /** 画像の公開 URL */
  url: string
  /** 画像の説明（読み上げ用。無ければ null） */
  alt: string | null
  /** ブランドの短い表記（SHORT_BRAND_NAMES の値。無ければ null） */
  brand: string | null
  /** 並び順（小さい順） */
  display_order: number
}

/** ギャラリーの画像を追加するときに送る内容 */
export interface GalleryBody {
  /** 画像の公開 URL */
  url: string
  /** 画像の説明 */
  alt?: string | null
  /** ブランドの短い表記 */
  brand?: string | null
}
