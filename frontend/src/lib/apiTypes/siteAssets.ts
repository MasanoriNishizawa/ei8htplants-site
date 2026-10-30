/** サイトページに表示する管理画像 */
export interface SiteAsset {
  /** 固定の画像設定キー */
  key: string
  /** Storage の公開 URL。空文字なら未設定 */
  url: string
}
