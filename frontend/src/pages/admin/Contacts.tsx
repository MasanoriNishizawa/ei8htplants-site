import { useEffect, useState } from 'react'
import { api, type ContactRecord } from '../../lib/api'

interface ReplyState { contactId: string; email: string; subject: string; body: string }

export default function AdminContacts() {
  const [contacts, setContacts] = useState<ContactRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [reply, setReply] = useState<ReplyState | null>(null)
  const [replySending, setReplySending] = useState(false)
  const [replyDone, setReplyDone] = useState<string | null>(null)

  const load = () => api.contact.list().then(setContacts).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const toggleRead = async (c: ContactRecord) => {
    try {
      await api.contact.markRead(c.id, !c.is_read)
      setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, is_read: !c.is_read } : x))
    } catch {
      setUpdateError('更新に失敗しました')
      setTimeout(() => setUpdateError(null), 3000)
    }
  }

  const openReply = (c: ContactRecord) => {
    setReply({
      contactId: c.id,
      email: c.email,
      subject: `Re: ei8ht plants お問い合わせ`,
      body: `${c.name} 様\n\nお問い合わせいただきありがとうございます。\n\n`,
    })
  }

  const sendReply = async () => {
    if (!reply) return
    setReplySending(true)
    try {
      await api.contact.reply(reply.contactId, reply.subject, reply.body)
      setContacts((prev) => prev.map((x) => x.id === reply.contactId ? { ...x, is_read: true } : x))
      setReplyDone(reply.email)
      setReply(null)
      setTimeout(() => setReplyDone(null), 4000)
    } catch {
      setUpdateError('返信の送信に失敗しました')
      setTimeout(() => setUpdateError(null), 3000)
    } finally {
      setReplySending(false)
    }
  }

  const unreadCount = contacts.filter((c) => !c.is_read).length

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #dddde8',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#ffffff',
    boxSizing: 'border-box', resize: 'vertical' as const,
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>お問い合わせ</h2>
        {unreadCount > 0 && (
          <span style={{ background: '#c0392b', color: '#fff', borderRadius: 12, fontSize: 12, padding: '2px 10px', fontWeight: 600 }}>
            未読 {unreadCount}
          </span>
        )}
      </div>

      {updateError && (
        <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 12, padding: '8px 14px', background: '#fdf0ee', borderRadius: 8, border: '1px solid #f5c6c0' }}>
          {updateError}
        </p>
      )}
      {replyDone && (
        <p style={{ color: '#2d5a2d', fontSize: 13, marginBottom: 12, padding: '8px 14px', background: '#f0f6f0', borderRadius: 8, border: '1px solid #b0d4b0' }}>
          {replyDone} に返信を送信しました。
        </p>
      )}

      {loading ? (
        <p style={{ color: '#8a9a7e' }}>読み込み中...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contacts.map((c) => (
            <div key={c.id} style={{ background: c.is_read ? '#ffffff' : '#fef9f0', border: `1px solid ${c.is_read ? '#dddde8' : '#e8c870'}`, borderRadius: 10, overflow: 'hidden' }}>
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '14px 18px', cursor: 'pointer', alignItems: 'center' }}
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                    {!c.is_read && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#e8a020', flexShrink: 0 }} />}
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 13, color: '#8a9a7e' }}>{c.email}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#8a9a7e' }}>
                    {new Date(c.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={(e) => { e.stopPropagation(); toggleRead(c) }}
                    style={{ padding: '6px 14px', border: '1px solid #dddde8', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#3a4535', whiteSpace: 'nowrap' }}>
                    {c.is_read ? '未読に戻す' : '既読にする'}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); openReply(c) }}
                    style={{ padding: '6px 14px', border: '1px solid #4a6741', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#f0f6f0', color: '#4a6741', whiteSpace: 'nowrap' }}>
                    返信
                  </button>
                  <span style={{ fontSize: 14, color: '#8a9a7e', transform: expanded === c.id ? 'rotate(180deg)' : 'none', transition: '0.2s', display: 'inline-block' }}>▼</span>
                </div>
              </div>
              {expanded === c.id && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f0f0f5' }}>
                  <p style={{ fontSize: 15, color: '#1c2417', lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: '14px 0 0' }}>{c.message}</p>
                </div>
              )}
            </div>
          ))}
          {contacts.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: '#8a9a7e' }}>お問い合わせはありません。</p>}
        </div>
      )}

      {reply && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setReply(null) }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 560, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 500, fontSize: 18 }}>返信: {reply.email}</h3>
              <button onClick={() => setReply(null)} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#8a9a7e', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: '#8a9a7e', marginBottom: 6 }}>件名</label>
              <input style={{ ...inputStyle, resize: undefined }} value={reply.subject} onChange={(e) => setReply({ ...reply, subject: e.target.value })} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: '#8a9a7e', marginBottom: 6 }}>本文</label>
              <textarea rows={10} style={inputStyle} value={reply.body} onChange={(e) => setReply({ ...reply, body: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setReply(null)} style={{ padding: '10px 20px', border: '1px solid #dddde8', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 14 }}>キャンセル</button>
              <button onClick={sendReply} disabled={replySending} style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: '#1c2417', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
                {replySending ? '送信中...' : '送信する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
