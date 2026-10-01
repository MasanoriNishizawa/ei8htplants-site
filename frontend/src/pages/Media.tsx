import { useEffect, useState } from 'react'
import { api, type MediaAppearance } from '../lib/api'
import PageMeta from '../components/PageMeta'
import { useLang, useT } from '../lib/lang'

const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"

/**
 * YouTube URL から動画 ID を抽出する
 * @param url - youtube.com または youtu.be 形式の URL
 */
function getYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?/]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

/**
 * ISO 日付文字列を言語に応じた年月ラベルに変換する
 * @param s - ISO 形式の日付文字列
 * @param lang - 表示言語（'ja' | 'en'）
 */
function fmtDate(s: string | null, lang: 'ja' | 'en'): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'long' })
}

/**
 * YouTube サムネイルとメタ情報を表示する動画カードコンポーネント
 * @param item - メディア出演データ
 */
function VideoCard({ item }: { item: MediaAppearance }) {
  const { lang } = useLang()
  const videoId = getYouTubeId(item.youtube_url)
  const thumb = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null

  return (
    <a
      href={item.youtube_url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '16/9',
        background: '#e8e8e8', overflow: 'hidden', borderRadius: 2,
      }}>
        {thumb && (
          <img
            src={thumb}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s cubic-bezier(.22,1,.36,1)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
          />
        )}
        {/* play button */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 3.5L14.5 9L5 14.5V3.5Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ padding: '14px 0 0' }}>
        {item.published_at && (
          <p style={{ fontSize: 11, letterSpacing: 2, color: 'var(--c-muted)', margin: '0 0 6px', textTransform: 'uppercase' }}>
            {fmtDate(item.published_at, lang)}
          </p>
        )}
        <p style={{ fontSize: 15, fontWeight: 400, margin: '0 0 6px', color: 'var(--c-ink)', lineHeight: 1.5, letterSpacing: '0.02em' }}>
          {item.title}
        </p>
        {item.description && (
          <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: 0, lineHeight: 1.8, letterSpacing: '0.02em' }}>
            {item.description}
          </p>
        )}
      </div>
    </a>
  )
}

/** メディア出演情報ページ。YouTube サムネイル付きの動画カードグリッドを表示する */
export default function Media() {
  const [items, setItems] = useState<MediaAppearance[]>([])
  const [loading, setLoading] = useState(true)
  const t = useT()

  useEffect(() => {
    api.mediaAppearances.list().then(setItems).finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageMeta title="Media" description="ei8ht plants のメディア出演情報をまとめています。" />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) clamp(20px, 4vw, 48px)' }}>
        <header style={{ marginBottom: 'clamp(40px, 6vw, 72px)' }}>
          <p style={{ fontFamily: SERIF, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }}>
            Media
          </p>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 300, letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)', lineHeight: 1.3 }}>
            {t('出演情報', 'Appearances')}
          </h1>
        </header>

        {loading ? (
          <p style={{ color: 'var(--c-muted)', fontSize: 14 }}>{t('読み込み中...', 'Loading...')}</p>
        ) : items.length === 0 ? (
          <p style={{ color: 'var(--c-muted)', fontSize: 14 }}>{t('まだ登録されていません。', 'No appearances registered yet.')}</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
            gap: 'clamp(32px, 4vw, 48px) clamp(20px, 3vw, 36px)',
          }}>
            {items.map((item) => (
              <VideoCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
