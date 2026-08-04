import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type Article, type Product } from '../lib/api'
import { parseBlocks, blocksToText } from '../components/BlockEditor'
import { useCart } from '../lib/cart'
import PageMeta from '../components/PageMeta'
import ShareButtons from '../components/ShareButtons'

const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
const SANS = "'Noto Sans JP', sans-serif"

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: SANS, color: '#b4ada4', fontSize: 11, letterSpacing: 3 }}>Loading...</p>
      </div>
    )
  }

  if (!article) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ fontFamily: SERIF, fontSize: 20, color: '#8c8478', fontWeight: 300 }}>記事が見つかりません。</p>
        <Link to="/journal" style={{ fontFamily: SANS, color: '#1a1a18', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>← Journal</Link>
      </div>
    )
  }

  const allBlocks = parseBlocks(article.content)
  const heroImgIdx = allBlocks.findIndex((b) => b.type === 'image' && !!(b as any).url)
  const heroUrl = heroImgIdx >= 0 ? (allBlocks[heroImgIdx] as any).url : (article.image_urls[0] ?? null)
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <>
      <PageMeta title={`${article.title} | ei8ht plants Journal`} description={blocksToText(allBlocks) || article.title} ogImage={heroUrl ?? undefined} />

      {/* ヘッダービジュアル — フルブリード */}
      <div style={{ background: '#1a1a18', position: 'relative', overflow: 'hidden' }}>
        {heroUrl && (
          <img
            src={heroUrl}
            alt={article.title}
            style={{ width: '100%', height: 'clamp(320px, 55vw, 600px)', objectFit: 'cover', display: 'block', opacity: 0.72 }}
          />
        )}
        {!heroUrl && <div style={{ height: 'clamp(200px, 30vw, 320px)' }} />}

        {/* オーバーレイテキスト */}
        <div style={{
          position: heroUrl ? 'absolute' : 'relative',
          bottom: 0, left: 0, right: 0,
          padding: 'clamp(24px, 4vw, 60px)',
          background: heroUrl ? 'linear-gradient(to top, rgba(20,20,18,0.86) 0%, rgba(20,20,18,0.3) 70%, transparent 100%)' : 'transparent',
        }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {article.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {article.tags.map((tag) => (
                  <span key={tag} style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '2.5px', color: '#c8c0b4', border: '1px solid rgba(200,192,180,0.4)', padding: '4px 12px', textTransform: 'uppercase' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 300, color: heroUrl ? '#fffdf9' : '#1a1a18', margin: '0 0 16px', lineHeight: 1.25, letterSpacing: '0.02em', fontStyle: 'italic' }}>
              {article.title}
            </h1>
            {article.published_at && (
              <p style={{ fontFamily: SANS, fontSize: 11, color: heroUrl ? 'rgba(255,253,249,0.55)' : '#b4ada4', margin: 0, letterSpacing: '1.5px' }}>
                {fmtDate(article.published_at)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* パンくず */}
      <div style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 11, color: 'var(--c-faint)', letterSpacing: '1px' }}>
          <Link to="/journal" style={{ color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase', fontSize: 10 }}>Journal</Link>
          <span style={{ color: 'var(--c-faint)' }}>/</span>
          <span style={{ color: 'var(--c-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.title}</span>
        </div>
      </div>

      {/* 本文 */}
      <article style={{ maxWidth: 740, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) 24px clamp(60px, 8vw, 100px)' }}>

        {/* 本文ブロック */}
        <div>
          {allBlocks.map((block, i) => {
            if (block.type === 'image') {
              if (i === heroImgIdx) return null
              return (block as any).url ? (
                <figure key={i} style={{ margin: '44px -24px', background: '#e8e3da', overflow: 'hidden' }}>
                  <img src={(block as any).url} alt="" style={{ width: '100%', display: 'block', maxHeight: 520, objectFit: 'cover' }} />
                </figure>
              ) : null
            }
            if (block.type === 'heading') return (
              <h2 key={i} style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 2.4vw, 28px)', fontWeight: 400, color: 'var(--c-ink)', margin: '48px 0 20px', letterSpacing: '0.03em', lineHeight: 1.5, fontStyle: 'italic' }}>
                {block.value}
              </h2>
            )
            if (block.type === 'text') return (
              <p key={i} style={{ fontFamily: SANS, fontSize: 15, color: 'var(--c-body)', lineHeight: 2.4, margin: '0 0 32px', whiteSpace: 'pre-wrap', letterSpacing: '0.02em' }}>
                {block.value}
              </p>
            )
            return null
          })}

          {allBlocks.length === 0 && article.image_urls.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 32 }}>
              {article.image_urls.slice(1).map((url, i) => (
                <div key={i} style={{ background: '#e8e3da', overflow: 'hidden', aspectRatio: '1/1' }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 関連商品 */}
        {linkedProducts.length > 0 && (
          <div style={{ borderTop: '1px solid var(--c-border)', marginTop: 64, paddingTop: 56 }}>
            <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '4px', textTransform: 'uppercase', color: 'var(--c-faint)', margin: '0 0 6px' }}>
              Shop
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 2.2vw, 26px)', fontWeight: 300, color: 'var(--c-ink)', margin: '0 0 36px', fontStyle: 'italic' }}>
              記事で紹介した商品
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 28 }}>
              {linkedProducts.map((p) => (
                <div key={p.id}>
                  <Link to={`/shop/${p.id}`} style={{ display: 'block', overflow: 'hidden', aspectRatio: '1/1', background: '#e8e3da', marginBottom: 14 }}>
                    {p.image_urls[0] ? (
                      <img src={p.image_urls[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#e8e3da' }} />
                    )}
                  </Link>
                  <Link to={`/shop/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <p style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 400, color: 'var(--c-ink)', margin: '0 0 6px', lineHeight: 1.5 }}>{p.name}</p>
                  </Link>
                  <p style={{ fontFamily: SANS, fontSize: 13, color: 'var(--c-muted)', margin: '0 0 12px' }}>
                    {fmt(p.price)}
                    <span style={{ fontSize: 10, color: 'var(--c-faint)', marginLeft: 5 }}>税込・送料別</span>
                  </p>
                  {p.stock > 0 ? (
                    <button
                      onClick={() => add(p)}
                      style={{ padding: '9px 18px', background: 'var(--c-ink)', color: '#fffdf9', border: 'none', fontFamily: SANS, fontSize: 11, letterSpacing: '1.5px', cursor: 'pointer', textTransform: 'uppercase' }}
                    >
                      カートに入れる
                    </button>
                  ) : (
                    <p style={{ fontFamily: SANS, fontSize: 11, color: '#c04040', margin: 0, letterSpacing: 1 }}>売り切れ</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 戻るリンク */}
        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 36, marginTop: linkedProducts.length > 0 ? 56 : 24 }}>
          <div style={{ marginBottom: 24 }}>
            <ShareButtons url={`${window.location.origin}/journal/${id}`} text={article.title} />
          </div>
          <Link to="/journal" style={{ fontFamily: SANS, fontSize: 11, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase' }}>
            ← Back to Journal
          </Link>
        </div>
      </article>

      {/* フローティングカートボタン */}
      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 100 }}>
          <Link
            to="/checkout"
            style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--c-ink)', color: '#fffdf9', textDecoration: 'none', padding: '13px 26px', fontFamily: SANS, fontSize: 12, letterSpacing: '1px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}
          >
            カート ({cartCount})
          </Link>
        </div>
      )}
    </>
  )
}
