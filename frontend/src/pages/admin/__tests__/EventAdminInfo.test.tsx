/**
 * EventAdminInfo ページのテスト
 *
 * 1. 搬入・搬出セクションのラベルが表示されること
 * 2. 時の選択肢（HOUR_OPTIONS）に「06」が含まれること
 * 3. 分の選択肢（MINUTE_OPTIONS）に「05」が含まれること
 * 4. ローディング中の表示
 * 5. 保存ボタンが表示されること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import EventAdminInfoPage from '../EventAdminInfo'
import { api } from '../../../lib/api'
import type { Event, EventFinances, EventAdminInfo } from '../../../lib/api'

// api モジュールのモック。実装は保持せず api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: {
        get: vi.fn(),
        getAdminInfo: vi.fn(),
        getFinances: vi.fn(),
        saveAdminInfo: vi.fn(),
        saveFinances: vi.fn(),
      },
    },
  }
})

// ---- テスト用モックデータ ----

/**
 * テスト用のイベントデータ
 */
const MOCK_EVENT: Event = {
  id: 'event-admin-info-1',
  slug: 'admin-info-test',
  name: '管理情報入力テストイベント',
  start_date: '2099-07-15',
  end_date: null,
  time: '10:00〜17:00',
  location: 'テスト展示会場',
  booth_number: 'B-3',
  address: null,
  official_url: null,
  brands: ['ei8ht plants'],
  has_workshop: false,
  ws_requires_reservation: false,
  is_past: false,
  display_order: 1,
  images: [],
  page_content: null,
  daily_times: null,
}

/**
 * テスト用の収支データ（全フィールドをデフォルト値で初期化）
 */
const MOCK_FINANCES: EventFinances = {
  id: 'fin-admin-1',
  event_id: 'event-admin-info-1',
  sales: 0,
  booth_fee: 0,
  distance: 0,
  gas_price: 160,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

/**
 * EventAdminInfo ページを Routes/MemoryRouter でラップしてレンダリングするヘルパー
 * @param eventId - URL パラメータとして渡すイベントID
 */
function renderAdminInfoPage(eventId: string = 'event-admin-info-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/events/${eventId}/admin-info`]}>
      <Routes>
        <Route path="/admin/events/:id/admin-info" element={<EventAdminInfoPage />} />
      </Routes>
    </MemoryRouter>
  )
}

// ---- テストスイート ----

describe('EventAdminInfo ページ — 搬入・搬出時間プルダウン', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセットしてデフォルトの解決値を設定する
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    vi.mocked(api.events.getFinances).mockReset()
    vi.mocked(api.events.saveAdminInfo).mockReset()
    vi.mocked(api.events.saveFinances).mockReset()

    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    // 管理情報は未入力の空オブジェクトを返す
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({} as EventAdminInfo)
    vi.mocked(api.events.getFinances).mockResolvedValue(MOCK_FINANCES)
    vi.mocked(api.events.saveAdminInfo).mockResolvedValue({ ok: true })
    vi.mocked(api.events.saveFinances).mockResolvedValue(MOCK_FINANCES)
  })

  it('データ読み込み後に「搬入日時」ラベルが表示される', async () => {
    // 搬入日時の入力ラベルが表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByText('搬入日時')).toBeDefined()
    })
  })

  it('データ読み込み後に「搬出日時」ラベルが表示される', async () => {
    // 搬出日時の入力ラベルが表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByText('搬出日時')).toBeDefined()
    })
  })

  it('時の選択肢に「06」が存在する（HOUR_OPTIONS の先頭）', async () => {
    // 06 時のオプションが存在することを確認する（HOUR_OPTIONS は 06〜22）
    renderAdminInfoPage()
    await waitFor(() => {
      // getAllByRole で全 option を取得し、値 "06" のものが含まれることを確認する
      const options = screen.getAllByRole('option', { name: '06' })
      expect(options.length).toBeGreaterThan(0)
    })
  })

  it('分の選択肢に「05」が存在する（MINUTE_OPTIONS の2番目）', async () => {
    // 05 分のオプションが存在することを確認する（MINUTE_OPTIONS は 00, 05, 10, ...）
    renderAdminInfoPage()
    await waitFor(() => {
      // getAllByRole で全 option を取得し、値 "05" のものが含まれることを確認する
      const options = screen.getAllByRole('option', { name: '05' })
      expect(options.length).toBeGreaterThan(0)
    })
  })

  it('ローディング中は「読み込み中...」が表示される', () => {
    // データ取得が完了する前はローディングメッセージが表示されることを確認する
    vi.mocked(api.events.get).mockReturnValue(new Promise(() => {})) // 永遠に保留
    renderAdminInfoPage()
    expect(screen.getByText('読み込み中...')).toBeDefined()
  })

  it('データ読み込み後に「保存する」ボタンが表示される', async () => {
    // 保存ボタンが表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存する' })).toBeDefined()
    })
  })

  it('イベント名がページに表示される', async () => {
    // イベント名がページ見出し付近に表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByText(/管理情報入力テストイベント/)).toBeDefined()
    })
  })

  it('「搬入・搬出」セクション見出しが表示される', async () => {
    // 搬入・搬出セクションのラベルが表示されることを確認する
    renderAdminInfoPage()
    await waitFor(() => {
      expect(screen.getByText('搬入・搬出')).toBeDefined()
    })
  })

  it('既存の carry_in_time を読み込んだとき時・分が正しく分割される', async () => {
    // carry_in_time が "2099-07-15T08:30" の場合、時 select に "08"・分 select に "30" が選択される
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({
      carry_in_time: '2099-07-15T08:30',
      carry_out_time: null,
      hotel_name: null,
      hotel_fee: null,
      booth_fee: null,
      booth_fee_pay_method: null,
      booth_fee_due: null,
      booth_fee_paid: false,
      notes: null,
    } as EventAdminInfo)
    renderAdminInfoPage()
    // 時 select が "08" を表示していることを確認する
    await waitFor(() => {
      expect(screen.getByDisplayValue('08')).toBeDefined()
    })
    // 分 select が "30" を表示していることを確認する
    expect(screen.getByDisplayValue('30')).toBeDefined()
  })

  it('minute が "00" のとき null にならず保存される（分 select が "00" を表示する）', async () => {
    // carry_in_time が "2099-07-15T09:00" の場合、分 select に "00" が選択された状態で表示される
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({
      carry_in_time: '2099-07-15T09:00',
      carry_out_time: null,
      hotel_name: null,
      hotel_fee: null,
      booth_fee: null,
      booth_fee_pay_method: null,
      booth_fee_due: null,
      booth_fee_paid: false,
      notes: null,
    } as EventAdminInfo)
    renderAdminInfoPage()
    // 分 select が "00" を表示していることを確認する（"00" は falsy になりがちなため特に重要）
    await waitFor(() => {
      expect(screen.getByDisplayValue('00')).toBeDefined()
    })
  })
})
