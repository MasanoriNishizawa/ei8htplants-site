import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import PageMeta from '../components/PageMeta'

export default function CancelReservation() {
  const [params] = useSearchParams()
  const [token, setToken] = useState(params.get('id') ?? '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'already' | 'notfound' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return
    setStatus('loading')
    try {
      const res = await fetch('/api/reserve/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim().toUpperCase() }),
      })
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
    fontSize: 20, fontFamily: 'inherit', outline: 'none', background: '#fff',
    boxSizing: 'border-box', color: '#1c2417', borderRadius: 0,
    letterSpacing: '0.2em', textTransform: 'uppercase',
    WebkitAppearance: 'none', appearance: 'none',
  }

  return (
    <>
      <PageMeta title="予約キャンセル" description="ワークショップ予約のキャンセルはこちらから。" />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 20px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40, paddingBottom: 32, borderBottom: '1px solid #dddde8' }}>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#8a9a7e', margin: '0 0 14px' }}>Habitat Oides</p>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 200, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0, color: '#1c2417' }}>
            予約キャンセル
          </h1>
        </div>

        {status === 'done' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: '#f5f5f8', border: '1px solid #dddde8', borderRadius: 4, padding: '36px 28px', marginBottom: 32 }}>
              <p style={{ fontSize: 18, fontWeight: 300, color: '#1c2417', margin: '0 0 12px' }}>キャンセルが完了しました</p>
              <p style={{ fontSize: 14, color: '#8a9a7e', lineHeight: 1.8, margin: 0 }}>
                ご予約のキャンセルを受け付けました。<br />
                またのご参加をお待ちしております。
              </p>
            </div>
            <Link to="/events" style={{ display: 'inline-block', padding: '12px 28px', border: '1px solid #dddde8', borderRadius: 4, color: '#8a9a7e', textDecoration: 'none', fontSize: 14 }}>
              イベント一覧へ戻る
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '36px' }}>
            <p style={{ fontSize: 14, color: '#3a4535', lineHeight: 1.8, margin: '0 0 28px' }}>
              確定メールに記載のキャンセルIDを入力してください。
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>
                キャンセルID
              </label>
              <input
                required
                style={inputStyle}
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                placeholder="XXXXXXXX"
                maxLength={8}
              />
            </div>

            {status === 'notfound' && (
              <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px' }}>
                キャンセルIDが見つかりません。メールをご確認ください。
              </p>
            )}
            {status === 'already' && (
              <p style={{ color: '#8a9a7e', fontSize: 13, margin: '0 0 16px' }}>
                この予約はすでにキャンセル済みです。
              </p>
            )}
            {status === 'error' && (
              <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px' }}>
                エラーが発生しました。再度お試しください。
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
              {status === 'loading' ? '処理中...' : '予約をキャンセルする'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}
