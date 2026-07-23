import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, type EventBody } from '../../lib/api'

const BRANDS = ['ei8ht plants', 'Habitat Oides', 'HUE by ei8ht plants']

type FormState = {
  name: string; start_date: string; end_date: string; time: string
  location: string; booth_number: string; address: string; official_url: string
  brands: string[]; has_workshop: boolean; ws_requires_reservation: boolean; is_past: boolean
}

type SessionInput = { time_label: string; max_participants: number }

const empty: FormState = {
  name: '', start_date: '', end_date: '', time: '', location: '',
  booth_number: '', address: '', official_url: '',
  brands: [], has_workshop: false, ws_requires_reservation: true, is_past: false,
}

export default function AdminEventForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(empty)
  const [imageUrls, setImageUrls] = useState<string[]>([''])
  const [sessions, setSessions] = useState<SessionInput[]>([])
  const [saving, setSaving] = useState(false)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([api.events.get(id), api.events.getSessions(id)]).then(([ev, sess]) => {
      setForm({
        name: ev.name, start_date: ev.start_date, end_date: ev.end_date ?? '',
        time: ev.time ?? '', location: ev.location, booth_number: ev.booth_number ?? '',
        address: ev.address ?? '', official_url: ev.official_url ?? '',
        brands: ev.brands, has_workshop: ev.has_workshop,
        ws_requires_reservation: ev.ws_requires_reservation, is_past: ev.is_past,
      })
      setImageUrls(ev.images.map((i) => i.url).concat(['']))
      setSessions(sess.map((s) => ({ time_label: s.time_label, max_participants: s.max_participants })))
    })
  }, [id])

  const set = (k: keyof FormState, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const handleImageFile = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const localUrl = URL.createObjectURL(file)
    const next = [...imageUrls]
    next[i] = localUrl
    if (i === imageUrls.length - 1) next.push('')
    setImageUrls(next)
    setUploadingIdx(i)
    try {
      const uploaded = await api.upload(file)
      setImageUrls((prev) => prev.map((u, j) => j === i ? uploaded : u))
    } finally {
      setUploadingIdx(null)
      e.target.value = ''
    }
  }

  const toggleBrand = (b: string) =>
    set('brands', form.brands.includes(b) ? form.brands.filter((x) => x !== b) : [...form.brands, b])

  const addSession = () => setSessions((prev) => [...prev, { time_label: '', max_participants: 10 }])
  const removeSession = (i: number) => setSessions((prev) => prev.filter((_, j) => j !== i))
  const setSession = (i: number, key: keyof SessionInput, value: string | number) =>
    setSessions((prev) => prev.map((s, j) => j === i ? { ...s, [key]: value } : s))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const body: EventBody = { ...form, image_urls: imageUrls.filter(Boolean) }
    try {
      let eventId = id
      if (id) {
        await api.events.update(id, body)
      } else {
        const created = await api.events.create(body)
        eventId = created.id
      }
      if (eventId) {
        const validSessions = form.has_workshop ? sessions.filter((s) => s.time_label.trim()) : []
        await api.events.saveSessions(eventId, validSessions)
      }
      navigate('/admin/events')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', background: '#fffcf6', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: 13, letterSpacing: 1, color: '#3a4535' }

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 32 }}>
        {id ? 'イベント編集' : '新規イベント'}
      </h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div><label style={labelStyle}>イベント名</label><input required style={inputStyle} value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><label style={labelStyle}>開始日</label><input required type="date" style={inputStyle} value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></div>
          <div><label style={labelStyle}>終了日</label><input type="date" style={inputStyle} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} /></div>
        </div>
        <div><label style={labelStyle}>開催時間</label><input style={inputStyle} placeholder="10:00〜16:00" value={form.time} onChange={(e) => set('time', e.target.value)} /></div>
        <div><label style={labelStyle}>会場名</label><input required style={inputStyle} value={form.location} onChange={(e) => set('location', e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><label style={labelStyle}>ブース番号</label><input style={inputStyle} value={form.booth_number} onChange={(e) => set('booth_number', e.target.value)} /></div>
          <div><label style={labelStyle}>住所</label><input style={inputStyle} value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
        </div>
        <div><label style={labelStyle}>公式サイトURL</label><input type="url" style={inputStyle} value={form.official_url} onChange={(e) => set('official_url', e.target.value)} /></div>
        <div>
          <label style={labelStyle}>販売ブランド</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {BRANDS.map((b) => (
              <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.brands.includes(b)} onChange={() => toggleBrand(b)} />
                {b}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>画像URL（複数可）</label>
          {imageUrls.map((url, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {url && !url.startsWith('blob:') && (
                  <img src={url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd4c0', flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
                {url && url.startsWith('blob:') && uploadingIdx === i && (
                  <img src={url} alt="preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd4c0', flexShrink: 0, opacity: 0.6 }} />
                )}
                <input
                  type="url"
                  style={{ ...inputStyle, flex: 1 }}
                  value={url.startsWith('blob:') ? '' : url}
                  placeholder={uploadingIdx === i ? 'アップロード中...' : 'https://...'}
                  onChange={(e) => {
                    const next = [...imageUrls]
                    next[i] = e.target.value
                    if (i === imageUrls.length - 1 && e.target.value) next.push('')
                    setImageUrls(next)
                  }}
                />
                <label style={{ padding: '10px 12px', background: uploadingIdx === i ? '#ccc' : '#e8e0d4', border: '1px solid #ddd4c0', borderRadius: 8, cursor: uploadingIdx === i ? 'default' : 'pointer', fontSize: 12, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                  {uploadingIdx === i ? '...' : 'ファイル'}
                  <input type="file" accept="image/*" onChange={(e) => handleImageFile(i, e)} disabled={uploadingIdx !== null} style={{ display: 'none' }} />
                </label>
                {i < imageUrls.length - 1 && (
                  <button type="button" onClick={() => setImageUrls(imageUrls.filter((_, j) => j !== i))}
                    style={{ padding: '0 12px', border: '1px solid #ddd4c0', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#c0392b' }}>
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* フラグ */}
        <div style={{ display: 'flex', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={form.has_workshop} onChange={(e) => set('has_workshop', e.target.checked)} />
            ワークショップあり
          </label>
          {form.has_workshop && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input type="checkbox" checked={form.ws_requires_reservation} onChange={(e) => set('ws_requires_reservation', e.target.checked)} />
              予約必要
            </label>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={form.is_past} onChange={(e) => set('is_past', e.target.checked)} />
            過去のイベント
          </label>
        </div>

        {/* WSセッション管理 */}
        {form.has_workshop && (
          <div style={{ padding: '20px', background: '#f8faf6', border: '1px solid #c8d8c0', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <label style={{ ...labelStyle, margin: 0, fontSize: 14, fontWeight: 500 }}>WSセッション（各回の時間・定員）</label>
              <button type="button" onClick={addSession}
                style={{ padding: '6px 16px', background: '#4a6741', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                + 追加
              </button>
            </div>
            {sessions.length === 0 && (
              <p style={{ fontSize: 13, color: '#8a9a7e', margin: 0 }}>セッションなし（時間指定なしで予約受付）</p>
            )}
            {sessions.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="例: 10:00〜11:30"
                  value={s.time_label}
                  onChange={(e) => setSession(i, 'time_label', e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: '#8a9a7e', whiteSpace: 'nowrap' }}>定員</span>
                  <input
                    type="number"
                    min={1}
                    value={s.max_participants}
                    onChange={(e) => setSession(i, 'max_participants', Number(e.target.value))}
                    style={{ ...inputStyle, width: 70, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 13, color: '#8a9a7e' }}>名</span>
                </div>
                <button type="button" onClick={() => removeSession(i)}
                  style={{ padding: '0 10px', height: 40, border: '1px solid #ddd4c0', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#c0392b', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="submit" disabled={saving} style={{ padding: '12px 32px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer' }}>
            {saving ? '保存中...' : '保存する'}
          </button>
          <button type="button" onClick={() => navigate('/admin/events')} style={{ padding: '12px 24px', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 15, background: 'none', cursor: 'pointer' }}>
            キャンセル
          </button>
        </div>
      </form>
    </div>
  )
}
