import { useState } from 'react'
import { api } from '../lib/api'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    try {
      await api.contact.send(form)
      setStatus('done')
      setForm({ name: '', email: '', message: '' })
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
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Contact</h1>
      </div>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 20px 80px' }}>
        {status === 'done' ? (
          <p style={{ textAlign: 'center', padding: '60px 0', color: '#3a4535' }}>お問い合わせを受け付けました。</p>
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
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, letterSpacing: 1 }}>お問い合わせ内容</label>
              <textarea required rows={6} style={{ ...inputStyle, resize: 'vertical' }} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            {status === 'error' && <p style={{ color: '#c0392b', fontSize: 14 }}>送信に失敗しました。再度お試しください。</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              style={{ padding: '14px 40px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, letterSpacing: 2, cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              {status === 'loading' ? '送信中...' : '送信する'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}
