import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api, type Product } from '../lib/api'
import { useCart } from '../lib/cart'
import PageMeta from '../components/PageMeta'

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

const BG = '#faf9f7'
const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
const SANS = "'Noto Sans JP', sans-serif"

export default function ShopProduct() {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [imgIdx, setImgIdx] = useState(0)
  const { add, items } = useCart()
  const navigate = useNavigate()

  useEffect(() => {
    if (!id) return
    api.products.get(id).then((p) => { setProduct(p); setQty(1) }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const cartQty = items.find((i) => i.product.id === id)?.quantity ?? 0
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)

  const handleAdd = () => {
    if (!product) return
    add(product, qty)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  const handleCheckout = () => {
    if (!product) return
    add(product, qty)
    navigate('/checkout')
  }

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: SANS, color: '#999', fontSize: 13, letterSpacing: 2 }}>Loading...</p>
      </div>
    )
  }

  if (!product) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', fontWeight: 300 }}>商品が見つかりません。</p>
        <Link to="/shop" style={{ fontFamily: SANS, color: '#1c1c1c', fontSize: 13, letterSpacing: 1 }}>ショップに戻る</Link>
      </div>
    )
  }

  const maxQty = product.stock - cartQty
  const soldOut = product.stock === 0

  return (
    <>
      <PageMeta title={`${product.name} | ei8ht plants Shop`} description={product.description ?? product.name} />

      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* パンくず */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 12, color: '#aaa' }}>
            <Link to="/shop" style={{ color: '#aaa', textDecoration: 'none' }}>Shop</Link>
            <span>/</span>
            <span style={{ color: '#717171' }}>{product.name}</span>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px 100px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: '56px', alignItems: 'start' }}>

            {/* 画像エリア */}
            <div>
              {/* メイン画像 */}
              <div style={{ aspectRatio: '1/1', background: '#f0ede8', overflow: 'hidden', marginBottom: 12 }}>
                {product.image_urls[imgIdx] ? (
                  <img
                    src={product.image_urls[imgIdx]}
                    alt={product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: '#ccc', letterSpacing: 2 }}>NO IMAGE</span>
                  </div>
                )}
              </div>
              {/* サムネイル */}
              {product.image_urls.length > 1 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {product.image_urls.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIdx(i)}
                      style={{
                        width: 72, height: 72, padding: 0, border: 'none', cursor: 'pointer',
                        overflow: 'hidden', background: '#f0ede8',
                        outline: i === imgIdx ? '2px solid #1c1c1c' : 'none',
                        outlineOffset: 2,
                      }}
                    >
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 商品情報エリア */}
            <div style={{ position: 'sticky', top: 32 }}>
              <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '3px', color: '#aaa', margin: '0 0 12px', textTransform: 'uppercase' }}>
                ei8ht plants
              </p>
              <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 2.5vw, 30px)', fontWeight: 400, color: '#1c1c1c', margin: '0 0 20px', lineHeight: 1.5, letterSpacing: '0.04em' }}>
                {product.name}
              </h1>

              {/* 価格 */}
              <div style={{ borderTop: '1px solid #e8e3da', borderBottom: '1px solid #e8e3da', padding: '16px 0', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, color: '#1c1c1c' }}>{fmt(product.price)}</span>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: '#aaa' }}>税込・送料別</span>
                </div>
              </div>

              {/* 在庫状態 */}
              <p style={{ fontFamily: SANS, fontSize: 13, color: soldOut ? '#c0392b' : '#717171', margin: '0 0 24px', letterSpacing: '0.5px' }}>
                {soldOut ? '現在売り切れです' : `残り ${product.stock} 点${cartQty > 0 ? `（カート: ${cartQty}）` : ''}`}
              </p>

              {/* 説明文 */}
              {product.description && (
                <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid #e8e3da' }}>
                  <p style={{ fontFamily: SANS, fontSize: 14, color: '#3a3a3a', lineHeight: 2, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {product.description}
                  </p>
                </div>
              )}

              {/* 数量・カート操作 */}
              {!soldOut && maxQty > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: '#717171', letterSpacing: 1, width: 40 }}>数量</span>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', background: '#fff' }}>
                      <button onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ width: 40, height: 40, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#1c1c1c', fontFamily: SANS }}>−</button>
                      <span style={{ width: 36, textAlign: 'center', fontFamily: SERIF, fontSize: 16, color: '#1c1c1c' }}>{qty}</span>
                      <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} style={{ width: 40, height: 40, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#1c1c1c', fontFamily: SANS }}>+</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    <button
                      onClick={handleCheckout}
                      style={{
                        width: '100%', padding: '15px 0', border: 'none',
                        background: '#1c1c1c', color: '#fff',
                        fontFamily: SANS, fontSize: 13, letterSpacing: '2px',
                        cursor: 'pointer',
                      }}
                    >
                      すぐに購入する
                    </button>
                    <button
                      onClick={handleAdd}
                      disabled={added}
                      style={{
                        width: '100%', padding: '14px 0',
                        border: '1px solid #1c1c1c', background: 'transparent',
                        color: added ? '#999' : '#1c1c1c',
                        fontFamily: SANS, fontSize: 13, letterSpacing: '2px',
                        cursor: added ? 'default' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {added ? 'カートに追加しました' : 'カートに入れる'}
                    </button>
                  </div>
                </>
              )}

              {soldOut && (
                <p style={{ fontFamily: SANS, fontSize: 13, color: '#999', padding: '16px 0', borderTop: '1px solid #e8e3da', borderBottom: '1px solid #e8e3da', textAlign: 'center', letterSpacing: 1, marginBottom: 24 }}>
                  現在在庫がありません
                </p>
              )}

              {/* 配送・注意事項 */}
              <div style={{ background: '#f4f1ec', padding: '20px 20px', marginBottom: 20 }}>
                <p style={{ fontFamily: SANS, fontSize: 12, color: '#717171', margin: 0, lineHeight: 2 }}>
                  ※ 送料は都道府県により異なります（¥1,000〜¥1,800）<br />
                  ※ ご注文後、順次発送いたします<br />
                  ※ 発送完了時にメールでお知らせします
                </p>
              </div>

              {cartCount > 0 && (
                <Link
                  to="/checkout"
                  style={{
                    display: 'block', textAlign: 'center', padding: '12px 0',
                    border: '1px solid #e8e3da', color: '#717171',
                    textDecoration: 'none', fontFamily: SANS, fontSize: 12, letterSpacing: '1.5px',
                  }}
                >
                  カートを見る ({cartCount})
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
