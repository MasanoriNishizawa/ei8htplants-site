/*
 * 管理画面で、作ったデータ（CSV・取得した画像など）をファイルとしてブラウザに保存させる共通の関数
 * イベント画像のダウンロード（eventImageFiles.ts）と予約の CSV 出力（EventReservations.tsx）で使う
 */

/** オブジェクト URL を解放するまで待つ時間（ミリ秒）。クリック直後に解放すると保存が始まらないブラウザがあるため */
export const REVOKE_DELAY_MS = 1000

/**
 * blob をファイルとして保存させる
 * 1. blob を指すオブジェクト URL を作る
 * 2. 一時的な a 要素に download 属性を付けて body に足し、クリックしてから取り除く
 * 3. 少し待ってからオブジェクト URL を解放する
 * @param blob - 保存する中身
 * @param fileName - 保存するときのファイル名
 */
export function saveBlob(blob: Blob, fileName: string): void {
  // 1. オブジェクト URL
  /** blob を指す一時的な URL */
  const objectUrl = URL.createObjectURL(blob)
  // 2. 一時的なリンクをクリックする（body に足さないとクリックが効かないブラウザがある）
  /** 保存のためだけに作るリンク */
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 3. 保存が始まってから解放する
  setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_DELAY_MS)
}
