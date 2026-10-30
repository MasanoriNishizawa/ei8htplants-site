/**
 * 管理画面「鉢作家管理」の削除操作テスト
 *
 * - 確認ダイアログでキャンセルしたときは削除APIを呼ばない
 * - 確認を承認したときは削除API成功後に対象作家を一覧から取り除く
 * api はモックし、本番サーバーやDBには接続しない
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AdminPotArtists from '../AdminPotArtists'
import { api, type PotArtist } from '../../../lib/api'

// この画面が使う鉢作家APIをモックして、削除結果をテスト内で制御する。
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      potArtists: {
        list: vi.fn(),
        add: vi.fn(),
        delete: vi.fn(),
      },
    },
  }
})

/**
 * 鉢作家の一覧表示用データを作る。
 * @param overrides - テストケースで差し替える鉢作家の属性
 * @returns 管理画面へ渡せる鉢作家レコード
 */
function makeArtist(overrides: Partial<PotArtist> = {}): PotArtist {
  return {
    id: 'artist-1',
    name: '山田陶房',
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('AdminPotArtists の削除確認', () => {
  beforeEach(() => {
    // 各テストで一覧・追加・削除APIの履歴と応答を初期化する。
    vi.mocked(api.potArtists.list).mockReset().mockResolvedValue([makeArtist()])
    vi.mocked(api.potArtists.add).mockReset()
    vi.mocked(api.potArtists.delete).mockReset().mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    // confirm のスパイを含め、各テストで作ったモックを元に戻す。
    vi.restoreAllMocks()
  })

  it('削除確認をキャンセルすると削除APIを呼ばず、作家を一覧に残す', async () => {
    // 1. 初期一覧を表示し、確認ダイアログをキャンセルする状態にする。
    /** 画面に表示される対象の鉢作家 */
    const artist = makeArtist()
    vi.mocked(api.potArtists.list).mockResolvedValue([artist])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<AdminPotArtists />)

    // 2. 対象作家の表示を待って「削除」を押し、確認をキャンセルする。
    expect(await screen.findByText(artist.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '削除' }))

    // 3. 確認文言を出したうえでAPIは呼ばれず、対象作家が残ることを確かめる。
    expect(confirmSpy).toHaveBeenCalledWith('この鉢作家を削除しますか？')
    expect(api.potArtists.delete).not.toHaveBeenCalled()
    expect(screen.getByText(artist.name)).toBeInTheDocument()
  })

  it('削除確認を承認するとAPI成功後に対象作家を一覧から削除する', async () => {
    // 1. 一覧対象を用意し、確認ダイアログを承認する状態にする。
    /** 削除後に画面から取り除かれる鉢作家 */
    const artist = makeArtist({ id: 'artist-2', name: '佐藤窯' })
    vi.mocked(api.potArtists.list).mockResolvedValue([artist])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminPotArtists />)

    // 2. 対象作家の表示を待って「削除」を押し、確認を承認する。
    expect(await screen.findByText(artist.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '削除' }))

    // 3. APIへ正しいIDが渡り、成功後に対象作家が一覧から消えることを確かめる。
    await waitFor(() => expect(api.potArtists.delete).toHaveBeenCalledWith(artist.id))
    await waitFor(() => expect(screen.queryByText(artist.name)).toBeNull())
    expect(api.potArtists.delete).toHaveBeenCalledTimes(1)
  })
})
