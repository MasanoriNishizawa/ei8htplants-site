import type { ChangeEvent, CSSProperties, RefObject } from 'react'
import { ImageViewer } from './AdminInfoParts'

/** 出店要項画像としてファイル選択を許可する MIME 形式（アップロード API の対応形式と合わせる） */
const GUIDELINE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

/** 画像アップロード中に表示する現在枚数と全体枚数 */
export interface ImageUploadProgress {
  /** 現在アップロード中の画像番号（1始まり） */
  current: number
  /** 選択された画像の総数 */
  total: number
}

/** 出店要項画像表示に必要なデータと、親が管理する操作を受け取る型 */
export interface EventGuidelinesImagesProps {
  /** フォームに保存されている出店要項画像の URL 一覧 */
  urls: string[]
  /** 複数画像のアップロード進捗。null なら待機中 */
  uploadProgress: ImageUploadProgress | null
  /** 失敗した画像の説明。null ならエラー表示なし */
  uploadError: string | null
  /** 親の要項入力欄と揃える画像ラベルのスタイル */
  labelStyle: CSSProperties
  /** ファイル選択欄を開くため親から渡される参照 */
  fileInputRef: RefObject<HTMLInputElement | null>
  /** 選択ファイルを親のアップロード処理へ渡す */
  onAddImages: (event: ChangeEvent<HTMLInputElement>) => void
  /** 指定位置の画像を親の確認処理付き削除へ渡す */
  onRemoveImage: (index: number) => void
  /** 拡大表示する画像位置。null なら閉じている */
  viewerIndex: number | null
  /** 拡大表示の位置変更を親の state に反映する */
  onChangeViewer: (index: number) => void
  /** 拡大表示を閉じる親の処理 */
  onCloseViewer: () => void
}

/**
 * 出店要項画像の一覧・追加操作・拡大表示を描画する表示専用コンポーネント。
 * フォーム更新、アップロード、確認付き削除、表示位置の state は親から受け取り、自身ではデータを変更しない。
 * @param props - 画像 URL、アップロード状態、親が管理する参照と操作関数
 * @returns 出店要項画像のセクションと、必要な場合の拡大表示
 */
export default function EventGuidelinesImages({
  urls,
  uploadProgress,
  uploadError,
  labelStyle,
  fileInputRef,
  onAddImages,
  onRemoveImage,
  viewerIndex,
  onChangeViewer,
  onCloseViewer,
}: EventGuidelinesImagesProps) {
  /** アップロード状態に応じて削除・追加操作を無効にする判定 */
  const uploading = uploadProgress !== null

  return (
    <>
      {/* 親の SectionBox に入れる画像エリア。文章欄と同じ並び順を保つ */}
      <div>
        {/* 画像枚数をラベルに表示し、0枚のときは枚数を省略する */}
        <label style={labelStyle}>
          要項の画像{urls.length > 0 && `（${urls.length} 枚）`}
        </label>

        {/* アップロード済み画像のサムネイル。最小 120px で折り返し、狭い幅でも横スクロールしない */}
        {urls.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(120px, 100%), 1fr))', gap: 10, marginBottom: 12 }}>
            {urls.map((url, index) => (
              /* 画像ごとに正方形サムネイルと削除ボタンを縦に配置する */
              <div key={`${url}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                {/* 正方形のサムネイル。タップで画面内に拡大表示する */}
                <button
                  type="button"
                  onClick={() => onChangeViewer(index)}
                  aria-label={`出店要項の画像 ${index + 1} を拡大表示`}
                  style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', padding: 0, border: '1px solid #dddde8', borderRadius: 4, background: '#f4f4f8', overflow: 'hidden', cursor: 'zoom-in' }}
                >
                  {/* サムネイル枠いっぱいに画像を切り抜いて表示する */}
                  <img
                    src={url}
                    alt={`出店要項の画像 ${index + 1}`}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </button>
                {/* この画像を外すボタン。アップロード中は誤操作防止のため無効にする */}
                <button
                  type="button"
                  onClick={() => onRemoveImage(index)}
                  disabled={uploading}
                  style={{ minHeight: 40, padding: '6px 8px', border: '1px solid #dddde8', borderRadius: 4, background: '#ffffff', color: '#c0392b', fontSize: 13, fontFamily: 'inherit', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 実際のファイル選択欄は隠し、下の「画像を追加」ボタンから開く */}
        <input
          ref={fileInputRef}
          type="file"
          accept={GUIDELINE_IMAGE_ACCEPT}
          multiple
          onChange={onAddImages}
          style={{ display: 'none' }}
        />
        {/* 親の input ref をクリックし、アップロード中は選択を止める */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ minHeight: 44, padding: '10px 20px', border: '1px solid #dddde8', borderRadius: 4, background: '#ffffff', color: 'var(--c-body)', fontSize: 14, fontFamily: 'inherit', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1, maxWidth: '100%' }}
        >
          {uploadProgress ? `アップロード中...（${uploadProgress.current}/${uploadProgress.total}）` : '画像を追加'}
        </button>
        {/* 受け付ける画像形式と容量、複数選択可能なことを案内する */}
        <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: '8px 0 0' }}>
          JPEG・PNG・WebP・GIF、1枚 10MB まで。複数枚まとめて選べます
        </p>

        {/* アップロードに失敗したファイルの案内を、長いファイル名も折り返して表示する */}
        {uploadError && (
          <p style={{ fontSize: 13, color: '#c0392b', background: '#fdf2f2', border: '1px solid #f5c6cb', borderRadius: 4, padding: '8px 12px', margin: '10px 0 0', overflowWrap: 'anywhere' }}>
            {uploadError}
          </p>
        )}
      </div>

      {/* 画像が存在し、親の state が表示位置を持つ場合だけ拡大表示する */}
      {viewerIndex !== null && urls.length > 0 && (
        <ImageViewer
          urls={urls}
          index={Math.min(viewerIndex, urls.length - 1)}
          onChange={onChangeViewer}
          onClose={onCloseViewer}
        />
      )}
    </>
  )
}
