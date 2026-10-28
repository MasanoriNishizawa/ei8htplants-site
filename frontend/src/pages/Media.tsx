import { api, type MediaAppearance } from '../lib/api'
import PageMeta from '../components/PageMeta'
import LoadError from '../components/LoadError'
import { useApi } from '../hooks/useApi'
import { useLang, useT } from '../lib/lang'
import { parseLocalDate } from '../lib/localDate'

/** 見出し用（明朝体）の書体 */
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"

/**
 * YouTube URL から動画 ID を抽出する
 * @param url - youtube.com または youtu.be 形式の URL
 * @returns 動画 ID（読み取れなければ null）
 */
function getYouTubeId(url: string): string | null {
  // watch?v=・youtu.be/・embed/ の 3 つの形に対応する
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
 * 日付の文字列を言語に応じた年月ラベルに変換する（日付だけの文字列は現地の日付として読む）
 * @param s - 日付の文字列（YYYY-MM-DD または ISO 形式）
 * @param lang - 表示言語（'ja' | 'en'）
 * @returns 「2026年5月」「May 2026」のような文字列（日付が無ければ空文字）
 */
function fmtDate(s: string | null, lang: 'ja' | 'en'): string {
  if (!s) return ''
  return parseLocalDate(s).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'long' })
}

/**
 * YouTube サムネイルとメタ情報を表示する動画カードコンポーネント
 * @param item - メディア出演データ
 * @returns YouTube を新しいタブで開くカード
 */
function VideoCard({ item }: { item: MediaAppearance }) {
  // 今の表示言語（日付の書式に使う）
  const { lang } = useLang()
  // YouTube の動画 ID
  const videoId = getYouTubeId(item.youtube_url)
  // YouTube が用意しているサムネイル画像の URL（ID が読めなければ灰色の枠だけを出す）
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
      {/* 16:9 のサムネイル枠。未登録画像時も背景色で枠を保つ */}
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '16/9',
        background: '#e8e8e8', overflow: 'hidden', borderRadius: 2,
      }}>
        {/* サムネイルを枠いっぱいに切り抜き、ホバー時に拡大する画像 */}
        {thumb && (
          <img
            src={thumb}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s cubic-bezier(.22,1,.36,1)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
          />
        )}
        {/* 中央の再生マーク（飾り。クリックはカード全体のリンクが受ける） */}
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
      {/* 公開日・タイトル・説明の余白と文字表現 */}
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

/**
 * メディア出演情報ページ。YouTube サムネイル付きの動画カードグリッドを表示する
 * @returns メディア出演情報の画面
 */
export default function Media() {
  const t = useT()
  // 出演情報の一覧（失敗は error に入り、「まだ登録されていません」とは分けて案内する）
  const { data, loading, error, reload } = useApi(() => api.mediaAppearances.list(), [])
  // 表示する出演情報（取得前・失敗時は空）
  const items: MediaAppearance[] = data ?? []

  return (
    <>
      <PageMeta title="Media" description="ei8ht plants のメディア出演情報をまとめています。" />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) clamp(20px, 4vw, 48px)' }}>
        {/* ページの見出し */}
        <header style={{ marginBottom: 'clamp(40px, 6vw, 72px)' }}>
          <p style={{ fontFamily: SERIF, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }}>
            Media
          </p>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 300, letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)', lineHeight: 1.3 }}>
            {t('出演情報', 'Appearances')}
          </h1>
        </header>

        {/* 読み込み中・失敗・0 件・カードの一覧のどれか 1 つを出す */}
        {loading ? (
          <p role="status" style={{ color: 'var(--c-muted)', fontSize: 14 }}>{t('読み込み中...', 'Loading...')}</p>
        ) : error ? (
          <LoadError onRetry={reload} />
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
