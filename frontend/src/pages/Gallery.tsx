import { useEffect, useState } from 'react'
import { api, type GalleryImage } from '../lib/api'
import PageMeta from '../components/PageMeta'

const BRANDS = ['ei8ht plants', 'Habitat Oides', 'HUE by ei8ht plants']

export default function Gallery() {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBrand, setActiveBrand] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.gallery.list(activeBrand ?? undefined).then(setImages).finally(() => setLoading(false))
  }, [activeBrand])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    document.body.style.overflow = lightbox ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lightbox])

  return (
    <>
      <PageMeta title="Gallery" description="ei8ht plants、Habitat Oides、HUE の植物ギャラリー。" />
      <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f5f5f7' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Gallery</h1>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 0, borderBottom: '1px solid #dddde8', background: '#f5f5f7' }}>
        {[null, ...BRANDS].map((b) => (
          <button
            key={b ?? 'all'}
            onClick={() => setActiveBrand(b)}
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
        {loading && <p style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-muted)' }}>読み込み中...</p>}
        {!loading && images.length === 0 && (
          <p style={{ textAlign: 'center', padding: '100px 0', color: 'var(--c-muted)', fontSize: 13 }}>まだ写真が追加されていません。</p>
        )}
        <div className="gallery-grid">
          {images.map((img) => (
            <div key={img.id} className="gallery-item" onClick={() => setLightbox(img.url)}>
              <img src={img.url} alt={img.alt ?? ''} loading="lazy" />
            </div>
          ))}
        </div>
      </div>

      {lightbox && (
        <div
          style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.95)', zIndex: 2000, alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
          onClick={() => setLightbox(null)}
        >
          <span style={{ position: 'absolute', top: 20, right: 30, color: '#fff', fontSize: 35, fontWeight: 200, cursor: 'pointer', lineHeight: 1 }}>×</span>
          <img src={lightbox} alt="" style={{ maxWidth: '90%', maxHeight: '85%', objectFit: 'contain' }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}
