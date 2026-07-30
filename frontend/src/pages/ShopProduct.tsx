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
  const { add, items } = useCart()
  const navigate = useNavigate()

  useEffect(() => {
    if (!id) return
    api.products.get(id).then((p) => { setProduct(p); setQty(1) }).catch(() => {}).finally(() => setLoading(false))
    window.scrollTo(0, 0)
  }, [id])

  const cartQty = items.find((i) => i.product.id === id)?.quantity ?? 0
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)

  const handleAdd = () => {
    if (!product) return
    add(product, qty)
    setAdded(true)
    setTimeout(() => setAdded(false), 1600)
  }

  const handleBuyNow = () => {
    if (!product) return
    add(product, qty)
    navigate('/checkout')
  }

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 13, letterSpacing: 2 }}>Loading...</p>
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

  // `## 見出し` で始まる行をセクションとして分割。なければ1段落ずつ扱う
  const rawDesc = product.description ?? ''
  type Section = { heading: string | null; body: string }
  const sections: Section[] = (() => {
    if (!rawDesc.trim()) return []
    if (!rawDesc.includes('##')) {
      return rawDesc.split(/\n\n+/).filter(Boolean).map((s) => ({ heading: null, body: s }))
    }
    const result: Section[] = []
    let current: Section = { heading: null, body: '' }
    for (const line of rawDesc.split('\n')) {
      if (line.startsWith('## ')) {
        if (current.body.trim() || current.heading) result.push(current)
        current = { heading: line.replace(/^## /, ''), body: '' }
      } else {
        current.body += (current.body ? '\n' : '') + line
      }
    }
    if (current.body.trim() || current.heading) result.push(current)
    return result
  })()

  return (
    <>
      <PageMeta title={`${product.name} | ei8ht plants Shop`} description={product.description ?? product.name} />

      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* パンくず */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 12, color: '#aaa' }}>
            <Link to="/shop" style={{ color: '#aaa', textDecoration: 'none' }}>Shop</Link>
            <span>/</span>
            <span style={{ color: '#717171' }}>{product.name}</span>
          </div>
        </div>

        {/* 記事本文 */}
        <article style={{ maxWidth: 720, margin: '0 auto', padding: '56px 24px 0' }}>

          {/* ブランドラベル・タイトル */}
          <header style={{ marginBottom: 40 }}>
            <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '3px', color: '#aaa', margin: '0 0 14px', textTransform: 'uppercase' }}>
              ei8ht plants
            </p>
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 400, color: '#1c1c1c', margin: 0, lineHeight: 1.6, letterSpacing: '0.04em' }}>
              {product.name}
            </h1>
          </header>

          {/* 価格（タイトル直下に小さく表示） */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 40, paddingBottom: 24, borderBottom: '1px solid #e8e3da' }}>
            <span style={{ fontFamily: SERIF, fontSize: 22, color: '#1c1c1c' }}>{fmt(product.price)}</span>
            <span style={{ fontFamily: SANS, fontSize: 11, color: '#aaa' }}>税込・送料別</span>
            {soldOut && <span style={{ fontFamily: SANS, fontSize: 12, color: '#c0392b', marginLeft: 8 }}>売り切れ</span>}
          </div>

          {/* メイン画像 */}
          {product.image_urls[0] && (
            <div style={{ marginBottom: 40, background: '#f0ede8', overflow: 'hidden', aspectRatio: '16/10' }}>
              <img
                src={product.image_urls[0]}
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          )}

          {/* 本文（セクションごとに見出し・テキスト・画像を交互配置） */}
          <div style={{ marginBottom: 48 }}>
            {sections.map((sec, i) => (
              <div key={i} style={{ marginBottom: 40 }}>
                {sec.heading && (
                  <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: '#1c1c1c', margin: '0 0 16px', letterSpacing: '0.04em', lineHeight: 1.6 }}>
                    {sec.heading}
                  </h2>
                )}
                {sec.body.trim() && (
                  <p style={{ fontFamily: SANS, fontSize: 15, color: '#3a3a3a', lineHeight: 2.2, margin: '0 0 28px', whiteSpace: 'pre-wrap' }}>
                    {sec.body.trim()}
                  </p>
                )}
                {/* セクションごとに対応する追加画像を挿入 */}
                {product.image_urls[i + 1] && (
                  <div style={{ background: '#f0ede8', overflow: 'hidden', aspectRatio: '4/3' }}>
                    <img
                      src={product.image_urls[i + 1]}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* 説明文がなく追加画像だけある場合のグリッド */}
            {sections.length === 0 && product.image_urls.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
                {product.image_urls.slice(1).map((url, i) => (
                  <div key={i} style={{ background: '#f0ede8', overflow: 'hidden', aspectRatio: '1/1' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 購入ボックス */}
          <div style={{ border: '1px solid #e8e3da', background: '#fff', padding: '36px 32px', marginBottom: 80 }}>
            <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '3px', color: '#aaa', margin: '0 0 10px', textTransform: 'uppercase' }}>
              ei8ht plants
            </p>
            <p style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: '#1c1c1c', margin: '0 0 20px', letterSpacing: '0.04em' }}>
              {product.name}
            </p>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: SERIF, fontSize: 28, color: '#1c1c1c' }}>{fmt(product.price)}</span>
              <span style={{ fontFamily: SANS, fontSize: 12, color: '#aaa' }}>税込・送料別</span>
            </div>

            <p style={{ fontFamily: SANS, fontSize: 12, color: soldOut ? '#c0392b' : '#aaa', margin: '0 0 28px' }}>
              {soldOut ? '現在売り切れです' : `残り ${product.stock} 点${cartQty > 0 ? `（カート: ${cartQty}）` : ''}`}
            </p>

            {!soldOut && maxQty > 0 && (
              <>
                {/* 数量 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: '#717171', letterSpacing: 1 }}>数量</span>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', background: '#fff' }}>
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ width: 40, height: 40, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#1c1c1c' }}>−</button>
                    <span style={{ width: 36, textAlign: 'center', fontFamily: SERIF, fontSize: 16, color: '#1c1c1c' }}>{qty}</span>
                    <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} style={{ width: 40, height: 40, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#1c1c1c' }}>+</button>
                  </div>
                </div>

                {/* ボタン */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={handleAdd}
                    disabled={added}
                    style={{
                      width: '100%', padding: '15px 0', border: 'none',
                      background: added ? '#a0a098' : '#1c1c1c', color: '#fff',
                      fontFamily: SANS, fontSize: 13, letterSpacing: '2px',
                      cursor: added ? 'default' : 'pointer', transition: 'background 0.2s',
                    }}
                  >
                    {added ? 'カートに追加しました' : 'カートに入れる'}
                  </button>
                  <button
                    onClick={handleBuyNow}
                    style={{
                      width: '100%', padding: '14px 0',
                      border: '1px solid #1c1c1c', background: 'transparent', color: '#1c1c1c',
                      fontFamily: SANS, fontSize: 13, letterSpacing: '2px', cursor: 'pointer',
                    }}
                  >
                    すぐに購入する
                  </button>
                </div>
              </>
            )}

            {/* 配送説明 */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e8e3da' }}>
              <p style={{ fontFamily: SANS, fontSize: 12, color: '#aaa', margin: 0, lineHeight: 2 }}>
                ※ 送料は都道府県により異なります（¥1,000〜¥1,800）<br />
                ※ 発送完了時にメールでお知らせします
              </p>
            </div>
          </div>
        </article>

        {/* ショップに戻るリンク */}
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 80px' }}>
          <Link to="/shop" style={{ fontFamily: SANS, fontSize: 13, color: '#aaa', textDecoration: 'none', letterSpacing: 1 }}>
            ← Shop 一覧に戻る
          </Link>
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
