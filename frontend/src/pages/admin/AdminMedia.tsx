import { useState, useEffect } from 'react'
import { failMessage } from './errorMessage'
import { useUnsavedChanges } from './UnsavedChanges'
import { api, type MediaAppearance } from '../../lib/api'

/**
 * YouTube URL からビデオ ID を抽出する（watch・短縮 URL・embed 形式に対応）
 * @param url - 解析する YouTube URL
 * @returns ビデオ ID。マッチしない場合は null
 */
function getYouTubeId(url: string): string | null {
  /** 対応する URL の形（watch?v=・youtu.be/・embed/）。1つ目のかっこがビデオ ID */
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?/]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ]
  for (const p of patterns) {
    // URL 形式ごとの正規表現で動画 ID を取り出し、最初に一致した値を返す。
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

/** 登録フォームの入力欄（タイトル・URL・説明・公開日）の共通スタイル。横幅いっぱい */
const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  border: '1px solid #dddde8',
  borderRadius: 4,
  fontSize: 14,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

/**
 * メディア出演（YouTube 動画）を登録・一覧表示・削除するページ
 * @returns 登録フォームと登録済みの動画の一覧
 */
export default function AdminMedia() {
  /** 登録済みのメディア出演（新しく足したものが先頭） */
  const [items, setItems] = useState<MediaAppearance[]>([])
  /** 一覧の読み込み中なら true */
  const [loading, setLoading] = useState(true)
  /** 一覧の読み込みの失敗の文言（空なら失敗なし。「登録されていません」とは分けて出す） */
  const [loadError, setLoadError] = useState('')
  /** 追加の送信中なら true（ボタンを押せなくする） */
  const [saving, setSaving] = useState(false)
  /** 入力チェック・追加の失敗の文言（空なら出さない） */
  const [error, setError] = useState('')

  /** 入力中のタイトル */
  const [title, setTitle] = useState('')
  /** 入力中の YouTube の URL */
  const [youtubeUrl, setYoutubeUrl] = useState('')
  /** 入力中の説明（任意） */
  const [description, setDescription] = useState('')
  /** 入力中の公開日 "YYYY-MM-DD"（任意） */
  const [publishedAt, setPublishedAt] = useState('')
  /** 追加フォームに書きかけの入力があるか（追加に成功したら入力欄を空にするので確認は出なくなる） */
  const isDirty = [title, youtubeUrl, description, publishedAt].some((v) => v.trim() !== '')
  // 書きかけの入力をサイドメニューの確認・再読み込みの確認に使えるよう登録する
  useUnsavedChanges(isDirty)

  /**
   * 一覧を読み込む（「再読み込み」ボタンからも呼ぶ）
   * 1. 読み込み中にして前回の失敗の文言を消す
   * 2. 一覧を取得する。失敗したら「登録されていません」と区別できるよう失敗の文言を出す
   * 3. 読み込み中を戻す
   * @returns 戻り値なし。
   */
  const load = () => {
    // 1. 読み込み中
    setLoading(true)
    setLoadError('')
    // 2. 取得
    api.mediaAppearances.list()
      .then(setItems)
      .catch((e: unknown) => setLoadError(failMessage('メディア出演の読み込みに失敗しました', e)))
      // 3. 読み込み中を戻す
      .finally(() => setLoading(false))
  }
  // 画面を開いたときに一覧を読み込む
  useEffect(() => { load() }, [])

  /**
   * 入力した内容でメディア出演を追加する
   * 1. タイトルと URL が空なら何もしない。URL からビデオ ID が取れなければ文言を出して止める
   * 2. API で追加し、一覧の先頭に足して入力欄を空にする
   * 3. 失敗したらフォームに文言を出す
   * @param e - フォームの送信イベント（画面の再読み込みを止める）
   * @returns 戻り値なし。
   */
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    // 1. 入力の確認
    if (!title.trim() || !youtubeUrl.trim()) return
    if (!getYouTubeId(youtubeUrl)) {
      setError('有効なYouTube URLを入力してください')
      return
    }
    // 2. 追加
    setSaving(true)
    setError('')
    try {
      // 入力内容を API に登録し、作成済みデータを一覧へ反映する。
      const created = await api.mediaAppearances.add({
        title: title.trim(),
        youtube_url: youtubeUrl.trim(),
        description: description.trim() || null,
        published_at: publishedAt || null,
      })
      setItems((prev) => [created, ...prev])
      setTitle(''); setYoutubeUrl(''); setDescription(''); setPublishedAt('')
    } catch (err) {
      // 3. 失敗の表示
      setError(err instanceof Error ? err.message : '追加に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  /**
   * 確認のうえ動画を削除し、一覧から外す（失敗したら alert で知らせる）
   * @param id - 削除するメディア出演の id
   * @returns 戻り値なし。
   */
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

      {/* 登録フォーム */}
      <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560, marginBottom: 40 }}>
        <div>
          <label htmlFor="media-title" style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>タイトル *</label>
          <input id="media-title" type="text" placeholder="番組名・動画タイトル" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} required />
        </div>
        <div>
          <label htmlFor="media-youtube-url" style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>YouTube URL *</label>
          <input id="media-youtube-url" type="url" placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} style={inputStyle} required />
        </div>
        <div>
          <label htmlFor="media-description" style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>説明（任意）</label>
          <textarea id="media-description"
            placeholder="出演内容の説明など"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          />
        </div>
        <div>
          <label htmlFor="media-published-at" style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>公開日（任意）</label>
          <input id="media-published-at" type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} />
        </div>
        {/* 入力チェック・追加の失敗 */}
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
      ) : items.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>まだ登録されていません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => {
            /** この動画のビデオ ID（取れなければ null） */
            const videoId = getYouTubeId(item.youtube_url)
            /** YouTube のサムネイル画像の URL（ビデオ ID が無ければ出さない） */
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
                {/* タイトル・公開日・説明（長いものは1行で省略） */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                  {item.published_at && (
                    <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{item.published_at}</p>
                  )}
                  {item.description && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</p>
                  )}
                </div>
                {/* YouTube を新しいタブで開くリンクと削除ボタン */}
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
