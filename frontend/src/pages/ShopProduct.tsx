import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type Product } from '../lib/api'
import { useCart } from '../lib/cart'
import PageMeta from '../components/PageMeta'

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

export default function ShopProduct() {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [imgIdx, setImgIdx] = useState(0)
  const { add, items } = useCart()

  useEffect(() => {
    if (!id) return
    api.products.get(id).then((p) => {
      setProduct(p)
      setQty(1)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const cartQty = items.find((i) => i.product.id === id)?.quantity ?? 0

  const handleAdd = () => {
    if (!product) return
    add(product, qty)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  if (loading) {
    return <div style={{ padding: '80px 24px', textAlign: 'center', color: '#8a9a7e' }}>読み込み中...</div>
  }
  if (!product) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ color: '#8a9a7e' }}>商品が見つかりません。</p>
        <Link to="/shop" style={{ color: '#8a9a7e', fontSize: 13 }}>ショップに戻る</Link>
      </div>
    )
  }

  const maxQty = product.stock - cartQty
  const soldOut = product.stock === 0

  return (
    <>
      <PageMeta title={`${product.name} | ei8ht plants Shop`} description={product.description ?? product.name} />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 24px 80px' }}>
        <div style={{ marginBottom: 32 }}>
          <Link to="/shop" style={{ fontSize: 13, color: '#8a9a7e', textDecoration: 'none' }}>&larr; Shop</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 48, alignItems: 'start' }}>
          {/* 画像 */}
          <div>
            <div style={{ aspectRatio: '4/3', background: '#f5f5f8', overflow: 'hidden', marginBottom: 12 }}>
              {product.image_urls[imgIdx] ? (
                <img src={product.image_urls[imgIdx]} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 13 }}>No Image</div>
              )}
            </div>
            {product.image_urls.length > 1 && (
              <div style={{ display: 'flex', gap: 8 }}>
                {product.image_urls.map((url, i) => (
                  <button key={i} onClick={() => setImgIdx(i)} style={{ width: 64, height: 48, padding: 0, border: `2px solid ${i === imgIdx ? '#1c2417' : '#dddde8'}`, cursor: 'pointer', overflow: 'hidden', background: 'none' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 商品情報 */}
          <div>
            <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#8a9a7e', margin: '0 0 10px' }}>ei8ht plants</p>
            <h1 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: '0.06em', margin: '0 0 16px', color: '#1c2417' }}>
              {product.name}
            </h1>
            <p style={{ fontSize: 28, fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, color: '#1c2417', margin: '0 0 6px' }}>{fmt(product.price)}</p>
            <p style={{ fontSize: 12, color: '#8a9a7e', margin: '0 0 24px' }}>税込・送料別</p>

            {product.description && (
              <p style={{ fontSize: 14, color: '#3a4535', lineHeight: 1.9, margin: '0 0 28px', whiteSpace: 'pre-wrap' }}>
                {product.description}
              </p>
            )}

            <p style={{ fontSize: 13, color: soldOut ? '#c0392b' : '#8a9a7e', margin: '0 0 20px', fontWeight: soldOut ? 500 : 400 }}>
              {soldOut ? '売り切れ' : `在庫 ${product.stock} 点${cartQty > 0 ? `（カート: ${cartQty}）` : ''}`}
            </p>

            {!soldOut && maxQty > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: '#8a9a7e', letterSpacing: 1 }}>数量</label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #dddde8' }}>
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ width: 36, height: 36, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#3a4535' }}>−</button>
                  <span style={{ width: 32, textAlign: 'center', fontSize: 15, color: '#1c2417' }}>{qty}</span>
                  <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} style={{ width: 36, height: 36, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#3a4535' }}>+</button>
                </div>
              </div>
            )}

            <button
              disabled={soldOut || maxQty <= 0 || added}
              onClick={handleAdd}
              style={{
                width: '100%', padding: '14px 0', border: 'none',
                background: soldOut || maxQty <= 0 ? '#dddde8' : added ? '#8a9a7e' : '#1c2417',
                color: soldOut || maxQty <= 0 ? '#999' : '#fff',
                fontSize: 13, letterSpacing: '2px', cursor: soldOut || maxQty <= 0 ? 'default' : 'pointer',
                fontFamily: 'inherit', marginBottom: 12, transition: 'background 0.2s',
              }}
            >
              {soldOut ? 'SOLD OUT' : maxQty <= 0 ? 'カートに追加済み' : added ? 'ADDED TO CART' : 'ADD TO CART'}
            </button>

            {items.length > 0 && (
              <Link to="/checkout" style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '13px 0', border: '1px solid #1c2417', textAlign: 'center', textDecoration: 'none', color: '#1c2417', fontSize: 13, letterSpacing: '2px' }}>
                CHECKOUT ({items.reduce((s, i) => s + i.quantity, 0)})
              </Link>
            )}

            <p style={{ fontSize: 12, color: '#8a9a7e', marginTop: 24, lineHeight: 1.8 }}>
              ※ 送料は都道府県によって異なります。<br />
              ※ ご注文後、発送が完了したらメールでお知らせします。
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
