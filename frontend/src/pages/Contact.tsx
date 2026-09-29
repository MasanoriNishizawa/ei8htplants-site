import { useState } from 'react'
import { api } from '../lib/api'
import PageMeta from '../components/PageMeta'
import { useT } from '../lib/lang'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const t = useT()

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
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    fontSize: 16,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
    boxSizing: 'border-box',
    color: 'var(--c-ink)',
    borderRadius: 0,
    WebkitAppearance: 'none',
    appearance: 'none',
  }

  return (
    <>
    <PageMeta title="Contact" description="ei8ht plants へのお問い合わせはこちらから。" />
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40, paddingBottom: 32, borderBottom: '1px solid #dddde8' }}>
        <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 14px' }}>ei8ht plants</p>
        <h1 style={{ fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 200, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px', color: 'var(--c-ink)' }}>Contact</h1>
        <p style={{ fontSize: 16, color: 'var(--c-muted)', lineHeight: 1.8, margin: 0 }}>
          {t(
            <>ご質問・ご依頼など、お気軽にお問い合わせください。<br />通常 2〜3 営業日以内にご返信いたします。</>,
            <>Feel free to contact us with any questions or inquiries.<br />We typically reply within 2–3 business days.</>
          )}
        </p>
      </div>

      {status === 'done' ? (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32', padding: '20px 24px', borderRadius: 4, textAlign: 'center', fontSize: 16, lineHeight: 1.8 }}>
          {t(
            <>お問い合わせを受け付けました。<br />内容を確認次第、ご連絡いたします。</>,
            <>Your message has been received.<br />We'll get back to you shortly.</>
          )}
        </div>
      ) : (
        <form onSubmit={submit} style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '40px' }}>
          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#aaa', margin: '0 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
            {t('お客様情報', 'Your Information')}
          </p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>
              {t('お名前', 'Name')} <span style={{ color: '#c0392b' }}>*</span>
            </label>
            <input required type="text" style={inputStyle}
              placeholder={t('例: 山田 花子', 'e.g. Jane Smith')}
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>
              {t('メールアドレス', 'Email')} <span style={{ color: '#c0392b' }}>*</span>
            </label>
            <input required type="email" style={inputStyle} placeholder="yourname@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>

          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#aaa', margin: '32px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
            {t('お問い合わせ内容', 'Inquiry')}
          </p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>
              {t('内容', 'Message')} <span style={{ color: '#c0392b' }}>*</span>
            </label>
            <textarea
              required
              rows={6}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 140 }}
              placeholder={t('お問い合わせ内容をご記入ください', 'Please describe your inquiry')}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>

          {status === 'error' && (
            <p style={{ color: '#c0392b', fontSize: 14, marginBottom: 16 }}>
              {t('送信に失敗しました。再度お試しください。', 'Failed to send. Please try again.')}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            style={{ width: '100%', padding: 16, background: 'var(--c-ink)', color: '#fff', border: 'none', fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', marginTop: 32, borderRadius: 4 }}
          >
            {status === 'loading' ? t('送信中...', 'Sending...') : t('送信する', 'Send')}
          </button>

        </form>
      )}
    </div>
    </>
  )
}
