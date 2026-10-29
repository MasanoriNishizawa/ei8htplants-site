import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useUnsavedChanges } from './UnsavedChanges'

// 公開サイトで使う写真カードの枚数
const PHOTO_COUNT = 6
/**
 * 写真カード1件分の初期状態を作る。
 * @returns URL・処理状態・通知を初期化した写真カード状態。
 */
const emptyPhoto = () => ({ savedUrl: '', draftUrl: '', uploading: false, saving: false, error: '', notice: '' })
/** 写真1枠の状態（保存済み URL、編集中 URL、処理状況、通知） */
type PhotoState = ReturnType<typeof emptyPhoto>

// 写真カードのアップロード状態や案内を表示する共通ラベルの見た目
const fieldStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, color: '#555', marginBottom: 10,
}

/**
 *  HUE by ei8ht plants のサイトに掲載する6枚の写真をアップロード・保存する管理ページ
 * @returns 6 枚の HUE 写真を登録する管理画面の React 要素
 */
export default function SiteImages() {
  // 6 枚の写真について、保存済み URL・編集中 URL・処理状態を保持する
  const [photos, setPhotos] = useState<PhotoState[]>(() => Array.from({ length: PHOTO_COUNT }, emptyPhoto))
  // 写真設定をサーバーから読み込んでいる間は true
  const [loading, setLoading] = useState(true)
  // 保存値と編集中の値に差があるかを判定し、ページ離脱時の確認に使う。
  const dirty = photos.some(({ savedUrl, draftUrl }) => savedUrl !== draftUrl)
  useUnsavedChanges(dirty)

  useEffect(() => {
    // 1. 6 枚分の画像設定を並行して取得する
    Promise.all(Array.from({ length: PHOTO_COUNT }, (_, index) =>
      api.siteAssets.get(`hue-color-${String(index + 1).padStart(2, '0')}`),
    )).then((assets) => {
      // 2. 取得した URL を保存済み・編集中の両方へ反映する
      setPhotos(assets.map(({ url }) => ({ ...emptyPhoto(), savedUrl: url, draftUrl: url })))
    }).catch(() => {
      // 3. 取得に失敗した場合は全カードにエラーを表示する
      setPhotos((current) => current.map((photo) => ({ ...photo, error: '写真設定を読み込めませんでした。再読み込みしてください。' })))
    }).finally(() => {
      // 4. 成功・失敗のどちらでも読み込み中表示を終了する
      setLoading(false)
    })
  }, [])

  /**
   * 指定した写真カードの状態だけを部分更新する。
   * @param index - 0 始まりの写真カード番号
   * @param patch - 対象カードへ反映する状態差分
   * @returns なし。
   */
  const updatePhoto = (index: number, patch: Partial<PhotoState>) => {
    setPhotos((current) => current.map((photo, i) => i === index ? { ...photo, ...patch } : photo))
  }

  /**
   * 選択された画像をアップロードし、写真カードの編集中 URL に反映する。
   * @param index - 0 始まりのアップロード対象写真カード番号
   * @param event - 画像ファイル選択 input の変更イベント
   * @returns 戻り値なし。
   */
  const chooseImage = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    // ファイル選択欄の先頭ファイルを取得し、未選択なら処理を終える。
    const file = event.target.files?.[0]
    if (!file) return
    updatePhoto(index, { uploading: true, error: '', notice: '' })
    try {
      // 画像をアップロードし、サーバーが返した URL を編集値へ反映する。
      const url = await api.upload(file)
      updatePhoto(index, { draftUrl: url })
    } catch (e) {
      updatePhoto(index, { error: e instanceof Error ? e.message : '写真のアップロードに失敗しました。' })
    } finally {
      updatePhoto(index, { uploading: false })
      event.target.value = ''
    }
  }

  /**
   * 写真カードの編集中 URL をサイト画像設定として保存する。
   * @param index - 0 始まりの保存対象写真カード番号
   * @returns 戻り値なし。
   */
  const save = async (index: number) => {
    // 対象の写真枠を取り出し、存在する場合だけ保存を続ける。
    const photo = photos[index]
    if (!photo) return
    updatePhoto(index, { saving: true, error: '', notice: '' })
    try {
      // 1〜6 の枠番号から設定キーを作り、編集中 URL を保存する。
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
          {/* 写真ごとのプレビュー、アップロード、保存操作 */}
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
