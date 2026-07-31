import { useEffect, useState } from 'react'
import { api, type Article, type ArticleBody, type Product } from '../../lib/api'
import BlockEditor, { type Block, parseBlocks, serializeBlocks } from '../../components/BlockEditor'

const BLANK: ArticleBody = {
  title: '', content: '', image_urls: [], tags: [], product_ids: [], is_published: false, display_order: 0,
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function AdminArticles() {
  const [articles, setArticles] = useState<Article[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Article | 'new' | null>(null)
  const [form, setForm] = useState<ArticleBody>(BLANK)
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])

  useEffect(() => {
    Promise.all([
      api.articles.list(true),
      api.products.list(true),
    ]).then(([arts, prods]) => {
      setArticles(arts)
      setProducts(prods)
    }).finally(() => setLoading(false))
  }, [])

  const openNew = () => {
    setEditing('new')
    setForm({ ...BLANK, display_order: articles.length })
    setBlocks([])
    setTagInput('')
  }
  const openEdit = (a: Article) => {
    setEditing(a)
    setForm({
      title: a.title,
      content: a.content ?? '',
      image_urls: a.image_urls,
      tags: a.tags,
      product_ids: a.product_ids ?? [],
      is_published: a.is_published,
      display_order: a.display_order,
    })
    setBlocks(parseBlocks(a.content))
    setTagInput('')
  }
  const close = () => { setEditing(null); setForm(BLANK); setBlocks([]) }

  const set = <K extends keyof ArticleBody>(k: K, v: ArticleBody[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagInput('')
  }
  const removeTag = (t: string) => set('tags', form.tags.filter((x) => x !== t))

  const toggleProduct = (id: string) => {
    const current = form.product_ids ?? []
    set('product_ids', current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
  }

  const handleSave = async () => {
    setSaving(true)
    const imageUrls = blocks.filter((b) => b.type === 'image').map((b) => (b as any).url).filter(Boolean)
    const payload = { ...form, content: serializeBlocks(blocks), image_urls: imageUrls }
    try {
      if (editing === 'new') {
        const a = await api.articles.create(payload)
        setArticles((prev) => [a, ...prev])
      } else if (editing) {
        const a = await api.articles.update(editing.id, payload)
        setArticles((prev) => prev.map((x) => x.id === a.id ? a : x))
      }
      close()
    } catch { /* ignore */ }
    setSaving(false)
  }

  const handleDelete = async (a: Article) => {
    if (!confirm(`「${a.title}」を削除しますか？`)) return
    await api.articles.delete(a.id)
    setArticles((prev) => prev.filter((x) => x.id !== a.id))
  }

  const togglePublish = async (a: Article) => {
    const updated = await api.articles.update(a.id, {
      title: a.title,
      content: a.content ?? '',
      image_urls: a.image_urls,
      tags: a.tags,
      product_ids: a.product_ids ?? [],
      is_published: !a.is_published,
      display_order: a.display_order,
    })
    setArticles((prev) => prev.map((x) => x.id === updated.id ? updated : x))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    border: '1px solid #dddde8', fontSize: 14, fontFamily: 'inherit',
    color: '#1c2417', background: '#fff', outline: 'none',
  }

  const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>記事管理</h2>
        <button onClick={openNew} style={{ padding: '9px 20px', background: '#1c2417', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          + 記事追加
        </button>
      </div>

      {loading ? <p style={{ color: '#8a9a7e' }}>読み込み中...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
                {['画像', 'タイトル', 'タグ', '公開日', '状態', '操作'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 500, color: '#3a4535', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                  <td style={{ padding: '10px 14px' }}>
                    {a.image_urls[0]
                      ? <img src={a.image_urls[0]} alt="" style={{ width: 48, height: 48, objectFit: 'cover', display: 'block', border: '1px solid #dddde8' }} />
                      : <div style={{ width: 48, height: 48, background: '#f5f5f8', border: '1px solid #dddde8' }} />}
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: 240 }}>
                    <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</p>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {a.tags.map((t) => (
                        <span key={t} style={{ fontSize: 11, padding: '2px 8px', background: '#f0f0f5', color: '#666' }}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#8a9a7e', whiteSpace: 'nowrap' }}>{fmtDate(a.published_at)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => togglePublish(a)}
                      style={{
                        padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontFamily: 'inherit',
                        background: a.is_published ? '#d4edda' : '#f0f0f5',
                        color: a.is_published ? '#155724' : '#666',
                      }}
                    >
                      {a.is_published ? '公開中' : '非公開'}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openEdit(a)} style={{ padding: '5px 14px', border: '1px solid #dddde8', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>
                      <button onClick={() => handleDelete(a)} style={{ padding: '5px 14px', border: '1px solid #f8d7da', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#c0392b' }}>削除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {articles.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: '#8a9a7e' }}>記事がありません。</p>}
        </div>
      )}

      {/* 編集モーダル */}
      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={close}>
          <div style={{ background: '#fff', maxWidth: 680, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 24px', fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22 }}>
              {editing === 'new' ? '記事追加' : '記事編集'}
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>タイトル *</label>
              <input required style={inputStyle} value={form.title} onChange={(e) => set('title', e.target.value)} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 10 }}>本文・画像</label>
              <BlockEditor blocks={blocks} onChange={setBlocks} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>タグ</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {form.tags.map((t) => (
                  <span key={t} style={{ fontSize: 12, padding: '4px 10px', background: '#f0f0f5', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t}
                    <button onClick={() => removeTag(t)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="タグを入力して Enter"
                />
                <button onClick={addTag} style={{ padding: '9px 16px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>追加</button>
              </div>
            </div>

            {/* 関連商品 */}
            {products.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 8 }}>関連商品（記事から購入できる商品）</label>
                <div style={{ border: '1px solid #dddde8', maxHeight: 220, overflowY: 'auto' }}>
                  {products.map((p) => {
                    const selected = (form.product_ids ?? []).includes(p.id)
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          borderBottom: '1px solid #f0f0f5', cursor: 'pointer',
                          background: selected ? '#f0f7f0' : '#fff',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(p.id)}
                          style={{ flexShrink: 0 }}
                        />
                        {p.image_urls[0] && (
                          <img src={p.image_urls[0]} alt="" style={{ width: 36, height: 36, objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8a9a7e' }}>{fmt(p.price)}{p.stock === 0 && <span style={{ color: '#c0392b', marginLeft: 8 }}>売り切れ</span>}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#1c2417' }}>
                <input type="checkbox" checked={form.is_published} onChange={(e) => set('is_published', e.target.checked)} />
                公開する
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={close} style={{ padding: '10px 20px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
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
