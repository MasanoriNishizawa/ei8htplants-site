import { api, type Collaboration } from '../lib/api'
import PageMeta from '../components/PageMeta'
import ShareButtons from '../components/ShareButtons'
import LoadError from '../components/LoadError'
import { useApi } from '../hooks/useApi'
import { useLang, useT } from '../lib/lang'
import { parseLocalDate } from '../lib/localDate'

/**
 * Habitat Oides のコラボレーション作品・活動記録を一覧表示するページ
 * @returns コラボレーション一覧の画面
 */
export default function Collaborations() {
  const t = useT()
  // 今の表示言語（日付の書式に使う）
  const { lang } = useLang()

  // コラボレーションの一覧（失敗は error に入り、「近日公開予定」とは分けて案内する）
  const { data, loading, error, reload } = useApi(() => api.collaborations.list(), [])
  // 表示するコラボレーション（取得前・失敗時は空）
  const items: Collaboration[] = data ?? []

  return (
    <>
      <PageMeta title="Collaborations" description="Habitat Oides のコラボレーション作品・活動記録。" ogImage="/img/habitatOides/habitat_oides_hero.jpg" />
      {/* ページの見出し */}
      <div style={{ textAlign: 'center', padding: '72px 20px 48px', background: '#f5f5f7' }}>
        <p style={{ fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 14px' }}>Habitat Oides</p>
        <h1 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 200, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>
          Collaboration
        </h1>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '56px 20px 100px' }}>
        {loading && <p role="status" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-muted)' }}>{t('読み込み中...', 'Loading...')}</p>}

        {/* 通信の失敗は「近日公開予定」と分けて案内する */}
        {!loading && error && <LoadError onRetry={reload} />}

        {!loading && !error && items.length === 0 && (
          <p style={{ textAlign: 'center', padding: '100px 0', color: 'var(--c-muted)', fontSize: 13 }}>
            {t('コラボレーション情報は近日公開予定です。', 'Collaboration details coming soon.')}
          </p>
        )}

        {/* コラボレーションのカードを縦に並べる */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {items.map((item) => (
            <article
              key={item.id}
              style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, overflow: 'hidden' }}
            >
              {/* 画像（マウスを乗せると少し拡大する） */}
              {item.image_url && (
                <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: '#f0f0f5' }}>
                  <img
                    src={item.image_url}
                    alt={item.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.6s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                </div>
              )}

              {/* 画像が無いときだけ動画を音なしで自動再生する */}
              {item.video_url && !item.image_url && (
                <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', overflow: 'hidden' }}>
                  <video
                    src={item.video_url}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              )}

              {/* 相手先・日付・タイトル・説明・シェアボタン */}
              <div style={{ padding: '28px 32px' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 12 }}>
                  {item.partner_name && (
                    <span style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--c-muted)' }}>
                      {item.partner_name}
                    </span>
                  )}
                  {item.event_date && (
                    <span style={{ fontSize: 11, letterSpacing: 2, color: '#aaa' }}>
                      {parseLocalDate(item.event_date).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <h2 style={{ fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 300, letterSpacing: '0.06em', color: 'var(--c-ink)', margin: '0 0 16px', lineHeight: 1.4 }}>
                  {item.title}
                </h2>
                {item.description && (
                  <p style={{ fontSize: 16, color: 'var(--c-body)', lineHeight: 1.9, margin: '0 0 20px', whiteSpace: 'pre-wrap' }}>
                    {item.description}
                  </p>
                )}
                <ShareButtons url={`${window.location.origin}/collaborations`} text={item.title} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  )
}
