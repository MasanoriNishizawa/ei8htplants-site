import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, type EventBody } from '../../lib/api'

const BRANDS = ['ei8ht plants', 'Habitat Oides', 'HUE by ei8ht plants']

type FormState = {
  name: string; start_date: string; end_date: string; time: string
  location: string; booth_number: string; address: string; official_url: string
  brands: string[]; has_workshop: boolean; ws_requires_reservation: boolean
}

type SessionInput = { time_label: string; max_participants: number }

const empty: FormState = {
  name: '', start_date: '', end_date: '', time: '', location: '',
  booth_number: '', address: '', official_url: '',
  brands: [], has_workshop: false, ws_requires_reservation: true,
}

export default function AdminEventForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(empty)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [sessions, setSessions] = useState<SessionInput[]>([])
  const [saving, setSaving] = useState(false)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const [dailyTimesMode, setDailyTimesMode] = useState(false)
  const [dailyTimes, setDailyTimes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id) return
    Promise.all([api.events.get(id), api.events.getSessions(id)]).then(([ev, sess]) => {
      setForm({
        name: ev.name, start_date: ev.start_date, end_date: ev.end_date ?? '',
        time: ev.time ?? '', location: ev.location, booth_number: ev.booth_number ?? '',
        address: ev.address ?? '', official_url: ev.official_url ?? '',
        brands: ev.brands, has_workshop: ev.has_workshop,
        ws_requires_reservation: ev.ws_requires_reservation,
      })
      setImageUrls(ev.images.map((i) => i.url))
      setSessions(sess.map((s) => ({ time_label: s.time_label, max_participants: s.max_participants })))
      const hasDailyTimes = !!ev.daily_times && Object.keys(ev.daily_times).length > 0
      setDailyTimesMode(hasDailyTimes)
      setDailyTimes(ev.daily_times ?? {})
    })
  }, [id])

  const set = (k: keyof FormState, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    const startIdx = imageUrls.filter(Boolean).length
    const blobs = fileArray.map((f) => URL.createObjectURL(f))
    setImageUrls((prev) => {
      const existing = prev.filter(Boolean)
      return [...existing, ...blobs]
    })
    setUploadingIdx(startIdx)
    try {
      const uploaded = await Promise.all(fileArray.map((f) => api.upload(f)))
      setImageUrls((prev) => {
        const result = [...prev]
        blobs.forEach((blob, i) => {
          const idx = result.indexOf(blob)
          if (idx !== -1) result[idx] = uploaded[i]
        })
        return result
      })
    } catch (err) {
      setImageUrls((prev) => prev.filter((u) => !blobs.includes(u)))
      alert(`画像のアップロードに失敗しました: ${err instanceof Error ? err.message : err}`)
    } finally {
      setUploadingIdx(null)
    }
  }

  const toggleBrand = (b: string) =>
    set('brands', form.brands.includes(b) ? form.brands.filter((x) => x !== b) : [...form.brands, b])

  const addSession = () => setSessions((prev) => [...prev, { time_label: '', max_participants: 10 }])
  const removeSession = (i: number) => setSessions((prev) => prev.filter((_, j) => j !== i))
  const setSession = (i: number, key: keyof SessionInput, value: string | number) =>
    setSessions((prev) => prev.map((s, j) => j === i ? { ...s, [key]: value } : s))

  const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

  const getDates = (start: string, end: string): string[] => {
    const dates: string[] = []
    const cur = new Date(start + 'T00:00:00')
    const endDate = new Date(end + 'T00:00:00')
    while (cur <= endDate) {
      dates.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  }

  const fmtDay = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00')
    return `${d.getMonth() + 1}月${d.getDate()}日（${DOW_JA[d.getDay()]}）`
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const isMultiDay = form.start_date && form.end_date && form.end_date > form.start_date
    const body: EventBody = {
      ...form,
      daily_times: (dailyTimesMode && isMultiDay) ? dailyTimes : null,
      image_urls: imageUrls.filter((u) => u && !u.startsWith('blob:')),
    }
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

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: 13, letterSpacing: 1, color: '#3a4535' }

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 32 }}>
        {id ? 'イベント編集' : '新規イベント'}
      </h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div><label style={labelStyle}>イベント名</label><input required style={inputStyle} value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>開始日</label>
            <input required type="date" style={inputStyle} value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)} />
            {form.start_date && <span style={{ fontSize: 11, color: parseInt(form.start_date.slice(0, 4)) < 2020 ? '#c0392b' : '#8a9a7e', marginTop: 4, display: 'block' }}>確認: {form.start_date}</span>}
          </div>
          <div>
            <label style={labelStyle}>終了日</label>
            <input type="date" style={inputStyle} value={form.end_date}
              onChange={(e) => set('end_date', e.target.value)} />
            {form.end_date && <span style={{ fontSize: 11, color: parseInt(form.end_date.slice(0, 4)) < 2020 ? '#c0392b' : '#8a9a7e', marginTop: 4, display: 'block' }}>確認: {form.end_date}</span>}
          </div>
        </div>
        <div>
          {(() => {
            const isMultiDay = form.start_date && form.end_date && form.end_date > form.start_date
            const dates = isMultiDay ? getDates(form.start_date, form.end_date) : []
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>開催時間</label>
                  {isMultiDay && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#3a4535' }}>
                      <input
                        type="checkbox"
                        checked={dailyTimesMode}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setDailyTimesMode(checked)
                          if (checked) {
                            const init: Record<string, string> = {}
                            dates.forEach((d) => { init[d] = form.time })
                            setDailyTimes(init)
                          }
                        }}
                      />
                      日ごとに異なる
                    </label>
                  )}
                </div>
                {dailyTimesMode && isMultiDay ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: '#f6f6fa', borderRadius: 4, border: '1px solid #dddde8' }}>
                    {dates.map((d) => (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 13, color: '#3a4535', minWidth: 116, flexShrink: 0 }}>{fmtDay(d)}</span>
                        <input
                          style={{ ...inputStyle, flex: 1 }}
                          placeholder="10:00〜16:00"
                          value={dailyTimes[d] ?? ''}
                          onChange={(e) => setDailyTimes((prev) => ({ ...prev, [d]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <input style={inputStyle} placeholder="10:00〜16:00" value={form.time} onChange={(e) => set('time', e.target.value)} />
                )}
              </>
            )
          })()}
        </div>
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
          <label style={labelStyle}>画像（複数可）</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
            {imageUrls.map((url, i) => {
              const isBlob = url.startsWith('blob:')
              const isUploading = isBlob && uploadingIdx !== null
              return (
                <div key={i} style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
                  <img
                    src={url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, border: '1px solid #dddde8', opacity: isUploading ? 0.5 : 1, display: 'block' }}
                  />
                  {isUploading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#8a9a7e' }}>...</div>
                  )}
                  {!isUploading && (
                    <button
                      type="button"
                      onClick={() => setImageUrls((prev) => prev.filter((_, j) => j !== i))}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c0392b', border: 'none', color: '#fff', fontSize: 12, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
            <label style={{
              width: 88, height: 88, border: '1.5px dashed #b0b0c4', borderRadius: 4,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, cursor: uploadingIdx !== null ? 'default' : 'pointer', color: '#8a9a7e', flexShrink: 0,
              opacity: uploadingIdx !== null ? 0.5 : 1,
            }}>
              <span style={{ fontSize: 24, lineHeight: 1 }}>+</span>
              <span style={{ fontSize: 11 }}>追加</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleImageFiles(e.target.files)}
                disabled={uploadingIdx !== null}
                style={{ display: 'none' }}
              />
            </label>
          </div>
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
        </div>

        {/* WSセッション管理 */}
        {form.has_workshop && (
          <div style={{ padding: '20px', background: '#f8faf6', border: '1px solid #c8d8c0', borderRadius: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <label style={{ ...labelStyle, margin: 0, fontSize: 14, fontWeight: 500 }}>WSセッション（各回の時間・定員）</label>
              <button type="button" onClick={addSession}
                style={{ padding: '6px 16px', background: '#4a6741', color: '#fff', border: 'none', borderRadius: 2, fontSize: 13, cursor: 'pointer' }}>
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
                  style={{ padding: '0 10px', height: 40, border: '1px solid #dddde8', borderRadius: 4, background: 'none', cursor: 'pointer', color: '#c0392b', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="submit" disabled={saving || uploadingIdx !== null} style={{ padding: '12px 32px', background: '#1c2417', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, cursor: saving || uploadingIdx !== null ? 'default' : 'pointer', opacity: saving || uploadingIdx !== null ? 0.6 : 1 }}>
            {saving ? '保存中...' : uploadingIdx !== null ? 'アップロード中...' : '保存する'}
          </button>
          <button type="button" onClick={() => navigate('/admin/events')} style={{ padding: '12px 24px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, background: 'none', cursor: 'pointer' }}>
            キャンセル
          </button>
        </div>
      </form>
    </div>
  )
}
