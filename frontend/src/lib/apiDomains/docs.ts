import type { DocTreeNode } from '../apiTypes'

/** JSON 応答を返す認証付きリクエスト関数の型 */
type AuthJsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/** プレーンテキスト応答を返す認証付きリクエスト関数の型 */
type AuthTextRequest = (path: string) => Promise<string>

/**
 * 管理画面で設計書を閲覧する API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. ファイルツリーを認証付き JSON リクエストで取得する
 * 2. 指定された設計書本文をパスを URL エンコードして認証付きテキストリクエストで取得する
 * 3. 既存の api.docs の操作名、URL、応答形式を保って返す
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @param authRequestText - 認証付きの共通プレーンテキストリクエスト
 * @returns api.docs として公開する設計書閲覧操作
 */
export function createDocsApi(authRequest: AuthJsonRequest, authRequestText: AuthTextRequest) {
  return {
    /**
     * doc/ 配下のファイルツリーを取得する。
     * 1. 認証付き JSON リクエストで既存のツリー URL を呼び出す
     * 2. 応答を DocTreeNode の配列として返す
     * @returns 設計書のファイルツリー
     */
    tree: () => authRequest<DocTreeNode[]>('/docs/tree'),
    /**
     * 指定した Markdown ファイルの本文をプレーンテキストで取得する。
     * 1. doc/ からの相対パスを encodeURIComponent で URL エンコードする
     * 2. 認証付きテキストリクエストで既存の本文 URL を呼び出す
     * @param path - doc/ からの相対パス
     * @returns Markdown ファイルの本文
     */
    content: (path: string) => authRequestText(`/docs/content?path=${encodeURIComponent(path)}`),
  }
}
