import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type Article, type Product } from '../lib/api'
import { parseBlocks } from '../components/BlockEditor'
import { useCart } from '../lib/cart'
import PageMeta from '../components/PageMeta'

const BG = '#faf9f7'
const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
const SANS = "'Noto Sans JP', sans-serif"

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function JournalArticle() {
  const { id } = useParams<{ id: string }>()
  const [article, setArticle] = useState<Article | null>(null)
  const [linkedProducts, setLinkedProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const { add, items } = useCart()

  useEffect(() => {
    if (!id) return
    api.articles.get(id)
      .then(async (a) => {
        setArticle(a)
        if (a.product_ids && a.product_ids.length > 0) {
          const all = await api.products.list()
          setLinkedProducts(all.filter((p) => a.product_ids.includes(p.id)))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    window.scrollTo(0, 0)
  }, [id])

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 13, letterSpacing: 2 }}>Loading...</p>
      </div>
    )
  }

  if (!article) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', fontWeight: 300 }}>記事が見つかりません。</p>
        <Link to="/journal" style={{ fontFamily: SANS, color: '#1c1c1c', fontSize: 13, letterSpacing: 1 }}>Journal に戻る</Link>
      </div>
    )
  }

  const allBlocks = parseBlocks(article.content)
  const heroImgIdx = allBlocks.findIndex((b) => b.type === 'image' && !!(b as any).url)
  const heroUrl = heroImgIdx >= 0 ? (allBlocks[heroImgIdx] as any).url : (article.image_urls[0] ?? null)

  const cartCount = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <>
      <PageMeta title={`${article.title} | ei8ht plants Journal`} description={article.content?.slice(0, 100) ?? article.title} />

      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* パンくず */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 12, color: '#aaa' }}>
            <Link to="/journal" style={{ color: '#aaa', textDecoration: 'none' }}>Journal</Link>
            <span>/</span>
            <span style={{ color: '#717171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.title}</span>
          </div>
        </div>

        {/* 記事本文 */}
        <article style={{ maxWidth: 720, margin: '0 auto', padding: '56px 24px 80px' }}>

          {/* タグ */}
          {article.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {article.tags.map((tag) => (
                <span key={tag} style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '1.5px', color: '#aaa', background: '#f0ede8', padding: '3px 10px' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* タイトル */}
          <header style={{ marginBottom: 40 }}>
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 400, color: '#1c1c1c', margin: '0 0 16px', lineHeight: 1.6, letterSpacing: '0.04em' }}>
              {article.title}
            </h1>
            {article.published_at && (
              <p style={{ fontFamily: SANS, fontSize: 12, color: '#bbb', margin: 0 }}>
                {fmtDate(article.published_at)}
              </p>
            )}
          </header>

          {/* メイン画像 */}
          {heroUrl && (
            <div style={{ marginBottom: 44, background: '#f0ede8', overflow: 'hidden', aspectRatio: '16/10' }}>
              <img src={heroUrl} alt={article.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}

          {/* 本文ブロック */}
          <div>
            {allBlocks.map((block, i) => {
              if (block.type === 'image') {
                if (i === heroImgIdx) return null
                return (block as any).url ? (
                  <div key={i} style={{ marginBottom: 36, background: '#f0ede8', overflow: 'hidden', aspectRatio: '4/3' }}>
                    <img src={(block as any).url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ) : null
              }
              if (block.type === 'heading') return (
                <h2 key={i} style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: '#1c1c1c', margin: '0 0 16px', letterSpacing: '0.04em', lineHeight: 1.6 }}>
                  {block.value}
                </h2>
              )
              if (block.type === 'text') return (
                <p key={i} style={{ fontFamily: SANS, fontSize: 15, color: '#3a3a3a', lineHeight: 2.3, margin: '0 0 28px', whiteSpace: 'pre-wrap' }}>
                  {block.value}
                </p>
              )
              return null
            })}

            {/* ブロックなし・複数画像の場合グリッド表示 */}
            {allBlocks.length === 0 && article.image_urls.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {article.image_urls.slice(1).map((url, i) => (
                  <div key={i} style={{ background: '#f0ede8', overflow: 'hidden', aspectRatio: '1/1' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 関連商品 */}
          {linkedProducts.length > 0 && (
            <div style={{ borderTop: '1px solid #e8e3da', marginTop: 56, paddingTop: 48 }}>
              <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: '#aaa', margin: '0 0 8px' }}>
                Shop
              </p>
              <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: '#1c1c1c', margin: '0 0 32px', letterSpacing: '0.04em' }}>
                記事で紹介した商品
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {linkedProducts.map((p) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 20, alignItems: 'center' }}>
                    <Link to={`/shop/${p.id}`} style={{ display: 'block', overflow: 'hidden', aspectRatio: '1/1', background: '#f0ede8', flexShrink: 0 }}>
                      {p.image_urls[0] ? (
                        <img src={p.image_urls[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: '#e8e3da' }} />
                      )}
                    </Link>
                    <div>
                      <Link to={`/shop/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <p style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 400, color: '#1c1c1c', margin: '0 0 6px', lineHeight: 1.5, letterSpacing: '0.04em' }}>
                          {p.name}
                        </p>
                      </Link>
                      <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', margin: '0 0 12px' }}>
                        {fmt(p.price)}
                        <span style={{ fontSize: 11, color: '#bbb', marginLeft: 6 }}>税込・送料別</span>
                      </p>
                      {p.stock > 0 ? (
                        <button
                          onClick={() => add(p)}
                          style={{
                            padding: '9px 20px', background: '#1c1c1c', color: '#fff', border: 'none',
                            fontFamily: SANS, fontSize: 12, letterSpacing: '1px', cursor: 'pointer',
                          }}
                        >
                          カートに入れる
                        </button>
                      ) : (
                        <p style={{ fontFamily: SANS, fontSize: 12, color: '#c0392b', margin: 0, letterSpacing: 1 }}>売り切れ</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 戻るリンク */}
          <div style={{ borderTop: '1px solid #e8e3da', paddingTop: 32, marginTop: linkedProducts.length > 0 ? 48 : 16 }}>
            <Link to="/journal" style={{ fontFamily: SANS, fontSize: 13, color: '#aaa', textDecoration: 'none', letterSpacing: 1 }}>
              ← Journal 一覧に戻る
            </Link>
          </div>
        </article>
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
    </>
  )
}
