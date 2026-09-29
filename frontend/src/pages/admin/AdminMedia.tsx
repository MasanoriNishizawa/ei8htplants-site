import { useState, useEffect } from 'react'
import { api, type MediaAppearance } from '../../lib/api'

function getYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?/]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  border: '1px solid #dddde8',
  borderRadius: 4,
  fontSize: 14,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

export default function AdminMedia() {
  const [items, setItems] = useState<MediaAppearance[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [description, setDescription] = useState('')
  const [publishedAt, setPublishedAt] = useState('')

  useEffect(() => {
    api.mediaAppearances.list().then(setItems).finally(() => setLoading(false))
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !youtubeUrl.trim()) return
    if (!getYouTubeId(youtubeUrl)) {
      setError('有効なYouTube URLを入力してください')
      return
    }
    setSaving(true)
    setError('')
    try {
      const created = await api.mediaAppearances.add({
        title: title.trim(),
        youtube_url: youtubeUrl.trim(),
        description: description.trim() || null,
        published_at: publishedAt || null,
      })
      setItems((prev) => [created, ...prev])
      setTitle(''); setYoutubeUrl(''); setDescription(''); setPublishedAt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('この動画を削除しますか？')) return
    try {
      await api.mediaAppearances.delete(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました')
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 28px', letterSpacing: 1 }}>
        メディア出演管理
      </h1>

      <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560, marginBottom: 40 }}>
        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>タイトル *</label>
          <input type="text" placeholder="番組名・動画タイトル" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} required />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>YouTube URL *</label>
          <input type="url" placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} style={inputStyle} required />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>説明（任意）</label>
          <textarea
            placeholder="出演内容の説明など"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>公開日（任意）</label>
          <input type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} />
        </div>
        {error && <p style={{ color: '#c0392b', fontSize: 13, margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '12px 24px', background: saving ? '#ccc' : '#1c2417',
            color: '#fff', border: 'none', borderRadius: 4,
            fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start', fontFamily: 'inherit',
          }}
        >
          {saving ? '追加中...' : '追加'}
        </button>
      </form>

      {loading ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>読み込み中...</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>まだ登録されていません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => {
            const videoId = getYouTubeId(item.youtube_url)
            const thumb = videoId ? `https://img.youtube.com/vi/${videoId}/default.jpg` : null
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', background: '#fff',
                border: '1px solid #dddde8', borderRadius: 6,
              }}>
                {thumb && (
                  <img src={thumb} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                  {item.published_at && (
                    <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{item.published_at}</p>
                  )}
                  {item.description && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <a
                    href={item.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '6px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 12, color: '#444', textDecoration: 'none' }}
                  >
                    確認
                  </a>
                  <button
                    onClick={() => remove(item.id)}
                    style={{ padding: '6px 12px', background: 'none', border: '1px solid #e0b0b0', borderRadius: 4, color: '#c0392b', fontSize: 12, cursor: 'pointer' }}
                  >
                    削除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
