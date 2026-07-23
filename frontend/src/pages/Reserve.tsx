import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api, type Event, type WsSession } from '../lib/api'
import PageMeta from '../components/PageMeta'

type FormState = {
  name: string
  email: string
  phone: string
  participants: number
  note: string
  session_id: string
  bring_plant: boolean
  bring_pot: boolean
}

const BLANK: FormState = {
  name: '', email: '', phone: '', participants: 1, note: '',
  session_id: '', bring_plant: false, bring_pot: false,
}

export default function Reserve() {
  const [params] = useSearchParams()
  const eventId = params.get('event_id') ?? ''
  const [event, setEvent] = useState<Event | null>(null)
  const [sessions, setSessions] = useState<WsSession[]>([])
  const [form, setForm] = useState<FormState>(BLANK)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'full'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!eventId) return
    api.events.get(eventId).then((ev) => {
      setEvent(ev)
      if (ev.has_workshop) {
        api.events.getSessions(eventId).then(setSessions)
      }
    }).catch(() => {})
  }, [eventId])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const hasSessions = sessions.length > 0
  const selectedSession = sessions.find((s) => s.id === form.session_id) ?? null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (hasSessions && !form.session_id) return
    setStatus('loading')
    setErrorMsg('')
    try {
      await api.reserve.create({
        event_id: eventId,
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        participants: form.participants,
        note: form.note || undefined,
        session_id: form.session_id || undefined,
        bring_plant: form.bring_plant,
        bring_pot: form.bring_pot,
      })
      setStatus('done')
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('409')) {
        setStatus('full')
      } else {
        setStatus('error')
        setErrorMsg('送信に失敗しました。再度お試しください。')
      }
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
    fontSize: 16, fontFamily: 'inherit', outline: 'none', background: '#fff',
    boxSizing: 'border-box', color: '#1c2417', borderRadius: 0,
    WebkitAppearance: 'none', appearance: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, letterSpacing: '1.5px',
    textTransform: 'uppercase', color: '#999', marginBottom: 6,
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#aaa',
    margin: '32px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0',
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

        {status === 'full' ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 18, color: '#c0392b', marginBottom: 16 }}>このセッションは満席になりました</p>
            <p style={{ fontSize: 14, color: '#8a9a7e', marginBottom: 24 }}>別の回をお選びいただくか、次回のワークショップをお待ちください。</p>
            <button onClick={() => { setStatus('idle'); set('session_id', '') }} style={{ padding: '10px 24px', border: '1px solid #ddd4c0', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 14 }}>
              戻る
            </button>
          </div>
        ) : status === 'done' ? (
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
                ...(selectedSession ? [{ label: '時間', value: selectedSession.time_label }] : []),
                { label: '参加人数', value: `${form.participants} 名` },
                { label: '植物持ち込み', value: form.bring_plant ? 'あり' : 'なし' },
                { label: '鉢持ち込み', value: form.bring_pot ? 'あり' : 'なし' },
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
            <p style={sectionLabel}>お客様情報</p>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>お名前 <span style={{ color: '#c0392b' }}>*</span></label>
              <input required style={inputStyle} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>メールアドレス <span style={{ color: '#c0392b' }}>*</span></label>
              <input required type="email" style={inputStyle} value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>電話番号（任意）</label>
              <input type="tel" style={inputStyle} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>

            <p style={sectionLabel}>予約内容</p>

            {/* セッション選択 */}
            {hasSessions && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>参加時間 <span style={{ color: '#c0392b' }}>*</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sessions.map((s) => {
                    const remaining = s.max_participants - s.reserved_count
                    const full = remaining <= 0
                    return (
                      <label key={s.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                        border: `1px solid ${form.session_id === s.id ? '#4a6741' : '#ddd'}`,
                        borderRadius: 6, cursor: full ? 'not-allowed' : 'pointer',
                        background: full ? '#f8f8f8' : form.session_id === s.id ? '#f0f5ee' : '#fff',
                        opacity: full ? 0.6 : 1,
                      }}>
                        <input
                          type="radio"
                          name="session"
                          value={s.id}
                          disabled={full}
                          checked={form.session_id === s.id}
                          onChange={() => set('session_id', s.id)}
                          style={{ accentColor: '#4a6741' }}
                        />
                        <span style={{ flex: 1, fontSize: 15, color: '#1c2417' }}>{s.time_label}</span>
                        <span style={{ fontSize: 12, color: full ? '#c0392b' : '#8a9a7e' }}>
                          {full ? '満席' : `残り ${remaining} 名`}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>参加人数 <span style={{ color: '#c0392b' }}>*</span></label>
              <input required type="number" min={1} max={10} style={{ ...inputStyle, width: 100 }} value={form.participants} onChange={(e) => set('participants', Number(e.target.value))} />
            </div>

            {/* 持ち込み */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>持ち込み（任意）</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15 }}>
                  <input type="checkbox" checked={form.bring_plant} onChange={(e) => set('bring_plant', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#4a6741' }} />
                  植物を持ち込む
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15 }}>
                  <input type="checkbox" checked={form.bring_pot} onChange={(e) => set('bring_pot', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#4a6741' }} />
                  鉢を持ち込む
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 0 }}>
              <label style={labelStyle}>備考（任意）</label>
              <textarea rows={4} style={{ ...inputStyle, resize: 'vertical' }} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </div>

            {status === 'error' && <p style={{ color: '#c0392b', fontSize: 14, marginTop: 16, marginBottom: 0 }}>{errorMsg}</p>}

            <button
              type="submit"
              disabled={status === 'loading' || (hasSessions && !form.session_id)}
              style={{ width: '100%', padding: 16, background: '#1e3272', color: '#fff', border: 'none', fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', marginTop: 32, borderRadius: 4, opacity: (hasSessions && !form.session_id) ? 0.5 : 1 }}
            >
              {status === 'loading' ? '送信中...' : '予約する'}
            </button>
            {hasSessions && !form.session_id && (
              <p style={{ textAlign: 'center', fontSize: 12, color: '#c0392b', marginTop: 8 }}>参加時間を選択してください</p>
            )}
          </form>
        )}
      </div>
    </>
  )
}
