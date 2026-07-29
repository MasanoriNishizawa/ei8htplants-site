import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Product } from '../lib/api'
import { useCart } from '../lib/cart'
import PageMeta from '../components/PageMeta'

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const { add, items } = useCart()
  const [added, setAdded] = useState<string | null>(null)

  useEffect(() => {
    api.products.list().then(setProducts).finally(() => setLoading(false))
  }, [])

  const handleAdd = (p: Product) => {
    add(p, 1)
    setAdded(p.id)
    setTimeout(() => setAdded(null), 1200)
  }

  const inCart = (id: string) => items.find((i) => i.product.id === id)?.quantity ?? 0

  return (
    <>
      <PageMeta title="Shop | ei8ht plants" description="ei8ht plants オンラインストア" />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#8a9a7e', margin: '0 0 14px' }}>
            ei8ht plants
          </p>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 8px', color: '#1c2417' }}>
            Shop
          </h1>
          <p style={{ fontSize: 13, color: '#8a9a7e', margin: 0 }}>オンラインストア</p>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#8a9a7e' }}>読み込み中...</p>
        ) : products.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#8a9a7e', padding: '60px 0' }}>現在販売中の商品はありません。</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 32 }}>
            {products.map((p) => (
              <div key={p.id} style={{ border: '1px solid #dddde8', background: '#fff', display: 'flex', flexDirection: 'column' }}>
                <Link to={`/shop/${p.id}`} style={{ display: 'block', overflow: 'hidden', aspectRatio: '4/3', background: '#f5f5f8' }}>
                  {p.image_urls[0] ? (
                    <img src={p.image_urls[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.4s', }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 13 }}>No Image</div>
                  )}
                </Link>
                <div style={{ padding: '20px 20px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Link to={`/shop/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <p style={{ fontSize: 13, color: '#8a9a7e', margin: '0 0 6px', letterSpacing: 1 }}>ei8ht plants</p>
                    <h2 style={{ fontSize: 17, fontWeight: 400, margin: '0 0 8px', color: '#1c2417', lineHeight: 1.4 }}>{p.name}</h2>
                  </Link>
                  <p style={{ fontSize: 18, fontWeight: 500, color: '#1c2417', margin: '0 0 4px', fontFamily: "'Cormorant Garamond', serif" }}>{fmt(p.price)}</p>
                  <p style={{ fontSize: 12, color: p.stock > 0 ? '#8a9a7e' : '#c0392b', margin: '0 0 16px' }}>
                    {p.stock > 0 ? `残り ${p.stock} 点` : '売り切れ'}
                  </p>
                  <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                    {inCart(p.id) > 0 && (
                      <span style={{ fontSize: 12, color: '#8a9a7e', alignSelf: 'center' }}>カート: {inCart(p.id)}</span>
                    )}
                    <button
                      disabled={p.stock === 0 || added === p.id}
                      onClick={() => handleAdd(p)}
                      style={{
                        flex: 1, padding: '11px 0', border: 'none',
                        background: p.stock === 0 ? '#dddde8' : added === p.id ? '#8a9a7e' : '#1c2417',
                        color: p.stock === 0 ? '#999' : '#fff',
                        fontSize: 13, letterSpacing: '1.5px', cursor: p.stock === 0 ? 'default' : 'pointer',
                        fontFamily: 'inherit', transition: 'background 0.2s',
                      }}
                    >
                      {p.stock === 0 ? 'SOLD OUT' : added === p.id ? 'ADDED' : 'ADD TO CART'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 100 }}>
            <Link
              to="/checkout"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#1c2417', color: '#fff', textDecoration: 'none',
                padding: '14px 24px', fontSize: 14, letterSpacing: '1px',
                boxShadow: '0 4px 16px rgba(28,36,23,0.25)',
              }}
            >
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{items.reduce((s, i) => s + i.quantity, 0)}</span>
              <span>CHECKOUT</span>
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
