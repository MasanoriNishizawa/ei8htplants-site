import { useRef, useState } from 'react'
import type { ChangeEvent, RefObject } from 'react'

/** 画像アップロード中に表示する現在枚数と全体枚数 */
export interface EventAdminInfoImageUploadProgress {
  /** 現在アップロード中の画像番号（1始まり） */
  current: number
  /** 選択された画像の総数 */
  total: number
}

/** 出店要項画像の操作に必要な依存関数 */
interface UseEventAdminInfoGuidelinesImagesOptions {
  /** 画像 URL 配列の更新を、親フォームの最新値に対して適用する */
  updateImageUrls: (update: (urls: string[]) => string[]) => void
  /** 画像ファイルをアップロードして公開 URL を返す。通信は呼び出し元から注入する */
  uploadFile: (file: File) => Promise<string>
}

/** 出店要項画像の状態と操作関数 */
export interface EventAdminInfoGuidelinesImagesState {
  /** ファイル選択欄を「画像を追加」ボタンから開くための参照 */
  fileInputRef: RefObject<HTMLInputElement | null>
  /** 画像アップロードの進捗。待機中は null */
  uploadProgress: EventAdminInfoImageUploadProgress | null
  /** 画像アップロード失敗の案内。表示しない場合は null */
  uploadError: string | null
  /** 拡大表示中の画像位置。閉じている場合は null */
  viewerIndex: number | null
  /** 画像をアップロード中かどうか */
  uploading: boolean
  /** ファイル選択後に画像を順番にアップロードする */
  handleAddImages: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  /** 確認後に指定位置の画像 URL をフォームから外す */
  handleRemoveImage: (index: number) => void
  /** 拡大表示する画像位置を設定する */
  onChangeViewer: (index: number) => void
  /** 拡大表示を閉じる */
  onCloseViewer: () => void
}

/**
 * 出店要項画像の選択・逐次アップロード・削除確認・拡大表示を管理する。
 * 1. 進捗・失敗表示・file input・viewer の一時状態をhook内で持つ
 * 2. URLの追加・削除は注入された機能更新を通して親フォームへ反映する
 * 3. ファイルごとの失敗を記録し、選択順の成功URLを残したまま進捗を解除する
 * @param options - 親フォームの画像URL更新関数とアップロード関数
 * @returns 出店要項画像の表示状態とイベント操作
 */
export function useEventAdminInfoGuidelinesImages({
  updateImageUrls,
  uploadFile,
}: UseEventAdminInfoGuidelinesImagesOptions): EventAdminInfoGuidelinesImagesState {
  /** 「画像を追加」ボタンから操作する隠し file input */
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** いま何枚目をアップロードしているか。null なら待機中 */
  const [uploadProgress, setUploadProgress] = useState<EventAdminInfoImageUploadProgress | null>(null)
  /** アップロードに失敗したファイル名の案内 */
  const [uploadError, setUploadError] = useState<string | null>(null)
  /** 画像 viewer で拡大表示している位置 */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  /**
   * 選択された画像を1枚ずつアップロードし、成功URLを選択順に末尾へ加える。
   * 一部失敗時は成功分を残し、失敗したファイル名をまとめて表示する。
   * @param event - ファイル選択欄の change イベント
   * @returns 全ファイルの処理を終えたとき解決するPromise
   */
  const handleAddImages = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    /** await 後にも値を消せるように、イベントから input を先に控える */
    const input = event.currentTarget
    // 1. input の値を消すと FileList も空になるため、選択ファイルを先に配列へ写す
    /** 選択されたファイルを元の順序で保持する配列 */
    const files = Array.from(input.files ?? [])
    if (files.length === 0) return

    setUploadError(null)
    /** 個別アップロードに失敗したファイル名 */
    const failedNames: string[] = []
    try {
      // 2. 同時実行せず選択順にアップロードし、完了した成功URLを親フォームへ追加する
      for (let index = 0; index < files.length; index += 1) {
        /** 現在アップロードする画像ファイル */
        const file = files[index]
        setUploadProgress({ current: index + 1, total: files.length })
        try {
          /** アップロード後にフォームへ追加する公開URL */
          const url = await uploadFile(file)
          updateImageUrls((urls) => [...urls, url])
        } catch {
          failedNames.push(file.name)
        }
      }

      // 3. 失敗した画像があれば、成功した画像を残したままファイル名を知らせる
      if (failedNames.length > 0) {
        setUploadError(`次の画像をアップロードできませんでした: ${failedNames.join('、')}（JPEG・PNG・WebP・GIF、10MB まで）`)
      }
    } finally {
      // 4. 最後に進捗表示を解除し、同じファイルを続けて選べるよう input を空にする
      setUploadProgress(null)
      input.value = ''
    }
  }

  /**
   * 確認後に画像 URL をフォームから外す。Storage 上のファイルは削除しない。
   * @param index - 外す画像の位置（0始まり）
   * @returns なし。確認を拒否した場合はURLを変更しない
   */
  const handleRemoveImage = (index: number): void => {
    if (!window.confirm('この画像を出店要項から削除しますか？（保存ボタンを押すと確定します）')) return
    updateImageUrls((urls) => urls.filter((_, imageIndex) => imageIndex !== index))
  }

  return {
    fileInputRef,
    uploadProgress,
    uploadError,
    viewerIndex,
    uploading: uploadProgress !== null,
    handleAddImages,
    handleRemoveImage,
    onChangeViewer: setViewerIndex,
    onCloseViewer: () => setViewerIndex(null),
  }
}
