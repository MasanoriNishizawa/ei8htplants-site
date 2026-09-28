import { useState, useEffect } from 'react'
import { api, type PotArtist } from '../../lib/api'

export default function AdminPotArtists() {
  const [artists, setArtists] = useState<PotArtist[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.potArtists.list().then(setArtists).finally(() => setLoading(false))
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    setError('')
    try {
      const created = await api.potArtists.add(name)
      setArtists((prev) => [...prev, created])
      setNewName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('この鉢作家を削除しますか？')) return
    try {
      await api.potArtists.delete(id)
      setArtists((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました')
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px',
    border: '1px solid #dddde8',
    borderRadius: 4,
    fontSize: 15,
    fontFamily: 'inherit',
    flex: 1,
    minWidth: 0,
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 28px', letterSpacing: 1 }}>
        鉢作家管理
      </h1>

      <form onSubmit={add} style={{ display: 'flex', gap: 10, maxWidth: 480, marginBottom: 32 }}>
        <input
          type="text"
          placeholder="鉢作家名を入力"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={saving || !newName.trim()}
          style={{
            padding: '10px 20px',
            background: '#1c2417',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {saving ? '追加中...' : '追加'}
        </button>
      </form>

      {error && (
        <p style={{ color: '#c0392b', fontSize: 13, margin: '-20px 0 20px' }}>{error}</p>
      )}

      {loading ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>読み込み中...</p>
      ) : artists.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>鉢作家が登録されていません。</p>
      ) : (
        <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #dddde8', borderRadius: 6, overflow: 'hidden' }}>
          {artists.map((artist, i) => (
            <div
              key={artist.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderTop: i === 0 ? 'none' : '1px solid #dddde8',
                background: '#fff',
              }}
            >
              <span style={{ fontSize: 15 }}>{artist.name}</span>
              <button
                onClick={() => remove(artist.id)}
                style={{
                  padding: '6px 12px',
                  background: 'none',
                  border: '1px solid #e0b0b0',
                  borderRadius: 4,
                  color: '#c0392b',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
