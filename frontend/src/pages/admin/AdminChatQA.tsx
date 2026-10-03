import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const API = import.meta.env.VITE_API_URL ?? ''

interface QA {
  id: string
  question: string
  answer: string
  sort_order: number
  enabled: boolean
}

const emptyForm = (): Omit<QA, 'id'> => ({
  question: '',
  answer: '',
  sort_order: 0,
  enabled: true,
})

/** AIチャット用Q&A管理画面。追加・編集・削除・有効/無効の切り替えが可能 */
export default function AdminChatQA() {
  const [items, setItems] = useState<QA[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const authHeader = async (): Promise<Record<string, string>> => {
    if (!supabase) return {}
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const load = async () => {
    setLoading(true)
    const res = await fetch(`${API}/api/chat-qa`)
    setItems(res.ok ? await res.json() : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const startEdit = (item: QA) => {
    setEditId(item.id)
    setForm({ question: item.question, answer: item.answer, sort_order: item.sort_order, enabled: item.enabled })
    setError('')
  }

  const startAdd = () => {
    setEditId('new')
    setForm(emptyForm())
    setError('')
  }

  const cancel = () => { setEditId(null); setError('') }

  const save = async () => {
    if (!form.question.trim() || !form.answer.trim()) { setError('質問と回答を入力してください'); return }
    setSaving(true)
    const headers = { 'Content-Type': 'application/json', ...await authHeader() }
    const body = JSON.stringify(form)
    const res = editId === 'new'
      ? await fetch(`${API}/api/chat-qa`, { method: 'POST', headers, body })
      : await fetch(`${API}/api/chat-qa/${editId}`, { method: 'PATCH', headers, body })
    setSaving(false)
    if (!res.ok) { setError('保存に失敗しました'); return }
    setEditId(null)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('削除しますか？')) return
    const headers = await authHeader()
    await fetch(`${API}/api/chat-qa/${id}`, { method: 'DELETE', headers })
    load()
  }

  const toggleEnabled = async (item: QA) => {
    const headers = { 'Content-Type': 'application/json', ...await authHeader() }
    await fetch(`${API}/api/chat-qa/${item.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ ...item, enabled: !item.enabled }),
    })
    load()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid #dddde8',
    borderRadius: 4, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>AIチャット Q&A 管理</h1>
        <button onClick={startAdd} style={{ padding: '8px 16px', background: '#2d3a24', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>
          + 追加
        </button>
      </div>

      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        ここで登録したQ&Aはチャットのシステムプロンプトに自動で反映されます。有効/無効で一時的に除外できます。
      </p>

      {/* 追加・編集フォーム */}
      {editId !== null && (
        <div style={{ background: '#f9f9fb', border: '1px solid #dddde8', borderRadius: 4, padding: 20, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 400 }}>{editId === 'new' ? 'Q&A を追加' : 'Q&A を編集'}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 13, color: '#555' }}>
              質問
              <textarea
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                rows={2}
                style={{ ...inputStyle, marginTop: 4, resize: 'vertical' }}
              />
            </label>
            <label style={{ fontSize: 13, color: '#555' }}>
              回答
              <textarea
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                rows={4}
                style={{ ...inputStyle, marginTop: 4, resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
                表示順
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 80 }}
                />
              </label>
              <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                有効
              </label>
            </div>
            {error && <p style={{ color: '#c0392b', fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={saving} style={{ padding: '8px 20px', background: '#2d3a24', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={cancel} style={{ padding: '8px 16px', background: 'none', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Q&A 一覧 */}
      {loading ? (
        <p style={{ color: '#888', fontSize: 14 }}>読み込み中...</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>Q&A がまだ登録されていません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              border: '1px solid #dddde8', borderRadius: 4, padding: 16,
              background: item.enabled ? '#fff' : '#fafafa',
              opacity: item.enabled ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 500, color: '#2d3a24' }}>
                    Q: {item.question}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: '#555', whiteSpace: 'pre-wrap' }}>
                    A: {item.answer}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: '#aaa' }}>表示順: {item.sort_order}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => toggleEnabled(item)}
                    style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #dddde8', borderRadius: 4, cursor: 'pointer', background: '#fff' }}
                  >
                    {item.enabled ? '無効化' : '有効化'}
                  </button>
                  <button
                    onClick={() => startEdit(item)}
                    style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #dddde8', borderRadius: 4, cursor: 'pointer', background: '#fff' }}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #e8dddd', borderRadius: 4, cursor: 'pointer', background: '#fff', color: '#c0392b' }}
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
