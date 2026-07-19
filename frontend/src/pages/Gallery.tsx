import { useEffect, useState } from 'react'
import { api, type GalleryImage } from '../lib/api'

export default function Gallery() {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.gallery.list().then(setImages).finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Gallery</h1>
      </div>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px 80px' }}>
        {loading && <p style={{ textAlign: 'center', padding: '60px 0', color: '#8a9a7e' }}>読み込み中...</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {images.map((img) => (
            <div key={img.id} style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '1/1' }}>
              <img src={img.url} alt={img.alt ?? ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
