import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Suspense, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { SKIP_ADMIN_AUTH } from '../../lib/devAuth'
import PageLoading from '../../components/PageLoading'
import { UnsavedChangesProvider, useConfirmLeave } from './UnsavedChanges'
import { preloadAdminPages } from './adminPages'

/** サイドメニューのグループの見出し（group: 見出しの文字） */
type NavGroup = { group: string }
/**
 * 管理画面の中のページへのリンク
 * to: リンク先のパス / label: 表示名 / end: パスが完全に一致するときだけ選択中にする（ダッシュボード用）/ sub: グループの中の項目として字下げする
 */
type NavLink_ = { to: string; label: string; end?: boolean; sub?: boolean }
/** 管理画面の外（別サービス）を新しいタブで開くリンク（href: 開く URL / label: 表示名） */
type NavExternal = { href: string; label: string }
/** サイドメニューの1項目（グループの見出し・管理画面内のリンク・外部リンクのどれか。持っているキーで見分ける） */
type NavItem = NavGroup | NavLink_ | NavExternal

/**
 * 分析ダッシュボード（analytics/ の Streamlit。Streamlit Community Cloud で公開）の URL。
 * 管理画面と同じ Supabase アカウントでログインして見る
 */
const ANALYTICS_URL = 'https://ei8htplants-analytics.streamlit.app'

/** サイドメニューに上から並べる項目 */
const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'ダッシュボード', end: true },
  { href: ANALYTICS_URL, label: '分析' },
  { to: '/admin/events', label: 'イベント' },
  { to: '/admin/gallery', label: 'ギャラリー' },
  { to: '/admin/site-images', label: 'サイト画像' },
  { to: '/admin/stockists', label: '取扱店' },
  { to: '/admin/reservations', label: 'WS予約' },
  { to: '/admin/collaborations', label: 'コラボレーション' },
  { to: '/admin/contacts', label: 'お問い合わせ' },
  { to: '/admin/products', label: '商品管理' },
  { to: '/admin/orders', label: '注文管理' },
  { to: '/admin/articles', label: '記事管理' },
  // 収支グループ
  { group: '収支' },
  { to: '/admin/finances', label: '全体の収支', sub: true },
  { to: '/admin/helper-payment', label: '支払い集計', sub: true },
  { to: '/admin/ws-summary', label: 'ワークショップ集計', sub: true },
  { to: '/admin/price-calc', label: '販売価格計算' },
  { to: '/admin/pot-artists', label: '鉢作家管理' },
  { to: '/admin/media', label: 'メディア管理' },
  { to: '/admin/docs', label: '設計書' },
  { to: '/admin/chat-qa', label: 'チャットQ&A' },
  { to: '/admin/chat-logs', label: 'チャット履歴' },
]

/**
 * サイドメニューのリンクの見た目
 * @param state.isActive - 今いる画面のリンクか
 * @param sub - グループの中の項目（字下げして小さくする）か
 * @returns スタイル
 */
const navStyle = ({ isActive }: { isActive: boolean }, sub = false): React.CSSProperties => ({
  display: 'block',
  padding: sub ? '8px 16px 8px 26px' : '10px 16px',
  textDecoration: 'none',
  borderRadius: 4, fontSize: sub ? 13 : 14, letterSpacing: 1,
  background: isActive ? '#1c2417' : 'transparent',
  color: isActive ? '#fff' : '#3a4535',
  whiteSpace: 'nowrap',
})

/**
 * 管理画面全体のレイアウト。Supabase 認証を担い、未認証時はログインフォームを表示する
 * @returns 確認中は何も出さず、未ログインならログインフォーム、ログイン済みなら管理画面の枠
 */
export default function AdminLayout() {
  /** 最初のセッションの確認中か（確認中は何も表示しない） */
  const [checking, setChecking] = useState(true)
  /** ログインしているか */
  const [authed, setAuthed] = useState(false)
  /** ログインフォームの ID（メールアドレス） */
  const [email, setEmail] = useState('')
  /** ログインフォームのパスワード */
  const [password, setPassword] = useState('')
  /** ログインの失敗の文言 */
  const [error, setError] = useState('')
  /** ログインを送信中か（ボタンを無効にして二重送信を防ぐ） */
  const [submitting, setSubmitting] = useState(false)

  /*
   * ログイン状態を初期化し、その後の変化を追いかける
   * 1. 開発用のログイン省略モードならログイン済みにする
   * 2. 今のセッションを確認する（失敗したら未ログインとして扱い、ログイン画面を出す）
   * 3. onAuthStateChange でセッションの変化（期限切れ・別タブでのログアウト・トークンの更新）を受け取り、
   *    セッションが無くなったらログイン画面に戻す
   */
  useEffect(() => {
    // 1. 開発用のログイン省略モード（本番ビルドでは常に false）。判定は lib/devAuth.ts にまとめている
    if (SKIP_ADMIN_AUTH) {
      setAuthed(true)
      setChecking(false)
      return
    }
    if (!supabase) { setChecking(false); return }
    // 2. 今のセッション
    supabase.auth.getSession()
      .then(({ data }) => setAuthed(!!data.session))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false))
    // 3. 変化の購読（テストのモックなどで onAuthStateChange が無い場合は購読しない）
    /** 購読の登録結果（画面を閉じるときに購読をやめるため） */
    const sub = supabase.auth.onAuthStateChange?.((_event, session) => {
      setAuthed(!!session)
    })
    return () => sub?.data.subscription.unsubscribe()
  }, [])

  /**
   * ログインフォームの送信
   * 1. 送信中にする
   * 2. ID・パスワードでログインする
   * 3. 失敗したら文言を出す
   * 4. 送信中を戻す
   * @param e - フォームの submit イベント
   */
  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) { setError('Supabase not configured'); return }
    if (submitting) return
    // 1. 送信中にする
    setSubmitting(true)
    setError('')
    try {
      // 2. ログイン（Supabase の失敗は error で返る）
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); return }
      setAuthed(true)
    } catch (err) {
      // 3. 通信の失敗など
      setError(err instanceof Error ? err.message : 'ログインに失敗しました')
    } finally {
      // 4. 送信中を戻す
      setSubmitting(false)
    }
  }

  /**
   * ログアウトしてログイン画面に戻す
   * @returns ログアウトが終わる Promise
   */
  const logout = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setAuthed(false)
  }

  // 最初のセッションの確認中は何も出さない（ログイン画面が一瞬見えるのを防ぐ）
  if (checking) return null

  // 未ログインならログインフォーム
  if (!authed) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f5f7', padding: '20px' }}>
      <form onSubmit={login} style={{ background: '#ffffff', padding: 40, borderRadius: 4, boxShadow: '0 2px 24px rgba(40,35,20,0.08)', width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: '0 0 8px', fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 24, fontWeight: 300 }}>Admin</h1>
        <input required type="email" inputMode="email" aria-label="ID" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="ID" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 16, fontFamily: 'inherit' }} />
        <input required type="password" aria-label="パスワード" autoComplete="current-password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 16, fontFamily: 'inherit' }} />
        {error && <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ padding: '12px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  )

  // 未保存の変更の確認（サイドメニュー）を使えるよう、ログイン後の画面全体を Provider で包む
  return (
    <UnsavedChangesProvider>
      <AdminShell onLogout={logout} />
    </UnsavedChangesProvider>
  )
}

/**
 * ログイン後の管理画面の枠（サイドメニュー・モバイルのヘッダー・中身）
 * UnsavedChangesProvider の内側で描画し、メニューのリンクを押したときに未保存の変更があれば確認を出す
 * @param props.onLogout - ログアウトボタンを押したときの処理
 * @returns 管理画面の枠
 */
function AdminShell({ onLogout }: { onLogout: () => void }) {
  /** モバイルでサイドメニュー（ドロワー）を開いているかどうか */
  const [menuOpen, setMenuOpen] = useState(false)
  /** 今いる画面のパス（同じ画面へのリンクでは確認を出さないため） */
  const { pathname } = useLocation()
  /** 未保存の変更があれば確認ダイアログを出す関数（移動してよければ true） */
  const confirmLeave = useConfirmLeave()

  // ログイン後の画面が出たら、ほかの管理ページも手が空いたときに先に読み込み、ページ移動で待たないようにする
  useEffect(() => {
    preloadAdminPages()
  }, [])

  /**
   * 管理画面内のメニューリンクを押したときの処理
   * 1. Ctrl・Cmd・Shift・Alt を押しながらのクリックや左以外のボタンは、新しいタブ・ウィンドウで開く操作で
   *    今の画面は残り入力も消えないので、確認を出さずブラウザの既定の動きに任せる（メニューもそのまま）
   * 2. 今いる画面と同じリンクなら、入力は消えないので確認しない
   * 3. 未保存の変更があれば確認し、キャンセルならリンクの移動を止める（メニューも開いたまま）
   * 4. 移動するときはモバイルのメニューを閉じる
   * @param e - クリックイベント
   * @param to - リンク先のパス
   */
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, to: string) => {
    // 1. 新しいタブ・ウィンドウで開く操作はブラウザに任せる
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    // 2. 3. 別の画面へ移るときだけ確認し、キャンセルなら移動を止める
    if (to !== pathname && !confirmLeave()) {
      e.preventDefault()
      return
    }
    // 4. モバイルのメニューを閉じる
    setMenuOpen(false)
  }

  /** ログアウトボタンの処理。ログアウトすると編集中の入力も消えるので、未保存の変更があれば確認する */
  const handleLogout = () => {
    if (!confirmLeave()) return
    onLogout()
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* モバイルオーバーレイ（メニューを開いているあいだ後ろを暗くし、押すと閉じる） */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }}
        />
      )}

      {/* サイドバー */}
      <aside
        className={`admin-sidebar${menuOpen ? ' drawer-open' : ''}`}
        style={{
          width: 200,
          background: '#ffffff',
          borderRight: '1px solid #dddde8',
          padding: 16,
          flexShrink: 0,
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {/* サイト名と、モバイルでメニューを閉じるボタン（PC では CSS で隠す） */}
        <div style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 18, fontWeight: 300, marginBottom: 12, letterSpacing: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>ei8ht admin</span>
          <button
            onClick={() => setMenuOpen(false)}
            className="admin-menu-close"
            aria-label="メニューを閉じる"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--c-muted)', padding: '0 4px', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {NAV_ITEMS.map((item, i) => {
          // グループヘッダー
          if ('group' in item) {
            return (
              <div key={`g-${i}`} style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', padding: '12px 16px 4px', marginTop: 4 }}>
                {item.group}
              </div>
            )
          }
          // 別サービスへのリンク（新しいタブで開く。管理画面内の現在地にはならないので常に非選択の見た目）
          // 今の画面はそのまま残り入力は消えないので、未保存の変更があっても確認しない
          if ('href' in item) {
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                style={navStyle({ isActive: false })}
                onClick={() => setMenuOpen(false)}
              >
                {item.label} <span aria-hidden="true" style={{ fontSize: 12 }}>↗</span>
                {/* 読み上げだけに伝える補足（画面には出さない） */}
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>（新しいタブで開きます）</span>
              </a>
            )
          }
          // 通常のナビリンク
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={(state) => navStyle(state, item.sub)}
              onClick={(e) => handleNavClick(e, item.to)}
            >
              {item.label}
            </NavLink>
          )
        })}
        {/* ログアウトボタン（メニューの一番下） */}
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button onClick={handleLogout} style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, cursor: 'pointer', color: 'var(--c-muted)' }}>ログアウト</button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* モバイルヘッダー（メニューを開くボタンとサイト名。PC では隠し、狭い幅で CSS が表示する） */}
        <div className="admin-mobile-header" style={{ display: 'none', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #dddde8', alignItems: 'center', gap: 12, flexShrink: 0, zIndex: 100 }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="メニューを開く"
            aria-expanded={menuOpen}
            style={{ background: 'none', border: '1px solid #dddde8', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--c-body)' }}
          >
            ☰
          </button>
          <span style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 16, fontWeight: 300, letterSpacing: 2 }}>ei8ht admin</span>
        </div>

        <main style={{ flex: 1, padding: 'clamp(16px, 3vw, 40px)', overflowY: 'auto', minWidth: 0 }}>
          {/* 各ページは画面ごとに別ファイルで読み込む（App.tsx の lazy）。読み込み中はサイドメニューを残したまま中身だけに表示を出す */}
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
