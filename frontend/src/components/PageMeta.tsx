import { BRAND } from '../lib/brands'
import { siteForHost } from '../lib/siteHost'

/** サイト名（タイトルの末尾と og:site_name に使う） */
const DEFAULT_SITE = BRAND.ei8htPlants.name
/** description を指定しないページで使う説明文 */
const DEFAULT_DESC = '植物の生息環境を切り取るハビタットスタイルの専門店。ワークショップ・イベント情報も発信しています。'
/** 本番サイトのオリジン（canonical・og:url・og:image の絶対 URL を作る） */
const ORIGIN = 'https://ei8htplants.com'
/** ogImage を指定しないページで使う OGP 画像（ei8ht plants のロゴ） */
const DEFAULT_OG_IMAGE = `${ORIGIN}${BRAND.ei8htPlants.logo}`

/** PageMeta に渡す値 */
interface Props {
  /** ページのタイトル */
  title?: string
  /** ページの説明文 */
  description?: string
  /** OGP 画像の URL */
  ogImage?: string
  /** OGP の種類（website・article など） */
  ogType?: string
}

/**
 * ページごとの title / description / OGP メタタグを React 19 形式で設定するコンポーネント
 * @param title - ページタイトル（省略時はサイト名のみ）
 * @param description - メタディスクリプション（省略時はデフォルト説明文）
 * @param ogImage - OGP 画像 URL（省略時はロゴ画像）
 * @param ogType - OGP タイプ（デフォルト 'website'）
 * @returns head に移される title・meta・link 要素（React 19 が自動で head に入れる）
 */
export default function PageMeta({ title, description, ogImage, ogType = 'website' }: Props) {
  const site = siteForHost(window.location.hostname)
  // 1. タイトル・説明文・画像を、指定が無ければ既定の値で決める
  const siteName = site.key === 'ei8htplants' ? DEFAULT_SITE : site.brandName
  const fullTitle = title ? (title === siteName ? siteName : `${title} | ${siteName}`) : siteName
  const desc = description ?? DEFAULT_DESC
  const img = new URL(ogImage ?? (site.key === 'ei8htplants' ? DEFAULT_OG_IMAGE : '/img/logo-' + (site.key === 'hue' ? 'hue' : 'habitatoides') + '.png'), site.origin).href
  // 2. 今のページの本番 URL（クエリは含めない）
  const pageUrl = (site.key === 'ei8htplants' ? ORIGIN : site.origin) + window.location.pathname

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
      <meta property="og:site_name" content={siteName} />
      <meta name="twitter:card" content="summary_large_image" />
    </>
  )
}
