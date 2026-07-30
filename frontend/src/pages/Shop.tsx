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
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '52px 32px 44px' }}>
            <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: '#aaa', margin: '0 0 12px' }}>
              Online Store
            </p>
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 300, letterSpacing: '0.06em', margin: '0 0 16px', color: '#1c1c1c', lineHeight: 1.2 }}>
              ei8ht plants Shop
            </h1>
            <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', margin: 0, lineHeight: 2 }}>
              植物と、暮らしにそっとなじむものを。
            </p>
          </div>
        </div>

        {/* 商品グリッド */}
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 32px 100px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 13, letterSpacing: 2 }}>Loading...</p>
            </div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', fontWeight: 300 }}>現在販売中の商品はありません。</p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '56px 32px',
            }}>
              {products.map((p) => (
                <Link
                  key={p.id}
                  to={`/shop/${p.id}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  {/* 商品画像 */}
                  <div style={{ aspectRatio: '1/1', overflow: 'hidden', background: '#f0ede8', marginBottom: 18 }}>
                    {p.image_urls[0] ? (
                      <img
                        src={p.image_urls[0]}
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.05)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: SANS, fontSize: 11, color: '#ccc', letterSpacing: 2 }}>NO IMAGE</span>
                      </div>
                    )}
                  </div>

                  {/* 商品情報 */}
                  <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '2px', color: '#bbb', margin: '0 0 8px', textTransform: 'uppercase' }}>
                    ei8ht plants
                  </p>
                  <h2 style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 400, color: '#1c1c1c', margin: '0 0 10px', lineHeight: 1.6, letterSpacing: '0.04em' }}>
                    {p.name}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: SERIF, fontSize: 15, color: '#1c1c1c' }}>{fmt(p.price)}</span>
                    <span style={{ fontFamily: SANS, fontSize: 10, color: '#bbb' }}>税込</span>
                  </div>
                  {p.stock === 0 && (
                    <p style={{ fontFamily: SANS, fontSize: 11, color: '#c0392b', margin: '6px 0 0', letterSpacing: 1 }}>売り切れ</p>
                  )}
                </Link>
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
