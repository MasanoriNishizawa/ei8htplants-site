/**
 * 管理画面の鉢作家（AdminPotArtists）・メディア出演（AdminMedia）の一覧の読み込み失敗のテスト
 * - 読み込みに失敗すると失敗の文言と「再読み込み」が出て、「登録されていません」とは別の表示になる
 * - 「再読み込み」で読み直し、成功すれば一覧（または「登録されていません」）になる
 * - 0 件で成功したときは「登録されていません」が出て、失敗の文言は出ない
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { api, ApiError, type MediaAppearance, type PotArtist } from '../../../lib/api'
import AdminPotArtists from '../AdminPotArtists'
import AdminMedia from '../AdminMedia'

// 使う api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      potArtists: { list: vi.fn(), add: vi.fn(), delete: vi.fn() },
      mediaAppearances: { list: vi.fn(), add: vi.fn(), delete: vi.fn() },
    },
  }
})

/** 500 のエラー */
const SERVER_ERROR = new ApiError(500, '500 Internal Server Error', null)

/** 鉢作家 1 人 */
const ARTIST: PotArtist = { id: 'a1', name: '山田陶房', created_at: '2026-01-01T00:00:00Z' }
/** メディア出演 1 件 */
const MEDIA = { id: 'm1', title: 'テレビ出演', youtube_url: 'https://www.youtube.com/watch?v=abc', description: null } as unknown as MediaAppearance

/** 画面ごとの設定（名前・部品・list のモック・失敗の文言・0 件の文言・1 件のデータと表示名） */
const CASES = [
  {
    name: 'AdminPotArtists',
    element: <AdminPotArtists />,
    list: () => vi.mocked(api.potArtists.list),
    failText: '鉢作家の読み込みに失敗しました（500 Internal Server Error）',
    emptyText: '鉢作家が登録されていません。',
    item: ARTIST,
    itemText: '山田陶房',
  },
  {
    name: 'AdminMedia',
    element: <AdminMedia />,
    list: () => vi.mocked(api.mediaAppearances.list),
    failText: 'メディア出演の読み込みに失敗しました（500 Internal Server Error）',
    emptyText: 'まだ登録されていません。',
    item: MEDIA,
    itemText: 'テレビ出演',
  },
] as const

describe.each(CASES)('$name の一覧の読み込み', (c) => {
  beforeEach(() => {
    c.list().mockReset()
  })

  it('読み込みに失敗すると失敗の文言と「再読み込み」が出て、「登録されていません」は出ない', async () => {
    c.list().mockRejectedValue(SERVER_ERROR)
    render(c.element)
    expect(await screen.findByRole('alert')).toHaveTextContent(c.failText)
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument()
    expect(screen.queryByText(c.emptyText)).toBeNull()
  })

  it('「再読み込み」を押すと読み直し、成功すれば一覧が出て失敗の文言が消える', async () => {
    c.list().mockRejectedValueOnce(SERVER_ERROR).mockResolvedValue([c.item] as never)
    render(c.element)
    fireEvent.click(await screen.findByRole('button', { name: '再読み込み' }))
    expect(await screen.findByText(c.itemText)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(c.list()).toHaveBeenCalledTimes(2)
  })

  it('0 件で成功したときは「登録されていません」が出て、失敗の文言は出ない', async () => {
    c.list().mockResolvedValue([])
    render(c.element)
    expect(await screen.findByText(c.emptyText)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
