import { useEffect, useState } from 'react'
import { api, type GalleryImage } from '../lib/api'

export default function Gallery() {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    api.gallery.list().then(setImages).finally(() => setLoading(false))
  }, [])

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
      <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f7f3ec' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Gallery</h1>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto 100px', padding: '40px 20px 0' }}>
        {loading && <p style={{ textAlign: 'center', padding: '60px 0', color: '#8a9a7e' }}>読み込み中...</p>}
        {!loading && images.length === 0 && (
          <p style={{ textAlign: 'center', padding: '100px 0', color: '#8a9a7e', fontSize: 13 }}>まだ写真が追加されていません。</p>
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
