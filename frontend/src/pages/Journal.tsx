import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Article } from '../lib/api'
import { parseBlocks } from '../components/BlockEditor'
import PageMeta from '../components/PageMeta'

const BG = '#f8f7f5'
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
const SANS = "'Noto Sans JP', sans-serif"

function excerpt(text: string | null, max = 120): string {
  if (!text) return ''
  const blocks = parseBlocks(text)
  const plain = blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as any).value as string)
    .join(' ')
  const src = plain || text.replace(/^## .+$/gm, '').replace(/\n+/g, ' ').trim()
  return src.length > max ? src.slice(0, max) + '…' : src
}

function fmtDate(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function Journal() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  useEffect(() => {
    api.articles.list().then(setArticles).finally(() => setLoading(false))
  }, [])

  const allTags = Array.from(new Set(articles.flatMap((a) => a.tags))).sort()
  const filtered = activeTag ? articles.filter((a) => a.tags.includes(activeTag)) : articles
  const [featured, ...rest] = filtered

  return (
    <>
      <PageMeta title="Journal | ei8ht plants" description="植物と暮らしにまつわるコラム" />

      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* マストヘッド */}
        <div style={{ borderBottom: '1px solid #e0dbd4', background: '#fff' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '44px 32px 36px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '4px', textTransform: 'uppercase', color: '#bbb', margin: '0 0 10px' }}>
                  ei8ht plants
                </p>
                <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(48px, 7vw, 84px)', fontWeight: 300, letterSpacing: '0.02em', margin: 0, color: '#1c1c1c', lineHeight: 0.9, fontStyle: 'italic' }}>
                  Journal
                </h1>
              </div>
              <p style={{ fontFamily: SANS, fontSize: 13, color: '#8a9a7e', margin: 0, lineHeight: 2, maxWidth: 280 }}>
                植物と暮らしについての考察。素材、育て方、美意識。
              </p>
            </div>
          </div>

          {/* タグナビ */}
          {allTags.length > 0 && (
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px', display: 'flex', gap: 0, overflowX: 'auto', flexWrap: 'nowrap', borderTop: '1px solid #f0ece6' }}>
              <button
                onClick={() => setActiveTag(null)}
                style={{ padding: '13px 18px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 12, letterSpacing: '1px', whiteSpace: 'nowrap', color: activeTag === null ? '#1c1c1c' : '#aaa', borderBottom: activeTag === null ? '2px solid #1c1c1c' : '2px solid transparent', transition: 'all 0.15s' }}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  style={{ padding: '13px 18px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 12, letterSpacing: '1px', whiteSpace: 'nowrap', color: activeTag === tag ? '#1c1c1c' : '#aaa', borderBottom: activeTag === tag ? '2px solid #1c1c1c' : '2px solid transparent', transition: 'all 0.15s' }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 12, letterSpacing: 3 }}>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', textAlign: 'center', padding: '80px 0', fontWeight: 300 }}>
            記事がありません。
          </p>
        ) : (
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px 100px' }}>

            {/* フィーチャー記事（1番目・大きく） */}
            {featured && (
              <div style={{ borderBottom: '1px solid #e0dbd4', padding: '56px 0' }}>
                <Link to={`/journal/${featured.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gridTemplateColumns: '1fr', gap: 0 }} className="journal-featured">
                  <div style={{ display: 'grid', gap: 0 }} className="journal-featured-grid">
                    {/* 画像 */}
                    <div style={{ overflow: 'hidden', background: '#e8e3da', aspectRatio: '16/9', position: 'relative' }} className="journal-featured-img">
                      {featured.image_urls[0] ? (
                        <img
                          src={featured.image_urls[0]}
                          alt={featured.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.8s ease' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.03)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: SANS, fontSize: 11, color: '#ccc', letterSpacing: 3 }}>ei8ht plants</span>
                        </div>
                      )}
                      {featured.tags.length > 0 && (
                        <div style={{ position: 'absolute', top: 20, left: 20 }}>
                          <span style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '2px', background: '#fff', color: '#3a3a3a', padding: '5px 12px', textTransform: 'uppercase' }}>
                            {featured.tags[0]}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* テキスト */}
                    <div style={{ padding: '36px 0 8px' }} className="journal-featured-text">
                      <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '3px', color: '#bbb', margin: '0 0 16px', textTransform: 'uppercase' }}>
                        {featured.published_at ? fmtDate(featured.published_at) : 'Featured'}
                      </p>
                      <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(26px, 3.5vw, 44px)', fontWeight: 300, color: '#1c1c1c', margin: '0 0 20px', lineHeight: 1.3, letterSpacing: '0.02em', fontStyle: 'italic' }}>
                        {featured.title}
                      </h2>
                      {featured.content && (
                        <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', lineHeight: 2.2, margin: '0 0 28px', maxWidth: 680 }}>
                          {excerpt(featured.content, 160)}
                        </p>
                      )}
                      <span style={{ fontFamily: SANS, fontSize: 11, color: '#1c1c1c', letterSpacing: '3px', textTransform: 'uppercase', borderBottom: '1px solid #1c1c1c', paddingBottom: 3 }}>
                        Read Article →
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            )}

            {/* 残り記事グリッド */}
            {rest.length > 0 && (
              <div style={{ paddingTop: 56 }}>
                <div className="journal-grid">
                  {rest.map((article) => (
                    <article key={article.id}>
                      <Link to={`/journal/${article.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                        {/* 画像 */}
                        <div style={{ overflow: 'hidden', background: '#e8e3da', aspectRatio: '3/2', marginBottom: 20, position: 'relative' }}>
                          {article.image_urls[0] ? (
                            <img
                              src={article.image_urls[0]}
                              alt={article.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.6s ease' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontFamily: SANS, fontSize: 10, color: '#ccc', letterSpacing: 2 }}>ei8ht plants</span>
                            </div>
                          )}
                          {article.tags.length > 0 && (
                            <div style={{ position: 'absolute', top: 14, left: 14 }}>
                              <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '2px', background: '#fff', color: '#3a3a3a', padding: '4px 10px', textTransform: 'uppercase' }}>
                                {article.tags[0]}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* テキスト */}
                        {article.published_at && (
                          <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '2px', color: '#bbb', margin: '0 0 10px', textTransform: 'uppercase' }}>
                            {fmtDate(article.published_at)}
                          </p>
                        )}
                        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(17px, 1.6vw, 20px)', fontWeight: 400, color: '#1c1c1c', margin: '0 0 12px', lineHeight: 1.5, letterSpacing: '0.03em' }}>
                          {article.title}
                        </h2>
                        {article.content && (
                          <p style={{ fontFamily: SANS, fontSize: 13, color: '#8a9a7e', lineHeight: 2, margin: '0 0 16px' }}>
                            {excerpt(article.content, 90)}
                          </p>
                        )}
                        <span style={{ fontFamily: SANS, fontSize: 10, color: '#aaa', letterSpacing: '2px', textTransform: 'uppercase' }}>
                          Read →
                        </span>
                      </Link>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
