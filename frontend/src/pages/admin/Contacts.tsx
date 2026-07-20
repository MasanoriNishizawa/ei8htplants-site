import { useEffect, useState } from 'react'
import { api, type ContactRecord } from '../../lib/api'

export default function AdminContacts() {
  const [contacts, setContacts] = useState<ContactRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = () => api.contact.list().then(setContacts).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const toggleRead = async (c: ContactRecord) => {
    await api.contact.markRead(c.id, !c.is_read)
    setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, is_read: !c.is_read } : x))
  }

  const unreadCount = contacts.filter((c) => !c.is_read).length

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

      {loading ? (
        <p style={{ color: '#8a9a7e' }}>読み込み中...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contacts.map((c) => (
            <div
              key={c.id}
              style={{
                background: c.is_read ? '#fffcf6' : '#fef9f0',
                border: `1px solid ${c.is_read ? '#ddd4c0' : '#e8c870'}`,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '14px 18px', cursor: 'pointer', alignItems: 'center' }}
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                    {!c.is_read && (
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#e8a020', flexShrink: 0 }} />
                    )}
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 13, color: '#8a9a7e' }}>{c.email}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#8a9a7e' }}>
                    {new Date(c.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleRead(c) }}
                    style={{ padding: '6px 14px', border: '1px solid #ddd4c0', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#3a4535', whiteSpace: 'nowrap' }}
                  >
                    {c.is_read ? '未読に戻す' : '既読にする'}
                  </button>
                  <span style={{ fontSize: 14, color: '#8a9a7e', transform: expanded === c.id ? 'rotate(180deg)' : 'none', transition: '0.2s', display: 'inline-block' }}>▼</span>
                </div>
              </div>
              {expanded === c.id && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f0ebe0' }}>
                  <p style={{ fontSize: 15, color: '#1c2417', lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: '14px 0 0' }}>{c.message}</p>
                  <a href={`mailto:${c.email}?subject=Re: ei8ht plants お問い合わせ`} style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: '#4a6741', textDecoration: 'underline' }}>
                    返信する ({c.email})
                  </a>
                </div>
              )}
            </div>
          ))}
          {contacts.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: '#8a9a7e' }}>お問い合わせはありません。</p>}
        </div>
      )}
    </div>
  )
}
