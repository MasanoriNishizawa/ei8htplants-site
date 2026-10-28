/**
 * lang.tsx の useLang・useT フックのユニットテスト
 *
 * LangProvider でラップしたフックの動作を確認する。
 * - 保存済み言語の読み込み
 * - toggle による言語切り替え
 * - useT が正しい言語の値を返すこと
 */
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { LangProvider, useLang, useT } from '../lang'

/**
 * LangProvider でフックをラップするためのラッパーコンポーネント（createElement で JSX 非使用）
 * @param children - 子要素
 * @returns LangProvider で包んだ要素
 */
function wrapper({ children }: { children: ReactNode }) {
  return createElement(LangProvider, null, children)
}

describe('useLang フック', () => {
  // 各テスト前に localStorage をクリアして状態をリセットする
  beforeEach(() => {
    localStorage.clear()
  })

  it('localStorage に "ja" が保存されているときデフォルト言語として "ja" が返る', () => {
    // 1. localStorage に ja を設定してから LangProvider を初期化する
    localStorage.setItem('site-lang', 'ja')
    // 2. フックをレンダリングして返り値を確認する
    const { result } = renderHook(() => useLang(), { wrapper })
    expect(result.current.lang).toBe('ja')
  })

  it('localStorage に "en" が保存されているとき "en" が返る', () => {
    // 1. localStorage に en を設定する
    localStorage.setItem('site-lang', 'en')
    // 2. フックをレンダリングして lang が en であることを確認する
    const { result } = renderHook(() => useLang(), { wrapper })
    expect(result.current.lang).toBe('en')
  })

  it('toggle を呼ぶと ja から en に切り替わる', () => {
    // 1. 初期言語を ja に設定する
    localStorage.setItem('site-lang', 'ja')
    const { result } = renderHook(() => useLang(), { wrapper })
    expect(result.current.lang).toBe('ja')
    // 2. toggle を呼んで en に切り替わることを確認する
    act(() => { result.current.toggle() })
    expect(result.current.lang).toBe('en')
  })

  it('toggle を呼ぶと en から ja に切り替わる', () => {
    // 1. 初期言語を en に設定する
    localStorage.setItem('site-lang', 'en')
    const { result } = renderHook(() => useLang(), { wrapper })
    expect(result.current.lang).toBe('en')
    // 2. toggle を呼んで ja に切り替わることを確認する
    act(() => { result.current.toggle() })
    expect(result.current.lang).toBe('ja')
  })

  it('toggle で切り替えた言語が localStorage に保存される', () => {
    // 1. ja で始める
    localStorage.setItem('site-lang', 'ja')
    const { result } = renderHook(() => useLang(), { wrapper })
    // 2. toggle して en に切り替える
    act(() => { result.current.toggle() })
    // 3. localStorage に en が保存されていることを確認する
    expect(localStorage.getItem('site-lang')).toBe('en')
  })
})

describe('useT フック', () => {
  // 各テスト前に localStorage をクリアする
  beforeEach(() => {
    localStorage.clear()
  })

  it('言語が "ja" のとき日本語テキストを返す', () => {
    // 1. 日本語モードで初期化する
    localStorage.setItem('site-lang', 'ja')
    const { result } = renderHook(() => useT(), { wrapper })
    // 2. t(ja, en) が ja の値を返すことを確認する
    expect(result.current('日本語テキスト', 'English text')).toBe('日本語テキスト')
  })

  it('言語が "en" のとき英語テキストを返す', () => {
    // 1. 英語モードで初期化する
    localStorage.setItem('site-lang', 'en')
    const { result } = renderHook(() => useT(), { wrapper })
    // 2. t(ja, en) が en の値を返すことを確認する
    expect(result.current('日本語テキスト', 'English text')).toBe('English text')
  })

  it('言語を切り替えると useT の返す値も変わる', () => {
    // 1. ja で開始して toggle を呼んだあと en の値になることを確認する
    localStorage.setItem('site-lang', 'ja')
    // useLang と useT を同一コンテキストで取得するため両方をまとめてレンダリングする
    const { result } = renderHook(
      () => ({ lang: useLang(), t: useT() }),
      { wrapper }
    )
    // 2. 切り替え前は日本語テキストが返る
    expect(result.current.t('日本語', 'English')).toBe('日本語')
    // 3. toggle して en にする
    act(() => { result.current.lang.toggle() })
    // 4. 切り替え後は英語テキストが返る
    expect(result.current.t('日本語', 'English')).toBe('English')
  })
})
