import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type Article } from '../lib/api'
import PageMeta from '../components/PageMeta'

const BG = '#faf9f7'
const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
const SANS = "'Noto Sans JP', sans-serif"

function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function JournalArticle() {
  const { id } = useParams<{ id: string }>()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.articles.get(id).then(setArticle).catch(() => {}).finally(() => setLoading(false))
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

  // `## 見出し` でセクション分割
  type Section = { heading: string | null; body: string }
  const rawContent = article.content ?? ''
  const sections: Section[] = (() => {
    if (!rawContent.trim()) return []
    if (!rawContent.includes('##')) {
      return rawContent.split(/\n\n+/).filter(Boolean).map((s) => ({ heading: null, body: s }))
    }
    const result: Section[] = []
    let current: Section = { heading: null, body: '' }
    for (const line of rawContent.split('\n')) {
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
          {article.image_urls[0] && (
            <div style={{ marginBottom: 44, background: '#f0ede8', overflow: 'hidden', aspectRatio: '16/10' }}>
              <img src={article.image_urls[0]} alt={article.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}

          {/* 本文（セクションと画像を交互配置） */}
          <div>
            {sections.map((sec, i) => (
              <div key={i} style={{ marginBottom: 44 }}>
                {sec.heading && (
                  <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: '#1c1c1c', margin: '0 0 16px', letterSpacing: '0.04em', lineHeight: 1.6 }}>
                    {sec.heading}
                  </h2>
                )}
                {sec.body.trim() && (
                  <p style={{ fontFamily: SANS, fontSize: 15, color: '#3a3a3a', lineHeight: 2.3, margin: '0 0 28px', whiteSpace: 'pre-wrap' }}>
                    {sec.body.trim()}
                  </p>
                )}
                {article.image_urls[i + 1] && (
                  <div style={{ background: '#f0ede8', overflow: 'hidden', aspectRatio: '4/3' }}>
                    <img src={article.image_urls[i + 1]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                )}
              </div>
            ))}

            {/* 説明なしで追加画像だけある場合 */}
            {sections.length === 0 && article.image_urls.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {article.image_urls.slice(1).map((url, i) => (
                  <div key={i} style={{ background: '#f0ede8', overflow: 'hidden', aspectRatio: '1/1' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 戻るリンク */}
          <div style={{ borderTop: '1px solid #e8e3da', paddingTop: 32, marginTop: 16 }}>
            <Link to="/journal" style={{ fontFamily: SANS, fontSize: 13, color: '#aaa', textDecoration: 'none', letterSpacing: 1 }}>
              ← Journal 一覧に戻る
            </Link>
          </div>
        </article>
      </div>
    </>
  )
}
