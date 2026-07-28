import { useEffect, useState } from 'react'
import { api, type Stockist, type StockistBody } from '../../lib/api'

const BRANDS = ['ei8ht plants', 'Habitat Oides', 'HUE']

type Form = { name: string; area: string; address: string; url: string; brands: string[] }
const empty: Form = { name: '', area: '', address: '', url: '', brands: [] }

function BrandCheckboxes({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (b: string) =>
    onChange(value.includes(b) ? value.filter((x) => x !== b) : [...value, b])
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {BRANDS.map((b) => (
        <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', color: '#3a4535' }}>
          <input type="checkbox" checked={value.includes(b)} onChange={() => toggle(b)} />
          {b}
        </label>
      ))}
    </div>
  )
}

export default function AdminStockists() {
  const [stockists, setStockists] = useState<Stockist[]>([])
  const [form, setForm] = useState<Form>(empty)
  const [editing, setEditing] = useState<Stockist | null>(null)
  const [editForm, setEditForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)

  const load = () => api.stockists.list().then(setStockists)
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await api.stockists.add(form)
    setForm(empty)
    await load()
    setSaving(false)
  }

  const startEdit = (s: Stockist) => {
    setEditing(s)
    setEditForm({ name: s.name, area: s.area ?? '', address: s.address ?? '', url: s.url ?? '', brands: s.brands ?? [] })
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    const body: StockistBody = {
      name: editForm.name,
      area: editForm.area || null,
      address: editForm.address || null,
      url: editForm.url || null,
      brands: editForm.brands,
    }
    await api.stockists.patch(editing.id, body)
    setEditing(null)
    await load()
    setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await api.stockists.delete(id)
    load()
  }

  const inputStyle: React.CSSProperties = { padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', background: '#ffffff', width: '100%', boxSizing: 'border-box' }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>取扱店管理</h2>

      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, padding: 20, background: '#ffffff', borderRadius: 12, border: '1px solid #dddde8' }}>
        <div><input required placeholder="店舗名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></div>
        <div><input placeholder="エリア（例: 東京）" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} style={inputStyle} /></div>
        <div><input placeholder="住所" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} /></div>
        <div><input type="url" placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={inputStyle} /></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={{ fontSize: 12, color: '#8a9a7e', margin: '0 0 8px', letterSpacing: 1 }}>取扱ブランド</p>
          <BrandCheckboxes value={form.brands} onChange={(brands) => setForm({ ...form, brands })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>追加</button>
        </div>
      </form>

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form onSubmit={saveEdit} style={{ background: '#ffffff', borderRadius: 14, padding: 32, width: 480, maxWidth: '90vw', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <h3 style={{ gridColumn: '1 / -1', fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, margin: '0 0 8px' }}>取扱店を編集</h3>
            <div><input required placeholder="店舗名" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} /></div>
            <div><input placeholder="エリア" value={editForm.area} onChange={(e) => setEditForm({ ...editForm, area: e.target.value })} style={inputStyle} /></div>
            <div><input placeholder="住所" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} style={inputStyle} /></div>
            <div><input type="url" placeholder="URL" value={editForm.url} onChange={(e) => setEditForm({ ...editForm, url: e.target.value })} style={inputStyle} /></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ fontSize: 12, color: '#8a9a7e', margin: '0 0 8px', letterSpacing: 1 }}>取扱ブランド</p>
              <BrandCheckboxes value={editForm.brands} onChange={(brands) => setEditForm({ ...editForm, brands })} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={() => setEditing(null)} style={{ padding: '10px 20px', background: 'none', border: '1px solid #dddde8', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>キャンセル</button>
              <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>保存</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stockists.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 10, gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div style={{ fontSize: 13, color: '#8a9a7e', marginTop: 2 }}>{[s.area, s.address].filter(Boolean).join(' / ')}</div>
              {s.brands?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {s.brands.map((b) => (
                    <span key={b} style={{ fontSize: 11, background: '#eee8da', color: '#3a4535', padding: '2px 8px', borderRadius: 10, letterSpacing: 0.5 }}>{b}</span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => startEdit(s)} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 8, fontSize: 13, background: 'none', cursor: 'pointer', color: '#3a4535' }}>編集</button>
              <button onClick={() => del(s.id)} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 8, fontSize: 13, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
