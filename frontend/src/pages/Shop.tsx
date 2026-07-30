import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Product } from '../lib/api'
import { useCart } from '../lib/cart'
import { parseBlocks } from '../components/BlockEditor'
import PageMeta from '../components/PageMeta'

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const BG = '#faf9f7'
const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
const SANS = "'Noto Sans JP', sans-serif"

function firstText(description: string | null): string {
  if (!description) return ''
  const blocks = parseBlocks(description)
  const textBlock = blocks.find((b) => b.type === 'text')
  const text = textBlock ? (textBlock as any).value as string : ''
  return text.length > 120 ? text.slice(0, 120) + '…' : text
}

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const { items } = useCart()

  useEffect(() => {
    api.products.list().then(setProducts).finally(() => setLoading(false))
  }, [])

  const cartCount = items.reduce((s, i) => s + i.quantity, 0)
  const [hero, ...rest] = products

  return (
    <>
      <PageMeta title="Shop | ei8ht plants" description="ei8ht plants オンラインストア" />

      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* ページヘッダー */}
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 32px 0' }}>
          <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '4px', textTransform: 'uppercase', color: '#bbb', margin: '0 0 10px' }}>
            Online Store
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 300, letterSpacing: '0.06em', margin: 0, color: '#1c1c1c' }}>
            Shop
          </h1>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '120px 0' }}>
            <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 13, letterSpacing: 2 }}>Loading...</p>
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '120px 0' }}>
            <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', fontWeight: 300 }}>現在販売中の商品はありません。</p>
          </div>
        ) : (
          <div>

            {/* フィーチャー：1番目の商品を大きく */}
            {hero && (
              <Link to={`/shop/${hero.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 32px 0' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 1fr',
                    gap: 0,
                    alignItems: 'stretch',
                    cursor: 'pointer',
                  }}>
                    {/* 大きな画像 */}
                    <div style={{ overflow: 'hidden', background: '#f0ede8', aspectRatio: '4/3' }}>
                      {hero.image_urls[0] ? (
                        <img
                          src={hero.image_urls[0]}
                          alt={hero.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.7s ease' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: '#e8e3da' }} />
                      )}
                    </div>

                    {/* テキスト */}
                    <div style={{ background: '#fff', padding: '52px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '3px', color: '#bbb', margin: '0 0 24px', textTransform: 'uppercase' }}>
                        ei8ht plants
                      </p>
                      <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(20px, 2.5vw, 30px)', fontWeight: 400, color: '#1c1c1c', margin: '0 0 24px', lineHeight: 1.7, letterSpacing: '0.04em' }}>
                        {hero.name}
                      </h2>
                      {firstText(hero.description) && (
                        <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', lineHeight: 2.2, margin: '0 0 32px' }}>
                          {firstText(hero.description)}
                        </p>
                      )}
                      <div style={{ borderTop: '1px solid #e8e3da', paddingTop: 24 }}>
                        <span style={{ fontFamily: SERIF, fontSize: 18, color: '#1c1c1c' }}>{fmt(hero.price)}</span>
                        <span style={{ fontFamily: SANS, fontSize: 11, color: '#bbb', marginLeft: 8 }}>税込・送料別</span>
                        {hero.stock === 0 && (
                          <p style={{ fontFamily: SANS, fontSize: 11, color: '#c0392b', margin: '8px 0 0', letterSpacing: 1 }}>売り切れ</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* 残りの商品：交互レイアウト */}
            <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 32px' }}>
              {rest.map((p, idx) => (
                <Link
                  key={p.id}
                  to={`/shop/${p.id}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: idx % 2 === 0 ? '1fr 1fr' : '1fr 1fr',
                    gap: 0,
                    marginTop: 80,
                    cursor: 'pointer',
                  }}>
                    {/* 画像 */}
                    <div style={{ order: idx % 2 === 0 ? 0 : 1, overflow: 'hidden', background: '#f0ede8', aspectRatio: '5/4' }}>
                      {p.image_urls[0] ? (
                        <img
                          src={p.image_urls[0]}
                          alt={p.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.7s ease' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: '#e8e3da' }} />
                      )}
                    </div>

                    {/* テキスト */}
                    <div style={{
                      order: idx % 2 === 0 ? 1 : 0,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      padding: idx % 2 === 0 ? '48px 0 48px 64px' : '48px 64px 48px 0',
                    }}>
                      <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '3px', color: '#bbb', margin: '0 0 20px', textTransform: 'uppercase' }}>
                        ei8ht plants
                      </p>
                      <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(18px, 2vw, 26px)', fontWeight: 400, color: '#1c1c1c', margin: '0 0 20px', lineHeight: 1.7, letterSpacing: '0.04em' }}>
                        {p.name}
                      </h2>
                      {firstText(p.description) && (
                        <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', lineHeight: 2.2, margin: '0 0 28px' }}>
                          {firstText(p.description)}
                        </p>
                      )}
                      <div>
                        <span style={{ fontFamily: SERIF, fontSize: 17, color: '#1c1c1c' }}>{fmt(p.price)}</span>
                        <span style={{ fontFamily: SANS, fontSize: 11, color: '#bbb', marginLeft: 8 }}>税込・送料別</span>
                        {p.stock === 0 && (
                          <p style={{ fontFamily: SANS, fontSize: 11, color: '#c0392b', margin: '8px 0 0', letterSpacing: 1 }}>売り切れ</p>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div style={{ height: 120 }} />
          </div>
        )}

        {/* フローティングカートボタン */}
        {cartCount > 0 && (
          <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 100 }}>
            <Link
              to="/checkout"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#1c1c1c', color: '#fff', textDecoration: 'none',
                padding: '14px 28px', fontFamily: SANS, fontSize: 13, letterSpacing: '1px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />
              </svg>
              カート ({cartCount})
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
