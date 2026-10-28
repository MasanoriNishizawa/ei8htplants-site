import { useEffect, useState, type ReactNode } from 'react'
import { LANG_STORAGE_KEY, LangCtx, initialLang, type Lang } from './langContext'

/**
 * 言語設定を全体に提供する Context プロバイダー。
 * 言語が変わったら <html lang> も合わせて変え、読み上げソフトや翻訳機能が正しい言語で扱えるようにする
 * （画面からは lib/lang から import する。lib/lang がこのファイルを再 export している）
 * @param children - 子コンポーネント
 * @returns Context で包んだ子コンポーネント
 */
export function LangProvider({ children }: { children: ReactNode }) {
  // 今の表示言語
  const [lang, setLang] = useState<Lang>(initialLang)

  // <html lang="..."> を今の言語にそろえる
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  /** 日本語と英語を切り替え、選んだ言語を保存する。
   * @returns なし。表示言語と localStorage を更新する
   */
  const toggle = () => {
    // 現在と反対の言語を次の表示言語にする
    const next: Lang = lang === 'ja' ? 'en' : 'ja'
    setLang(next)
    // 切り替えた言語を保存する（プライベートモードなどで保存できなくても切り替え自体は続ける）
    try { localStorage.setItem(LANG_STORAGE_KEY, next) } catch { /* 保存できなくても動作は続ける */ }
  }
  return <LangCtx.Provider value={{ lang, toggle }}>{children}</LangCtx.Provider>
}
