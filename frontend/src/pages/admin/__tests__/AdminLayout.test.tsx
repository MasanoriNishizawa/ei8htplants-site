/**
 * AdminLayout（管理画面の共通レイアウト）のテスト
 *
 * 確かめること:
 * 1. サイドメニューに「分析」リンクがあり、分析ダッシュボード（Streamlit Community Cloud の別サービス）を新しいタブで開く
 *    - href が https://ei8htplants-analytics.streamlit.app
 *    - target="_blank"・rel="noopener noreferrer"（開いた先から管理画面を操作されないように）
 *    - スクリーンリーダー向けに「（新しいタブで開きます）」が読み上げられる
 * 2. 「分析」は「ダッシュボード」の直後、「イベント」の前に並ぶ
 * 3. 「分析」リンクは管理画面内の現在地にならない（ダッシュボードを開いていても選択中の見た目にならない）
 * 4. 既存のメニュー（ダッシュボード・イベントなど）は管理画面内のリンクのまま（別タブで開かない）
 * 5. 未ログインのときはメニュー自体が出ない（分析リンクも出ない）
 *
 * Supabase のクライアントはモックにして、本番の認証サーバーには接続しない。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminLayout from '../AdminLayout'

// 分析ダッシュボードの公開 URL（仕様で決めた値）
const ANALYTICS_URL = 'https://ei8htplants-analytics.streamlit.app'

// getSession が返すセッション（null なら未ログイン）。テストごとに切り替える
const sessionHolder: { session: object | null } = { session: { user: { email: 'admin@example.com' } } }

// Supabase クライアントのモック。getSession の結果だけを sessionHolder から返す
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: sessionHolder.session } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
}))

/**
 * AdminLayout を /admin 配下のルートで描画する
 * @param path - 最初に開くパス（既定は /admin）
 * @returns 処理結果。
 */
function renderLayout(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<div>ダッシュボードの中身</div>} />
          <Route path="events" element={<div>イベントの中身</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * サイドメニュー（aside）の中のリンクを並び順のまま取り出す
 * @returns リンク要素の配列
 */
async function sidebarLinks() {
  // 1. ログイン確認が終わってメニューが出るまで待つ
  await screen.findByRole('link', { name: 'ダッシュボード' })
  // 2. aside（complementary）の中のリンクを並び順で返す
  const aside = screen.getByRole('complementary')
  return within(aside).getAllByRole('link')
}

describe('AdminLayout のサイドメニュー「分析」リンク', () => {
  beforeEach(() => {
    // ログイン済みの状態に戻す
    sessionHolder.session = { user: { email: 'admin@example.com' } }
  })

  it('ログイン済みで開くと「分析」リンクが分析ダッシュボードの URL を指す', async () => {
    renderLayout()
    const link = await screen.findByRole('link', { name: /分析/ })
    expect(link).toHaveAttribute('href', ANALYTICS_URL)
  })

  it('「分析」リンクは target="_blank" と rel="noopener noreferrer" で新しいタブに開く', async () => {
    renderLayout()
    const link = await screen.findByRole('link', { name: /分析/ })
    expect(link).toHaveAttribute('target', '_blank')
    // rel は noopener と noreferrer の両方を含むこと
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
  })

  it('「分析」リンクのアクセシブルな名前に「（新しいタブで開きます）」が含まれ、矢印は読み上げ対象外になる', async () => {
    renderLayout()
    const link = await screen.findByRole('link', { name: '分析 （新しいタブで開きます）' })
    // 1. 矢印 ↗ は aria-hidden で読み上げから外れている
    const arrow = within(link).getByText('↗')
    expect(arrow).toHaveAttribute('aria-hidden', 'true')
    // 2. 補足の文言はリンクの中にある
    expect(within(link).getByText('（新しいタブで開きます）')).toBeInTheDocument()
  })

  it('サイドメニューで「分析」は「ダッシュボード」の直後、「イベント」の前に並ぶ', async () => {
    renderLayout()
    const links = await sidebarLinks()
    const names = links.map((a) => a.textContent ?? '')
    const dashIdx = names.findIndex((n) => n === 'ダッシュボード')
    expect(dashIdx).toBeGreaterThanOrEqual(0)
    // 直後が「分析」、その次が「イベント」
    expect(names[dashIdx + 1]).toMatch(/^分析/)
    expect(names[dashIdx + 2]).toBe('イベント')
  })

  it('「分析」リンクはサイドメニューに 1 つだけある', async () => {
    renderLayout()
    const links = await sidebarLinks()
    const analytics = links.filter((a) => a.getAttribute('href') === ANALYTICS_URL)
    expect(analytics).toHaveLength(1)
  })

  it('ダッシュボードを開いているとき、ダッシュボードは選択中の見た目で「分析」は選択中にならない', async () => {
    renderLayout('/admin')
    const dash = await screen.findByRole('link', { name: 'ダッシュボード' })
    const analytics = screen.getByRole('link', { name: /分析/ })
    // NavLink は現在地のとき aria-current="page" が付く。外部リンクには付かない
    expect(dash).toHaveAttribute('aria-current', 'page')
    expect(analytics).not.toHaveAttribute('aria-current')
    // 選択中の背景色（#1c2417）にならない
    expect(analytics.style.background).not.toBe('rgb(28, 36, 23)')
    expect(dash.style.background).toBe('rgb(28, 36, 23)')
  })

  it('既存の「ダッシュボード」「イベント」は管理画面内のリンクのままで、新しいタブでは開かない', async () => {
    renderLayout()
    const dash = await screen.findByRole('link', { name: 'ダッシュボード' })
    const events = screen.getByRole('link', { name: 'イベント' })
    expect(dash).toHaveAttribute('href', '/admin')
    expect(events).toHaveAttribute('href', '/admin/events')
    expect(dash).not.toHaveAttribute('target')
    expect(events).not.toHaveAttribute('target')
  })

  it('「分析」以外のサイドメニューのリンクはすべて管理画面内（/admin で始まる）を指す', async () => {
    renderLayout()
    const links = await sidebarLinks()
    const others = links.filter((a) => a.getAttribute('href') !== ANALYTICS_URL)
    expect(others.length).toBeGreaterThan(10)
    for (const a of others) {
      expect(a.getAttribute('href')).toMatch(/^\/admin/)
      expect(a).not.toHaveAttribute('target')
    }
  })

  it('未ログインのときはログインフォームだけが出て「分析」リンクは表示されない', async () => {
    sessionHolder.session = null
    renderLayout()
    // ログインボタンが出るまで待つ
    expect(await screen.findByRole('button', { name: 'ログイン' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /分析/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'ダッシュボード' })).not.toBeInTheDocument()
  })
})
