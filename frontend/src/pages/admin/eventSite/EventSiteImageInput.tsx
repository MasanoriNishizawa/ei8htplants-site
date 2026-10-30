import { useState } from 'react'
import { api } from '../../../lib/api'

/**
 * イベント公開ページ編集で使う単画像の選択・アップロード入力。
 * 公開ページ全体の状態、保存、未保存判定は親フォームが管理し、この部品は画像 URL とアップロード中状態だけを扱う。
 * 1. 選択された画像をアップロードして、成功した URL を親へ返す
 * 2. 失敗時は既存どおり alert で知らせ、最後に input を空へ戻す
 * 3. 既存のサムネイル、blob URL の表示条件、削除条件を保つ
 * @param props.value - 現在の画像 URL
 * @param props.onChange - 画像 URL を親へ通知する関数（削除時は空文字）
 * @returns 四角い画像サムネイルと削除ボタン
 */
export default function EventSiteImageInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  /** 画像アップロード中なら true。二重選択を防ぎ、サムネイルを薄く表示する */
  const [uploading, setUploading] = useState(false)

  /**
   * 選択された画像をアップロードし、完了した URL を親フォームに返す。
   * 1. 選択ファイルを取得し、未選択なら終了する
   * 2. アップロード中にして API を呼び、失敗時は既存の alert を表示する
   * 3. 成否にかかわらず状態を戻し、同じファイルを再選択できるよう input を空にする
   * @param event - ファイル選択 input の変更イベント
   * @returns 非同期処理の完了を表す Promise
   */
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    /** 選択された画像ファイル。選択を取り消した場合は undefined */
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      /** API が返したアップロード先 URL。親フォームの画像 URL として反映する */
      const url = await api.upload(file)
      onChange(url)
    } catch {
      alert('アップロードに失敗しました')
    } finally {
      setUploading(false)
      // 同一ファイルを続けて選んだ場合にも change イベントが発火するよう選択を空に戻す
      event.target.value = ''
    }
  }

  /** サムネイル選択ラベルの見た目。既存画面と同じ 88px 四方を維持する */
  const thumb: React.CSSProperties = {
    width: 88, height: 88, borderRadius: 4, border: '1px solid #dddde8',
    overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f5f5f8',
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <label style={{ ...thumb, opacity: uploading ? 0.5 : 1 }}>
        {value && !value.startsWith('blob:') ? (
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 24, color: '#aaa' }}>{uploading ? '…' : '+'}</span>
        )}
        <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
      </label>
      {/* 画像 URL があり blob URL ではない場合だけ、既存どおり削除操作を表示する */}
      {value && !value.startsWith('blob:') && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{ fontSize: 12, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          削除
        </button>
      )}
    </div>
  )
}
