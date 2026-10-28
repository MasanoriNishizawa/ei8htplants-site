/**
 * 公開ギャラリー（pages/Gallery.tsx）のブランドの絞り込みのテスト（MSW を使う）
 * 管理画面のギャラリーは HUE の写真を短い表記「HUE」で保存するため、
 * 公開ギャラリーは「HUE by ei8ht plants」タブを押したとき、サーバーへ brand=HUE で問い合わせる。
 * GET /api/gallery は src/mocks/handlers.ts（brand が完全一致する写真だけを返す。HUE の写真は brand: 'HUE'）を使い、
 * 問い合わせの URL を確かめるテストだけ server.use で記録する。本番には接続しない
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/node'
import { MOCK_GALLERY } from '../../mocks/data'
import Gallery from '../Gallery'

/**
 * GET /api/gallery の ?brand= の値を記録しながら、モックの写真を brand で絞って返す
 * @returns 問い合わせの brand の値（無ければ null）を入れていく配列
 */
/**
 * gallery API へ送られた brand クエリを記録する MSW ハンドラーを登録する。
 * 末尾の問い合わせは brands[brands.length - 1] で取る（tsconfig の lib が ES2020 で Array.prototype.at が使えないため）。
 * @returns 記録した brand クエリ値の配列を返す。
 */
function recordGalleryRequests(): (string | null)[] {
  const brands: (string | null)[] = []
  server.use(
    http.get('*/api/gallery', ({ request }) => {
      // 1. 問い合わせの brand を記録する
      const brand = new URL(request.url).searchParams.get('brand')
      brands.push(brand)
      // 2. handlers.ts と同じく完全一致で絞って返す
      return HttpResponse.json(brand ? MOCK_GALLERY.filter((g) => g.brand === brand) : MOCK_GALLERY)
    }),
  )
  return brands
}

describe('Gallery のブランドの絞り込み（MSW）', () => {
  it('HUE by ei8ht plants のタブを押すと、サーバーへ brand=HUE（短い表記）で問い合わせる', async () => {
    const brands = recordGalleryRequests()
    render(<Gallery />)
    // 1. 最初は brand なし
    await waitFor(() => expect(brands).toEqual([null]))
    // 2. HUE のタブを押す
    fireEvent.click(screen.getByRole('button', { name: 'HUE by ei8ht plants' }))
    await waitFor(() => expect(brands).toEqual([null, 'HUE']))
    // 正式名では問い合わせない
    expect(brands).not.toContain('HUE by ei8ht plants')
  })

  it('HUE のタブを押すと、モックの HUE の写真（植物 3）だけが表示され、タブが選択中になる', async () => {
    render(<Gallery />)
    // 1. 最初は全部の写真
    await screen.findByRole('img', { name: '植物 1' })
    // 2. HUE のタブ
    const tab = screen.getByRole('button', { name: 'HUE by ei8ht plants' })
    fireEvent.click(tab)
    await waitFor(() => expect(screen.queryByRole('img', { name: '植物 1' })).toBeNull())
    expect(screen.getByRole('img', { name: '植物 3' })).toBeInTheDocument()
    expect(screen.queryByText('まだ写真が追加されていません。')).toBeNull()
    expect(tab).toHaveAttribute('aria-pressed', 'true')
  })

  it('ei8ht plants・Habitat Oides のタブは正式名と短い表記が同じなので、その名前で問い合わせる', async () => {
    const brands = recordGalleryRequests()
    render(<Gallery />)
    await waitFor(() => expect(brands).toEqual([null]))
    fireEvent.click(screen.getByRole('button', { name: 'Habitat Oides' }))
    await waitFor(() => expect(brands[brands.length - 1]).toBe('Habitat Oides'))
    fireEvent.click(screen.getByRole('button', { name: 'ei8ht plants' }))
    await waitFor(() => expect(brands[brands.length - 1]).toBe('ei8ht plants'))
  })

  it('All に戻すと brand なしで問い合わせる', async () => {
    const brands = recordGalleryRequests()
    render(<Gallery />)
    fireEvent.click(await screen.findByRole('button', { name: 'HUE by ei8ht plants' }))
    await waitFor(() => expect(brands[brands.length - 1]).toBe('HUE'))
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(brands[brands.length - 1]).toBeNull())
  })
})
