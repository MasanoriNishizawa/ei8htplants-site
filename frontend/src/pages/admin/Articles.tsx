import { useEffect, useState } from 'react'
import { api, type Article, type ArticleBody } from '../../lib/api'

const BLANK: ArticleBody = {
  title: '', content: '', image_urls: [], tags: [], is_published: false, display_order: 0,
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function AdminArticles() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Article | 'new' | null>(null)
  const [form, setForm] = useState<ArticleBody>(BLANK)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    api.articles.list(true).then(setArticles).finally(() => setLoading(false))
  }, [])

  const openNew = () => { setEditing('new'); setForm({ ...BLANK, display_order: articles.length }); setTagInput('') }
  const openEdit = (a: Article) => {
    setEditing(a)
    setForm({ title: a.title, content: a.content ?? '', image_urls: a.image_urls, tags: a.tags, is_published: a.is_published, display_order: a.display_order })
    setTagInput('')
  }
  const close = () => { setEditing(null); setForm(BLANK) }

  const set = <K extends keyof ArticleBody>(k: K, v: ArticleBody[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagInput('')
  }
  const removeTag = (t: string) => set('tags', form.tags.filter((x) => x !== t))

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

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing === 'new') {
        const a = await api.articles.create(form)
        setArticles((prev) => [a, ...prev])
      } else if (editing) {
        const a = await api.articles.update(editing.id, form)
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
    const updated = await api.articles.update(a.id, { ...a, content: a.content ?? '', is_published: !a.is_published })
    setArticles((prev) => prev.map((x) => x.id === updated.id ? updated : x))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    border: '1px solid #dddde8', fontSize: 14, fontFamily: 'inherit',
    color: '#1c2417', background: '#fff', outline: 'none',
  }

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

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>
                本文（<code style={{ fontSize: 11 }}>## 見出し</code> で区切るとセクションに分かれます）
              </label>
              <textarea
                style={{ ...inputStyle, height: 240, resize: 'vertical', lineHeight: 1.7 }}
                value={form.content ?? ''}
                onChange={(e) => set('content', e.target.value)}
                placeholder={"## 最初の見出し\nここに本文を書きます。\n\n## 次の見出し\n続きの文章。"}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>画像</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {form.image_urls.map((url, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', border: '1px solid #dddde8', display: 'block' }} />
                    <button
                      onClick={() => set('image_urls', form.image_urls.filter((_, idx) => idx !== i))}
                      style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#c0392b', color: '#fff', fontSize: 11, cursor: 'pointer', padding: 0, lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
              </div>
              <label style={{ display: 'inline-block', padding: '8px 16px', border: '1px solid #dddde8', fontSize: 12, cursor: 'pointer', color: '#3a4535' }}>
                {uploading ? 'アップロード中...' : '+ 画像追加'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
              </label>
              <p style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>1枚目がメイン画像、以降は本文セクションに対応します</p>
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
