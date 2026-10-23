/**
 * 管理画面の 404（pages/admin/AdminNotFound.tsx）のテスト
 * - /admin/xxx のような存在しない URL を開くと、管理画面のレイアウト（サイドメニュー）の中に
 *   「ページが見つかりません」・開こうとした URL・ダッシュボードへのリンクが出る
 * ルートの組み方は App.tsx（/admin の中の path="*"）と同じにする。Supabase はモックにして本番に接続しない
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminLayout from '../AdminLayout'
import AdminNotFound from '../AdminNotFound'

// Supabase クライアントのモック（ログイン済みのセッションを返す）
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { email: 'admin@example.com' } } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
}))

/**
 * 管理画面のレイアウトの中で、指定した URL を開く
 * @param path - 開く URL
 * @returns render の結果
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<div>ダッシュボードの中身</div>} />
          <Route path="events" element={<div>イベントの中身</div>} />
          <Route path="*" element={<AdminNotFound />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('管理画面の AdminNotFound', () => {
  it('/admin/xxx を開くとサイドメニューのあるレイアウトの中に「ページが見つかりません」が出る', async () => {
    renderAt('/admin/xxx')
    expect(await screen.findByRole('heading', { name: 'ページが見つかりません' })).toBeInTheDocument()
    // サイドメニュー（aside）も出ている＝管理画面のレイアウトの中
    const aside = screen.getByRole('complementary')
    expect(within(aside).getByRole('link', { name: 'イベント' })).toBeInTheDocument()
  })

  it('開こうとした URL が表示される（深い階層でもそのまま出る）', async () => {
    renderAt('/admin/events/abc/unknown')
    expect(await screen.findByText('/admin/events/abc/unknown')).toBeInTheDocument()
  })

  it('「ダッシュボードへ」のリンクが /admin を指し、押すとダッシュボードの中身に切り替わる', async () => {
    renderAt('/admin/xxx')
    const link = await screen.findByRole('link', { name: 'ダッシュボードへ' })
    expect(link).toHaveAttribute('href', '/admin')
    link.click()
    expect(await screen.findByText('ダッシュボードの中身')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ページが見つかりません' })).toBeNull()
  })

  it('存在する URL（/admin/events）では 404 の案内は出ない', async () => {
    renderAt('/admin/events')
    expect(await screen.findByText('イベントの中身')).toBeInTheDocument()
    expect(screen.queryByText('ページが見つかりません')).toBeNull()
  })
})
