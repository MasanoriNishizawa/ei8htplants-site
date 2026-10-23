/*
 * 表示言語（日本語・英語）の Context と、最初の言語を決める関数
 *
 * 部品（LangProvider.tsx）とフック（lang.ts）を別のファイルに分けたため、両方が使う Context をここに置く。
 * 画面からは lib/lang の useLang・useT・LangProvider を使い、このファイルを直接 import しない
 */
import { createContext } from 'react'

/** 表示言語 */
export type Lang = 'ja' | 'en'

/** 言語の Context に入れる値（今の言語と切り替え関数） */
export interface LangCtxType {
  /** 今の表示言語 */
  lang: Lang
  /** 日本語と英語を切り替える */
  toggle: () => void
}

/** localStorage に選んだ言語を保存するときのキー */
export const LANG_STORAGE_KEY = 'site-lang'

/** 言語の Context。Provider の外で使われたときは日本語・切り替えなしとして動く */
export const LangCtx = createContext<LangCtxType>({ lang: 'ja', toggle: () => {} })

/**
 * 最初に表示する言語を決める
 * 1. localStorage に保存した値が 'ja' か 'en' ならそれを使う（壊れた値は無視する）
 * 2. なければブラウザの言語（日本語なら ja、それ以外は en）
 * 3. 読み取りに失敗したら ja
 * @returns 表示言語
 */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    if (saved === 'ja' || saved === 'en') return saved
    return navigator.language.startsWith('ja') ? 'ja' : 'en'
  } catch { return 'ja' }
}
