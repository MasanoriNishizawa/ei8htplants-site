import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminHelperPayment from '../AdminHelperPayment'
import { api } from '../../../lib/api'

vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: {
        list: vi.fn(),
        getAllFinances: vi.fn(),
      },
    },
  }
})

const BASE_FIN = {
  id: '',
  booth_fee: 0,
  distance: 0,
  gas_price: 170,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

const EVENTS = [
  { id: 'e1', start_date: '2025-06-01', name: 'Summer Market', has_workshop: false, is_past: true },
  { id: 'e2', start_date: '2025-09-15', name: 'Autumn Pop-up', has_workshop: false, is_past: true },
  { id: 'e3', start_date: '2024-05-10', name: 'Spring Fair 2024', has_workshop: false, is_past: true },
  { id: 'e4', start_date: '2025-07-20', name: 'No Payment Event', has_workshop: false, is_past: true },
]

const FINANCES = [
  { ...BASE_FIN, id: 'f1', event_id: 'e1', sales: 100000, booth_fee: 20000, payment_flag: true },
  { ...BASE_FIN, id: 'f2', event_id: 'e2', sales: 50000, payment_flag: true },
  { ...BASE_FIN, id: 'f3', event_id: 'e3', sales: 80000, payment_flag: true },
  { ...BASE_FIN, id: 'f4', event_id: 'e4', sales: 60000, payment_flag: false },
]

describe('AdminHelperPayment 年度別集計', () => {
  beforeEach(() => {
    vi.mocked(api.events.list).mockResolvedValue(EVENTS as any)
    vi.mocked(api.events.getAllFinances).mockResolvedValue(FINANCES as any)
  })

  it('payment_flag=false のイベントは集計に含まれない', async () => {
    render(<AdminHelperPayment />)
    await waitFor(() => {
      expect(screen.queryByText('No Payment Event')).toBeNull()
    })
  })

  it('2025年度が表示される', async () => {
    render(<AdminHelperPayment />)
    await waitFor(() => {
      expect(screen.getAllByText(/2025年度/).length).toBeGreaterThan(0)
    })
  })

  it('2024年度が表示される', async () => {
    render(<AdminHelperPayment />)
    await waitFor(() => {
      expect(screen.getAllByText(/2024年度/).length).toBeGreaterThan(0)
    })
  })

  it('2025年度の年間合計: salesShare e1(16000) + e2(10000) = 26000', async () => {
    render(<AdminHelperPayment />)
    // e1: (100000 - 20000) * 0.2 = 16000
    // e2: 50000 * 0.2 = 10000
    // total = 26000
    await waitFor(() => {
      expect(screen.getAllByText('16,000 円').length).toBeGreaterThan(0)
      expect(screen.getByText('10,000 円')).toBeDefined()
      expect(screen.getAllByText('26,000 円').length).toBeGreaterThan(0)
    })
  })

  it('2025年度の翌期月額支払い: Math.round(26000 / 12) = 2,167', async () => {
    render(<AdminHelperPayment />)
    await waitFor(() => {
      expect(screen.getByText('2,167 円/月')).toBeDefined()
    })
  })

  it('2024年度の年間合計: e3 salesShare = 80000 * 0.2 = 16000', async () => {
    render(<AdminHelperPayment />)
    // e3: 80000 * 0.2 = 16000
    await waitFor(() => {
      expect(screen.getAllByText('16,000 円').length).toBeGreaterThan(0)
    })
  })

  it('年度は降順（新しい順）で表示される', async () => {
    render(<AdminHelperPayment />)
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 2 })
      const years = headings
        .map(h => h.textContent ?? '')
        .filter(t => t.includes('年度'))
      expect(years[0]).toContain('2025')
      expect(years[1]).toContain('2024')
    })
  })

  it('全イベントが payment_flag=false のとき「手伝いありのイベントがありません」と表示される', async () => {
    vi.mocked(api.events.getAllFinances).mockResolvedValue(
      FINANCES.map(f => ({ ...f, payment_flag: false })) as any
    )
    render(<AdminHelperPayment />)
    await waitFor(() => {
      expect(screen.getByText('手伝いありのイベントがありません。')).toBeDefined()
    })
  })
})
