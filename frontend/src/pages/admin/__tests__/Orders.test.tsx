/**
 * 管理画面の注文管理（pages/admin/Orders.tsx）の主要な表示・操作・失敗のテスト
 * - 注文一覧の読み込み成功・失敗・0 件
 * - 注文詳細の取得成功・失敗
 * - ステータス変更と発送情報の保存、失敗時の表示保持、処理中の二重送信防止
 * api.orders はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { api, ApiError, type Order, type OrderDetail } from '../../../lib/api'
import AdminOrders from '../Orders'

// 注文管理で使うAPIだけを置き換え、ApiErrorなどの共有実装はそのまま使う
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      orders: {
        list: vi.fn(),
        get: vi.fn(),
        updateStatus: vi.fn(),
      },
    },
  }
})

/** 注文一覧に表示する支払済み注文 */
const ORDER: Order = {
  id: 'order-1', customer_name: '山田 花子', customer_email: 'hanako@example.com', customer_phone: '090-1234-5678',
  postal_code: '150-0001', prefecture: '東京都', city: '渋谷区', address_line1: '神宮前1-1-1', address_line2: null,
  note: null, subtotal: 3800, shipping_fee: 800, total: 4600, status: 'paid', square_payment_id: 'sq-pay-1',
  carrier: null, tracking_number: null, created_at: '2026-10-28T03:00:00Z',
}

/** 明細・配送情報を含む注文詳細 */
const DETAIL: OrderDetail = {
  ...ORDER,
  items: [{ id: 'item-1', order_id: ORDER.id, product_id: 'product-1', product_name: '植木鉢 S', price: 3800, quantity: 1 }],
}

/** 発送完了後にAPIが返す一覧用注文 */
const SHIPPED_ORDER: Order = {
  ...ORDER, status: 'shipped', carrier: 'ヤマト運輸', tracking_number: '1234-5678',
}

/** 注文管理画面を描画し、読み込みを終えるまで待つ */
async function renderOrders() {
  render(<AdminOrders />)
  await screen.findByRole('heading', { name: '注文管理' })
  await waitFor(() => expect(api.orders.list).toHaveBeenCalledTimes(1))
}

/** 一覧に出ている注文のステータス選択欄 */
const orderStatusSelect = () => screen.getByRole('combobox', { name: '山田 花子 様の注文のステータス' })

/** 注文詳細モーダルを開く */
async function openOrderDetail() {
  await renderOrders()
  fireEvent.click(await screen.findByRole('button', { name: '詳細' }))
  return screen.findByRole('dialog', { name: '注文詳細' })
}

/** 一覧から発送情報の入力モーダルを開く */
async function openShippingModal() {
  await renderOrders()
  fireEvent.change(orderStatusSelect(), { target: { value: 'shipped' } })
  return screen.findByRole('dialog', { name: '発送情報の入力' })
}

beforeEach(() => {
  vi.mocked(api.orders.list).mockReset().mockResolvedValue([ORDER])
  vi.mocked(api.orders.get).mockReset().mockResolvedValue(DETAIL)
  vi.mocked(api.orders.updateStatus).mockReset()
})

describe('管理画面の注文一覧', () => {
  it('一覧の取得に成功すると注文の名前・都道府県・合計・状態を表示する', async () => {
    await renderOrders()

    expect(screen.getByText('山田 花子')).toBeInTheDocument()
    expect(screen.getByText('東京都')).toBeInTheDocument()
    expect(screen.getByText('¥4,600')).toBeInTheDocument()
    expect(orderStatusSelect()).toHaveValue('paid')
  })

  it('一覧が0件なら「注文がありません。」を表示する', async () => {
    vi.mocked(api.orders.list).mockResolvedValue([])
    render(<AdminOrders />)

    expect(await screen.findByText('注文がありません。')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('一覧の取得に失敗するとエラーを表示する', async () => {
    vi.mocked(api.orders.list).mockRejectedValue(new ApiError(500, '500 Internal Server Error', null))
    render(<AdminOrders />)

    expect(await screen.findByRole('alert')).toHaveTextContent('注文の読み込みに失敗しました（500 Internal Server Error）')
    // 既知の問題: 読み込み失敗時にも0件表示が併記される。現行UIは変えず、エラー表示を回帰確認する。
    expect(screen.getByText('注文がありません。')).toBeInTheDocument()
    expect(screen.queryByText('読み込み中...')).toBeNull()
  })
})

describe('管理画面の注文詳細', () => {
  it('詳細の取得に成功すると顧客情報・注文内容・金額を表示し、閉じると一覧に戻る', async () => {
    const dialog = await openOrderDetail()

    expect(api.orders.get).toHaveBeenCalledWith(ORDER.id)
    expect(within(await dialog).getByText('hanako@example.com')).toBeInTheDocument()
    expect(screen.getByText('植木鉢 S × 1')).toBeInTheDocument()
    expect(screen.getByText('小計: ¥3,800')).toBeInTheDocument()
    expect(screen.getByText('送料: ¥800')).toBeInTheDocument()
    expect(screen.getByText('合計: ¥4,600')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog', { name: '注文詳細' })).toBeNull()
  })

  it('詳細の取得に失敗するとエラーを表示し、誤った詳細モーダルを開かない', async () => {
    vi.mocked(api.orders.get).mockRejectedValue(new ApiError(500, '詳細を取得できません', null))
    await renderOrders()
    fireEvent.click(screen.getByRole('button', { name: '詳細' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('注文の詳細の取得に失敗しました（詳細を取得できません）')
    expect(screen.queryByRole('dialog', { name: '注文詳細' })).toBeNull()
  })
})

describe('管理画面の注文ステータス変更', () => {
  it('ステータス更新に成功すると一覧と開いている詳細の両方へ反映する', async () => {
    vi.mocked(api.orders.updateStatus).mockResolvedValue({ ...ORDER, status: 'delivered' })
    const dialog = await openOrderDetail()
    fireEvent.click(within(await dialog).getByRole('button', { name: '配達完了' }))

    await waitFor(() => expect(api.orders.updateStatus).toHaveBeenCalledWith(ORDER.id, 'delivered'))
    await waitFor(() => expect(orderStatusSelect()).toHaveValue('delivered'))
    expect(within(await screen.findByRole('dialog', { name: '注文詳細' })).getByRole('button', { name: '配達完了' })).toBeDisabled()
  })

  it('ステータス更新に失敗すると元の状態を保ち、理由と再操作できる状態を表示する', async () => {
    vi.mocked(api.orders.updateStatus).mockRejectedValue(new ApiError(409, '状態を変更できません', null))
    const dialog = await openOrderDetail()
    fireEvent.click(within(await dialog).getByRole('button', { name: '配達完了' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ステータスの変更に失敗しました。元の状態のままです（状態を変更できません）')
    expect(orderStatusSelect()).toHaveValue('paid')
    expect(within(await screen.findByRole('dialog', { name: '注文詳細' })).getByRole('button', { name: '配達完了' })).toBeEnabled()
  })
})

describe('管理画面の発送情報', () => {
  it('キャンセルすると発送APIを呼ばず、注文の状態を変更しない', async () => {
    const dialog = await openShippingModal()
    fireEvent.click(within(await dialog).getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('dialog', { name: '発送情報の入力' })).toBeNull()
    expect(api.orders.updateStatus).not.toHaveBeenCalled()
    expect(orderStatusSelect()).toHaveValue('paid')
  })

  it('追跡番号を入力すると配送会社・番号を送信し、一覧の注文を発送済みに更新する', async () => {
    vi.mocked(api.orders.updateStatus).mockResolvedValue(SHIPPED_ORDER)
    const dialog = await openShippingModal()
    fireEvent.change(within(await dialog).getByLabelText('配送会社'), { target: { value: '佐川急便' } })
    fireEvent.change(within(await dialog).getByLabelText('お問い合わせ番号（任意）'), { target: { value: '1234-5678' } })
    fireEvent.click(within(await dialog).getByRole('button', { name: '発送済みにする' }))

    await waitFor(() => expect(api.orders.updateStatus).toHaveBeenCalledWith(ORDER.id, 'shipped', '佐川急便', '1234-5678'))
    await waitFor(() => expect(orderStatusSelect()).toHaveValue('shipped'))
    expect(screen.queryByRole('dialog', { name: '発送情報の入力' })).toBeNull()
  })

  it('追跡番号が空なら任意値を省略して発送を確定する', async () => {
    vi.mocked(api.orders.updateStatus).mockResolvedValue(SHIPPED_ORDER)
    const dialog = await openShippingModal()
    fireEvent.click(within(await dialog).getByRole('button', { name: '発送済みにする' }))

    await waitFor(() => expect(api.orders.updateStatus).toHaveBeenCalledWith(ORDER.id, 'shipped', 'ヤマト運輸', undefined))
    await waitFor(() => expect(orderStatusSelect()).toHaveValue('shipped'))
  })

  it('発送に失敗するとモーダルと入力を保ち、再試行できる', async () => {
    vi.mocked(api.orders.updateStatus)
      .mockRejectedValueOnce(new ApiError(500, '発送通知を送信できません', null))
      .mockResolvedValueOnce(SHIPPED_ORDER)
    const dialog = await openShippingModal()
    fireEvent.change(within(await dialog).getByLabelText('配送会社'), { target: { value: '日本郵便（ゆうパック）' } })
    fireEvent.change(within(await dialog).getByLabelText('お問い合わせ番号（任意）'), { target: { value: 'JP-001' } })
    fireEvent.click(within(await dialog).getByRole('button', { name: '発送済みにする' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('発送済みへの変更に失敗しました（発送通知を送信できません）')
    expect(screen.getByRole('dialog', { name: '発送情報の入力' })).toBeInTheDocument()
    expect(screen.getByLabelText('配送会社')).toHaveValue('日本郵便（ゆうパック）')
    expect(screen.getByLabelText('お問い合わせ番号（任意）')).toHaveValue('JP-001')
    expect(screen.getByRole('button', { name: '発送済みにする' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '発送済みにする' }))
    await waitFor(() => expect(api.orders.updateStatus).toHaveBeenCalledTimes(2))
    expect(api.orders.updateStatus).toHaveBeenLastCalledWith(ORDER.id, 'shipped', '日本郵便（ゆうパック）', 'JP-001')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '発送情報の入力' })).toBeNull())
  })

  it('発送処理中は確定ボタンを無効にして二重送信しない', async () => {
    let finishUpdate: ((order: Order) => void) | undefined
    vi.mocked(api.orders.updateStatus).mockImplementationOnce(() => new Promise((resolve) => {
      finishUpdate = resolve
    }))
    const dialog = await openShippingModal()
    const submit = within(await dialog).getByRole('button', { name: '発送済みにする' })
    fireEvent.click(submit)

    const pendingButton = screen.getByRole('button', { name: '処理中...' })
    expect(pendingButton).toBeDisabled()
    fireEvent.click(pendingButton)
    expect(api.orders.updateStatus).toHaveBeenCalledTimes(1)

    finishUpdate?.(SHIPPED_ORDER)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '発送情報の入力' })).toBeNull())
  })
})
