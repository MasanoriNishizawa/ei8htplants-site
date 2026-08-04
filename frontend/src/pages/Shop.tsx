import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Product, type Article, PRODUCT_CATEGORIES } from '../lib/api'
import { useCart } from '../lib/cart'
import PageMeta from '../components/PageMeta'
import ShareButtons from '../components/ShareButtons'

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
const SANS = "'Noto Sans JP', sans-serif"

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: SANS, fontSize: 9, letterSpacing: '3px', textTransform: 'uppercase',
  color: 'var(--c-faint)', margin: '0 0 6px',
}

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { items } = useCart()
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)

  useEffect(() => {
    Promise.all([api.products.list(), api.articles.list()])
      .then(([p, a]) => { setProducts(p); setArticles(a) })
      .finally(() => setLoading(false))
  }, [])

  const latestArticles = articles.slice(0, 4)
  const backlogArticles = articles.slice(4)
  const filteredProducts = activeCategory
    ? products.filter((p) => p.category === activeCategory)
    : products
  const usedCategories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[]

  return (
    <>
      <PageMeta title="Shop | ei8ht plants" description="ei8ht plants オンラインストア" />

      <div style={{ background: 'var(--c-bg)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) clamp(16px, 3vw, 40px) 80px' }}>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ fontFamily: SANS, color: 'var(--c-faint)', fontSize: 11, letterSpacing: 3 }}>Loading...</p>
            </div>
          ) : (
            <>
              {/* ── Journal ── */}
              {articles.length > 0 && (
                <section style={{ marginBottom: 'clamp(40px, 6vw, 64px)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <p style={SECTION_LABEL}>Journal</p>
                      <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(20px, 2.5vw, 26px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.05em', margin: 0, color: 'var(--c-ink)' }}>
                        From the Blog
                      </h2>
                    </div>
                    <Link to="/journal" style={{ fontFamily: SANS, fontSize: 10, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      All →
                    </Link>
                  </div>

                  {/* 最新4記事 */}
                  <div className="shop-journal-grid">
                    {latestArticles.map((a) => (
                      <ArticleCard key={a.id} article={a} />
                    ))}
                  </div>

                  {/* バックログ */}
                  {backlogArticles.length > 0 && (
                    <>
                      {backlogOpen && (
                        <div className="shop-journal-grid" style={{ marginTop: 12 }}>
                          {backlogArticles.map((a) => (
                            <ArticleCard key={a.id} article={a} />
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop: 16, textAlign: 'center' }}>
                        <button
                          onClick={() => setBacklogOpen((v) => !v)}
                          style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--c-muted)', background: 'none', border: '1px solid var(--c-border)', padding: '8px 24px', cursor: 'pointer' }}
                        >
                          {backlogOpen ? 'Close' : `Backlog +${backlogArticles.length}`}
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--c-border)', margin: '0 0 clamp(32px, 5vw, 48px)' }} />

              {/* ── Products ── */}
              <section>
                <div style={{ marginBottom: 16 }}>
                  <p style={SECTION_LABEL}>Online Store</p>
                  <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(20px, 2.5vw, 26px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.05em', margin: 0, color: 'var(--c-ink)' }}>
                    All Items
                  </h2>
                </div>

                {/* カテゴリーフィルター */}
                {usedCategories.length > 0 && (
                  <div style={{ display: 'flex', gap: 0, overflowX: 'auto', borderBottom: '1px solid var(--c-border)', marginBottom: 28, scrollbarWidth: 'none' }}>
                    <button
                      onClick={() => setActiveCategory(null)}
                      style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '1.5px', whiteSpace: 'nowrap', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', color: activeCategory === null ? 'var(--c-ink)' : 'var(--c-faint)', borderBottom: activeCategory === null ? '2px solid var(--c-ink)' : '2px solid transparent', marginBottom: -1 }}
                    >
                      すべて
                    </button>
                    {PRODUCT_CATEGORIES.filter((c) => usedCategories.includes(c)).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '1.5px', whiteSpace: 'nowrap', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', color: activeCategory === cat ? 'var(--c-ink)' : 'var(--c-faint)', borderBottom: activeCategory === cat ? '2px solid var(--c-ink)' : '2px solid transparent', marginBottom: -1 }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {filteredProducts.length === 0 ? (
                  <p style={{ fontFamily: SANS, fontSize: 13, color: 'var(--c-faint)', padding: '40px 0' }}>
                    {products.length === 0 ? '現在販売中の商品はありません。' : 'このカテゴリーの商品はありません。'}
                  </p>
                ) : (
                  <div className="shop-product-grid">
                    {filteredProducts.map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid var(--c-border)' }}>
                  <ShareButtons url={`${window.location.origin}/shop`} text="ei8ht plants Shop" />
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* フローティングカート */}
      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 100 }}>
          <Link
            to="/checkout"
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--c-ink)', color: '#fffdf9', textDecoration: 'none', padding: '11px 22px', fontFamily: SANS, fontSize: 11, letterSpacing: '1px', boxShadow: '0 4px 20px rgba(0,0,0,0.18)' }}
          >
            Cart &nbsp;{cartCount}
          </Link>
        </div>
      )}
    </>
  )
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link to={`/journal/${article.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div
        onMouseEnter={(e) => { const img = e.currentTarget.querySelector('img') as HTMLImageElement | null; if (img) img.style.transform = 'scale(1.04)' }}
        onMouseLeave={(e) => { const img = e.currentTarget.querySelector('img') as HTMLImageElement | null; if (img) img.style.transform = 'scale(1)' }}
      >
        <div style={{ overflow: 'hidden', background: '#e8e3da', aspectRatio: '3/2', marginBottom: 10 }}>
          {article.image_urls[0] ? (
            <img src={article.image_urls[0]} alt={article.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#e0dbd2' }} />
          )}
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 'clamp(12px, 1.2vw, 14px)', color: 'var(--c-ink)', margin: 0, lineHeight: 1.5, letterSpacing: '0.02em' }}>
          {article.title}
        </p>
      </div>
    </Link>
  )
}

function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/shop/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div
        onMouseEnter={(e) => { const img = e.currentTarget.querySelector('img') as HTMLImageElement | null; if (img) img.style.transform = 'scale(1.04)' }}
        onMouseLeave={(e) => { const img = e.currentTarget.querySelector('img') as HTMLImageElement | null; if (img) img.style.transform = 'scale(1)' }}
      >
        <div style={{ overflow: 'hidden', background: '#e8e3da', aspectRatio: '1/1', marginBottom: 12, position: 'relative' }}>
          {product.image_urls[0] ? (
            <img src={product.image_urls[0]} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#e0dbd2' }} />
          )}
          {product.stock === 0 && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,24,0.36)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '3px', color: '#fffdf9', border: '1px solid rgba(255,253,249,0.6)', padding: '5px 14px' }}>SOLD OUT</span>
            </div>
          )}
        </div>
        <p style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '2px', color: 'var(--c-faint)', margin: '0 0 5px', textTransform: 'uppercase' }}>
          ei8ht plants
        </p>
        <p style={{ fontFamily: SERIF, fontSize: 'clamp(13px, 1.3vw, 15px)', color: 'var(--c-ink)', margin: '0 0 5px', lineHeight: 1.5 }}>
          {product.name}
        </p>
        <p style={{ fontFamily: SANS, fontSize: 12, color: product.stock === 0 ? 'var(--c-faint)' : 'var(--c-muted)', margin: 0 }}>
          {fmt(product.price)}
        </p>
      </div>
    </Link>
  )
}
