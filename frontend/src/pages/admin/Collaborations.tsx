import { useEffect, useState } from 'react'
import { api, type Collaboration, type CollaborationPayload } from '../../lib/api'

const empty: CollaborationPayload = {
  title: '',
  partner_name: '',
  description: '',
  video_url: '',
  image_url: '',
  event_date: '',
}

export default function AdminCollaborations() {
  const [items, setItems] = useState<Collaboration[]>([])
  const [form, setForm] = useState<CollaborationPayload>(empty)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = () => api.collaborations.list().then(setItems)
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const payload: CollaborationPayload = {
      title: form.title,
      ...(form.partner_name && { partner_name: form.partner_name }),
      ...(form.description && { description: form.description }),
      ...(form.video_url && { video_url: form.video_url }),
      ...(form.image_url && { image_url: form.image_url }),
      ...(form.event_date && { event_date: form.event_date }),
    }
    await api.collaborations.add(payload)
    setForm(empty)
    await load()
    setSaving(false)
  }

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const localUrl = URL.createObjectURL(file)
    setForm((f) => ({ ...f, image_url: localUrl }))
    setUploading(true)
    try {
      const uploaded = await api.upload(file)
      setForm((f) => ({ ...f, image_url: uploaded }))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await api.collaborations.delete(id)
    load()
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4,
    fontSize: 15, fontFamily: 'inherit', background: '#ffffff', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>コラボレーション管理</h2>

      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, padding: 20, background: '#ffffff', borderRadius: 4, border: '1px solid #dddde8' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <input required placeholder="タイトル *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <input placeholder="コラボ相手" value={form.partner_name} onChange={(e) => setForm({ ...form, partner_name: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <input type="date" placeholder="開催日" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <input type="url" placeholder="動画URL（任意）" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ width: 88, height: 88, borderRadius: 4, border: '1px solid #dddde8', overflow: 'hidden', flexShrink: 0, cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f8', opacity: uploading ? 0.5 : 1 }}>
            {form.image_url && !form.image_url.startsWith('blob:') ? (
              <img src={form.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 24, color: '#aaa' }}>{uploading ? '…' : '+'}</span>
            )}
            <input type="file" accept="image/*" onChange={handleImageFile} disabled={uploading} style={{ display: 'none' }} />
          </label>
          {form.image_url && !form.image_url.startsWith('blob:') && (
            <button type="button" onClick={() => setForm({ ...form, image_url: '' })} style={{ fontSize: 12, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>削除</button>
          )}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <textarea
            placeholder="説明文（任意）"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
            {saving ? '追加中...' : '追加'}
          </button>
        </div>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: item.image_url ? '80px 1fr auto' : '1fr auto', gap: 16, alignItems: 'start', padding: '16px 20px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4 }}>
            {item.image_url && (
              <img src={item.image_url} alt={item.title} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 2 }} />
            )}
            <div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{item.title}</div>
              {item.partner_name && <div style={{ fontSize: 13, color: '#8a9a7e' }}>{item.partner_name}</div>}
              {item.event_date && <div style={{ fontSize: 13, color: '#8a9a7e' }}>{item.event_date}</div>}
              {item.description && <div style={{ fontSize: 13, color: '#3a4535', marginTop: 6, lineHeight: 1.6 }}>{item.description}</div>}
              {item.video_url && <div style={{ fontSize: 12, color: '#4a6741', marginTop: 4 }}>動画あり</div>}
            </div>
            <button onClick={() => del(item.id)} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#c0392b', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>削除</button>
          </div>
        ))}
        {items.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: '#8a9a7e' }}>コラボレーションがありません。</p>}
      </div>
    </div>
  )
}
