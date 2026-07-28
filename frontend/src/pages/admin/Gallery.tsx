import { useEffect, useState } from 'react'
import { api, type GalleryImage } from '../../lib/api'

const BRANDS = ['ei8ht plants', 'Habitat Oides', 'HUE']

export default function AdminGallery() {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [brand, setBrand] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set())

  const load = () => api.gallery.list().then(setImages)
  useEffect(() => { load() }, [])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await api.upload(file)
      setUrl(uploaded)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return
    setSaving(true)
    await api.gallery.add({ url, alt: alt || null, brand: brand || null })
    setUrl(''); setAlt(''); setBrand('')
    await load()
    setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await api.gallery.delete(id)
    load()
  }

  const move = async (idx: number, dir: -1 | 1) => {
    const next = dir === -1 ? idx - 1 : idx + 1
    if (next < 0 || next >= images.length) return
    const a = images[idx], b = images[next]
    await Promise.all([
      api.gallery.updateOrder(a.id, b.display_order),
      api.gallery.updateOrder(b.id, a.display_order),
    ])
    load()
  }

  const inputStyle: React.CSSProperties = { padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', background: '#ffffff' }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>ギャラリー管理</h2>
      <form onSubmit={add} style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ width: 88, height: 88, borderRadius: 8, border: '1px solid #dddde8', overflow: 'hidden', flexShrink: 0, cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f8', opacity: uploading ? 0.5 : 1 }}>
          {url ? (
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 24, color: '#aaa' }}>{uploading ? '…' : '+'}</span>
          )}
          <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: 'none' }} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 2, minWidth: 200 }}>
          <input placeholder="ALTテキスト（任意）" value={alt} onChange={(e) => setAlt(e.target.value)} style={{ ...inputStyle, minWidth: 140 }} />
          <select value={brand} onChange={(e) => setBrand(e.target.value)} style={inputStyle}>
            <option value="">ブランド（任意）</option>
            {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button type="submit" disabled={!url || saving || uploading} style={{ padding: '10px 24px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: !url ? 0.5 : 1 }}>追加</button>
        </div>
      </form>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {images.map((img, idx) => (
          <div key={img.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1/1', background: '#f0f0f5' }}>
            <img
              src={img.url}
              alt={img.alt ?? ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setBrokenIds((prev) => new Set([...prev, img.id]))}
            />
            {brokenIds.has(img.id) && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(192,57,43,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, color: '#c0392b', background: '#fff', padding: '3px 10px', borderRadius: 10, fontWeight: 600 }}>URL無効</span>
              </div>
            )}
            {img.brand && (
              <span style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 10, letterSpacing: 1 }}>
                {img.brand}
              </span>
            )}
            <button onClick={() => del(img.id)}
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>
              x
            </button>
            <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button onClick={() => move(idx, -1)} disabled={idx === 0}
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === 0 ? 0.3 : 1 }}>
                ▲
              </button>
              <button onClick={() => move(idx, 1)} disabled={idx === images.length - 1}
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === images.length - 1 ? 0.3 : 1 }}>
                ▼
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
