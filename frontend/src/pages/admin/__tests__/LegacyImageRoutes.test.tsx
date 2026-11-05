/**
 * 古い画像の管理画面の URL の転送（App.tsx のルート）のテスト
 *
 * 「サイト画像」（/admin/site-images）と「Habitat Oides 画像」（/admin/habitat-images）の画面は削除し、
 * 「ページ画像の編集」に一本化した。古い URL を開いたときは、App.tsx のルートで対応するブランドの編集画面へ転送する。
 *
 * 確かめること:
 * 1. /admin/site-images → /admin/page-editor/hue
 * 2. /admin/habitat-images → /admin/page-editor/habitat-oides
 * 3. /admin/page-editor（ブランドなし）→ /admin/page-editor/ei8htplants
 *
 * App 全体（本物のルート定義）を描画する。ログインの確認を省くため AdminLayout を、
 * 描画を軽くするため PageEditor を、今のパスとパラメータを出すだけの部品に置き換える。React Router はモックしない。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import App from '../../../App'

// AdminLayout はログインの確認をせず、子のルートだけを出す
vi.mock('../AdminLayout', () => ({
  default: () => <Outlet />,
}))

// PageEditor は、今のパスと URL の :brand / :page だけを出す
vi.mock('../PageEditor', () => ({
  default: function PageEditorProbe() {
    // 今のパス
    const { pathname } = useLocation()
    // URL のブランドとページ
    const { brand, page } = useParams()
    return (
      <>
        <p data-testid="location">{pathname}</p>
        <p data-testid="params">{`${brand ?? ''}/${page ?? ''}`}</p>
      </>
    )
  },
}))

describe('古い画像の管理画面の URL の転送（App のルート）', () => {
  afterEach(() => {
    // ほかのテストに影響しないよう、URL をトップに戻す
    window.history.replaceState({}, '', '/')
  })

  it.each([
    ['/admin/site-images', '/admin/page-editor/hue', 'hue/'],
    ['/admin/habitat-images', '/admin/page-editor/habitat-oides', 'habitat-oides/'],
    ['/admin/page-editor', '/admin/page-editor/ei8htplants', 'ei8htplants/'],
  ])('%s を開くと %s に転送され、ページ画像の編集が開く', async (from, to, params) => {
    // 1. 古い URL を開いた状態で App を描画する
    window.history.replaceState({}, '', from)
    render(<App />)
    // 2. 転送先の編集画面（モック）が出て、URL が書き換わっている
    expect(await screen.findByTestId('location', {}, { timeout: 5000 })).toHaveTextContent(to)
    expect(screen.getByTestId('params')).toHaveTextContent(params)
    expect(window.location.pathname).toBe(to)
  })
})
