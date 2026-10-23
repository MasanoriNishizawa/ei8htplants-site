// API 呼び出し（lib/api.ts の request）が投げたエラーから HTTP のステータスコードを読み取る小さな関数。
// request は失敗時に「404 Not Found」「429 too many requests」のように、ステータスコードで始まる文の Error を投げる

/**
 * エラーから HTTP のステータスコードを取り出す
 * @param err - catch で受け取った値
 * @returns ステータスコード（通信そのものの失敗など、読み取れないときは null）
 */
export function httpStatusOf(err: unknown): number | null {
  if (!(err instanceof Error)) return null
  const m = /^(\d{3})\b/.exec(err.message)
  return m ? Number(m[1]) : null
}
