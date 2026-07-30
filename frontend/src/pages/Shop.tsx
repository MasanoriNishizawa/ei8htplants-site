import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Product } from '../lib/api'
import { useCart } from '../lib/cart'
import PageMeta from '../components/PageMeta'

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

const BG = '#faf9f7'
const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
const SANS = "'Noto Sans JP', sans-serif"

function excerpt(text: string | null, max = 80): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '…' : text
}

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const { items } = useCart()

  useEffect(() => {
    api.products.list().then(setProducts).finally(() => setLoading(false))
  }, [])

  const cartCount = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <>
      <PageMeta title="Shop | ei8ht plants" description="ei8ht plants オンラインストア" />

      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* ページヘッダー */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 860, margin: '0 auto', padding: '52px 24px 44px' }}>
            <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: '#aaa', margin: '0 0 12px' }}>
              Online Store
            </p>
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 300, letterSpacing: '0.06em', margin: '0 0 20px', color: '#1c1c1c', lineHeight: 1.2 }}>
              ei8ht plants Shop
            </h1>
            <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', margin: 0, lineHeight: 2, maxWidth: 480 }}>
              植物と、暮らしにそっとなじむものを。<br />
              ei8ht plants がセレクトしたアイテムをお届けします。
            </p>
          </div>
        </div>

        {/* 記事一覧 */}
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '56px 24px 100px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 13, letterSpacing: 2 }}>Loading...</p>
            </div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', fontWeight: 300 }}>現在販売中の商品はありません。</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 64 }}>
              {products.map((p, idx) => (
                <article key={p.id} style={{ borderBottom: '1px solid #e8e3da', paddingBottom: 64 }}>
                  {/* 偶数・奇数で画像位置を交互に */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: idx % 2 === 0 ? 'minmax(0,1.1fr) minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1.1fr)',
                    gap: 40,
                    alignItems: 'center',
                  }}>
                    {/* 画像 */}
                    <div style={{ order: idx % 2 === 0 ? 0 : 1 }}>
                      <Link to={`/shop/${p.id}`} style={{ display: 'block', overflow: 'hidden', aspectRatio: '4/3', background: '#f0ede8' }}>
                        {p.image_urls[0] ? (
                          <img
                            src={p.image_urls[0]}
                            alt={p.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontFamily: SANS, fontSize: 12, color: '#ccc', letterSpacing: 2 }}>NO IMAGE</span>
                          </div>
                        )}
                      </Link>
                    </div>

                    {/* テキスト */}
                    <div style={{ order: idx % 2 === 0 ? 1 : 0 }}>
                      <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '3px', color: '#aaa', margin: '0 0 14px', textTransform: 'uppercase' }}>
                        ei8ht plants
                      </p>
                      <Link to={`/shop/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 400, color: '#1c1c1c', margin: '0 0 16px', lineHeight: 1.6, letterSpacing: '0.04em' }}>
                          {p.name}
                        </h2>
                      </Link>
                      {p.description && (
                        <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', lineHeight: 2, margin: '0 0 20px' }}>
                          {excerpt(p.description)}
                        </p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 24 }}>
                        <span style={{ fontFamily: SERIF, fontSize: 20, color: '#1c1c1c' }}>{fmt(p.price)}</span>
                        <span style={{ fontFamily: SANS, fontSize: 11, color: '#aaa' }}>税込・送料別</span>
                      </div>
                      {p.stock === 0 ? (
                        <p style={{ fontFamily: SANS, fontSize: 12, color: '#c0392b', letterSpacing: 1 }}>売り切れ</p>
                      ) : (
                        <Link
                          to={`/shop/${p.id}`}
                          style={{
                            display: 'inline-block', padding: '12px 28px',
                            border: '1px solid #1c1c1c', color: '#1c1c1c',
                            textDecoration: 'none', fontFamily: SANS, fontSize: 12, letterSpacing: '2px',
                          }}
                        >
                          詳しく見る
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

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
