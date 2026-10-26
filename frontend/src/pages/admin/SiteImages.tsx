import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useUnsavedChanges } from './UnsavedChanges'

const PHOTO_COUNT = 6
const emptyPhoto = () => ({ savedUrl: '', draftUrl: '', uploading: false, saving: false, error: '', notice: '' })
type PhotoState = ReturnType<typeof emptyPhoto>

const fieldStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, color: '#555', marginBottom: 10,
}

/** HUE by ei8ht plants のサイトに掲載する6枚の写真をアップロード・保存する管理ページ */
export default function SiteImages() {
  const [photos, setPhotos] = useState<PhotoState[]>(() => Array.from({ length: PHOTO_COUNT }, emptyPhoto))
  const [loading, setLoading] = useState(true)
  const dirty = photos.some(({ savedUrl, draftUrl }) => savedUrl !== draftUrl)
  useUnsavedChanges(dirty)

  useEffect(() => {
    Promise.all(Array.from({ length: PHOTO_COUNT }, (_, index) =>
      api.siteAssets.get(`hue-color-${String(index + 1).padStart(2, '0')}`),
    )).then((assets) => {
      setPhotos(assets.map(({ url }) => ({ ...emptyPhoto(), savedUrl: url, draftUrl: url })))
    }).catch(() => {
      setPhotos((current) => current.map((photo) => ({ ...photo, error: '写真設定を読み込めませんでした。再読み込みしてください。' })))
    }).finally(() => setLoading(false))
  }, [])

  const updatePhoto = (index: number, patch: Partial<PhotoState>) => {
    setPhotos((current) => current.map((photo, i) => i === index ? { ...photo, ...patch } : photo))
  }

  const chooseImage = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    updatePhoto(index, { uploading: true, error: '', notice: '' })
    try {
      const url = await api.upload(file)
      updatePhoto(index, { draftUrl: url })
    } catch (e) {
      updatePhoto(index, { error: e instanceof Error ? e.message : '写真のアップロードに失敗しました。' })
    } finally {
      updatePhoto(index, { uploading: false })
      event.target.value = ''
    }
  }

  const save = async (index: number) => {
    const photo = photos[index]
    if (!photo) return
    updatePhoto(index, { saving: true, error: '', notice: '' })
    try {
      const result = await api.siteAssets.save(`hue-color-${String(index + 1).padStart(2, '0')}`, photo.draftUrl)
      updatePhoto(index, {
        savedUrl: result.url,
        draftUrl: result.url,
        notice: result.url ? '写真を保存しました。' : '写真を外しました。',
      })
    } catch (e) {
      updatePhoto(index, { error: e instanceof Error ? e.message : '保存に失敗しました。' })
    } finally {
      updatePhoto(index, { saving: false })
    }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 12px' }}>サイト画像管理</h1>
      <p style={{ fontSize: 16, lineHeight: 1.8, color: '#555', margin: '0 0 28px' }}>
        HUE by ei8ht plants の「植物のある暮らし」に掲載する6枚の写真を設定します。公開ページでは、色見本と同じ丸い形・大きさで並びます。
      </p>

      {loading ? <p style={{ fontSize: 16 }}>読み込み中…</p> : (
        <div className="admin-site-image-grid">
          {photos.map((photo, index) => (
            <section key={index} className="admin-site-image-card">
              <h2 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 14px' }}>写真 {String(index + 1).padStart(2, '0')}</h2>
              {photo.draftUrl ? (
                <div className="admin-site-image-preview" style={{ '--photo-index': index } as React.CSSProperties}>
                  <img src={photo.draftUrl} alt={`写真 ${index + 1} の切り抜きプレビュー`} />
                </div>
              ) : (
                <div className="admin-site-image-preview admin-site-image-preview--empty" style={{ '--photo-index': index } as React.CSSProperties}>
                  写真未設定
                </div>
              )}
              <label htmlFor={`hue-color-${String(index + 1).padStart(2, '0')}-image`} style={fieldStyle}>掲載写真</label>
              <input
                id={`hue-color-${String(index + 1).padStart(2, '0')}-image`}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => { void chooseImage(index, event) }}
                disabled={photo.uploading || photo.saving}
                style={{ width: '100%', fontSize: 14, marginBottom: 12 }}
              />
              {photo.uploading && <p role="status" style={{ fontSize: 14 }}>アップロード中…</p>}
              {photo.draftUrl && (
                <button type="button" onClick={() => updatePhoto(index, { draftUrl: '', notice: '' })} disabled={photo.saving} style={{ margin: '0 0 12px', padding: 0, border: 0, background: 'none', color: '#a33', fontSize: 14, cursor: 'pointer' }}>
                  写真を外す
                </button>
              )}
              {photo.error && <p role="alert" style={{ color: '#a33', fontSize: 14 }}>{photo.error}</p>}
              {photo.notice && <p role="status" style={{ color: '#28623d', fontSize: 14 }}>{photo.notice}</p>}
              <button
                type="button"
                onClick={() => { void save(index) }}
                disabled={photo.savedUrl === photo.draftUrl || photo.uploading || photo.saving}
                style={{ padding: '10px 18px', border: 0, borderRadius: 4, background: photo.savedUrl !== photo.draftUrl ? '#1c2417' : '#aaa', color: '#fff', fontSize: 15, cursor: photo.savedUrl !== photo.draftUrl ? 'pointer' : 'default' }}
              >
                {photo.saving ? '保存中…' : '写真を保存'}
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
