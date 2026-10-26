import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { parseBlocks } from '../lib/blocks'
import { useT } from '../lib/lang'
import { parseLocalDate } from '../lib/localDate'
import PageMeta from '../components/PageMeta'
import LoadError from '../components/LoadError'
import { useApi } from '../hooks/useApi'

/** ページの背景色（生成り） */
const BG = '#f8f7f5'
/** 見出し用（明朝体）の書体 */
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
/** 本文用（ゴシック体）の書体 */
const SANS = "'Noto Sans JP', sans-serif"

/**
 * 記事コンテンツからテキストブロックを抽出し、指定文字数で切り詰めた抜粋を返す
 * @param text - ブロック JSON または生テキスト
 * @param max - 抜粋の最大文字数（デフォルト 120）
 * @returns 抜粋（max を超えたら末尾に「…」を付ける）
 */
function excerpt(text: string | null, max = 120): string {
  if (!text) return ''
  // 1. 本文をブロックに分け、テキストのブロックだけをつなぐ（見出し・画像は除く）
  const blocks = parseBlocks(text)
  const plain = blocks
    .flatMap((b) => (b.type === 'text' ? [b.value] : []))
    .join(' ')
  // 2. テキストのブロックが無ければ、元の文字列から「## 見出し」の行を除き、改行を空白にして使う
  const src = plain || text.replace(/^## .+$/gm, '').replace(/\n+/g, ' ').trim()
  // 3. 長ければ切り詰める
  return src.length > max ? src.slice(0, max) + '…' : src
}

/**
 * 日付の文字列を英語形式の日付ラベルに変換する（日付だけの文字列は現地の日付として読む）
 * @param s - 日付の文字列（YYYY-MM-DD または ISO 形式）
 * @returns 「May 1, 2026」の形（日付が無ければ空文字）
 */
function fmtDate(s: string | null): string {
  if (!s) return ''
  const d = parseLocalDate(s)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * ジャーナル（記事）一覧ページ。タグフィルター・フィーチャー記事グリッドを提供する
 * @returns 記事一覧の画面
 */
export default function Journal() {
  const t = useT()
  // 選んでいるタグ（null はすべて）
  const [activeTag, setActiveTag] = useState<string | null>(null)
  // 記事の一覧（失敗は error に入り、「記事がありません」とは分けて案内する）
  const { data, loading, error, reload } = useApi(() => api.articles.list(), [])
  // 表示する記事（取得前・失敗時は空）
  const articles = data ?? []

  // 全記事のタグ（重複なし・五十音／アルファベット順）
  const allTags = Array.from(new Set(articles.flatMap((a) => a.tags))).sort()
  // タグで絞り込んだ記事
  const filtered = activeTag ? articles.filter((a) => a.tags.includes(activeTag)) : articles
  // 先頭の 1 件は大きく出し（featured）、残りはグリッドに並べる（rest）
  const [featured, ...rest] = filtered

  return (
    <>
      <PageMeta title="Journal" description="植物と暮らしにまつわるコラム" />

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
            </div>
          </div>

          {/* タグナビ（タグが 1 つ以上あるときだけ。選んでいるタグに下線） */}
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

        {/* 読み込み中・失敗・0 件・記事の一覧のどれか 1 つを出す */}
        {loading ? (
          <div role="status" style={{ textAlign: 'center', padding: '100px 0' }}>
            <p style={{ fontFamily: SANS, color: '#aaa', fontSize: 12, letterSpacing: 3 }}>{t('読み込み中...', 'Loading...')}</p>
          </div>
        ) : error ? (
          <LoadError onRetry={reload} />
        ) : filtered.length === 0 ? (
          <p style={{ fontFamily: SERIF, fontSize: 18, color: '#999', textAlign: 'center', padding: '80px 0', fontWeight: 300 }}>
            {t('記事がありません。', 'No articles found.')}
          </p>
        ) : (
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px 100px' }}>

            {/* フィーチャー記事（1番目・大きく） */}
            {featured && (
              <div style={{ borderBottom: '1px solid #e0dbd4', padding: '56px 0' }}>
                <Link to={`/official/journal/${featured.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gridTemplateColumns: '1fr', gap: 0 }} className="journal-featured">
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
                      <Link to={`/official/journal/${article.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
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
                          <p style={{ fontFamily: SANS, fontSize: 13, color: 'var(--c-muted)', lineHeight: 2, margin: '0 0 16px' }}>
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
