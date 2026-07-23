import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api, type Event } from '../lib/api'
import PageMeta from '../components/PageMeta'

export default function Reserve() {
  const [params] = useSearchParams()
  const eventId = params.get('event_id') ?? ''
  const [event, setEvent] = useState<Event | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', participants: 1, note: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  useEffect(() => {
    if (eventId) api.events.get(eventId).then(setEvent).catch(() => {})
  }, [eventId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    try {
      await api.reserve.create({ event_id: eventId, ...form })
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    fontSize: 16,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
    boxSizing: 'border-box',
    color: '#1c2417',
    borderRadius: 0,
    WebkitAppearance: 'none',
    appearance: 'none',
  }

  return (
    <>
      <PageMeta title="Workshop 予約" description="Habitat Style Workshop へのご予約はこちらから。" />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 20px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40, paddingBottom: 32, borderBottom: '1px solid #ddd4c0' }}>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#8a9a7e', margin: '0 0 14px' }}>Habitat Oides</p>
          <h1 style={{ fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 200, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px', color: '#1c2417' }}>Workshop 予約</h1>
          {event && (
            <p style={{ fontSize: 15, color: '#3a4535', lineHeight: 1.7, margin: 0 }}>
              {event.name}<br />
              <span style={{ fontSize: 13, color: '#8a9a7e' }}>{event.start_date}{event.time ? ` ${event.time}` : ''} / {event.location}</span>
            </p>
          )}
          {!event && (
            <p style={{ fontSize: 16, color: '#8a9a7e', lineHeight: 1.8, margin: 0 }}>
              ご記入いただいた内容を確認後、折り返しご連絡いたします。
            </p>
          )}
        </div>

        {status === 'done' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: '#f0f6f0', border: '1px solid #b0d4b0', borderRadius: 14, padding: '36px 32px', marginBottom: 32 }}>
              <p style={{ fontSize: 22, fontWeight: 300, letterSpacing: '0.08em', color: '#2d5a2d', margin: '0 0 16px' }}>予約を受け付けました</p>
              <p style={{ fontSize: 14, color: '#3a4535', lineHeight: 1.9, margin: 0 }}>
                確認メールを <strong>{form.email}</strong> にお送りしました。<br />
                届かない場合は迷惑メールフォルダをご確認ください。
              </p>
            </div>
            <div style={{ background: '#fffcf6', border: '1px solid #ddd4c0', borderRadius: 12, padding: '24px 28px', textAlign: 'left', marginBottom: 32 }}>
              <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#8a9a7e', margin: '0 0 16px' }}>予約内容</p>
              {[
                { label: 'お名前', value: form.name },
                { label: 'メール', value: form.email },
                { label: '電話番号', value: form.phone || '-' },
                { label: '参加人数', value: `${form.participants} 名` },
                ...(form.note ? [{ label: '備考', value: form.note }] : []),
                ...(event ? [{ label: 'イベント', value: event.name }] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0ebe0' }}>
                  <span style={{ fontSize: 12, color: '#8a9a7e' }}>{label}</span>
                  <span style={{ fontSize: 14, color: '#1c2417' }}>{value}</span>
                </div>
              ))}
            </div>
            <Link to="/events" style={{ display: 'inline-block', padding: '12px 28px', border: '1px solid #ddd4c0', borderRadius: 8, color: '#8a9a7e', textDecoration: 'none', fontSize: 14 }}>
              イベント一覧へ戻る
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: '#fffcf6', border: '1px solid #ddd4c0', borderRadius: 14, padding: '40px' }}>
            <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#aaa', margin: '0 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>お客様情報</p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>
                お名前 <span style={{ color: '#c0392b' }}>*</span>
              </label>
              <input required style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>
                メールアドレス <span style={{ color: '#c0392b' }}>*</span>
              </label>
              <input required type="email" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>
                電話番号（任意）
              </label>
              <input type="tel" style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>

            <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#aaa', margin: '32px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>予約内容</p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>
                参加人数 <span style={{ color: '#c0392b' }}>*</span>
              </label>
              <input required type="number" min={1} max={10} style={{ ...inputStyle, width: 100 }} value={form.participants} onChange={(e) => setForm({ ...form, participants: Number(e.target.value) })} />
            </div>

            <div style={{ marginBottom: 0 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>
                備考（任意）
              </label>
              <textarea rows={4} style={{ ...inputStyle, resize: 'vertical' }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>

            {status === 'error' && <p style={{ color: '#c0392b', fontSize: 14, marginTop: 16, marginBottom: 0 }}>送信に失敗しました。再度お試しください。</p>}

            <button
              type="submit"
              disabled={status === 'loading'}
              style={{ width: '100%', padding: 16, background: '#1e3272', color: '#fff', border: 'none', fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', marginTop: 32, borderRadius: 4 }}
            >
              {status === 'loading' ? '送信中...' : '予約する'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}
