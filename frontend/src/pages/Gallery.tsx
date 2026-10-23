import { useState } from 'react'
import { api } from '../lib/api'
import PageMeta from '../components/PageMeta'
import ImageLightbox from '../components/ImageLightbox'
import LoadError from '../components/LoadError'
import { useApi } from '../hooks/useApi'
import { useT } from '../lib/lang'
import { BRANDS } from '../lib/brands'

/** ブランド別フィルターとライトボックス（拡大表示）を備えたギャラリーページ */
export default function Gallery() {
  // 選んでいるブランドの正式名（タブの表示に使う。null はすべて）
  const [activeBrand, setActiveBrand] = useState<string | null>(null)
  // 拡大表示している写真の位置（null は閉じている）
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const t = useT()

  // サーバーに渡すブランドの値。管理画面のギャラリーは短い表記（HUE）で保存するので、正式名を短い表記に直して絞り込む
  const activeShortName = BRANDS.find((b) => b.name === activeBrand)?.shortName

  // ブランドを切り替えるたびに取り直す。切り替え前の古い応答が後から届いても捨てる（useApi）
  const { data, loading, error, reload } = useApi(
    () => api.gallery.list(activeShortName),
    [activeShortName],
  )
  // 表示する写真（取得前・失敗時は空）
  const images = data ?? []

  return (
    <>
      <PageMeta title="Gallery" description="ei8ht plants、Habitat Oides、HUE の植物ギャラリー。" />
      <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f5f5f7' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Gallery</h1>
      </div>

      {/* ブランドの切り替えタブ */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 0, borderBottom: '1px solid #dddde8', background: '#f5f5f7' }}>
        {[null, ...BRANDS.map((brand) => brand.name)].map((b) => (
          <button
            key={b ?? 'all'}
            type="button"
            aria-pressed={activeBrand === b}
            onClick={() => { setActiveBrand(b); setLightboxIdx(null) }}
            style={{
              padding: '12px 20px', border: 'none', background: 'none',
              fontSize: 12, letterSpacing: '1.5px', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: 'inherit',
              color: activeBrand === b ? '#1c2417' : '#8a9a7e',
              borderBottom: activeBrand === b ? '2px solid #1c2417' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 0.2s',
            }}
          >
            {b ?? 'All'}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto 100px', padding: '40px 20px 0' }}>
        {loading && <p role="status" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-muted)' }}>{t('読み込み中...', 'Loading...')}</p>}
        {/* 通信の失敗は「まだありません」と分けて案内する */}
        {!loading && error && <LoadError onRetry={reload} />}
        {!loading && !error && images.length === 0 && (
          <p style={{ textAlign: 'center', padding: '100px 0', color: 'var(--c-muted)', fontSize: 13 }}>{t('まだ写真が追加されていません。', 'No photos yet.')}</p>
        )}
        {/* 写真の一覧。キーボードでも選べるよう、各写真を button で包む */}
        <div className="gallery-grid">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className="gallery-item"
              aria-label={img.alt ? t(`${img.alt} を拡大表示`, `Enlarge: ${img.alt}`) : t(`写真 ${i + 1} を拡大表示`, `Enlarge photo ${i + 1}`)}
              onClick={() => setLightboxIdx(i)}
            >
              <img src={img.url} alt={img.alt ?? ''} loading="lazy" />
            </button>
          ))}
        </div>
      </div>

      {lightboxIdx !== null && images[lightboxIdx] && (
        <ImageLightbox
          images={images.map((img) => img.url)}
          index={lightboxIdx}
          alt={images[lightboxIdx].alt ?? ''}
          onClose={() => setLightboxIdx(null)}
          onChange={setLightboxIdx}
        />
      )}
    </>
  )
}
