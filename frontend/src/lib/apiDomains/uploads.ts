/** 認証付きの共通 fetch を受け取り、成功した Response を返す型 */
type AuthFetchOk = (path: string, options?: RequestInit) => Promise<Response>

/** アップロード API が返す公開 URL の応答型 */
interface UploadResponse {
  /** Storage に保存されたファイルの公開 URL */
  url: string
}

/**
 * 画像・動画アップロードの API 操作を作成する。
 * 1. 共通処理で file フィールドを持つ FormData を作成する
 * 2. Content-Type を指定せず認証付きで multipart/form-data を送信する
 * 3. JSON 応答から公開 URL を取り出して各操作から返す
 * @param authFetchOk - 認証付きで成功 Response を返す共通 fetch
 * @returns api.upload と api.uploadVideo として公開するアップロード操作
 */
export function createUploadsApi(authFetchOk: AuthFetchOk) {
  /**
   * 指定したアップロード先へファイルを送り、保存先の公開 URL を受け取る。
   * @param path - アップロード先の API パス
   * @param file - 送信する画像または動画ファイル
   * @returns 保存したファイルの公開 URL
   */
  async function uploadFile(path: string, file: File): Promise<string> {
    // 1. サーバー側の受け取り名に合わせて file という名前で FormData を作る
    const form = new FormData()
    form.append('file', file)
    // 2. Content-Type はブラウザが boundary 付きで設定するため明示しない
    const response = await authFetchOk(path, { method: 'POST', body: form })
    // 3. JSON 応答から Storage に保存されたファイルの公開 URL を取り出す
    const result: UploadResponse = await response.json()
    return result.url
  }

  return {
    /**
     * 画像を Storage にアップロードし、公開 URL を返す（管理者のみ）。
     * @param file - 送信する画像ファイル
     * @returns 保存した画像の公開 URL
     */
    upload: (file: File): Promise<string> => uploadFile('/upload', file),
    /**
     * 動画を Storage にアップロードし、公開 URL を返す（管理者のみ）。
     * @param file - 送信する動画ファイル
     * @returns 保存した動画の公開 URL
     */
    uploadVideo: (file: File): Promise<string> => uploadFile('/upload/video', file),
  }
}
