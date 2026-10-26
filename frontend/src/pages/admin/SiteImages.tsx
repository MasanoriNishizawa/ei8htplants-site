import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useUnsavedChanges } from './UnsavedChanges'

const ASSET_KEY = 'hue-color-study'
const fieldStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, color: '#555', marginBottom: 10,
}

/** HUE by ei8ht plants のサイトに表示する写真をアップロード・保存する管理ページ */
export default function SiteImages() {
  const [savedUrl, setSavedUrl] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const dirty = draftUrl !== savedUrl
  useUnsavedChanges(dirty)

  useEffect(() => {
    api.siteAssets.get(ASSET_KEY)
      .then(({ url }) => { setSavedUrl(url); setDraftUrl(url) })
      .catch(() => setError('写真設定を読み込めませんでした。再読み込みしてください。'))
      .finally(() => setLoading(false))
  }, [])

  const chooseImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    setNotice('')
    try {
      setDraftUrl(await api.upload(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : '写真のアップロードに失敗しました。')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api.siteAssets.save(ASSET_KEY, draftUrl)
      setSavedUrl(result.url)
      setDraftUrl(result.url)
      setNotice(result.url ? '写真を保存しました。' : '写真を外しました。')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 12px' }}>サイト画像管理</h1>
      <p style={{ fontSize: 16, lineHeight: 1.8, color: '#555', margin: '0 0 28px' }}>
        HUE by ei8ht plants の「植物のある暮らし」セクションに掲載する写真を設定します。色見本の代わりに、切り抜き済みの写真を表示します。
      </p>

      <section style={{ padding: 24, background: '#fff', border: '1px solid #dddde8', borderRadius: 6 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 6px' }}>HUE by ei8ht plants — セクション写真</h2>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7, margin: '0 0 18px' }}>
          横長に切り抜いた写真を選んでください。対応形式は JPEG、PNG、WebP、GIF、上限は10MBです。
        </p>

        {loading ? <p style={{ fontSize: 16 }}>読み込み中…</p> : (
          <>
            <label htmlFor="hue-color-study-image" style={fieldStyle}>掲載写真</label>
            <input
              id="hue-color-study-image"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={chooseImage}
              disabled={uploading || saving}
              style={{ fontSize: 14, marginBottom: 18 }}
            />
            {uploading && <p role="status" style={{ fontSize: 14 }}>アップロード中…</p>}
            {draftUrl ? (
              <div style={{ marginBottom: 18 }}>
                <img src={draftUrl} alt="HUE by ei8ht plants 掲載写真のプレビュー" style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'cover', borderRadius: 4 }} />
                <button type="button" onClick={() => { setDraftUrl(''); setNotice('') }} disabled={saving} style={{ marginTop: 10, padding: 0, border: 0, background: 'none', color: '#a33', fontSize: 14, cursor: 'pointer' }}>
                  写真を外す
                </button>
              </div>
            ) : !loading && <p style={{ padding: '30px 16px', margin: '0 0 18px', background: '#f5f3ef', color: '#777', textAlign: 'center', fontSize: 14 }}>写真はまだ設定されていません</p>}

            {error && <p role="alert" style={{ color: '#a33', fontSize: 14 }}>{error}</p>}
            {notice && <p role="status" style={{ color: '#28623d', fontSize: 14 }}>{notice}</p>}
            <button type="button" onClick={save} disabled={!dirty || uploading || saving || loading} style={{ padding: '11px 22px', border: 0, borderRadius: 4, background: dirty ? '#1c2417' : '#aaa', color: '#fff', fontSize: 15, cursor: dirty ? 'pointer' : 'default' }}>
              {saving ? '保存中…' : '写真を保存'}
            </button>
          </>
        )}
      </section>
    </div>
  )
}
