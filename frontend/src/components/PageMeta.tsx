const SITE = 'ei8ht plants'
const DEFAULT_DESC = '植物の生息環境を切り取るハビタットスタイルの専門店。ワークショップ・イベント情報も発信しています。'
const ORIGIN = 'https://ei8htplants.com'
const DEFAULT_OG_IMAGE = `${ORIGIN}/img/logo-ei8htplants.png`

interface Props {
  title?: string
  description?: string
  ogImage?: string
  ogType?: string
}

/**
 * ページごとの title / description / OGP メタタグを React 19 形式で設定するコンポーネント
 * @param title - ページタイトル（省略時はサイト名のみ）
 * @param description - メタディスクリプション（省略時はデフォルト説明文）
 * @param ogImage - OGP 画像 URL（省略時はロゴ画像）
 * @param ogType - OGP タイプ（デフォルト 'website'）
 */
export default function PageMeta({ title, description, ogImage, ogType = 'website' }: Props) {
  const fullTitle = title ? `${title} | ${SITE}` : SITE
  const desc = description ?? DEFAULT_DESC
  const img = ogImage ?? DEFAULT_OG_IMAGE
  const pageUrl = ORIGIN + window.location.pathname

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={pageUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={img} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE} />
      <meta name="twitter:card" content="summary_large_image" />
    </>
  )
}
