import { useEffect, useId, useState } from 'react'
import { api, type Collaboration, type CollaborationPayload } from '../../lib/api'
import { failMessage } from './errorMessage'
import { dirtySnapshotJson, useUnsavedChanges } from './UnsavedChanges'

/** 追加フォームの初期値（すべて未入力） */
const empty: CollaborationPayload = {
  title: '',
  partner_name: '',
  description: '',
  video_url: '',
  image_url: '',
  event_date: '',
}

/** エラーの帯の見た目（ほかの管理画面と同じ赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/** 追加フォームの入力欄（タイトル・コラボ相手・開催日・説明文）の共通の見た目。横幅いっぱい */
const inputStyle: React.CSSProperties = {
  padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4,
  fontSize: 15, fontFamily: 'inherit', background: '#ffffff', width: '100%', boxSizing: 'border-box',
}

/**
 * コラボレーション事例を管理するページ（動画・画像のアップロードを含む）
 * @returns 追加フォームと登録済みの一覧
 */
export default function AdminCollaborations() {
  /** 登録済みのコラボレーション */
  const [items, setItems] = useState<Collaboration[]>([])
  /** 追加フォームの入力 */
  const [form, setForm] = useState<CollaborationPayload>(empty)
  /** 追加を保存中なら true */
  const [saving, setSaving] = useState(false)
  /** 画像をアップロード中なら true */
  const [uploading, setUploading] = useState(false)
  /** 動画をアップロード中なら true */
  const [uploadingVideo, setUploadingVideo] = useState(false)
  /** 読み込み・追加・削除・アップロードの失敗の文言。null なら出さない */
  const [error, setError] = useState<string | null>(null)
  /** 「動画（任意）」の見出しの id（ファイル選択欄の読み上げの名前に使う） */
  const videoLabelId = useId()
  /** ファイルを選ぶボタンの文字の id（同じく読み上げの名前に使う） */
  const videoPickId = useId()
  /** 追加フォームに入力があるか（空のフォームと比べる。追加に成功したらフォームを空にするので確認は出なくなる） */
  const isDirty = dirtySnapshotJson(form) !== dirtySnapshotJson(empty)
  // 書きかけの入力をサイドメニューの確認・再読み込みの確認に使えるよう登録する
  useUnsavedChanges(isDirty)

  /**
   * 一覧を読み込み直す。失敗したら「ありません」と誤表示しないよう文言を出す
   * @returns 読み込みが終わる Promise
   */
  const load = () => api.collaborations.list()
    .then(setItems)
    .catch((e: unknown) => setError(failMessage('コラボレーションの読み込みに失敗しました', e)))
  // 画面を開いたときに一覧を読み込む
  useEffect(() => { load() }, [])

  /**
   * フォームの内容を追加する
   * 1. 空の項目は送らない（サーバー側で null のままにする）
   * 2. 追加できたらフォームを空にして一覧を読み込み直す
   * 3. 失敗したら入力を残したまま文言を出す
   * @param e - フォームの送信イベント
   */
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    // 1. 送る内容
    /** 送る内容（タイトル以外は入力があるものだけ） */
    const payload: CollaborationPayload = {
      title: form.title,
      ...(form.partner_name && { partner_name: form.partner_name }),
      ...(form.description && { description: form.description }),
      ...(form.video_url && { video_url: form.video_url }),
      ...(form.image_url && { image_url: form.image_url }),
      ...(form.event_date && { event_date: form.event_date }),
    }
    try {
      // 2. 追加と読み込み直し
      await api.collaborations.add(payload)
      setForm(empty)
      await load()
    } catch (err: unknown) {
      // 3. 失敗
      setError(failMessage('追加に失敗しました', err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * 画像を選んだらアップロードする（blob URL ですぐに仮の値を入れ、アップロード後に本当の URL へ差し替える）
   * 失敗したら画像を外して文言を出す。仮の blob URL は終わったら解放する
   * @param e - ファイル選択欄の変更イベント
   */
  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    /** 選ばれたファイル（選ぶのをやめたときは undefined） */
    const file = e.target.files?.[0]
    if (!file) return
    /** アップロードが終わるまでの仮の blob URL */
    const localUrl = URL.createObjectURL(file)
    setForm((f) => ({ ...f, image_url: localUrl }))
    setUploading(true)
    setError(null)
    try {
      const uploaded = await api.upload(file)
      setForm((f) => ({ ...f, image_url: uploaded }))
    } catch (err: unknown) {
      setForm((f) => ({ ...f, image_url: '' }))
      setError(failMessage('画像のアップロードに失敗しました', err))
    } finally {
      setUploading(false)
      URL.revokeObjectURL(localUrl)
      e.target.value = ''
    }
  }

  /**
   * 動画を選んだらアップロードする（画像と同じく blob URL で仮の値を入れ、アップロード後に差し替える）
   * 失敗したら動画を外して文言を出す
   * @param e - ファイル選択欄の変更イベント
   */
  const handleVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    /** 選ばれたファイル（選ぶのをやめたときは undefined） */
    const file = e.target.files?.[0]
    if (!file) return
    /** アップロードが終わるまでの仮の blob URL（この値のあいだは「アップロード中…」を出す） */
    const localUrl = URL.createObjectURL(file)
    setForm((f) => ({ ...f, video_url: localUrl }))
    setUploadingVideo(true)
    setError(null)
    try {
      const uploaded = await api.uploadVideo(file)
      setForm((f) => ({ ...f, video_url: uploaded }))
    } catch (err: unknown) {
      setForm((f) => ({ ...f, video_url: '' }))
      setError(failMessage('動画のアップロードに失敗しました', err))
    } finally {
      setUploadingVideo(false)
      URL.revokeObjectURL(localUrl)
      e.target.value = ''
    }
  }

  /**
   * 確認してから 1 件削除する。失敗したら一覧はそのままにして文言を出す
   * @param id - 削除するコラボレーションの id
   */
  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    setError(null)
    try {
      await api.collaborations.delete(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (err: unknown) {
      setError(failMessage('削除に失敗しました', err))
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>コラボレーション管理</h2>

      {/* 読み込み・追加・削除・アップロードの失敗 */}
      {error && <p role="alert" style={errorBoxStyle}>{error}</p>}

      {/* 追加フォーム（2 列のグリッド。タイトル・動画・説明文は横いっぱい） */}
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, padding: 20, background: '#ffffff', borderRadius: 4, border: '1px solid #dddde8' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <input required aria-label="タイトル" placeholder="タイトル *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <input aria-label="コラボ相手" placeholder="コラボ相手" value={form.partner_name} onChange={(e) => setForm({ ...form, partner_name: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <input type="date" aria-label="開催日" placeholder="開催日" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} style={inputStyle} />
        </div>
        {/* 動画（任意）。見出しの文字をファイル選択欄の読み上げの名前に結び付ける */}
        <div role="group" aria-labelledby={videoLabelId} style={{ gridColumn: '1 / -1' }}>
          <span id={videoLabelId} style={{ display: 'block', fontSize: 13, color: 'var(--c-muted)', marginBottom: 8 }}>動画（任意）</span>
          {/* アップロード済みならプレビューと削除、アップロード中なら案内、未選択ならファイルを選ぶボタン */}
          {form.video_url && form.video_url.length > 0 && !form.video_url.startsWith('blob:') ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <video
                src={form.video_url}
                controls
                aria-label="追加する動画のプレビュー"
                style={{ maxWidth: 280, maxHeight: 160, borderRadius: 4, background: '#000' }}
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, video_url: '' })}
                style={{ fontSize: 12, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                削除
              </button>
            </div>
          ) : form.video_url?.startsWith('blob:') ? (
            <p style={{ fontSize: 13, color: 'var(--c-muted)' }}>アップロード中…</p>
          ) : (
            /* ファイルを選ぶボタン（見た目はボタン。中の input は隠し、ラベル全体を押せるようにする） */
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', border: '1px solid #dddde8', borderRadius: 4, cursor: uploadingVideo ? 'default' : 'pointer', opacity: uploadingVideo ? 0.6 : 1, fontSize: 13, color: 'var(--c-body)', background: '#f5f5f8' }}>
              <span id={videoPickId}>{uploadingVideo ? 'アップロード中…' : '動画ファイルを選択 (.mp4 / .mov / .webm)'}</span>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                aria-labelledby={`${videoLabelId} ${videoPickId}`}
                onChange={handleVideoFile}
                disabled={uploadingVideo}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
        {/* 画像（任意）。四角い枠を押すとファイルを選べる */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ width: 88, height: 88, borderRadius: 4, border: '1px solid #dddde8', overflow: 'hidden', flexShrink: 0, cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f8', opacity: uploading ? 0.5 : 1 }}>
            {form.image_url && !form.image_url.startsWith('blob:') ? (
              <img src={form.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span aria-hidden="true" style={{ fontSize: 24, color: '#aaa' }}>{uploading ? '…' : '+'}</span>
            )}
            <input type="file" accept="image/*" aria-label="画像（任意）" onChange={handleImageFile} disabled={uploading} style={{ display: 'none' }} />
          </label>
          {/* アップロード済みの画像を外すボタン */}
          {form.image_url && !form.image_url.startsWith('blob:') && (
            <button type="button" onClick={() => setForm({ ...form, image_url: '' })} style={{ fontSize: 12, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>削除</button>
          )}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <textarea
            aria-label="説明文（任意）"
            placeholder="説明文（任意）"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>
            {saving ? '追加中...' : '追加'}
          </button>
        </div>
      </form>

      {/* 登録済みの一覧（画像があれば左に縮小表示） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: item.image_url ? '80px 1fr auto' : '1fr auto', gap: 16, alignItems: 'start', padding: '16px 20px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4 }}>
            {item.image_url && (
              <img src={item.image_url} alt={item.title} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 2 }} />
            )}
            <div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{item.title}</div>
              {item.partner_name && <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>{item.partner_name}</div>}
              {item.event_date && <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>{item.event_date}</div>}
              {item.description && <div style={{ fontSize: 13, color: 'var(--c-body)', marginTop: 6, lineHeight: 1.6 }}>{item.description}</div>}
              {item.video_url && (
                <video src={item.video_url} controls aria-label={`${item.title}の動画`} style={{ marginTop: 8, maxWidth: 240, maxHeight: 135, borderRadius: 4, background: '#000', display: 'block' }} />
              )}
            </div>
            <button onClick={() => del(item.id)} aria-label={`${item.title}を削除`} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#c0392b', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>削除</button>
          </div>
        ))}
        {/* 読み込みに失敗したときは「ありません」を出さない */}
        {items.length === 0 && !error && <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>コラボレーションがありません。</p>}
      </div>
    </div>
  )
}
