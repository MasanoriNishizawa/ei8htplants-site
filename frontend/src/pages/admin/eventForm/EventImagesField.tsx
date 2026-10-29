/**
 * イベントフォームの画像プレビュー一覧と追加枠を表示する。
 * 画像 URL の state、アップロード、画像の削除は親フォームの callback に委ねる。
 * @param props - 表示する画像、アップロード状態、画像操作 callback、項目ラベルの見た目
 * @returns イベント画像欄の JSX
 */
type EventImagesFieldProps = {
  /** 表示する画像 URL。アップロード中の画像は blob URL */
  imageUrls: string[]
  /** 画像アップロード中の先頭 index。null はアップロード中でない状態 */
  uploadingIdx: number | null
  /** ファイル選択時に親フォームのアップロード処理を呼び出す */
  onAddFiles: (files: FileList | null) => void
  /** 指定位置の画像を親フォームの state から取り除く */
  onRemoveImage: (index: number) => void
  /** 画像欄の見出しに適用する共通 label style */
  labelStyle: React.CSSProperties
}

/**
 * 画像プレビューと追加用 file input を、イベントフォームの既存表示順で描画する。
 * 1. 各画像をプレビューし、blob URL はアップロード中表示にする
 * 2. アップロード完了済み画像に削除操作を表示する
 * 3. 末尾に画像追加枠を置き、選択ファイルを親へ渡す
 * @param props - 画像一覧と親フォームが所有する操作 callback
 * @returns 画像見出しとプレビュー一覧を含む JSX
 */
export default function EventImagesField({
  imageUrls,
  uploadingIdx,
  onAddFiles,
  onRemoveImage,
  labelStyle,
}: EventImagesFieldProps) {
  return (
    <div>
      {/* 画像は一覧と「追加」のボタンの集まりなので、label ではなく見出しの文字にする */}
      <p style={{ ...labelStyle, margin: '0 0 6px' }}>画像（複数可）</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        {imageUrls.map((url, i) => {
          /** アップロードが終わる前の仮の画像か */
          const isBlob = url.startsWith('blob:')
          /** この画像をアップロード中か（中は薄く表示し、外すボタンを出さない） */
          const isUploading = isBlob && uploadingIdx !== null
          return (
            <div key={i} style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
              <img
                src={url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, border: '1px solid #dddde8', opacity: isUploading ? 0.5 : 1, display: 'block' }}
              />
              {isUploading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--c-muted)' }}>...</div>
              )}
              {!isUploading && (
                <button
                  type="button"
                  onClick={() => onRemoveImage(i)}
                  aria-label={`${i + 1}枚目の画像を外す`}
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c0392b', border: 'none', color: '#fff', fontSize: 12, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
        {/* 画像を追加する枠（押すとファイルを選べる。アップロード中は押せない） */}
        <label style={{
          width: 88, height: 88, border: '1.5px dashed #b0b0c4', borderRadius: 4,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 4, cursor: uploadingIdx !== null ? 'default' : 'pointer', color: 'var(--c-muted)', flexShrink: 0,
          opacity: uploadingIdx !== null ? 0.5 : 1,
        }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 11 }}>追加</span>
          <input
            type="file"
            accept="image/*"
            aria-label="画像を追加"
            multiple
            onChange={(e) => onAddFiles(e.target.files)}
            disabled={uploadingIdx !== null}
            style={{ display: 'none' }}
          />
        </label>
      </div>
    </div>
  )
}
