import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Article } from '../lib/api'
import { parseBlocks } from '../components/BlockEditor'
import PageMeta from '../components/PageMeta'

const BG = '#faf9f7'
const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
const SANS = "'Noto Sans JP', sans-serif"

function excerpt(text: string | null, max = 100): string {
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
  return new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
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

  return (
    <>
      <PageMeta title="Journal | ei8ht plants" description="植物と暮らしにまつわるコラム" />

      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* ページヘッダー */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 860, margin: '0 auto', padding: '52px 24px 44px' }}>
            <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: '#aaa', margin: '0 0 12px' }}>
              Journal
            </p>
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 300, letterSpacing: '0.06em', margin: '0 0 20px', color: '#1c1c1c', lineHeight: 1.2 }}>
              植物と暮らす
            </h1>
            <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', margin: 0, lineHeight: 2 }}>
              植物のこと、暮らしのこと。ei8ht plants からのコラムです。
            </p>
          </div>
        </div>

        {/* タグフィルター */}
        {allTags.length > 0 && (
          <div style={{ background: '#fff', borderBottom: '1px solid #e8e3da' }}>
            <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap' }}>
              <button
                onClick={() => setActiveTag(null)}
                style={{
                  padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  fontFamily: SANS, fontSize: 13, whiteSpace: 'nowrap',
                  color: activeTag === null ? '#1c1c1c' : '#aaa',
                  borderBottom: activeTag === null ? '2px solid #1c1c1c' : '2px solid transparent',
                }}
              >
                すべて
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  style={{
                    padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer',
                    fontFamily: SANS, fontSize: 13, whiteSpace: 'nowrap',
                    color: activeTag === tag ? '#1c1c1c' : '#aaa',
                    borderBottom: activeTag === tag ? '2px solid #1c1c1c' : '2px solid transparent',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 記事一覧 */}
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '56px 24px 100px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 13, letterSpacing: 2 }}>Loading...</p>
            </div>
          ) : filtered.length === 0 ? (
            <p style={{ fontFamily: SERIF, fontSize: 16, color: '#999', textAlign: 'center', padding: '60px 0', fontWeight: 300 }}>
              記事がありません。
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 56 }}>
              {filtered.map((article, idx) => (
                <article key={article.id} style={{ borderBottom: '1px solid #e8e3da', paddingBottom: 56 }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: idx % 2 === 0 ? 'minmax(0,1.1fr) minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1.1fr)',
                    gap: 40,
                    alignItems: 'center',
                  }}>
                    {/* サムネイル */}
                    <div style={{ order: idx % 2 === 0 ? 0 : 1 }}>
                      <Link to={`/journal/${article.id}`} style={{ display: 'block', overflow: 'hidden', aspectRatio: '4/3', background: '#f0ede8' }}>
                        {article.image_urls[0] ? (
                          <img
                            src={article.image_urls[0]}
                            alt={article.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontFamily: SANS, fontSize: 12, color: '#ccc', letterSpacing: 2 }}>ei8ht plants</span>
                          </div>
                        )}
                      </Link>
                    </div>

                    {/* テキスト */}
                    <div style={{ order: idx % 2 === 0 ? 1 : 0 }}>
                      {article.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                          {article.tags.map((tag) => (
                            <span key={tag} style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '1.5px', color: '#aaa', background: '#f0ede8', padding: '3px 10px' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <Link to={`/journal/${article.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(18px, 2.2vw, 22px)', fontWeight: 400, color: '#1c1c1c', margin: '0 0 14px', lineHeight: 1.7, letterSpacing: '0.04em' }}>
                          {article.title}
                        </h2>
                      </Link>
                      {article.content && (
                        <p style={{ fontFamily: SANS, fontSize: 14, color: '#717171', lineHeight: 2, margin: '0 0 16px' }}>
                          {excerpt(article.content)}
                        </p>
                      )}
                      {article.published_at && (
                        <p style={{ fontFamily: SANS, fontSize: 12, color: '#bbb', margin: '0 0 20px' }}>
                          {fmtDate(article.published_at)}
                        </p>
                      )}
                      <Link
                        to={`/journal/${article.id}`}
                        style={{ fontFamily: SANS, fontSize: 12, color: '#1c1c1c', letterSpacing: '2px', textDecoration: 'none', borderBottom: '1px solid #1c1c1c', paddingBottom: 2 }}
                      >
                        続きを読む
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
