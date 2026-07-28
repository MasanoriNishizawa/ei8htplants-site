import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type Event, type PageContent } from '../../lib/api'

type LineupItem = NonNullable<PageContent['lineup']>[number]
type GuestItem = NonNullable<PageContent['guests']>[number]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #ddd4c0', borderRadius: 8,
  fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, letterSpacing: 1, color: '#8a9a7e', textTransform: 'uppercase', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fffcf6', border: '1px solid #ddd4c0', borderRadius: 12, padding: 24 }}>
      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, letterSpacing: 2, margin: '0 0 20px', paddingBottom: 12, borderBottom: '1px solid #ddd4c0' }}>{title}</h3>
      {children}
    </div>
  )
}

function ImageInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await api.upload(file)
      onChange(url)
    } catch {
      alert('アップロードに失敗しました')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }
  const thumb: React.CSSProperties = {
    width: 88, height: 88, borderRadius: 8, border: '1px solid #ddd4c0',
    overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f2ede4',
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <label style={{ ...thumb, opacity: uploading ? 0.5 : 1 }}>
        {value && !value.startsWith('blob:') ? (
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 24, color: '#aaa' }}>{uploading ? '…' : '+'}</span>
        )}
        <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
      </label>
      {value && !value.startsWith('blob:') && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{ fontSize: 12, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          削除
        </button>
      )}
    </div>
  )
}

function emptyContent(): PageContent {
  return {
    hero: { image_url: '', tagline: '', subtitle: '' },
    venue: { address: '', access: '', map_url: '' },
    concept: '',
    lineup: [],
    workshop: null,
    guests: [],
    archive: { enabled: false, title: '', message: '', gallery: [] },
  }
}

export default function AdminEventSite() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [pc, setPc] = useState<PageContent>(emptyContent())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    api.events.get(id).then((ev) => {
      setEvent(ev)
      const saved = ev.page_content ?? {}
      setPc({
        ...emptyContent(),
        ...saved,
        hero: { ...emptyContent().hero, ...saved.hero },
        venue: { ...emptyContent().venue, ...saved.venue },
        archive: { ...emptyContent().archive, ...saved.archive, enabled: saved.archive?.enabled ?? false },
      })
    })
  }, [id])

  const save = async () => {
    if (!id) return
    setSaving(true)
    try {
      await api.events.savePageContent(id, pc)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof PageContent>(key: K, val: PageContent[K]) =>
    setPc((p) => ({ ...p, [key]: val }))

  const setHero = (key: string, val: string) =>
    setPc((p) => ({ ...p, hero: { ...p.hero, [key]: val } }))

  const setVenue = (key: string, val: string) =>
    setPc((p) => ({ ...p, venue: { ...p.venue, [key]: val } }))

  const setArchive = (key: string, val: string | boolean | string[]) =>
    setPc((p) => ({ ...p, archive: { ...emptyContent().archive, ...p.archive, enabled: p.archive?.enabled ?? false, [key]: val } }))

  const setLineupItem = (i: number, patch: Partial<LineupItem>) =>
    set('lineup', (pc.lineup ?? []).map((it, j) => j === i ? { ...it, ...patch } : it))

  const setGuestItem = (i: number, patch: Partial<GuestItem>) =>
    set('guests', (pc.guests ?? []).map((g, j) => j === i ? { ...g, ...patch } : g))

  if (!event) return <p style={{ color: '#8a9a7e' }}>読み込み中...</p>

  const hasWorkshop = pc.workshop !== null && pc.workshop !== undefined
  const isArchived = pc.archive?.enabled ?? false

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 300, margin: '0 0 6px' }}>サイト編集</h2>
          <p style={{ fontSize: 13, color: '#8a9a7e', margin: 0 }}>{event.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to={`/events/${id}`} target="_blank" style={{ fontSize: 13, color: '#8a9a7e', textDecoration: 'none', borderBottom: '1px solid #ddd4c0', paddingBottom: 2 }}>
            プレビュー →
          </Link>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: '10px 24px', background: saved ? '#4a6741' : '#1c2417', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background 0.3s' }}
          >
            {saved ? '保存しました' : saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Hero */}
        <Card title="Hero">
          <Field label="キャッチコピー">
            <input value={pc.hero?.tagline ?? ''} onChange={(e) => setHero('tagline', e.target.value)} placeholder="植物と出会う2日間" style={inputStyle} />
          </Field>
          <Field label="サブタイトル">
            <input value={pc.hero?.subtitle ?? ''} onChange={(e) => setHero('subtitle', e.target.value)} style={inputStyle} />
          </Field>
        </Card>

        {/* 開催情報 */}
        <Card title="開催情報">
          <Field label="住所（イベント情報から自動取得）">
            <div style={{ padding: '9px 12px', background: '#f2ede4', border: '1px solid #ddd4c0', borderRadius: 8, fontSize: 14, color: '#3a4535' }}>
              {event.address ? (
                <>
                  <span>{event.address}</span>
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(event.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginLeft: 12, fontSize: 12, color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    Google マップで確認
                  </a>
                </>
              ) : (
                <span style={{ color: '#aaa' }}>イベントに住所が登録されていません</span>
              )}
            </div>
          </Field>
          <Field label="アクセス">
            <input value={pc.venue?.access ?? ''} onChange={(e) => setVenue('access', e.target.value)} placeholder="○○駅から徒歩5分" style={inputStyle} />
          </Field>
        </Card>

        {/* コンセプト */}
        <Card title="コンセプト">
          <textarea
            value={pc.concept ?? ''}
            onChange={(e) => set('concept', e.target.value)}
            rows={6}
            placeholder="イベントのコンセプトを入力..."
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.8 }}
          />
        </Card>

        {/* ラインナップ */}
        <Card title="ラインナップ">
          {(pc.lineup ?? []).map((item, i) => (
            <div key={i} style={{ border: '1px solid #e8e2d8', borderRadius: 8, padding: '16px 16px 4px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#8a9a7e', letterSpacing: 1 }}>ラインナップ {i + 1}</span>
                <button onClick={() => set('lineup', (pc.lineup ?? []).filter((_, j) => j !== i))} style={{ padding: '4px 10px', border: '1px solid #f0b8ae', borderRadius: 6, fontSize: 12, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
              </div>
              <Field label="名称">
                <input value={item.title} onChange={(e) => setLineupItem(i, { title: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="説明">
                <textarea value={item.description ?? ''} onChange={(e) => setLineupItem(i, { description: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <Field label="画像">
                <ImageInput value={item.image_url ?? ''} onChange={(v) => setLineupItem(i, { image_url: v })} />
              </Field>
            </div>
          ))}
          <button onClick={() => set('lineup', [...(pc.lineup ?? []), { title: '', description: '', image_url: '' }])}
            style={{ padding: '9px 20px', border: '1px dashed #b8a88a', borderRadius: 8, fontSize: 13, color: '#8a9a7e', background: 'none', cursor: 'pointer', width: '100%' }}>
            + ラインナップを追加
          </button>
        </Card>

        {/* ワークショップ */}
        <Card title="ワークショップ">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, cursor: 'pointer', fontSize: 14, color: '#3a4535' }}>
            <input type="checkbox" checked={hasWorkshop} onChange={(e) => set('workshop', e.target.checked ? { title: '', description: '', note: '' } : null)} style={{ width: 16, height: 16 }} />
            ワークショップセクションを表示する
          </label>
          {hasWorkshop && pc.workshop !== null && pc.workshop !== undefined && (
            <>
              <Field label="タイトル">
                <input value={pc.workshop.title ?? ''} onChange={(e) => set('workshop', { ...pc.workshop!, title: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="説明">
                <textarea value={pc.workshop.description ?? ''} onChange={(e) => set('workshop', { ...pc.workshop!, description: e.target.value })} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <Field label="備考（定員・持ち物など）">
                <input value={pc.workshop.note ?? ''} onChange={(e) => set('workshop', { ...pc.workshop!, note: e.target.value })} placeholder="定員 8名" style={inputStyle} />
              </Field>
            </>
          )}
        </Card>

        {/* ゲスト・出展者 */}
        <Card title="ゲスト・出展者">
          {(pc.guests ?? []).map((guest, i) => (
            <div key={i} style={{ border: '1px solid #e8e2d8', borderRadius: 8, padding: '16px 16px 4px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#8a9a7e', letterSpacing: 1 }}>ゲスト {i + 1}</span>
                <button onClick={() => set('guests', (pc.guests ?? []).filter((_, j) => j !== i))} style={{ padding: '4px 10px', border: '1px solid #f0b8ae', borderRadius: 6, fontSize: 12, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
              </div>
              <Field label="名前">
                <input value={guest.name} onChange={(e) => setGuestItem(i, { name: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="役割・肩書き">
                <input value={guest.role ?? ''} onChange={(e) => setGuestItem(i, { role: e.target.value })} placeholder="陶芸作家" style={inputStyle} />
              </Field>
              <Field label="プロフィール">
                <textarea value={guest.bio ?? ''} onChange={(e) => setGuestItem(i, { bio: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <Field label="プロフィール画像">
                <ImageInput value={guest.image_url ?? ''} onChange={(v) => setGuestItem(i, { image_url: v })} />
              </Field>
              <Field label="Instagram URL">
                <input value={guest.instagram_url ?? ''} onChange={(e) => setGuestItem(i, { instagram_url: e.target.value })} placeholder="https://www.instagram.com/..." style={inputStyle} />
              </Field>
            </div>
          ))}
          <button onClick={() => set('guests', [...(pc.guests ?? []), { name: '', role: '', bio: '', image_url: '', instagram_url: '' }])}
            style={{ padding: '9px 20px', border: '1px dashed #b8a88a', borderRadius: 8, fontSize: 13, color: '#8a9a7e', background: 'none', cursor: 'pointer', width: '100%' }}>
            + ゲストを追加
          </button>
        </Card>

        {/* アーカイブ */}
        <Card title="アーカイブ">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, cursor: 'pointer', fontSize: 14, color: '#3a4535' }}>
            <input type="checkbox" checked={isArchived} onChange={(e) => setArchive('enabled', e.target.checked)} style={{ width: 16, height: 16 }} />
            アーカイブ表示にする（イベント終了後）
          </label>
          {isArchived && (
            <>
              <Field label="タイトル">
                <input value={pc.archive?.title ?? ''} onChange={(e) => setArchive('title', e.target.value)} placeholder="ご来場ありがとうございました" style={inputStyle} />
              </Field>
              <Field label="メッセージ">
                <textarea value={pc.archive?.message ?? ''} onChange={(e) => setArchive('message', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <Field label="ギャラリー画像 URL（1行1URL）">
                <textarea
                  value={(pc.archive?.gallery ?? []).join('\n')}
                  onChange={(e) => setArchive('gallery', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                  rows={5}
                  placeholder="https://..."
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                />
              </Field>
            </>
          )}
        </Card>

      </div>
    </div>
  )
}
