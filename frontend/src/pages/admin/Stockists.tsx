import { useEffect, useState } from 'react'
import { api, type Stockist } from '../../lib/api'

type Form = { name: string; area: string; address: string; url: string }
const empty: Form = { name: '', area: '', address: '', url: '' }

export default function AdminStockists() {
  const [stockists, setStockists] = useState<Stockist[]>([])
  const [form, setForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)

  const load = () => api.stockists.list().then(setStockists)
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/stockists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setForm(empty)
    await load()
    setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await fetch(`/api/stockists/${id}`, { method: 'DELETE' })
    load()
  }

  const inputStyle: React.CSSProperties = { padding: '10px 14px', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', background: '#fffcf6', width: '100%', boxSizing: 'border-box' }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>取扱店管理</h2>
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, padding: 20, background: '#fffcf6', borderRadius: 12, border: '1px solid #ddd4c0' }}>
        <div><input required placeholder="店舗名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></div>
        <div><input placeholder="エリア（例: 東京）" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} style={inputStyle} /></div>
        <div><input placeholder="住所" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} /></div>
        <div><input type="url" placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={inputStyle} /></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>追加</button>
        </div>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stockists.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: '#fffcf6', border: '1px solid #ddd4c0', borderRadius: 10 }}>
            <div>
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div style={{ fontSize: 13, color: '#8a9a7e', marginTop: 2 }}>{[s.area, s.address].filter(Boolean).join(' / ')}</div>
            </div>
            <button onClick={() => del(s.id)} style={{ padding: '8px 16px', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 13, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
          </div>
        ))}
      </div>
    </div>
  )
}
