import { useCallback, useEffect, useState, type DependencyList } from 'react'

/** useApi が返す読み込みの状態 */
export interface ApiState<T> {
  /** 取得できたデータ。まだ取得していないとき・失敗したときは null */
  data: T | null
  /** 取得中なら true */
  loading: boolean
  /** 取得に失敗したときのエラー。成功・取得中は null */
  error: Error | null
  /** もう一度取得する（エラー表示の「再読み込み」ボタン用） */
  reload: () => void
}

/** useApi の追加の設定 */
export interface UseApiOptions {
  /**
   * false のときは取得しない（data: null・loading: false・error: null のまま）。
   * URL の id が無いときなど、取得する前提がそろっていない場合に使う。省略時は true
   */
  enabled?: boolean
}

/** useApi の中で持つ状態（reload を除いた部分） */
interface InnerState<T> {
  /** 取得できたデータ（ApiState.data と同じ） */
  data: T | null
  /** 取得中なら true */
  loading: boolean
  /** 取得に失敗したときのエラー */
  error: Error | null
}

/**
 * 公開ページの API 取得を共通化するフック。
 * 通信に失敗したときに「まだありません」と誤表示しないよう、data・loading・error を分けて返す。
 *
 * - deps が変わるたびに取り直す。切り替え前の古い応答が後から届いても捨てる（画面には反映しない）
 * - 取り直しのあいだは直前のデータを残したまま loading を true にする（一覧が一瞬空になってちらつくのを防ぐ）
 * - 失敗したときは data を null にして error を入れる
 *
 * ESLint の react-hooks/exhaustive-deps は eslint.config.js の additionalHooks で useApi も確認するので、
 * fetcher の中で使う値は deps に入れる
 * @param fetcher - データを取得する関数（api.xxx.list() など）
 * @param deps - これが変わったら取り直す値の配列（useEffect の依存配列と同じ）
 * @param options - 追加の設定（enabled）
 * @returns data・loading・error・reload
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  options: UseApiOptions = {},
): ApiState<T> {
  // 取得してよいか（省略時は取得する）
  const enabled = options.enabled ?? true
  // 取得結果と状態。最初から取得する場合は loading: true で始め、「まだありません」が一瞬出るのを防ぐ
  const [state, setState] = useState<InnerState<T>>({ data: null, loading: enabled, error: null })
  // reload を押した回数。これを依存配列に入れて取り直しのきっかけにする
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    // 1. 取得しない設定なら、空の状態にして終わる
    if (!enabled) {
      setState({ data: null, loading: false, error: null })
      return
    }
    // 2. 取得を始める（直前のデータは残す）
    // この取得が古くなった（deps が変わった・画面を離れた）かどうか
    let cancelled = false
    setState((prev) => ({ data: prev.data, loading: true, error: null }))
    // 3. 応答を反映する。deps が変わった・画面を離れたあと（cancelled）に届いた古い応答は捨てる
    fetcher().then(
      (data) => { if (!cancelled) setState({ data, loading: false, error: null }) },
      (err: unknown) => {
        if (cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        setState({ data: null, loading: false, error })
      },
    )
    return () => { cancelled = true }
    // fetcher は呼び出し側で毎回作り直される関数なので依存配列に入れない（deps で取り直しを決める）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, reloadKey])

  // 取り直しのきっかけを 1 つ進める。描画のたびに作り直さないよう固定する
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { ...state, reload }
}
