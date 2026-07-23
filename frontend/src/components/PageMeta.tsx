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

export default function PageMeta({ title, description, ogImage, ogType = 'website' }: Props) {
  const fullTitle = title ? `${title} | ${SITE}` : SITE
  const desc = description ?? DEFAULT_DESC
  const img = ogImage ?? DEFAULT_OG_IMAGE

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={img} />
      <meta property="og:url" content={ORIGIN} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE} />
      <meta name="twitter:card" content="summary_large_image" />
    </>
  )
}
