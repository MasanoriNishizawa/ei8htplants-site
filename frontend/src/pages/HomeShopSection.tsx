import { Link } from 'react-router-dom'
import { formatYen } from '../lib/format'
import type { Product } from '../lib/api'
import { SERIF, SANS } from './homeTypography'

/** ショップ枠の描画に必要な商品一覧 */
interface HomeShopSectionProps {
  /** 親で取得し、表示件数を絞った商品一覧 */
  products: Product[]
}

/** 商品配列を受け取り、公式HOMEのショップカードを描画する。
 * @param props - 表示対象の商品一覧
 * @returns ショップの見出しと商品カード
 */
export default function HomeShopSection({ products }: HomeShopSectionProps) {
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) clamp(20px, 4vw, 48px)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 'var(--brand-type-subheading)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
          Shop
        </h2>
        <Link to="/official/shop" style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          View All →
        </Link>
      </div>
      <div className="home-shop-grid">
        {products.map((p) => (
          // ホバー・キーボード選択で画像を拡大する（index.css の .home-shop-card / .home-zoom-img）
          <Link key={p.id} to={`/official/shop/${p.id}`} className="home-shop-card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div>
              <div style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--c-border)', overflow: 'hidden', marginBottom: 12 }}>
                {p.image_urls[0] ? (
                  <img src={p.image_urls[0]} alt={p.name} className="home-zoom-img" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'var(--c-faint)' }} />
                )}
                {p.stock === 0 && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', letterSpacing: '4px', color: '#ffffff', border: '1px solid rgba(255,255,255,0.6)', padding: '6px 16px' }}>SOLD OUT</span>
                  </div>
                )}
              </div>
              <p style={{ fontFamily: SERIF, fontSize: 'var(--brand-type-body)', color: 'var(--c-ink)', margin: '0 0 5px', lineHeight: 1.5 }}>{p.name}</p>
              <p style={{ fontFamily: SANS, fontSize: 'var(--brand-type-navigation)', color: 'var(--c-muted)', margin: 0 }}>{formatYen(p.price)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
