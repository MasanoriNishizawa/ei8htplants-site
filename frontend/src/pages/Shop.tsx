import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Product } from '../lib/api'
import { useCart } from '../lib/cart'
import PageMeta from '../components/PageMeta'

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const BG = '#faf9f7'
const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
const SANS = "'Noto Sans JP', sans-serif"

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
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '48px 24px 32px' }}>
          <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '4px', textTransform: 'uppercase', color: '#bbb', margin: '0 0 10px' }}>
            Online Store
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 300, letterSpacing: '0.06em', margin: 0, color: '#1c1c1c' }}>
            Shop
          </h1>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 13, letterSpacing: 2 }}>Loading...</p>
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', fontWeight: 300 }}>現在販売中の商品はありません。</p>
          </div>
        ) : (
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px 80px' }}>
            <div className="shop-grid">
              {products.map((p) => (
                <Link
                  key={p.id}
                  to={`/shop/${p.id}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  <div
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => {
                      const img = e.currentTarget.querySelector('img') as HTMLImageElement | null
                      if (img) img.style.transform = 'scale(1.04)'
                    }}
                    onMouseLeave={(e) => {
                      const img = e.currentTarget.querySelector('img') as HTMLImageElement | null
                      if (img) img.style.transform = 'scale(1)'
                    }}
                  >
                    {/* 画像 */}
                    <div style={{ overflow: 'hidden', background: '#f0ede8', aspectRatio: '1/1', position: 'relative', marginBottom: 14 }}>
                      {p.image_urls[0] ? (
                        <img
                          src={p.image_urls[0]}
                          alt={p.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.6s ease' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: '#e8e3da' }} />
                      )}
                      {p.stock === 0 && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '4px', color: '#fff', border: '1px solid rgba(255,255,255,0.7)', padding: '7px 18px' }}>SOLD OUT</span>
                        </div>
                      )}
                    </div>

                    {/* テキスト */}
                    <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '2px', color: '#bbb', margin: '0 0 6px', textTransform: 'uppercase' }}>
                      ei8ht plants
                    </p>
                    <p style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 400, color: '#1c1c1c', margin: '0 0 8px', lineHeight: 1.5, letterSpacing: '0.02em' }}>
                      {p.name}
                    </p>
                    <p style={{ fontFamily: SERIF, fontSize: 14, color: p.stock === 0 ? '#bbb' : '#1c1c1c', margin: 0 }}>
                      {fmt(p.price)}
                      <span style={{ fontFamily: SANS, fontSize: 10, color: '#bbb', marginLeft: 6 }}>税込・送料別</span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
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
