/**
 * 管理画面の取扱店（pages/admin/Stockists.tsx）のテスト
 * - 追加で空の項目（エリア・住所・URL）は null で送られる
 * - 保存（追加）に失敗すると文言が出て、入力が残り、「追加」ボタンがまた押せる（保存中のまま固まらない）
 * - 読み込みに失敗すると文言が出る
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminStockists from '../Stockists'
import { api, ApiError, type Stockist } from '../../../lib/api'

// api.stockists だけをモックする（ApiError などの実装はそのまま）
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      stockists: {
        list: vi.fn(),
        add: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    },
  }
})

/** 登録済みの取扱店（1 件） */
const STOCKIST: Stockist = { id: 's-1', name: 'Botany Tokyo', area: '東京', address: null, url: null, brands: ['HUE'] }

describe('管理画面の取扱店', () => {
  beforeEach(() => {
    vi.mocked(api.stockists.list).mockReset()
    vi.mocked(api.stockists.add).mockReset()
    vi.mocked(api.stockists.list).mockResolvedValue([STOCKIST])
  })

  it('店舗名だけ入れて追加すると、エリア・住所・URL は空文字ではなく null で送られる', async () => {
    vi.mocked(api.stockists.add).mockResolvedValue(STOCKIST)
    render(<AdminStockists />)
    await screen.findByText('Botany Tokyo')
    fireEvent.change(screen.getByLabelText('店舗名'), { target: { value: '新しいお店' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(api.stockists.add).toHaveBeenCalledTimes(1))
    expect(api.stockists.add).toHaveBeenCalledWith({ name: '新しいお店', area: null, address: null, url: null, brands: [] })
  })

  it('入力した項目と選んだブランド（HUE は短い表記）はそのまま送られる', async () => {
    vi.mocked(api.stockists.add).mockResolvedValue(STOCKIST)
    render(<AdminStockists />)
    await screen.findByText('Botany Tokyo')
    fireEvent.change(screen.getByLabelText('店舗名'), { target: { value: 'A店' } })
    fireEvent.change(screen.getByLabelText('エリア'), { target: { value: '大阪' } })
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'HUE' })[0])
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(api.stockists.add).toHaveBeenCalledWith({ name: 'A店', area: '大阪', address: null, url: null, brands: ['HUE'] }))
  })

  it('追加に失敗すると「追加に失敗しました」と理由が出て、入力は残り、追加ボタンがまた押せる', async () => {
    vi.mocked(api.stockists.add).mockRejectedValue(new ApiError(500, '500 Internal Server Error', null))
    render(<AdminStockists />)
    await screen.findByText('Botany Tokyo')
    fireEvent.change(screen.getByLabelText('店舗名'), { target: { value: '失敗するお店' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('追加に失敗しました（500 Internal Server Error）')
    expect(screen.getByLabelText('店舗名')).toHaveValue('失敗するお店')
    expect(screen.getByRole('button', { name: '追加' })).toBeEnabled()
  })

  it('ログインの期限切れ（401）で失敗すると、ログインし直す案内になる', async () => {
    vi.mocked(api.stockists.add).mockRejectedValue(new ApiError(401, '401 Unauthorized', null))
    render(<AdminStockists />)
    await screen.findByText('Botany Tokyo')
    fireEvent.change(screen.getByLabelText('店舗名'), { target: { value: 'B店' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ログインの期限が切れました。ログインし直してください')
  })

  it('一覧の読み込みに失敗すると「取扱店の読み込みに失敗しました」が出る', async () => {
    vi.mocked(api.stockists.list).mockRejectedValue(new Error('network'))
    render(<AdminStockists />)
    expect(await screen.findByRole('alert')).toHaveTextContent('取扱店の読み込みに失敗しました（network）')
  })
})
