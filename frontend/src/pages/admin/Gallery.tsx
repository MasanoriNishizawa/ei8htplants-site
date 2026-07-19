import { useEffect, useState } from 'react'
import { api, type GalleryImage } from '../../lib/api'

export default function AdminGallery() {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => api.gallery.list().then(setImages)
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return
    setSaving(true)
    await fetch('/api/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, alt }) })
    setUrl(''); setAlt('')
    await load()
    setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await fetch(`/api/gallery/${id}`, { method: 'DELETE' })
    load()
  }

  const inputStyle: React.CSSProperties = { padding: '10px 14px', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', background: '#fffcf6' }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>ギャラリー管理</h2>
      <form onSubmit={add} style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        <input required type="url" placeholder="画像URL" value={url} onChange={(e) => setUrl(e.target.value)} style={{ ...inputStyle, flex: 2, minWidth: 200 }} />
        <input placeholder="ALTテキスト（任意）" value={alt} onChange={(e) => setAlt(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
        <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>追加</button>
      </form>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {images.map((img) => (
          <div key={img.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1/1' }}>
            <img src={img.url} alt={img.alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button
              onClick={() => del(img.id)}
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
