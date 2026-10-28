/*
 * 表示言語（日本語・英語）のフックと Provider の入口
 *
 * 開発中の画面の自動更新（Fast Refresh）が効くよう、部品（LangProvider.tsx）とフック（このファイル）を分けている。
 * これまでどおり `import { LangProvider, useLang, useT } from '../lib/lang'` で使える
 */
import { useContext } from 'react'
import { LangCtx, type LangCtxType } from './langContext'

export { LangProvider } from './LangProvider'
export type { Lang } from './langContext'

/**
 * 現在の言語と切り替え関数を取得するフック
 * @returns lang（今の言語）と toggle（切り替え関数）
 */
export function useLang(): LangCtxType { return useContext(LangCtx) }

/**
 * ja/en の値を受け取り、現在の言語に対応する値を返す翻訳ヘルパーを返すフック
 * @returns `t(ja, en)` 関数
 */
export function useT() {
  /** 翻訳対象の言語。t 関数が日本語・英語の値を選ぶときに使う */
  const { lang } = useLang()
  /**
   * 現在の表示言語に合わせて日本語または英語の値を選ぶ。
   * @param ja - 日本語で表示する値
   * @param en - 英語で表示する値
   * @returns 現在の言語に対応する値
   */
  return function t<T>(ja: T, en: T): T { return lang === 'ja' ? ja : en }
}
