import { useState, useEffect, useId, useRef } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useLang } from '../lib/lang'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { TEXT_LOGO } from '../lib/brands'

/** ナビに並べるページ（end: true はそのパスちょうどのときだけ選択中にする） */
const NAV_ITEMS = [
  { to: '/official', label: 'Home', end: true },
  { to: '/official/events', label: 'Event' },
  { to: '/official/gallery', label: 'Gallery' },
  { to: '/official/concept', label: 'Concept' },
  { to: '/official/stockists', label: 'Stockists' },
  { to: '/official/collaborations', label: 'Collabs' },
  { to: '/official/media', label: 'Media' },
  { to: '/official/contact', label: 'Contact' },
  { to: '/official/brands', label: 'Brands' },
]

/**
 * サイト共通ヘッダー。固定表示でスクロール検知・モバイルメニュー・言語切り替え（PC のナビとモバイルメニューの両方）を提供する
 * @returns ヘッダー・モバイルメニューの幕・モバイルメニュー本体
 */
export default function Header() {
  // モバイルメニューを開いているか
  const [menuOpen, setMenuOpen] = useState(false)
  // ページを少しでもスクロールしたか（ヘッダー下の線を出す）
  const [scrolled, setScrolled] = useState(false)
  // 今の表示言語と切り替え関数
  const { lang, toggle: toggleLang } = useLang()
  // モバイルメニューの id（開閉ボタンの aria-controls 用）
  const mobileMenuId = useId()
  // Brand メニューの開閉ボタン・モバイルメニューの開閉ボタン（Esc で閉じたときにフォーカスを戻す先）
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  // Brand メニューを含む枠（枠の外へフォーカスが移ったら閉じる判定用）
  // モバイルメニュー本体（Tab のフォーカスをメニューの中で回すため）と、メニューの中の閉じるボタン（開いたときのフォーカス先）
  const mobileNavRef = useRef<HTMLElement>(null)
  /** メニューを開いたときフォーカスを移す閉じるボタン */
  const menuCloseBtnRef = useRef<HTMLButtonElement>(null)
  // モバイルメニューを閉じた後に開閉ボタンへフォーカスを戻すか（閉じるボタン・Esc・幕で閉じたとき true。リンクでページを移るときは戻さない）
  const returnFocusOnClose = useRef(false)

  // スクロール量が 4px を超えたらボーダーを表示してヘッダーを強調
  useEffect(() => {
    /** スクロール位置からヘッダーの強調状態を更新する。
     * @returns なし
     */
    const handler = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // モバイルメニュー表示中は body のスクロールを止める（写真の拡大表示などと共通の参照カウント式）
  useBodyScrollLock(menuOpen)

  /**
   * モバイルメニューを閉じ、閉じた後に開閉ボタンへフォーカスを戻す（閉じるボタン・幕・メニューのリンクから呼ぶ。Esc は同じ処理を直接書いている）
   * @returns なし
   */
  const closeMenuAndReturnFocus = () => {
    returnFocusOnClose.current = true
    setMenuOpen(false)
  }

  // モバイルメニューを開いたまま画面を PC の幅（769px 以上。index.css でメニューボタンを隠す幅）に広げたら閉じる。
  // 閉じないと、見えないメニューのために幕・スクロール止め・Tab の閉じ込めが残ってしまう
  useEffect(() => {
    if (!menuOpen || typeof window.matchMedia !== 'function') return
    /** PC の幅かどうかの判定 */
    const mq = window.matchMedia('(min-width: 769px)')
    /**
     * 画面の幅が変わったとき、PC の幅になっていればメニューを閉じる（開くボタンは隠れているのでフォーカスは戻さない）
     * @param e - 画面幅の条件に一致したかを示すメディアクエリ変更イベント
     * @returns なし
     */
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [menuOpen])

  // モバイルメニューを開いているあいだは、後ろのページ本体（main・footer・チャットボタンなど、body 直下の #root の中で
  // ヘッダーとメニュー以外のもの）を inert にして、Tab のフォーカスと読み上げに出さない。閉じたら元に戻す
  useEffect(() => {
    if (!menuOpen) return
    /** inert にした要素（閉じたときに外すため。もともと inert のものは触らない） */
    const changed = Array.from(document.querySelectorAll<HTMLElement>('main, footer, .chat-fab'))
      .filter((el) => !el.hasAttribute('inert') && !mobileNavRef.current?.contains(el))
    changed.forEach((el) => el.setAttribute('inert', ''))
    return () => changed.forEach((el) => el.removeAttribute('inert'))
  }, [menuOpen])

  // モバイルメニューを開いたらメニューの中の閉じるボタンへ、閉じるボタン・Esc・幕で閉じたら開閉ボタンへフォーカスを移す
  // （開いているあいだ開閉ボタンは inert でメニューの下に隠れるので、描画が終わってから移す）。
  // メニューのリンクを押したときも同じく開閉ボタンへ戻す（今いるページのリンクでは画面が変わらず、フォーカスの行き先が無くなるため）
  useEffect(() => {
    if (menuOpen) {
      menuCloseBtnRef.current?.focus()
    } else if (returnFocusOnClose.current) {
      returnFocusOnClose.current = false
      menuBtnRef.current?.focus()
    }
  }, [menuOpen])

  // Esc キーで開いているモバイルメニューを閉じ、開閉ボタンへフォーカスを戻す。
  // モバイルメニューを開いているあいだは、Tab のフォーカスをメニューの中で回す（後ろのページへ出ないように）
  useEffect(() => {
    if (!menuOpen) return
    /**
     * Esc キーでメニューを閉じ、Tab キーのフォーカスをメニュー内に保つ。
     * @param e - 押されたキーを含むキーボードイベント
     * @returns なし。キーに応じて閉じる処理またはフォーカス移動を行う
     */
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && menuOpen && mobileNavRef.current) {
        /** メニューの中でフォーカスできる要素（先頭は閉じるボタン、最後は言語切り替え） */
        const items = Array.from(mobileNavRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
        if (items.length === 0) return
        /** Tab キーでメニューの外へ出るときの移動先判定に使う最初の要素 */
        const first = items[0]
        /** Shift+Tab キーでメニューの外へ戻るときの移動先判定に使う最後の要素 */
        const last = items[items.length - 1]
        /** 今フォーカスがメニューの中にあるか */
        const inside = mobileNavRef.current.contains(document.activeElement)
        if (e.shiftKey && (document.activeElement === first || !inside)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
          e.preventDefault()
          first.focus()
        }
        return
      }
      if (e.key !== 'Escape') return
      if (menuOpen) {
        // closeMenuAndReturnFocus と同じ（依存配列に関数を入れないため、ここで直接書く）
        returnFocusOnClose.current = true
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [menuOpen])

  /**
   * ナビの各リンクの見た目
   * @param isActive - 今いるページなら true（濃い文字と下線）
   * @returns 選択状態を反映したナビゲーションリンク用 CSSProperties
   */
  const navItemStyle = (isActive: boolean): React.CSSProperties => ({
    fontSize: 'var(--brand-type-navigation)',
    fontWeight: 500,
    letterSpacing: '0.1em',
    textDecoration: 'none',
    padding: '4px 0',
    color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
    borderBottom: isActive ? '1px solid var(--c-ink)' : '1px solid transparent',
    transition: 'color 0.2s, border-color 0.2s',
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  })

  // PC 表示のナビゲーション（ページのリンク・言語の切り替え）
  const desktopNav = (
    <>
      {NAV_ITEMS.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          style={({ isActive }) => navItemStyle(isActive)}
        >
          {label}
        </NavLink>
      ))}

      {/* Shop ボタン。ホバー時の色の反転は index.css の .header-shop-link */}
      <Link to="/official/shop" className="header-shop-link">
        Shop
      </Link>
    </>
  )

  return (
    <>
      {/* 画面上端に固定した高さ 64px のバー。少しでもスクロールしたら下に線を出す */}
      {/* モバイルメニューを開いているあいだは、ヘッダーのバー（ロゴ・開くボタン）も inert にしてメニューの外へフォーカスが出ないようにする */}
      <header
        inert={menuOpen}
        style={{
          position: 'fixed', top: 0, left: 0, width: '100%',
          background: 'var(--c-bg)',
          borderBottom: scrolled ? '1px solid var(--c-border)' : '1px solid transparent',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 clamp(20px, 4vw, 48px)', boxSizing: 'border-box', height: 64,
          transition: 'border-color 0.3s',
        }}
      >
        {/* ロゴ（トップページへ） */}
        <Link to="/official" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img
            src={TEXT_LOGO}
            alt="ei8ht plants"
            style={{ height: 26, width: 'auto', objectFit: 'contain' }}
          />
        </Link>

        {/* PC 表示のナビ（スマホでは index.css で隠し、右上のメニューボタンを出す） */}
        <nav className="header-nav-desktop" style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {desktopNav}
          {/* 言語切り替えボタン。ホバー時の色は index.css の .header-lang-btn */}
          <button
            type="button"
            className="header-lang-btn"
            onClick={toggleLang}
            aria-label={lang === 'ja' ? 'Switch to English' : '日本語に切り替える'}
          >
            {lang === 'ja' ? 'EN' : 'JA'}
          </button>
        </nav>

        {/* モバイルメニューを開くボタン（2本線）。開いているあいだはメニュー本体の下に隠れるので、
            inert と aria-hidden で操作・読み上げから外し、閉じる操作はメニューの中の閉じるボタンで行う */}
        <button
          ref={menuBtnRef}
          type="button"
          className="menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label={lang === 'ja' ? 'メニューを開く' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls={mobileMenuId}
          inert={menuOpen}
          aria-hidden={menuOpen || undefined}
          style={{ padding: 8, zIndex: 1100 }}
        >
          {/* 上の線 */}
          <span aria-hidden="true" style={{
            display: 'block', width: 22, height: 1,
            background: 'var(--c-ink)',
          }} />
          {/* 下の短い線 */}
          <span aria-hidden="true" style={{
            display: 'block', height: 1, width: 11,
            background: 'var(--c-ink)',
            marginTop: 8,
          }} />
        </button>
      </header>

      {/* モバイルオーバーレイ（メニューの後ろの半透明の幕。押すと閉じる） */}
      <div
        aria-hidden="true"
        onClick={closeMenuAndReturnFocus}
        style={{
          position: 'fixed', inset: 0, zIndex: 1040,
          background: 'rgba(66,66,66,0.25)',
          opacity: menuOpen ? 1 : 0,
          visibility: menuOpen ? 'visible' : 'hidden',
          transition: 'opacity 0.35s, visibility 0.35s',
          backdropFilter: menuOpen ? 'blur(2px)' : 'none',
        }}
      />
      {/* モバイルメニューのダイアログの枠（見た目は持たない）。開いているあいだだけ role="dialog"・aria-modal にし、
          読み上げに「メニューのダイアログ」として伝える（中の nav はナビゲーションとしてそのまま残す） */}
      <div
        role={menuOpen ? 'dialog' : undefined}
        aria-modal={menuOpen ? true : undefined}
        aria-label={menuOpen ? (lang === 'ja' ? 'メニュー' : 'Menu') : undefined}
      >
      {/* モバイルメニュー本体（右から出てくる）。閉じているあいだは inert と visibility: hidden で
          Tab キーのフォーカスや読み上げが画面外のリンクに入らないようにする */}
      <nav
        ref={mobileNavRef}
        id={mobileMenuId}
        aria-label={lang === 'ja' ? 'メニュー' : 'Menu'}
        inert={!menuOpen}
        style={{
          visibility: menuOpen ? 'visible' : 'hidden',
          position: 'fixed', top: 0, right: 0, height: '100vh',
          width: 'min(320px, 85vw)',
          background: 'var(--c-surface)',
          zIndex: 1050,
          display: 'flex', flexDirection: 'column',
          padding: '96px 40px 48px',
          gap: 32,
          transform: menuOpen ? 'translateX(0)' : 'translateX(100%)',
          // 閉じるときは動きが終わってから隠す（visibility を 0.4 秒遅らせる）
          transition: menuOpen
            ? 'transform 0.4s cubic-bezier(.22,1,.36,1)'
            : 'transform 0.4s cubic-bezier(.22,1,.36,1), visibility 0s linear 0.4s',
          overflowY: 'auto',
        }}
      >
        {/* メニューを閉じるボタン（×）。ヘッダーの開くボタンと同じ右上の位置に置く。開いたときはここにフォーカスを移す */}
        <button
          ref={menuCloseBtnRef}
          type="button"
          onClick={closeMenuAndReturnFocus}
          aria-label={lang === 'ja' ? 'メニューを閉じる' : 'Close menu'}
          aria-expanded={menuOpen}
          aria-controls={mobileMenuId}
          style={{
            position: 'absolute', top: 10, right: 'clamp(12px, 4vw, 40px)',
            width: 44, height: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          {/* × の2本の線（22px の線を ±45 度回して重ねる） */}
          <span aria-hidden="true" style={{ position: 'relative', display: 'block', width: 22, height: 22 }}>
            <span style={{ position: 'absolute', top: 11, left: 0, width: 22, height: 1, background: 'var(--c-ink)', transform: 'rotate(45deg)' }} />
            <span style={{ position: 'absolute', top: 11, left: 0, width: 22, height: 1, background: 'var(--c-ink)', transform: 'rotate(-45deg)' }} />
          </span>
        </button>
        {/* ページのリンク（押したらメニューを閉じる） */}
        {NAV_ITEMS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={closeMenuAndReturnFocus}
            style={({ isActive }) => ({
              fontSize: 'var(--brand-type-navigation)', fontWeight: 300, letterSpacing: '0.14em',
              textDecoration: 'none', textTransform: 'uppercase',
              color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
              borderBottom: isActive ? '1px solid var(--c-ink)' : '1px solid transparent',
              paddingBottom: 4, display: 'inline-block',
              transition: 'color 0.2s',
            })}
          >
            {label}
          </NavLink>
        ))}
        {/* 区切り線とショップへのリンク */}
        <div style={{ height: '1px', background: 'var(--c-border)', margin: '4px 0' }} />
        <NavLink
          to="/official/shop"
          onClick={closeMenuAndReturnFocus}
          style={({ isActive }) => ({
            fontSize: 'var(--brand-type-navigation)', fontWeight: 300, letterSpacing: '0.14em',
            textDecoration: 'none', textTransform: 'uppercase',
            color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
            transition: 'color 0.2s',
          })}
        >
          Shop
        </NavLink>
        {/* 言語切り替えボタン（PC のナビと同じもの。スマホでは PC のナビを隠すので、メニューの中にも置く）。
            押してもメニューは閉じない */}
        <button
          type="button"
          className="header-lang-btn"
          onClick={toggleLang}
          aria-label={lang === 'ja' ? 'Switch to English' : '日本語に切り替える'}
          style={{ alignSelf: 'flex-start' }}
        >
          {lang === 'ja' ? 'EN' : 'JA'}
        </button>
      </nav>
      </div>
    </>
  )
}
