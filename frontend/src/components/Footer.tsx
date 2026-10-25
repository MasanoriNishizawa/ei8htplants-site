import { Link, useLocation } from 'react-router-dom'
import { useT } from '../lib/lang'
import { BRAND, BRANDS, TEXT_LOGO } from '../lib/brands'
import { BRAND_SITE_URLS } from '../lib/siteHost'

/** 特定商取引法のリンクを出すページのパス（ショップ・チェックアウト・注文完了とその下の階層） */
const SHOP_PATHS = ['/shop', '/checkout', '/order']

/** 「Pages」の列に並べるサイト内のリンク（to: パス、label: 表示名） */
const NAV_LINKS = [
  { to: '/events', label: 'Event' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/concept', label: 'Concept' },
  { to: '/stockists', label: 'Stockists' },
  { to: '/contact', label: 'Contact' },
  { to: '/shop', label: 'Shop' },
]

/** 「Brand」の列に並べるブランドページへのリンク */
const BRAND_LINKS = [
  { href: BRAND_SITE_URLS.ei8htplants, label: BRAND.ei8htPlants.name },
  { href: BRAND_SITE_URLS['habitat-oides'], label: BRAND.habitatOides.name },
  { href: BRAND_SITE_URLS.hue, label: BRAND.hue.name },
]

/** ロゴの下に並べる、3 ブランドの Instagram のアカウントへのリンク */
const IG_LINKS = BRANDS.map((b) => ({ href: b.instagramUrl, label: b.instagramHandle }))

/** フッターの各リンク（Instagram・メニュー・ブランド）の文字の見た目（小さめ・大文字・薄い色） */
const linkStyle: React.CSSProperties = {
  fontSize: 11, letterSpacing: '1.5px', textDecoration: 'none',
  color: 'var(--c-muted)', transition: 'color 0.2s', textTransform: 'uppercase',
  fontWeight: 300,
}

/**
 * サイト共通フッター。プライバシーポリシーのリンクは全ページ、特定商取引法リンクはショップ系ページのみ表示する
 * @returns フッターの要素
 */
export default function Footer() {
  // 今のページのパス（特定商取引法のリンクを出すかの判定に使う）
  const { pathname } = useLocation()
  const t = useT()
  // ショップ・チェックアウト・注文完了ページのみ特定商取引法リンクを表示
  const showLegal = SHOP_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))

  return (
    // marginTop: 'auto' で、中身が短いページでもフッターを画面の下端に寄せる
    <footer style={{ background: 'var(--c-bg)', borderTop: '1px solid var(--c-border)', marginTop: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(48px, 7vw, 80px) clamp(20px, 4vw, 48px) 40px' }}>

        {/* 上段: 左にロゴと Instagram、右に Pages・Brand のリンクの列 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '48px 64px', marginBottom: 56 }}>
          {/* ロゴ（トップへ）と Instagram のリンク */}
          <div style={{ minWidth: 180 }}>
            <Link to="/">
              <img src={TEXT_LOGO} alt="ei8ht plants" style={{ height: 22, display: 'block', marginBottom: 24, opacity: 0.7 }} />
            </Link>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {IG_LINKS.map(({ href, label }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  style={{ ...linkStyle, fontSize: 10 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-muted)' }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '40px 56px', flexWrap: 'wrap' }}>
            {/* Pages: サイト内のページへのリンク */}
            <div>
              <p style={{ fontSize: 9, letterSpacing: '2.5px', color: 'var(--c-faint)', textTransform: 'uppercase', margin: '0 0 16px' }}>Pages</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {NAV_LINKS.map(({ to, label }) => (
                  <Link key={to} to={to} style={linkStyle}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-muted)' }}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Brand: ブランドページへのリンク */}
            <div>
              <p style={{ fontSize: 9, letterSpacing: '2.5px', color: 'var(--c-faint)', textTransform: 'uppercase', margin: '0 0 16px' }}>Brand</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {BRAND_LINKS.map(({ href, label }) => (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-muted)' }}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 下段: 商標の注記と、プライバシーポリシー・特定商取引法・著作権表示 */}
        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 28, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 10, color: 'var(--c-faint)', margin: 0, letterSpacing: '0.5px', lineHeight: 1.8 }}>
            {t('※「HABITATSTYLE / ハビタットスタイル」は Shabomaniac! (およびTHE SUCCULENTIST)の登録商標です。', '※ "HABITATSTYLE" is a registered trademark of Shabomaniac! (and THE SUCCULENTIST).')}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {/* プライバシーポリシーは全ページに表示する（アクセス解析の利用を知らせるため） */}
            <Link to="/privacy" style={{ ...linkStyle, fontSize: 10 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-muted)' }}
            >
              {t('プライバシーポリシー', 'Privacy Policy')}
            </Link>
            {/* 特定商取引法はショップ系のページだけ */}
            {showLegal && (
              <Link to="/legal" style={{ ...linkStyle, fontSize: 10 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-ink)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--c-muted)' }}
              >
                {t('特定商取引法', 'Legal Notice')}
              </Link>
            )}
            <span style={{ fontSize: 10, color: 'var(--c-faint)', letterSpacing: '0.5px' }}>
              &copy; {new Date().getFullYear()} ei8ht plants
            </span>
          </div>
        </div>

      </div>
    </footer>
  )
}
