import { useState, useEffect } from 'react'
import { failMessage } from './errorMessage'
import { useUnsavedChanges } from './UnsavedChanges'
import { api, type PotArtist } from '../../lib/api'

/**
 * 鉢作家のマスターデータを管理するページ（PriceCalc の選択肢として使用される）
 * 名前を入れて追加し、一覧の「削除」で消す
 * @returns 追加フォームと鉢作家の一覧
 */
export default function AdminPotArtists() {
  /** 登録済みの鉢作家の一覧 */
  const [artists, setArtists] = useState<PotArtist[]>([])
  /** 追加フォームに入力中の名前 */
  const [newName, setNewName] = useState('')
  /** 一覧の読み込み中なら true */
  const [loading, setLoading] = useState(true)
  /** 一覧の読み込みの失敗の文言（空なら失敗なし。「登録されていません」とは分けて出す） */
  const [loadError, setLoadError] = useState('')
  /** 追加の送信中なら true（ボタンを押せなくする） */
  const [saving, setSaving] = useState(false)
  /** 追加の失敗の文言（空なら出さない） */
  const [error, setError] = useState('')
  // 追加の入力欄に書きかけの名前があれば、サイドメニューの確認・再読み込みの確認に使えるよう登録する
  // （追加に成功したら入力欄を空にするので確認は出なくなる）
  useUnsavedChanges(newName.trim() !== '')

  /**
   * 一覧を読み込む（「再読み込み」ボタンからも呼ぶ）
   * 1. 読み込み中にして前回の失敗の文言を消す
   * 2. 一覧を取得する。失敗したら「登録されていません」と区別できるよう失敗の文言を出す
   * 3. 読み込み中を戻す
   */
  const load = () => {
    // 1. 読み込み中
    setLoading(true)
    setLoadError('')
    // 2. 取得
    api.potArtists.list()
      .then(setArtists)
      .catch((e: unknown) => setLoadError(failMessage('鉢作家の読み込みに失敗しました', e)))
      // 3. 読み込み中を戻す
      .finally(() => setLoading(false))
  }
  // 画面を開いたときに一覧を読み込む
  useEffect(() => { load() }, [])

  /**
   * 入力した名前で鉢作家を追加する
   * 1. 前後の空白を除いた名前が空なら何もしない
   * 2. API で追加し、一覧の末尾に足して入力欄を空にする
   * 3. 失敗したらフォームの下に文言を出す
   * @param e - フォームの送信イベント（画面の再読み込みを止める）
   */
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    // 1. 名前の確認
    const name = newName.trim()
    if (!name) return
    // 2. 追加
    setSaving(true)
    setError('')
    try {
      const created = await api.potArtists.add(name)
      setArtists((prev) => [...prev, created])
      setNewName('')
    } catch (err) {
      // 3. 失敗の表示
      setError(err instanceof Error ? err.message : '追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  /**
   * 確認のうえ鉢作家を削除し、一覧から外す（失敗したら alert で知らせる）
   * @param id - 削除する鉢作家の id
   */
  const remove = async (id: string) => {
    if (!confirm('この鉢作家を削除しますか？')) return
    try {
      await api.potArtists.delete(id)
      setArtists((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました')
    }
  }

  /** 追加フォームの名前の入力欄のスタイル（横幅はボタンの残りいっぱい） */
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

      {/* 追加フォーム（名前の入力欄と追加ボタン） */}
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

      {/* 追加の失敗（フォームのすぐ下に詰めて出す） */}
      {error && (
        <p style={{ color: '#c0392b', fontSize: 13, margin: '-20px 0 20px' }}>{error}</p>
      )}

      {/* 読み込み中・読み込みの失敗・未登録・一覧 */}
      {loading ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>読み込み中...</p>
      ) : loadError ? (
        /* 読み込みの失敗（再読み込みボタンつき） */
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0', margin: 0 }}>
          {loadError}
          <button
            type="button"
            onClick={load}
            style={{ marginLeft: 12, padding: '4px 12px', border: '1px solid #dddde8', borderRadius: 4, background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-body)' }}
          >
            再読み込み
          </button>
        </p>
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
