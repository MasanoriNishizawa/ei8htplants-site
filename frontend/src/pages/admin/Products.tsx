import { useEffect, useState } from 'react'
import { api, type Product, type ProductBody } from '../../lib/api'

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

const BLANK: ProductBody = {
  name: '', description: '', price: 0, stock: 0,
  image_urls: [], is_published: false, display_order: 0,
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Product | null | 'new'>(null)
  const [form, setForm] = useState<ProductBody>(BLANK)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = () => {
    api.products.list(true).then(setProducts).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openNew = () => { setEditing('new'); setForm({ ...BLANK, display_order: products.length }) }
  const openEdit = (p: Product) => { setEditing(p); setForm({ name: p.name, description: p.description ?? '', price: p.price, stock: p.stock, image_urls: p.image_urls, is_published: p.is_published, display_order: p.display_order }) }
  const closeModal = () => { setEditing(null); setForm(BLANK) }

  const set = <K extends keyof ProductBody>(k: K, v: ProductBody[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await api.upload(file)
      set('image_urls', [...form.image_urls, url])
    } catch { /* ignore */ }
    setUploading(false)
    e.target.value = ''
  }

  const removeImage = (i: number) =>
    set('image_urls', form.image_urls.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing === 'new') {
        const p = await api.products.create(form)
        setProducts((prev) => [...prev, p])
      } else if (editing) {
        const p = await api.products.update(editing.id, form)
        setProducts((prev) => prev.map((x) => x.id === p.id ? p : x))
      }
      closeModal()
    } catch { /* ignore */ }
    setSaving(false)
  }

  const handleDelete = async (p: Product) => {
    if (!confirm(`「${p.name}」を削除しますか？`)) return
    await api.products.delete(p.id)
    setProducts((prev) => prev.filter((x) => x.id !== p.id))
  }

  const togglePublish = async (p: Product) => {
    const updated = await api.products.update(p.id, { ...p, is_published: !p.is_published })
    setProducts((prev) => prev.map((x) => x.id === updated.id ? updated : x))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    border: '1px solid #dddde8', fontSize: 14, fontFamily: 'inherit',
    color: '#1c2417', background: '#fff', outline: 'none',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>商品管理</h2>
        <button onClick={openNew} style={{ padding: '9px 20px', background: '#1c2417', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          + 商品追加
        </button>
      </div>

      {loading ? <p style={{ color: '#8a9a7e' }}>読み込み中...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
                {['画像', '商品名', '価格', '在庫', '状態', '操作'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 500, color: '#3a4535', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                  <td style={{ padding: '10px 14px' }}>
                    {p.image_urls[0] ? (
                      <img src={p.image_urls[0]} alt="" style={{ width: 48, height: 48, objectFit: 'cover', display: 'block', border: '1px solid #dddde8' }} />
                    ) : <div style={{ width: 48, height: 48, background: '#f5f5f8', border: '1px solid #dddde8' }} />}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{p.name}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmt(p.price)}</td>
                  <td style={{ padding: '10px 14px', color: p.stock === 0 ? '#c0392b' : '#1c2417' }}>{p.stock}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => togglePublish(p)}
                      style={{
                        padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontFamily: 'inherit',
                        background: p.is_published ? '#d4edda' : '#f0f0f5',
                        color: p.is_published ? '#155724' : '#666',
                      }}
                    >
                      {p.is_published ? '公開中' : '非公開'}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openEdit(p)} style={{ padding: '5px 14px', border: '1px solid #dddde8', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>
                      <button onClick={() => handleDelete(p)} style={{ padding: '5px 14px', border: '1px solid #f8d7da', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#c0392b' }}>削除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: '#8a9a7e' }}>商品がありません。</p>}
        </div>
      )}

      {/* 編集モーダル */}
      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={closeModal}>
          <div style={{ background: '#fff', maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 24px', fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22 }}>
              {editing === 'new' ? '商品追加' : '商品編集'}
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>商品名 *</label>
              <input required style={inputStyle} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>説明</label>
              <textarea style={{ ...inputStyle, height: 100, resize: 'vertical' }} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>価格（円・税込）*</label>
                <input required type="number" min={0} style={inputStyle} value={form.price} onChange={(e) => set('price', Number(e.target.value))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>在庫数 *</label>
                <input required type="number" min={0} style={inputStyle} value={form.stock} onChange={(e) => set('stock', Number(e.target.value))} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>画像</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {form.image_urls.map((url, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', border: '1px solid #dddde8', display: 'block' }} />
                    <button onClick={() => removeImage(i)} style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#c0392b', color: '#fff', fontSize: 11, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
              <label style={{ display: 'inline-block', padding: '8px 16px', border: '1px solid #dddde8', fontSize: 12, cursor: 'pointer', color: '#3a4535' }}>
                {uploading ? 'アップロード中...' : '+ 画像追加'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
              </label>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#1c2417' }}>
                <input type="checkbox" checked={form.is_published} onChange={(e) => set('is_published', e.target.checked)} />
                公開する
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '10px 20px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', background: '#1c2417', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
