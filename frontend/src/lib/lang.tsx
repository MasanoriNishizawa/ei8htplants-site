import { createContext, useContext, useState, type ReactNode } from 'react'

type Lang = 'ja' | 'en'
interface LangCtxType { lang: Lang; toggle: () => void }

const LangCtx = createContext<LangCtxType>({ lang: 'ja', toggle: () => {} })

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem('site-lang') as Lang) ?? 'ja' } catch { return 'ja' }
  })
  const toggle = () => {
    const next: Lang = lang === 'ja' ? 'en' : 'ja'
    setLang(next)
    try { localStorage.setItem('site-lang', next) } catch {}
  }
  return <LangCtx.Provider value={{ lang, toggle }}>{children}</LangCtx.Provider>
}

export function useLang() { return useContext(LangCtx) }

export function useT() {
  const { lang } = useLang()
  return function t<T>(ja: T, en: T): T { return lang === 'ja' ? ja : en }
}
