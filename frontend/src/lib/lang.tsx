import { createContext, useContext, useState, type ReactNode } from 'react'

type Lang = 'ja' | 'en'
interface LangCtxType { lang: Lang; toggle: () => void }

const LangCtx = createContext<LangCtxType>({ lang: 'ja', toggle: () => {} })

/**
 * 言語設定を全体に提供する Context プロバイダー
 * @param children - 子コンポーネント
 */
export function LangProvider({ children }: { children: ReactNode }) {
  // localStorageの保存値 → なければブラウザ言語 → フォールバックで ja
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem('site-lang') as Lang | null
      if (saved) return saved
      return navigator.language.startsWith('ja') ? 'ja' : 'en'
    } catch { return 'ja' }
  })
  const toggle = () => {
    const next: Lang = lang === 'ja' ? 'en' : 'ja'
    setLang(next)
    // 切り替えた言語を永続化
    try { localStorage.setItem('site-lang', next) } catch {}
  }
  return <LangCtx.Provider value={{ lang, toggle }}>{children}</LangCtx.Provider>
}

/** 現在の言語と切り替え関数を取得するフック */
export function useLang() { return useContext(LangCtx) }

/**
 * ja/en の値を受け取り、現在の言語に対応する値を返す翻訳ヘルパーを返すフック
 * @returns `t(ja, en)` 関数
 */
export function useT() {
  const { lang } = useLang()
  return function t<T>(ja: T, en: T): T { return lang === 'ja' ? ja : en }
}
