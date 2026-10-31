import ShareButtons from '../components/ShareButtons'
import { BRAND } from '../lib/brands'
import { useT } from '../lib/lang'

/** Instagramリンクの型。hrefはアカウントURL、srcはロゴ画像、clsは表示寸法、brandは代替テキスト用。 */
interface InstagramLink {
  /** InstagramアカウントのURL */
  href: string
  /** ブランドロゴ画像のURL */
  src: string
  /** ブランドごとのロゴ表示調整用クラス */
  cls: 'habitat' | 'ei8ht' | 'hue'
  /** 代替テキストに含めるブランド名 */
  brand: string
}

/** Habitat Oidesを先頭にした公式HOMEのInstagramリンク順。 */
const IG_LINKS: InstagramLink[] = [
  { href: BRAND.habitatOides.instagramUrl, src: BRAND.habitatOides.logo, cls: 'habitat', brand: BRAND.habitatOides.name },
  { href: BRAND.ei8htPlants.instagramUrl, src: BRAND.ei8htPlants.logo, cls: 'ei8ht', brand: BRAND.ei8htPlants.name },
  { href: BRAND.hue.instagramUrl, src: BRAND.hue.logo, cls: 'hue', brand: BRAND.hue.name },
]

/** セクション見出し用の明朝体。 */
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
/** セクション補助文用のゴシック体。 */
const SANS = "'Noto Sans JP', sans-serif"

/**
 * 公式HOMEのInstagramリンクとシェアボタンを表示する。
 * @returns Instagramロゴ一覧と公式HOMEのシェア操作
 */
export default function HomeSocialSection() {
  /** 現在の表示言語に合わせてInstagramロゴの代替テキストを選ぶ翻訳関数。 */
  const t = useT()

  // 1. ブランド順を維持したInstagramリンクと各ロゴを表示する。
  // 2. セクション下部に公式HOMEのURLと固定文言を使ったシェアボタンを表示する。
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) clamp(20px, 4vw, 48px)', textAlign: 'center' }}>
      <p style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', letterSpacing: '4px', color: 'var(--c-faint)', margin: '0 0 8px', textTransform: 'uppercase' }}>{t('フォロー', 'Follow us')}</p>
      <p style={{ fontFamily: SERIF, fontSize: 'var(--brand-type-subheading)', fontWeight: 300, fontStyle: 'italic', color: 'var(--c-ink)', margin: '0 0 clamp(28px, 4vw, 44px)', letterSpacing: '0.06em' }}>Instagram</p>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'clamp(24px, 5vw, 60px)', flexWrap: 'wrap' }}>
        {IG_LINKS.map(({ href, src, cls, brand }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: 'clamp(90px, 12vw, 140px)', height: 'clamp(90px, 12vw, 140px)', overflow: 'hidden' }}
          >
            <img
              src={src}
              alt={t(`${brand} の Instagram`, `${brand} on Instagram`)}
              style={{
                width: cls === 'ei8ht' ? '140%' : cls === 'hue' ? '115%' : '100%',
                height: cls === 'habitat' ? '100%' : 'auto',
                objectFit: cls === 'habitat' ? 'cover' : undefined,
                borderRadius: cls === 'habitat' ? '20%' : undefined,
              }}
            />
          </a>
        ))}
      </div>
      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'center' }}>
        <ShareButtons url={`${window.location.origin}/official`} text="ei8ht plants — Collect the strange." />
      </div>
    </section>
  )
}
