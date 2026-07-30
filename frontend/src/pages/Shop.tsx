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
  const { add, items } = useCart()
  const [added, setAdded] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    api.products.list().then(setProducts).finally(() => setLoading(false))
  }, [])

  const handleAdd = (p: Product) => {
    add(p, 1)
    setAdded(p.id)
    setTimeout(() => setAdded(null), 1400)
  }

  const inCart = (id: string) => items.find((i) => i.product.id === id)?.quantity ?? 0
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <>
      <PageMeta title="Shop | ei8ht plants" description="ei8ht plants オンラインストア" />

      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* ページヘッダー */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 40px' }}>
            <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: '#999', margin: '0 0 12px' }}>
              Online Store
            </p>
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 300, letterSpacing: '0.06em', margin: '0 0 16px', color: '#1c1c1c', lineHeight: 1.2 }}>
              ei8ht plants Shop
            </h1>
            <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', margin: 0, lineHeight: 1.8, maxWidth: 520 }}>
              植物と、暮らしにそっとなじむものを。<br />
              ei8ht plants がセレクトしたアイテムをお届けします。
            </p>
          </div>
        </div>

        {/* 商品グリッド */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 100px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ fontFamily: SANS, color: '#999', fontSize: 13, letterSpacing: 2 }}>Loading...</p>
            </div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', fontWeight: 300 }}>現在販売中の商品はありません。</p>
              <p style={{ fontFamily: SANS, fontSize: 13, color: '#bbb', marginTop: 8 }}>しばらくお待ちください。</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '48px 32px' }}>
              {products.map((p) => (
                <article key={p.id}>
                  {/* 商品画像 */}
                  <Link
                    to={`/shop/${p.id}`}
                    style={{ display: 'block', overflow: 'hidden', aspectRatio: '1/1', background: '#f0ede8', marginBottom: 16 }}
                    onMouseEnter={() => setHovered(p.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {p.image_urls[0] ? (
                      <img
                        src={p.image_urls[0]}
                        alt={p.name}
                        style={{
                          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                          transform: hovered === p.id ? 'scale(1.04)' : 'scale(1)',
                          transition: 'transform 0.5s ease',
                        }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: SANS, fontSize: 12, color: '#ccc', letterSpacing: 2 }}>NO IMAGE</span>
                      </div>
                    )}
                  </Link>

                  {/* 商品情報 */}
                  <div style={{ paddingBottom: 4 }}>
                    <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '2px', color: '#aaa', margin: '0 0 6px', textTransform: 'uppercase' }}>
                      ei8ht plants
                    </p>
                    <Link to={`/shop/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <h2 style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 400, color: '#1c1c1c', margin: '0 0 8px', lineHeight: 1.5, letterSpacing: '0.03em' }}>
                        {p.name}
                      </h2>
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                      <span style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400, color: '#1c1c1c' }}>{fmt(p.price)}</span>
                      <span style={{ fontFamily: SANS, fontSize: 11, color: '#aaa' }}>税込</span>
                    </div>

                    {/* 在庫・カート */}
                    {p.stock === 0 ? (
                      <p style={{ fontFamily: SANS, fontSize: 12, color: '#c0392b', letterSpacing: 1 }}>売り切れ</p>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                          onClick={() => handleAdd(p)}
                          disabled={added === p.id}
                          style={{
                            flex: 1, padding: '11px 0', border: 'none',
                            background: added === p.id ? '#a0a098' : '#1c1c1c',
                            color: '#fff', fontFamily: SANS, fontSize: 12, letterSpacing: '2px',
                            cursor: added === p.id ? 'default' : 'pointer',
                            transition: 'background 0.2s',
                          }}
                        >
                          {added === p.id ? 'ADDED' : 'カートに入れる'}
                        </button>
                        {inCart(p.id) > 0 && (
                          <span style={{ fontFamily: SANS, fontSize: 11, color: '#aaa' }}>×{inCart(p.id)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* カートボタン（フローティング） */}
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
              <span>カート ({cartCount})</span>
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
