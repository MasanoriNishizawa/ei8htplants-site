import { Link, NavLink, useLocation } from 'react-router-dom'
import { useCart } from '../lib/cart'
import { TEXT_LOGO } from '../lib/brands'
import { useLang } from '../lib/lang'

/** ヘッダーの文字に使うゴシック体 */
const SANS = "'Noto Sans JP', sans-serif"

/**
 * ショップ・ジャーナル・チェックアウト用のコンパクトなヘッダー（ロゴ・Shop / Journal のリンク・カートの点数・言語の切り替え）。
 * 狭い画面では「Official Site」を隠し（ロゴもトップへのリンクなので）、ロゴが潰れないようにする（index.css の .store-header-*）
 * @returns ヘッダーの要素
 */
export default function StoreHeader() {
  // カートの中身
  const { items } = useCart()
  // カートに入っている商品の点数の合計（数量の合計）
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)
  // 今のページのパス
  const { pathname } = useLocation()
  // チェックアウト・注文完了ページではカートボタンをリンクではなくテキスト表示にする
  const isCheckout = pathname === '/official/checkout' || pathname === '/official/order/complete'
  // 今の表示言語と切り替え関数（公開サイトのヘッダーと同じ）
  const { lang, toggle: toggleLang } = useLang()

  return (
    // 画面上端に固定した高さ 56px の白いバー（StoreLayout の main の paddingTop と合わせる）
    <header style={{
      position: 'fixed', top: 0, left: 0, width: '100%',
      background: 'var(--c-surface)',
      borderBottom: '1px solid var(--c-border)',
      zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 clamp(16px, 3vw, 32px)', boxSizing: 'border-box', height: 56,
    }}>
      {/* 左: ロゴ（トップページへ）+ Shop / Journal の切り替え */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 3vw, 20px)', minWidth: 0 }}>
        {/* ロゴは縮めない（右側の部品が増えても潰れないように） */}
        <Link to="/official" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <img
            src={TEXT_LOGO}
            alt="ei8ht plants"
            style={{ height: 26, width: 'auto', objectFit: 'contain' }}
          />
        </Link>
        {/* ショップとジャーナルの切り替え（表示中のほうに下線） */}
        <nav style={{ display: 'flex', gap: 'clamp(12px, 3vw, 20px)', alignItems: 'center' }}>
          {[{ to: '/official/shop', label: 'Shop' }, { to: '/official/journal', label: 'Journal' }].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                fontFamily: SANS, fontSize: 10, letterSpacing: '2px', textDecoration: 'none', textTransform: 'uppercase',
                color: isActive ? 'var(--c-ink)' : 'var(--c-muted)',
                borderBottom: isActive ? '1px solid var(--c-ink)' : '1px solid transparent',
                paddingBottom: 2,
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* 右: ブランドサイトへ戻る + 言語の切り替え + カート */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2.5vw, 20px)', flexShrink: 0 }}>
        {/* ブランドサイト（トップページ）へ戻るボタン（狭い画面では index.css で隠す） */}
        <Link
          to="/official"
          className="store-header-official"
          style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '1.5px', color: 'var(--c-surface)', textDecoration: 'none', textTransform: 'uppercase', whiteSpace: 'nowrap', background: 'var(--c-muted)', padding: '5px 12px' }}
        >
          Official Site
        </Link>
        {/* 言語切り替えボタン（公開サイトのヘッダーと同じ見た目・動き） */}
        <button
          type="button"
          className="header-lang-btn"
          onClick={toggleLang}
          aria-label={lang === 'ja' ? 'Switch to English' : '日本語に切り替える'}
        >
          {lang === 'ja' ? 'EN' : 'JA'}
        </button>
        {/* カートに商品があるときだけ、チェックアウトへのリンクを出す */}
        {!isCheckout && cartCount > 0 && (
          <Link
          to="/official/checkout"
            style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '1px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--c-ink)', color: '#fffdf9', padding: '6px clamp(8px, 2.5vw, 14px)', whiteSpace: 'nowrap' }}
          >
            Cart &nbsp;<span style={{ fontVariantNumeric: 'tabular-nums' }}>{cartCount}</span>
          </Link>
        )}
        {/* チェックアウト中は点数だけを文字で出す */}
        {isCheckout && cartCount > 0 && (
          <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '1px', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>
            {cartCount} item{cartCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </header>
  )
}
