import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useT } from '../lib/lang'
import PageMeta from '../components/PageMeta'

export default function CancelReservation() {
  const t = useT()
  const [params] = useSearchParams()
  const [token, setToken] = useState(params.get('id') ?? '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'already' | 'notfound' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return
    setStatus('loading')
    try {
      const res = await api.reserve.cancel(token.trim())
      if (res.ok) {
        setStatus('done')
      } else if (res.status === 400) {
        setStatus('already')
      } else if (res.status === 404) {
        setStatus('notfound')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', border: '1px solid #ddd',
    fontSize: 24, fontFamily: 'monospace', outline: 'none', background: '#fff',
    boxSizing: 'border-box', color: 'var(--c-ink)', borderRadius: 0,
    letterSpacing: '0.3em',
    WebkitAppearance: 'none', appearance: 'none',
  }

  return (
    <>
      <PageMeta title={t('予約キャンセル', 'Cancel Reservation')} description={t('ワークショップ予約のキャンセルはこちらから。', 'Cancel your workshop reservation here.')} />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 20px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40, paddingBottom: 32, borderBottom: '1px solid #dddde8' }}>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 14px' }}>Habitat Oides</p>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 200, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0, color: 'var(--c-ink)' }}>
            {t('予約キャンセル', 'Cancel Reservation')}
          </h1>
        </div>

        {status === 'done' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: '#f5f5f8', border: '1px solid #dddde8', borderRadius: 4, padding: '36px 28px', marginBottom: 32 }}>
              <p style={{ fontSize: 18, fontWeight: 300, color: 'var(--c-ink)', margin: '0 0 12px' }}>{t('キャンセルが完了しました', 'Cancellation complete')}</p>
              <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.8, margin: 0 }}>
                {t(
                  <>ご予約のキャンセルを受け付けました。<br />またのご参加をお待ちしております。</>,
                  <>Your reservation has been cancelled.<br />We hope to see you at a future event.</>
                )}
              </p>
            </div>
            <Link to="/events" style={{ display: 'inline-block', padding: '12px 28px', border: '1px solid #dddde8', borderRadius: 4, color: 'var(--c-muted)', textDecoration: 'none', fontSize: 14 }}>
              {t('イベント一覧へ戻る', 'Back to Events')}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '36px' }}>
            <p style={{ fontSize: 14, color: 'var(--c-body)', lineHeight: 1.8, margin: '0 0 28px' }}>
              {t('確定メールに記載のキャンセルIDを入力してください。', 'Enter the cancellation ID from your confirmation email.')}
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>
                {t('キャンセルID', 'Cancellation ID')}
              </label>
              <input
                required
                inputMode="numeric"
                pattern="[0-9]{8}"
                style={inputStyle}
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="00000000"
                maxLength={8}
              />
            </div>

            {status === 'notfound' && (
              <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px' }}>
                {t('キャンセルIDが見つかりません。メールをご確認ください。', 'Cancellation ID not found. Please check your confirmation email.')}
              </p>
            )}
            {status === 'already' && (
              <p style={{ color: 'var(--c-muted)', fontSize: 13, margin: '0 0 16px' }}>
                {t('この予約はすでにキャンセル済みです。', 'This reservation has already been cancelled.')}
              </p>
            )}
            {status === 'error' && (
              <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px' }}>
                {t('エラーが発生しました。再度お試しください。', 'An error occurred. Please try again.')}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'loading' || !token.trim()}
              style={{
                width: '100%', padding: 14, background: '#c0392b', color: '#fff',
                border: 'none', fontSize: 15, letterSpacing: '1px', cursor: 'pointer',
                fontFamily: 'inherit', borderRadius: 4,
                opacity: !token.trim() ? 0.5 : 1,
              }}
            >
              {status === 'loading' ? t('処理中...', 'Processing...') : t('予約をキャンセルする', 'Cancel Reservation')}
            </button>
          </form>
        )}
      </div>
    </>
  )
}
