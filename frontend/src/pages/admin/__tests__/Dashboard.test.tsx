/**
 * Dashboard（管理画面トップ）の「出店料の支払い」「今後の搬入予定」のテスト
 *
 * 確かめること:
 * 1. 出店料の支払い: 未払いのものだけが急ぐ順に並び、期限の状態（data-due-status）・ラベル・残り日数が出る
 * 2. 今後の搬入予定: 今日から60日以内に始まるものだけが開始日順に並び、搬入・搬出・ホテル・会場が出る
 * 3. 0件のとき・読み込みに失敗したときの案内。失敗しても統計カードと管理メニューは残る
 * 4. 統計の読み込みに失敗しても2つの一覧は出る
 * 5. 行のリンク先は管理情報の確認画面で、state.from に '/admin' を渡す
 *
 * API は vi.mock でモックする。「今日」は Date だけを偽の時計にして 2026-10-21 に固定する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Dashboard from '../Dashboard'
import { api, type AdminInfoDashboardItem } from '../../../lib/api'

vi.mock('../../../lib/api', () => ({
  api: {
    stats: vi.fn(),
    events: { getAdminInfoDashboard: vi.fn() },
  },
}))

/** モックした API（型付き） */
const mockStats = vi.mocked(api.stats)
// ダッシュボードの管理情報取得 API を型付きモックとして扱う
const mockDashboard = vi.mocked(api.events.getAdminInfoDashboard)

/**
 * ダッシュボードの1件を作る
 * @param over - 上書きする項目
 * @returns テスト用の1件
 */
function item(over: Partial<AdminInfoDashboardItem>): AdminInfoDashboardItem {
  return {
    event_id: 'e1',
    name: 'イベント',
    start_date: '2026-11-01',
    end_date: null,
    location: null,
    carry_in_time: null,
    carry_out_time: null,
    hotel_name: null,
    booth_fee: null,
    booth_fee_pay_method: null,
    booth_fee_due: null,
    booth_fee_paid: false,
    ...over,
  }
}

/**
 *  確認画面の代わりに表示する部品。state.from を画面に出す
 * @returns 確認画面への遷移情報を表示するプローブ
 */
function AdminInfoProbe() {
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from ?? '(なし)'
  return <div>確認画面 {loc.pathname} from={from}</div>
}

/**
 *  Dashboard を /admin で描画する
 * @returns Dashboard と遷移先プローブを描画した Testing Library の結果
 */
function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/events/:id/admin-info" element={<AdminInfoProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 *  「出店料の支払い」のセクション
 * @returns 「出店料の支払い」領域の要素
 */
function paymentSection() {
  return screen.getByRole('region', { name: '出店料の支払い' })
}

/**
 *  「今後の搬入予定」のセクション
 * @returns 「今後の搬入予定」領域の要素
 */
function carryInSection() {
  return screen.getByRole('region', { name: '今後の搬入予定' })
}

/** 表示に使うデータ（今日は 2026-10-21） */
const ITEMS: AdminInfoDashboardItem[] = [
  // 終了済みで期限切れの未払い
  item({ event_id: 'over', name: '春の植物市', start_date: '2026-05-01', end_date: '2026-05-02', booth_fee: 8000, booth_fee_pay_method: '振込', booth_fee_due: '2026-10-19' }),
  // 期限が今日
  item({ event_id: 'soon', name: '秋のマルシェ', start_date: '2026-10-24', end_date: '2026-10-25', location: '代々木公園', booth_fee: 14000, booth_fee_due: '2026-10-21', carry_in_time: '2026-10-24T08:30', carry_out_time: '2026-10-25T18:00', hotel_name: 'ホテルA' }),
  // 期限が先
  item({ event_id: 'later', name: '冬の展示会', start_date: '2026-12-10', booth_fee: 5000, booth_fee_due: '2026-11-30' }),
  // 期限なし・出店料あり、61日後に開始（搬入予定には出ない）
  item({ event_id: 'none', name: '年末イベント', start_date: '2026-12-21', booth_fee: 3000 }),
  // 支払い済み・30日後（搬入予定にだけ出る）
  item({ event_id: 'paid', name: '支払済イベント', start_date: '2026-11-20', booth_fee: 3000, booth_fee_due: '2026-10-10', booth_fee_paid: true }),
]

describe('Dashboard の出店料の支払い・今後の搬入予定', () => {
  beforeEach(() => {
    // Date だけを偽の時計にする（Promise・setTimeout は本物のまま）
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))
    mockStats.mockResolvedValue({ unreadContacts: 2, activeEvents: 5, pendingOrders: 0 })
    mockDashboard.mockResolvedValue(ITEMS)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('出店料の支払いは未払いのものだけが期限切れ→期限間近→それ以降→期限なしの順に並ぶ', async () => {
    renderDashboard()
    const rows = await within(paymentSection()).findAllByTestId('dashboard-payment-row')
    expect(rows.map((r) => r.getAttribute('data-due-status'))).toEqual(['overdue', 'soon', 'later', 'none'])
    expect(rows[0]).toHaveTextContent('春の植物市')
    expect(rows[1]).toHaveTextContent('秋のマルシェ')
    expect(rows[2]).toHaveTextContent('冬の展示会')
    expect(rows[3]).toHaveTextContent('年末イベント')
    // 支払い済みは出ない
    expect(within(paymentSection()).queryByText('支払済イベント')).not.toBeInTheDocument()
  })

  it('支払いの行には期限の状態のラベル・残り日数・出店料・支払い方法が出る', async () => {
    renderDashboard()
    const rows = await within(paymentSection()).findAllByTestId('dashboard-payment-row')
    // 期限切れ
    expect(rows[0]).toHaveTextContent('期限切れ')
    expect(rows[0]).toHaveTextContent('2日超過')
    expect(rows[0]).toHaveTextContent('8,000')
    expect(rows[0]).toHaveTextContent('振込')
    // 期限が今日
    expect(rows[1]).toHaveTextContent('期限間近')
    expect(rows[1]).toHaveTextContent('2026年10月21日（水）（今日まで）')
    // それ以降はラベルなし、残り日数は出る
    expect(rows[2]).not.toHaveTextContent('期限切れ')
    expect(rows[2]).not.toHaveTextContent('期限間近')
    expect(rows[2]).toHaveTextContent('あと40日')
    // 期限なし
    expect(rows[3]).toHaveTextContent('期限未設定')
    // 未入力の支払い方法は「未入力」
    expect(rows[1]).toHaveTextContent('支払い方法未入力')
  })

  it('今後の搬入予定は今日から60日以内に始まるものだけが開始日順に並ぶ', async () => {
    renderDashboard()
    const rows = await within(carryInSection()).findAllByTestId('dashboard-carry-in-row')
    expect(rows.map((r) => r.querySelector('div')?.textContent)).toEqual(['秋のマルシェ', '支払済イベント', '冬の展示会'])
    // 終了済み・61日後は出ない
    expect(within(carryInSection()).queryByText('春の植物市')).not.toBeInTheDocument()
    expect(within(carryInSection()).queryByText('年末イベント')).not.toBeInTheDocument()
  })

  it('搬入予定の行には開催日・会場・搬入・搬出・ホテルが出て、無い項目は「未入力」になる', async () => {
    renderDashboard()
    const rows = await within(carryInSection()).findAllByTestId('dashboard-carry-in-row')
    expect(rows[0]).toHaveTextContent('2026年10月24日（土）〜10月25日（日）')
    expect(rows[0]).toHaveTextContent('会場代々木公園')
    expect(rows[0]).toHaveTextContent('搬入2026年10月24日（土） 08:30')
    expect(rows[0]).toHaveTextContent('搬出2026年10月25日（日） 18:00')
    expect(rows[0]).toHaveTextContent('ホテルホテルA')
    expect(rows[1]).toHaveTextContent('会場未入力')
    expect(rows[1]).toHaveTextContent('搬入未入力')
    expect(rows[1]).toHaveTextContent('ホテル未入力')
  })

  it('行のリンク先は管理情報の確認画面で、押すと state.from に /admin が渡る', async () => {
    renderDashboard()
    const rows = await within(paymentSection()).findAllByTestId('dashboard-payment-row')
    expect(rows[0]).toHaveAttribute('href', '/admin/events/over/admin-info')
    const carry = within(carryInSection()).getAllByTestId('dashboard-carry-in-row')
    expect(carry[0]).toHaveAttribute('href', '/admin/events/soon/admin-info')
    fireEvent.click(carry[0])
    expect(await screen.findByText('確認画面 /admin/events/soon/admin-info from=/admin')).toBeInTheDocument()
  })

  it('支払いの行を押しても state.from に /admin が渡る', async () => {
    renderDashboard()
    const rows = await within(paymentSection()).findAllByTestId('dashboard-payment-row')
    fireEvent.click(rows[2])
    expect(await screen.findByText('確認画面 /admin/events/later/admin-info from=/admin')).toBeInTheDocument()
  })

  it('対象が0件のときはそれぞれ0件の案内が出る', async () => {
    mockDashboard.mockResolvedValue([])
    renderDashboard()
    expect(await within(paymentSection()).findByText('未払いの出店料はありません')).toBeInTheDocument()
    expect(within(carryInSection()).getByText('今日から60日以内に始まるイベントはありません')).toBeInTheDocument()
    expect(screen.queryAllByTestId('dashboard-payment-row')).toHaveLength(0)
    expect(screen.queryAllByTestId('dashboard-carry-in-row')).toHaveLength(0)
  })

  it('読み込み中は両方に「読み込み中...」が出る', async () => {
    mockDashboard.mockReturnValue(new Promise(() => {}))
    renderDashboard()
    expect(within(paymentSection()).getByText('読み込み中...')).toBeInTheDocument()
    expect(within(carryInSection()).getByText('読み込み中...')).toBeInTheDocument()
  })

  it('読み込みに失敗すると両方に失敗の案内が出て、統計カードと管理メニューは残る', async () => {
    mockDashboard.mockRejectedValue(new Error('500'))
    renderDashboard()
    const msg = '読み込みに失敗しました。時間をおいて再度お試しください。'
    expect(await within(paymentSection()).findByText(msg)).toBeInTheDocument()
    expect(within(carryInSection()).getByText(msg)).toBeInTheDocument()
    // 統計カードは値が出る
    expect(await screen.findByText('未読お問い合わせ')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // 管理メニューも残る
    expect(screen.getByText('管理メニュー')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /記事管理/ })).toBeInTheDocument()
  })

  it('統計の読み込みに失敗しても2つの一覧は出る', async () => {
    mockStats.mockRejectedValue(new Error('500'))
    renderDashboard()
    expect(await within(paymentSection()).findAllByTestId('dashboard-payment-row')).toHaveLength(4)
    expect(within(carryInSection()).getAllByTestId('dashboard-carry-in-row')).toHaveLength(3)
  })
})
