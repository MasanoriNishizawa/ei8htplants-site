import type { Article, ArticleBody } from '../apiTypes'

/** JSON API 呼び出しを受け取り、記事領域の操作を組み立てる型 */
type JsonRequest = <T>(path: string, options?: RequestInit) => Promise<T>

/**
 * Journal 記事の API 操作を作成する。通信と認証は api.ts の共通関数へ委ねる。
 * 1. 公開一覧と記事詳細の取得には認証不要の request を使う
 * 2. 非公開を含む一覧と作成・更新・削除には認証付き authRequest を使う
 * 3. 既存の URL・query・HTTP メソッド・JSON 本文・応答型を保って操作を返す
 * @param request - 認証不要の共通 JSON リクエスト
 * @param authRequest - 認証付きの共通 JSON リクエスト
 * @returns api.articles として公開する記事操作
 */
export function createArticlesApi(request: JsonRequest, authRequest: JsonRequest) {
  return {
    /**
     * 記事一覧を取得する。
     * 1. all が true なら認証付きで ?all=true を付けた一覧 URL を呼び出す
     * 2. それ以外は認証不要で公開記事の一覧 URL を呼び出す
     * @param all - true なら非公開も含む全件を取得する
     * @returns 記事一覧
     */
    list: (all = false) =>
      all ? authRequest<Article[]>('/articles?all=true') : request<Article[]>('/articles'),
    /**
     * 記事を 1 件取得する。
     * 1. 受け取った ID を既存どおり URL に補間する
     * 2. 認証不要の共通リクエストで記事詳細を取得する
     * @param id - 取得する記事の ID
     * @returns 記事
     */
    get: (id: string) => request<Article>(`/articles/${id}`),
    /**
     * 管理画面から記事を作成する。
     * 1. 記事本文を既存どおり JSON 文字列にする
     * 2. 認証付きで POST し、作成結果を返す
     * @param body - 作成する記事の内容
     * @returns 作成された記事
     */
    create: (body: ArticleBody) =>
      authRequest<Article>('/articles', { method: 'POST', body: JSON.stringify(body) }),
    /**
     * 管理画面から記事を更新する。
     * 1. 受け取った ID を既存どおり URL に補間する
     * 2. 記事本文を JSON 文字列にし、認証付きで PUT する
     * @param id - 更新する記事の ID
     * @param body - 更新する記事の内容
     * @returns 更新された記事
     */
    update: (id: string, body: ArticleBody) =>
      authRequest<Article>(`/articles/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    /**
     * 管理画面から記事を削除する。
     * 1. 受け取った ID を既存どおり URL に補間する
     * 2. 認証付きで DELETE し、削除結果を返す
     * @param id - 削除する記事の ID
     * @returns 削除結果
     */
    delete: (id: string) =>
      authRequest<{ ok: boolean }>(`/articles/${id}`, { method: 'DELETE' }),
  }
}
