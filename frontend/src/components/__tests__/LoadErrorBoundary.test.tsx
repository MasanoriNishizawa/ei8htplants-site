/**
 * LoadErrorBoundary（画面の読み込み失敗で真っ白にならないようにする境界）のテスト
 *
 * 確かめること:
 * 1. 子が正常なら子をそのまま表示する
 * 2. 子が描画中に例外を投げると「ページを読み込めませんでした。再読み込みしてください。」と再読み込みボタンが出る
 * 3. React.lazy の読み込み失敗（分けたファイルが見つからない）でも同じ案内になる
 * 4. 英語のときは英語の案内とボタンになる
 * 5. ボタンを押すと location.reload が呼ばれる
 * 6. エラーはコンソールに出す
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { lazy, Suspense } from 'react'
import LoadErrorBoundary from '../LoadErrorBoundary'
import { LangProvider } from '../../lib/lang'

/** 日本語の案内 */
const MSG_JA = 'ページを読み込めませんでした。再読み込みしてください。'
/** 英語の案内 */
const MSG_EN = 'Failed to load the page. Please reload.'

/** 描画すると例外を投げる部品 */
function Boom(): React.ReactNode {
  throw new Error('描画エラー')
}

/** 元の window.location（テスト後に戻す） */
const originalLocation = window.location
/** 差し替えた reload */
let reloadMock: ReturnType<typeof vi.fn>

/**
 * 言語を決めて LangProvider と境界で包んで描画する
 * @param lang - 'ja' または 'en'
 * @param child - 境界の中に置く部品
 */
function renderWithLang(lang: 'ja' | 'en', child: React.ReactNode) {
  localStorage.setItem('site-lang', lang)
  return render(
    <LangProvider>
      <LoadErrorBoundary>{child}</LoadErrorBoundary>
    </LangProvider>,
  )
}

describe('LoadErrorBoundary', () => {
  beforeEach(() => {
    // 1. location.reload を差し替える（jsdom の reload は実装されていないため）
    reloadMock = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload: reloadMock } })
    // 2. React と境界が出すエラーのログを黙らせる（呼ばれたかは個別に確かめる）
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('子が正常なら子をそのまま表示し、案内は出さない', () => {
    renderWithLang('ja', <p>中身</p>)
    expect(screen.getByText('中身')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('子が例外を投げると日本語の案内と再読み込みボタンが出る', () => {
    renderWithLang('ja', <Boom />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(MSG_JA)
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument()
  })

  it('React.lazy の読み込みに失敗しても同じ案内になる', async () => {
    const Broken = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')))
    renderWithLang('ja', (
      <Suspense fallback={<p>読み込み中</p>}>
        <Broken />
      </Suspense>
    ))
    expect(await screen.findByText(MSG_JA)).toBeInTheDocument()
  })

  it('英語のときは英語の案内と Reload ボタンになる', () => {
    renderWithLang('en', <Boom />)
    expect(screen.getByRole('alert')).toHaveTextContent(MSG_EN)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.queryByText(MSG_JA)).not.toBeInTheDocument()
  })

  it('再読み込みボタンを押すと location.reload が呼ばれる', () => {
    renderWithLang('ja', <Boom />)
    expect(reloadMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('エラーの内容をコンソールに出す', () => {
    renderWithLang('ja', <Boom />)
    const calls = vi.mocked(console.error).mock.calls
    expect(calls.some((c) => c[0] === '画面の読み込みに失敗しました' && c[1] instanceof Error)).toBe(true)
  })

  it('LangProvider が無くても日本語の案内で表示できる', () => {
    render(<LoadErrorBoundary><Boom /></LoadErrorBoundary>)
    expect(screen.getByText(MSG_JA)).toBeInTheDocument()
  })
})
