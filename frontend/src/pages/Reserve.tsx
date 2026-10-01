import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api, type Event, type WsSession } from '../lib/api'
import PageMeta from '../components/PageMeta'
import { useT, useLang } from '../lib/lang'

type FormState = {
  name: string
  email: string
  phone: string
  participants: number
  note: string
  session_id: string
  bring_plant: boolean
  bring_pot: boolean
  preferred_date: string
}

const BLANK: FormState = {
  name: '', email: '', phone: '', participants: 1, note: '',
  session_id: '', bring_plant: false, bring_pot: false,
  preferred_date: '',
}

/**
 * 開始日から終了日までの日付文字列（YYYY-MM-DD）配列を生成する
 * @param startDate - 開始日（YYYY-MM-DD）
 * @param endDate - 終了日（YYYY-MM-DD）。null の場合は開始日のみ
 */
function parseDateRange(startDate: string, endDate: string | null): string[] {
  const dates: string[] = []
  const start = new Date(startDate + 'T00:00:00')
  const end = endDate ? new Date(endDate + 'T00:00:00') : start
  const cur = new Date(start)
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const day = String(cur.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${day}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

/** ワークショップ予約フォームページ。日付・セッション選択と参加者情報の送信を行う */
export default function Reserve() {
  const [params] = useSearchParams()
  const eventId = params.get('event_id') ?? ''
  const [event, setEvent] = useState<Event | null>(null)
  const [sessions, setSessions] = useState<WsSession[]>([])
  const [form, setForm] = useState<FormState>(BLANK)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'full'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const t = useT()
  const { lang } = useLang()

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', {
      month: 'long', day: 'numeric', weekday: 'short',
    })

  // URL パラメータの event_id でイベントを取得し、単日イベントなら preferred_date を自動セットする
  useEffect(() => {
    if (!eventId) return
    api.events.get(eventId).then((ev) => {
      setEvent(ev)
      const dates = parseDateRange(ev.start_date, ev.end_date)
      if (dates.length === 1) {
        setForm((f) => ({ ...f, preferred_date: dates[0] }))
      }
    }).catch(() => {})
  }, [eventId])

  // ワークショップありのイベントで日付が決まったらセッション一覧を再取得する
  useEffect(() => {
    if (!event?.has_workshop || !form.preferred_date) return
    setSessions([])
    api.events.getSessions(eventId, form.preferred_date).then(setSessions)
  }, [event, form.preferred_date, eventId])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const dates = event ? parseDateRange(event.start_date, event.end_date) : []
  const isMultiDay = dates.length > 1
  const selectedSession = sessions.find((s) => s.id === form.session_id) ?? null
  const selectedRemaining = selectedSession
    ? selectedSession.max_participants - selectedSession.reserved_count
    : 0
  const sessionsDisabled = isMultiDay && !form.preferred_date

  const expectsSessions = !!event?.has_workshop
  const participantsDisabled = expectsSessions && !form.session_id

  const needsDate = isMultiDay && !form.preferred_date
  const needsSession = expectsSessions && !form.session_id
  const canSubmit = !needsDate && !needsSession

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
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
        preferred_date: form.preferred_date || undefined,
        lang,
      })
      setStatus('done')
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('409')) {
        setStatus('full')
      } else {
        setStatus('error')
        setErrorMsg(t('送信に失敗しました。再度お試しください。', 'Submission failed. Please try again.'))
      }
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
    fontSize: 16, fontFamily: 'inherit', outline: 'none', background: '#fff',
    boxSizing: 'border-box', color: 'var(--c-ink)', borderRadius: 0,
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

  const radioCard = (selected: boolean, disabled = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    border: `1px solid ${selected ? '#4a6741' : '#ddd'}`,
    borderRadius: 2, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#f8f8f8' : selected ? '#f0f5ee' : '#fff',
    opacity: disabled ? 0.6 : 1,
  })

  const confirmRows = [
    { label: t('お名前', 'Name'), value: form.name },
    { label: t('メール', 'Email'), value: form.email },
    ...(form.phone ? [{ label: t('電話番号', 'Phone'), value: form.phone }] : []),
    ...(event ? [{ label: t('イベント', 'Event'), value: event.name }] : []),
    ...(form.preferred_date ? [{ label: t('予約日', 'Date'), value: fmtDate(form.preferred_date) }] : []),
    ...(selectedSession ? [{ label: t('予約時間', 'Time'), value: selectedSession.time_label }] : []),
    { label: t('参加人数', 'Participants'), value: t(`${form.participants} 名`, `${form.participants}`) },
    { label: t('植物持ち込み', 'Bring plant'), value: t(form.bring_plant ? 'あり' : 'なし', form.bring_plant ? 'Yes' : 'No') },
    { label: t('鉢持ち込み', 'Bring pot'), value: t(form.bring_pot ? 'あり' : 'なし', form.bring_pot ? 'Yes' : 'No') },
    ...(form.note ? [{ label: t('備考', 'Notes'), value: form.note }] : []),
  ]

  return (
    <>
      <PageMeta title={t('Workshop 予約', 'Workshop Reservation')} description={t('Habitat Style Workshop へのご予約はこちらから。', 'Reserve your spot at a Habitat Style Workshop.')} />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) clamp(20px, 4vw, 48px) 80px' }}>

        <div style={{ marginBottom: 40, paddingBottom: 32, borderBottom: '1px solid var(--c-border)' }}>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 10px' }}>Habitat Oides</p>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 200, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0, color: 'var(--c-ink)' }}>
            {t('Workshop 予約', 'Workshop Reservation')}
          </h1>
        </div>

        <div className="reserve-layout">

          {/* 左：イベント情報 */}
          <div style={{ color: 'var(--c-body)' }}>
            {event ? (
              <>
                <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 10px' }}>Event</p>
                <p style={{ fontSize: 17, fontWeight: 500, color: 'var(--c-ink)', margin: '0 0 12px', lineHeight: 1.5 }}>{event.name}</p>
                <div style={{ fontSize: 14, color: 'var(--c-body)', lineHeight: 2.1, background: 'var(--c-surface)', border: '1px solid var(--c-border)', padding: '16px 20px', borderRadius: 4 }}>
                  <div>{event.start_date}{event.end_date && event.end_date !== event.start_date ? ` 〜 ${event.end_date}` : ''}</div>
                  {event.time && <div>{event.time}</div>}
                  <div style={{ fontWeight: 500 }}>{event.location}</div>
                </div>
                <div style={{ marginTop: 24, padding: '20px 24px', background: '#f0f5ee', borderRadius: 4, border: '1px solid #c8dcc4' }}>
                  <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#6a8a64', margin: '0 0 12px' }}>Workshop</p>
                  <p style={{ fontSize: 15, color: 'var(--c-ink)', lineHeight: 1.8, margin: '0 0 16px' }}>
                    {t(
                      <>植物の自生地を鉢の中で再現するハビタットスタイルのワークショップです。<br />石・砂と植物を組み合わせて、はじめての方でも楽しめます。<br />植物・鉢はご持参いただいたものでもご参加いただけます。</>,
                      <>A habitat-style workshop where you recreate a plant's natural environment in a pot.<br />Combine stone, sand, and plants — perfect for first-timers.<br />Feel free to bring your own plants or pots.</>
                    )}
                  </p>
                  <div style={{ paddingTop: 14, borderTop: '1px solid #c8dcc4' }}>
                    <span style={{ fontSize: 11, letterSpacing: 1, color: '#6a8a64' }}>{t('参加費', 'Fee')}</span>
                    <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '0.02em', margin: '4px 0 2px' }}>1,000円</p>
                    <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: 0 }}>{t('鉢・資材含む / 植物別', 'Pot & materials included / Plants extra')}</p>
                  </div>
                  <a
                    href="https://ei8htplants.com/habitatoides/workshop"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: 14, fontSize: 13, color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    {t('詳しくはこちら', 'Learn more')}
                  </a>
                </div>
                <div style={{ marginTop: 16, padding: '16px 20px', background: 'var(--c-bg)', borderRadius: 4, border: '1px solid var(--c-border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.9, margin: 0 }}>
                    {t(
                      <>ご記入いただいた内容を確認後、メールにて予約確認をお送りします。<br />ご不明な点は <a href="/contact" style={{ color: 'var(--c-green)', textDecoration: 'underline', textUnderlineOffset: 3 }}>お問い合わせ</a> ください。</>,
                      <>After reviewing your submission, we'll send a confirmation email.<br />Questions? <a href="/contact" style={{ color: 'var(--c-green)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Contact us</a>.</>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 15, color: 'var(--c-muted)', lineHeight: 1.9 }}>
                {t('ご記入いただいた内容を確認後、折り返しご連絡いたします。', "We'll follow up after reviewing your submission.")}
              </p>
            )}
          </div>

          {/* 右：フォーム */}
          <div>
        {status === 'full' ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 18, color: '#c0392b', marginBottom: 16 }}>{t('このセッションは満席になりました', 'This session is now full')}</p>
            <p style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: 24 }}>{t('別の回をお選びいただくか、次回のワークショップをお待ちください。', 'Please choose another time slot or wait for the next workshop.')}</p>
            <button onClick={() => { setStatus('idle'); set('session_id', '') }} style={{ padding: '10px 24px', border: '1px solid #dddde8', borderRadius: 4, background: 'none', cursor: 'pointer', fontSize: 14 }}>
              {t('戻る', 'Back')}
            </button>
          </div>
        ) : status === 'done' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: '#f0f6f0', border: '1px solid #b0d4b0', borderRadius: 4, padding: '36px 32px', marginBottom: 32 }}>
              <p style={{ fontSize: 22, fontWeight: 300, letterSpacing: '0.08em', color: '#2d5a2d', margin: '0 0 16px' }}>{t('予約を受け付けました', 'Reservation received')}</p>
              <p style={{ fontSize: 14, color: 'var(--c-body)', lineHeight: 1.9, margin: 0 }}>
                {t(
                  <><span>確認メールを </span><strong>{form.email}</strong><span> にお送りしました。</span><br />届かない場合は迷惑メールフォルダをご確認ください。</>,
                  <><span>A confirmation email has been sent to </span><strong>{form.email}</strong><span>.</span><br />If you don't see it, check your spam folder.</>
                )}
              </p>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '24px 28px', textAlign: 'left', marginBottom: 32 }}>
              <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 16px' }}>{t('予約内容', 'Reservation Details')}</p>
              {confirmRows.map(({ label, value }) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f5' }}>
                  <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{label}</span>
                  <span style={{ fontSize: 14, color: 'var(--c-ink)' }}>{value}</span>
                </div>
              ))}
            </div>
            <Link to="/events" style={{ display: 'inline-block', padding: '12px 28px', border: '1px solid #dddde8', borderRadius: 4, color: 'var(--c-muted)', textDecoration: 'none', fontSize: 14 }}>
              {t('イベント一覧へ戻る', 'Back to events')}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '40px' }}>
            <p style={sectionLabel}>{t('予約内容', 'Reservation')}</p>

            {isMultiDay && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>{t('予約日', 'Date')} <span style={{ color: '#c0392b' }}>*</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dates.map((d) => (
                    <label key={d} style={radioCard(form.preferred_date === d)}>
                      <input
                        type="radio"
                        name="preferred_date"
                        value={d}
                        checked={form.preferred_date === d}
                        onChange={() => setForm((f) => ({ ...f, preferred_date: d, session_id: '', participants: 1 }))}
                        style={{ accentColor: '#4a6741' }}
                      />
                      <span style={{ fontSize: 15, color: 'var(--c-ink)' }}>{fmtDate(d)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {event?.has_workshop && (
              <div style={{ marginBottom: 20, opacity: sessionsDisabled ? 0.4 : 1, pointerEvents: sessionsDisabled ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
                <label style={labelStyle}>
                  {t('予約時間', 'Time')} <span style={{ color: '#c0392b' }}>*</span>
                  {sessionsDisabled && (
                    <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11, color: '#aaa', marginLeft: 8 }}>
                      {t('（日付を先に選択してください）', '(Please select a date first)')}
                    </span>
                  )}
                </label>
                {sessions.length === 0 ? (
                  <p style={{ fontSize: 14, color: '#bbb', margin: 0 }}>{t('読み込み中...', 'Loading...')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sessions.map((s) => {
                      const rem = s.max_participants - s.reserved_count
                      const full = rem <= 0
                      return (
                        <label key={s.id} style={radioCard(form.session_id === s.id, full)}>
                          <input
                            type="radio"
                            name="session"
                            value={s.id}
                            disabled={full}
                            checked={form.session_id === s.id}
                            onChange={() => setForm((f) => ({ ...f, session_id: s.id, participants: 1 }))}
                            style={{ accentColor: '#4a6741' }}
                          />
                          <span style={{ flex: 1, fontSize: 15, color: 'var(--c-ink)' }}>{s.time_label}</span>
                          <span style={{ fontSize: 12, color: full ? '#c0392b' : '#8a9a7e' }}>
                            {full ? t('満席', 'Full') : t(`残り ${rem} 名`, `${rem} left`)}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {event && (
              <div style={{ marginBottom: 20, opacity: participantsDisabled ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                <label style={labelStyle}>{t('参加人数', 'Participants')} <span style={{ color: '#c0392b' }}>*</span></label>
                {expectsSessions ? (
                  <select
                    disabled={participantsDisabled}
                    style={{ ...inputStyle, width: 120, cursor: participantsDisabled ? 'not-allowed' : 'default' }}
                    value={form.participants}
                    onChange={(e) => set('participants', Number(e.target.value))}
                  >
                    {form.session_id && selectedRemaining > 0
                      ? Array.from({ length: selectedRemaining }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>{t(`${n} 名`, `${n}`)}</option>
                        ))
                      : <option value={1}>—</option>
                    }
                  </select>
                ) : (
                  <input required type="number" min={1} max={10} style={{ ...inputStyle, width: 100 }} value={form.participants} onChange={(e) => set('participants', Number(e.target.value))} />
                )}
              </div>
            )}

            <p style={sectionLabel}>{t('お客様情報', 'Your Information')}</p>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>{t('お名前', 'Name')} <span style={{ color: '#c0392b' }}>*</span></label>
              <input required style={inputStyle} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>{t('メールアドレス', 'Email')} <span style={{ color: '#c0392b' }}>*</span></label>
              <input required type="email" style={inputStyle} value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>{t('電話番号（任意）', 'Phone (optional)')}</label>
              <input type="tel" style={inputStyle} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="090-0000-0000" />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>{t('持ち込み（任意）', 'Bring your own (optional)')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15 }}>
                  <input type="checkbox" checked={form.bring_plant} onChange={(e) => set('bring_plant', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#4a6741' }} />
                  {t('植物を持ち込む', 'Bring a plant')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15 }}>
                  <input type="checkbox" checked={form.bring_pot} onChange={(e) => set('bring_pot', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#4a6741' }} />
                  {t('鉢を持ち込む', 'Bring a pot')}
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 0 }}>
              <label style={labelStyle}>{t('備考（任意）', 'Notes (optional)')}</label>
              <textarea rows={4} style={{ ...inputStyle, resize: 'vertical' }} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </div>

            {status === 'error' && <p style={{ color: '#c0392b', fontSize: 14, marginTop: 16, marginBottom: 0 }}>{errorMsg}</p>}

            <button
              type="submit"
              disabled={status === 'loading' || !canSubmit}
              style={{ width: '100%', padding: 16, background: '#1e3272', color: '#fff', border: 'none', fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', marginTop: 32, borderRadius: 4, opacity: !canSubmit ? 0.5 : 1 }}
            >
              {status === 'loading' ? t('送信中...', 'Submitting...') : t('予約する', 'Reserve')}
            </button>
            {(needsDate || needsSession) && (
              <p style={{ textAlign: 'center', fontSize: 12, color: '#c0392b', marginTop: 8 }}>
                {needsDate ? t('予約日を選択してください', 'Please select a date') : t('予約時間を選択してください', 'Please select a time')}
              </p>
            )}
          </form>
        )}
          </div>
        </div>
      </div>
    </>
  )
}
