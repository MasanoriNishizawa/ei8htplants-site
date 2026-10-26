import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import LoadError from '../components/LoadError'
import { useApi } from '../hooks/useApi'
import { api, type Product } from '../lib/api'
import { parseBlocks, blocksToText } from '../lib/blocks'
import { useCart } from '../lib/cart'
import { useT } from '../lib/lang'
import PageMeta from '../components/PageMeta'
import ShareButtons from '../components/ShareButtons'
import { formatYen } from '../lib/format'


/** ページの背景色（生成り） */
const BG = '#faf9f7'
/** 見出し用（明朝体）の書体 */
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
/** 本文用（ゴシック体）の書体 */
const SANS = "'Noto Sans JP', sans-serif"

/**
 * 商品詳細ページ。ブロックコンテンツ・購入ボックス・フローティングカートボタンを提供する
 * @returns 商品詳細の画面（読み込み中・失敗・見つからないときはそれぞれの案内）
 */
export default function ShopProduct() {
  const t = useT()
  // URL の商品 id（/shop/:id）
  const { id } = useParams<{ id: string }>()
  // 選んでいる数量
  const [qty, setQty] = useState(1)
  // 「カートに追加しました」を一時的に出しているあいだ true
  const [added, setAdded] = useState(false)
  // カートへの追加と、カートの中身
  const { add, items } = useCart()
  // 「すぐに購入する」で購入手続きへ移るため
  const navigate = useNavigate()

  // URL の id で商品を取る。別の商品へ移ったら読み込み中に戻り、前の商品の応答が後から届いても捨てる（useApi）。
  // ページの先頭へのスクロールは App.tsx の ScrollToTop が行う
  const { data, loading, error, reload } = useApi(
    (): Promise<Product> => api.products.get(id ?? ''),
    [id],
    { enabled: !!id },
  )
  // 表示する商品（見つからなければ null）
  const product = data

  // 別の商品へ移ったら数量を 1 に戻す
  useEffect(() => { setQty(1) }, [id])

  // 「カートに追加しました」を 1.6 秒後に戻す（画面を離れたらタイマーを止める）
  useEffect(() => {
    if (!added) return
    const timer = setTimeout(() => setAdded(false), 1600)
    return () => clearTimeout(timer)
  }, [added])

  // この商品がカートに入っている数と、カート全体の点数（フローティングのカートボタン用）
  const cartQty = items.find((i) => i.product.id === id)?.quantity ?? 0
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)

  /** 選んだ数量をカートに入れ、「追加しました」を少しのあいだ出す */
  const handleAdd = () => {
    if (!product) return
    add(product, qty)
    setAdded(true)
  }

  /** 選んだ数量をカートに入れて、そのまま購入手続きへ進む */
  const handleBuyNow = () => {
    if (!product) return
    add(product, qty)
    navigate('/official/checkout')
  }

  // 読み込み中
  if (loading) {
    return (
      <div role="status" style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 13, letterSpacing: 2 }}>{t('読み込み中...', 'Loading...')}</p>
      </div>
    )
  }

  // 404 以外の失敗（通信の失敗など）は「見つかりません」ではなく再読み込みを案内する
  if (error && !error.message.startsWith('404')) return <LoadError onRetry={reload} />

  // 商品が無い（404・URL に id が無い）ときは「見つかりません」とショップへのリンク
  if (!product) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', fontWeight: 300 }}>{t('商品が見つかりません。', 'Product not found.')}</p>
        <Link to="/official/shop" style={{ fontFamily: SANS, color: '#1c1c1c', fontSize: 13, letterSpacing: 1 }}>{t('ショップに戻る', 'Back to Shop')}</Link>
      </div>
    )
  }

  // あと何点カートに入れられるか（在庫 − すでにカートにある数）
  const maxQty = product.stock - cartQty
  // 売り切れか
  const soldOut = product.stock === 0

  // 商品説明のブロック
  const allBlocks = parseBlocks(product.description)
  // 最初の画像ブロックを大きな写真に使う（無ければ商品の 1 枚目の画像）
  const heroImgIdx = allBlocks.findIndex((b) => b.type === 'image' && !!b.url)
  const heroBlock = allBlocks[heroImgIdx]
  const heroUrl: string | null = heroBlock?.type === 'image' ? heroBlock.url : (product.image_urls[0] ?? null)

  return (
    <>
      <PageMeta title={`${product.name} | Shop`} description={blocksToText(allBlocks) || product.name} ogImage={product.image_urls[0]} />

      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* パンくず */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 12, color: '#aaa' }}>
        <Link to="/official/shop" style={{ color: '#aaa', textDecoration: 'none' }}>Shop</Link>
            <span>/</span>
            <span style={{ color: '#717171' }}>{product.name}</span>
          </div>
        </div>

        {/* 商品ページの本文（タイトル・価格・写真・説明・購入ボックス） */}
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
            <span style={{ fontFamily: SERIF, fontSize: 22, color: '#1c1c1c' }}>{formatYen(product.price)}</span>
            <span style={{ fontFamily: SANS, fontSize: 11, color: '#aaa' }}>{t('税込・送料別', 'Tax incl. · Shipping extra')}</span>
            {soldOut && <span style={{ fontFamily: SANS, fontSize: 12, color: '#c0392b', marginLeft: 8 }}>{t('売り切れ', 'Sold out')}</span>}
          </div>

          {/* メイン画像（最初のimageブロック、またはimage_urls[0]） */}
          {heroUrl && (
            <div style={{ marginBottom: 40, background: '#f0ede8', overflow: 'hidden', aspectRatio: '16/10' }}>
              <img src={heroUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}

          {/* 本文ブロック */}
          <div style={{ marginBottom: 48 }}>
            {allBlocks.map((block, i) => {
              if (block.type === 'image') {
                // 大きな写真に使った画像は本文では繰り返さない。URL の無い画像ブロックも出さない
                if (i === heroImgIdx) return null
                return block.url ? (
                  <div key={i} style={{ marginBottom: 32, background: '#f0ede8', overflow: 'hidden', aspectRatio: '4/3' }}>
                    <img src={block.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ) : null
              }
              if (block.type === 'heading') return (
                <h2 key={i} style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: '#1c1c1c', margin: '0 0 16px', letterSpacing: '0.04em', lineHeight: 1.6 }}>
                  {block.value}
                </h2>
              )
              if (block.type === 'text') return (
                <p key={i} style={{ fontFamily: SANS, fontSize: 15, color: '#3a3a3a', lineHeight: 2.2, margin: '0 0 28px', whiteSpace: 'pre-wrap' }}>
                  {block.value}
                </p>
              )
              return null
            })}

            {/* ブロックなし・複数画像の場合グリッド表示（2 枚目以降。1 枚目は上の大きな写真に使っている） */}
            {allBlocks.length === 0 && product.image_urls.length > 1 && (
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
              <span style={{ fontFamily: SERIF, fontSize: 28, color: '#1c1c1c' }}>{formatYen(product.price)}</span>
              <span style={{ fontFamily: SANS, fontSize: 12, color: '#aaa' }}>{t('税込・送料別', 'Tax incl. · Shipping extra')}</span>
            </div>

            {/* 在庫の残り（カートに入れている数も添える） */}
            <p style={{ fontFamily: SANS, fontSize: 12, color: soldOut ? '#c0392b' : '#aaa', margin: '0 0 28px' }}>
              {soldOut
                ? t('現在売り切れです', 'Out of stock')
                : t(`残り ${product.stock} 点${cartQty > 0 ? `（カート: ${cartQty}）` : ''}`,
                    `${product.stock} left${cartQty > 0 ? ` (in cart: ${cartQty})` : ''}`)}
            </p>

            {/* 在庫があり、まだカートに入れられるときだけ数量とボタンを出す */}
            {!soldOut && maxQty > 0 && (
              <>
                {/* 数量（1 〜 maxQty の範囲で増減） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: '#717171', letterSpacing: 1 }}>{t('数量', 'Qty')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', background: '#fff' }}>
                    <button type="button" aria-label={t('数量を減らす', 'Decrease quantity')} onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ width: 40, height: 40, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#1c1c1c' }}>−</button>
                    <span aria-live="polite" style={{ width: 36, textAlign: 'center', fontFamily: SERIF, fontSize: 16, color: '#1c1c1c' }}>{qty}</span>
                    <button type="button" aria-label={t('数量を増やす', 'Increase quantity')} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} style={{ width: 40, height: 40, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#1c1c1c' }}>+</button>
                  </div>
                </div>

                {/* カートに入れる（追加直後は少しのあいだ押せない）・すぐに購入する */}
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
                    {added ? t('カートに追加しました', 'Added to Cart') : t('カートに入れる', 'Add to Cart')}
                  </button>
                  <button
                    onClick={handleBuyNow}
                    style={{
                      width: '100%', padding: '14px 0',
                      border: '1px solid #1c1c1c', background: 'transparent', color: '#1c1c1c',
                      fontFamily: SANS, fontSize: 13, letterSpacing: '2px', cursor: 'pointer',
                    }}
                  >
                    {t('すぐに購入する', 'Buy Now')}
                  </button>
                </div>
              </>
            )}

            {/* 配送説明 */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e8e3da' }}>
              <p style={{ fontFamily: SANS, fontSize: 12, color: '#aaa', margin: 0, lineHeight: 2 }}>
                {t(
                  <>※ 送料は都道府県により異なります（¥1,000〜¥1,800）<br />※ 発送完了時にメールでお知らせします</>,
                  <>※ Shipping varies by prefecture (¥1,000–¥1,800)<br />※ You will be notified by email when your order ships</>
                )}
              </p>
            </div>
          </div>
        </article>

        {/* シェアボタンとショップに戻るリンク */}
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ marginBottom: 24 }}>
          <ShareButtons url={`${window.location.origin}/official/shop/${id}`} text={`${product.name} | ei8ht plants Shop`} />
          </div>
          <Link to="/official/shop" style={{ fontFamily: SANS, fontSize: 13, color: '#aaa', textDecoration: 'none', letterSpacing: 1 }}>
            {t('← Shop 一覧に戻る', '← Back to Shop')}
          </Link>
        </div>

        {/* フローティングカートボタン（カートに商品があるときだけ右下に固定して出す） */}
        {cartCount > 0 && (
          <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 100 }}>
            <Link
              to="/official/checkout"
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
              {t(`カート (${cartCount})`, `Cart (${cartCount})`)}
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
