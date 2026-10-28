/**
 * 公開サイトのヘッダー（components/Header.tsx）のスマホのメニューの言語切り替えのテスト
 * - スマホのメニュー（nav「メニュー」）の中に言語切り替えボタンがあり、押すと表示言語が変わる（メニューは閉じない）
 * - メニューを閉じているあいだは、メニューの中のボタンは inert・visibility: hidden の中にあり読み上げに出ない
 *   （PC の画面幅で 2 つ読み上げられないことは E2E の header-lang.spec.ts で確かめる）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Header from '../Header'
import { LangProvider, useLang } from '../../lib/lang'

/**
 * 現在の表示言語をテスト用の段落に表示し、切り替わりを確認できるようにする。
 * @returns 言語コードを表示する段落
 */
function LangProbe() {
  const { lang } = useLang()
  return <p data-testid="lang">{lang}</p>
}

/**
 * ヘッダーを描画する
 * @returns render の結果
 */
function renderHeader() {
  return render(
    <LangProvider>
      <MemoryRouter>
        <Header />
        <LangProbe />
      </MemoryRouter>
    </LangProvider>,
  )
}

/**
 * 閉じているスマホのメニュー（nav）を、開閉ボタンの aria-controls から取る
 * @returns nav 要素
 */
function closedMobileNav(): HTMLElement {
  const id = screen.getByRole('button', { name: 'メニューを開く' }).getAttribute('aria-controls')!
  return document.getElementById(id)!
}

describe('Header のスマホのメニューの言語切り替え', () => {
  beforeEach(() => {
    localStorage.setItem('site-lang', 'ja')
    document.body.style.overflow = ''
  })

  it('スマホのメニューの中に言語切り替えボタン（日本語表示では「EN」）がある', () => {
    renderHeader()
    // 閉じているあいだは inert で役割の検索から外れるので、開閉ボタンの aria-controls から nav を取る
    const mobileNav = closedMobileNav()
    const btn = Array.from(mobileNav.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Switch to English')
    expect(btn).toHaveTextContent('EN')
    expect(mobileNav).toHaveAttribute('aria-label', 'メニュー')
  })

  it('メニューを閉じているあいだは、メニューは inert で非表示になり、言語ボタンは 1 つだけ読み上げ対象になる', () => {
    renderHeader()
    // 閉じているあいだは inert で役割の検索から外れるので、開閉ボタンの aria-controls から nav を取る
    const mobileNav = closedMobileNav()
    expect(mobileNav).toHaveAttribute('inert')
    expect(mobileNav).toHaveStyle({ visibility: 'hidden' })
    // 読み上げ対象（hidden を含めない）の言語ボタンは PC のナビの 1 つだけ
    expect(screen.getAllByRole('button', { name: 'Switch to English' })).toHaveLength(1)
  })

  it('メニューを開いてメニューの中の言語ボタンを押すと英語に切り替わり、メニューは開いたまま', () => {
    renderHeader()
    // 1. メニューを開く
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    const mobileNav = screen.getByRole('navigation', { name: 'メニュー' })
    expect(mobileNav).not.toHaveAttribute('inert')
    // 2. メニューの中の言語ボタンを押す
    fireEvent.click(within(mobileNav).getByRole('button', { name: 'Switch to English' }))
    // 3. 英語になり、ボタンは「JA」（日本語に戻す）になる。メニューは閉じない
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
    const nav = screen.getByRole('navigation', { name: 'Menu' })
    expect(within(nav).getByRole('button', { name: '日本語に切り替える' })).toHaveTextContent('JA')
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('英語表示からメニューの中のボタンを押すと日本語に戻る', () => {
    localStorage.setItem('site-lang', 'en')
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const nav = screen.getByRole('navigation', { name: 'Menu' })
    fireEvent.click(within(nav).getByRole('button', { name: '日本語に切り替える' }))
    expect(screen.getByTestId('lang')).toHaveTextContent('ja')
  })
})

// ---- スマホのメニューのダイアログとしての動き（フォーカス・inert・閉じ方） ----

/**
 * ヘッダーと、後ろのページ本体（main・footer・チャットボタン）を描画する
 * @param preInert - true なら footer を最初から inert にしておく（閉じたあとも inert のままか確かめる）
 * @returns render の結果
 */
function renderPage(preInert = false) {
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={['/']}>
        <Header />
        <main><button type="button">本文のボタン</button></main>
        <footer {...(preInert ? { inert: true } : {})}>フッター</footer>
        <a className="chat-fab" href="/chat">チャット</a>
      </MemoryRouter>
    </LangProvider>,
  )
}

/** ヘッダーの開くボタン（開いているあいだは inert・aria-hidden になるので hidden も含めて探す） */
const openButton = () => screen.getByRole('button', { name: 'メニューを開く', hidden: true })

describe('Header のスマホのメニュー（ダイアログ）', () => {
  beforeEach(() => {
    localStorage.setItem('site-lang', 'ja')
  })

  it('開くと role=dialog・aria-modal・名前「メニュー」のダイアログになり、中の × にフォーカスが移る', () => {
    renderPage()
    fireEvent.click(openButton())
    const dialog = screen.getByRole('dialog', { name: 'メニュー' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const close = screen.getByRole('button', { name: 'メニューを閉じる' })
    expect(within(dialog).getByRole('button', { name: 'メニューを閉じる' })).toBe(close)
    expect(close).toHaveFocus()
  })

  it('閉じているあいだはダイアログの役割を持たない', () => {
    renderPage()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('開いているあいだは main・footer・チャットボタンが inert になり、閉じると外れる', () => {
    renderPage()
    const main = document.querySelector('main')!
    const footer = document.querySelector('footer')!
    const fab = document.querySelector('.chat-fab')!
    fireEvent.click(openButton())
    expect(main).toHaveAttribute('inert')
    expect(footer).toHaveAttribute('inert')
    expect(fab).toHaveAttribute('inert')
    fireEvent.click(screen.getByRole('button', { name: 'メニューを閉じる' }))
    expect(main).not.toHaveAttribute('inert')
    expect(footer).not.toHaveAttribute('inert')
    expect(fab).not.toHaveAttribute('inert')
  })

  it('もともと inert の要素は、閉じたあとも inert のまま（触らない）', () => {
    renderPage(true)
    const footer = document.querySelector('footer')!
    fireEvent.click(openButton())
    fireEvent.click(screen.getByRole('button', { name: 'メニューを閉じる' }))
    expect(footer).toHaveAttribute('inert')
    expect(document.querySelector('main')).not.toHaveAttribute('inert')
  })

  it('× で閉じると開くボタンにフォーカスが戻る', () => {
    renderPage()
    fireEvent.click(openButton())
    fireEvent.click(screen.getByRole('button', { name: 'メニューを閉じる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(openButton()).toHaveFocus()
  })

  it('Esc で閉じると開くボタンにフォーカスが戻る', () => {
    renderPage()
    fireEvent.click(openButton())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(openButton()).toHaveFocus()
  })

  it('後ろの幕を押して閉じると開くボタンにフォーカスが戻る', () => {
    renderPage()
    fireEvent.click(openButton())
    // 幕は aria-hidden の固定の div（ヘッダーの次の要素）
    const backdrop = Array.from(document.querySelectorAll<HTMLElement>('div[aria-hidden="true"]')).find((el) => el.style.position === 'fixed')!
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(openButton()).toHaveFocus()
  })

  it('メニューの中のリンクを押すと閉じて、開くボタンにフォーカスが戻る', () => {
    renderPage()
    fireEvent.click(openButton())
    const dialog = screen.getByRole('dialog', { name: 'メニュー' })
    fireEvent.click(within(dialog).getAllByRole('link')[0])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(openButton()).toHaveFocus()
  })

  it('Tab はメニューの中で回る（最後から Tab で先頭の ×、先頭から Shift+Tab で最後へ）', () => {
    renderPage()
    fireEvent.click(openButton())
    const dialog = screen.getByRole('dialog', { name: 'メニュー' })
    const items = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
    const first = items[0]
    const last = items[items.length - 1]
    expect(first).toHaveAccessibleName('メニューを閉じる')
    // 1. 最後で Tab → 先頭
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(first).toHaveFocus()
    // 2. 先頭で Shift+Tab → 最後
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    // 3. フォーカスがメニューの外にあっても Tab でメニューの先頭に戻る
    ;(document.querySelector('main button') as HTMLElement).focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(first).toHaveFocus()
  })
})

describe('Header のスマホのメニューを PC の幅に広げたとき', () => {
  /** matchMedia の change を受け取る関数（テストから呼ぶ） */
  let changeListener: ((e: { matches: boolean }) => void) | null = null
  /** 元の matchMedia */
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    localStorage.setItem('site-lang', 'ja')
    changeListener = null
    // (min-width: 769px) の判定のモック。change の受け取り手を控える
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => { changeListener = cb },
      removeEventListener: () => { changeListener = null },
    })) as unknown as typeof window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('開いたまま 769px 以上（matches: true）に広げると閉じ、inert も外れる', () => {
    renderPage()
    fireEvent.click(openButton())
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 769px)')
    expect(changeListener).not.toBeNull()
    act(() => changeListener!({ matches: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('main')).not.toHaveAttribute('inert')
  })

  it('狭いまま（matches: false）の変化では閉じない', () => {
    renderPage()
    fireEvent.click(openButton())
    act(() => changeListener!({ matches: false }))
    expect(screen.getByRole('dialog', { name: 'メニュー' })).toBeInTheDocument()
  })

  it('閉じたら幅の変化を聞くのをやめる', () => {
    renderPage()
    fireEvent.click(openButton())
    fireEvent.click(screen.getByRole('button', { name: 'メニューを閉じる' }))
    expect(changeListener).toBeNull()
  })
})
