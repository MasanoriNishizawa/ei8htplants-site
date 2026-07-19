import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'

export default function Reserve() {
  const [params] = useSearchParams()
  const eventId = params.get('event_id') ?? ''
  const [form, setForm] = useState({ name: '', email: '', phone: '', participants: 1, note: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

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
    width: '100%', padding: '12px 16px', border: '1px solid #ddd4c0',
    borderRadius: 8, fontSize: 16, fontFamily: 'inherit',
    background: '#fffcf6', boxSizing: 'border-box',
  }

  return (
    <>
      <div style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300, letterSpacing: 4, margin: 0 }}>Workshop 予約</h1>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 20px 80px' }}>
        {status === 'done' ? (
          <p style={{ textAlign: 'center', padding: '60px 0', color: '#3a4535' }}>ご予約を受け付けました。確認メールをお送りします。</p>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, letterSpacing: 1 }}>お名前</label>
              <input required style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, letterSpacing: 1 }}>メールアドレス</label>
              <input required type="email" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, letterSpacing: 1 }}>電話番号（任意）</label>
              <input type="tel" style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, letterSpacing: 1 }}>参加人数</label>
              <input required type="number" min={1} max={10} style={{ ...inputStyle, width: 100 }} value={form.participants} onChange={(e) => setForm({ ...form, participants: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, letterSpacing: 1 }}>備考（任意）</label>
              <textarea rows={4} style={{ ...inputStyle, resize: 'vertical' }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            {status === 'error' && <p style={{ color: '#c0392b', fontSize: 14 }}>送信に失敗しました。再度お試しください。</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              style={{ padding: '14px 40px', background: '#5c3d22', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, letterSpacing: 2, cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              {status === 'loading' ? '送信中...' : '予約する'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}
