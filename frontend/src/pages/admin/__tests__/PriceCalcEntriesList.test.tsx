import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { PriceCalcEntriesList } from '../PriceCalcEntriesList'
import type { PriceCalcEntry } from '../../../lib/api'

const entries: PriceCalcEntry[] = [
  {
    id: 'hue-1', brand: 'hue', plant_name: 'ユーフォルビア オベサ',
    pot_artist_name: '表示しない作家名', cost: 1500, selling_price: 3800,
    mode: 'purchase', created_at: '2026-10-27T00:00:00Z',
  },
  {
    id: 'habitat-1', brand: 'habitatoides', plant_name: 'アガベ ポタトルム',
    pot_artist_name: null, cost: 4000, selling_price: 8000,
    mode: null, created_at: '2026-10-27T00:00:00Z',
  },
]

describe('PriceCalcEntriesList', () => {
  it('ブランド・計算種類・金額を表示し、HUEの鉢作家名とnull modeは表示しない', () => {
    render(<PriceCalcEntriesList entries={entries} emptyMessage="空です" onDelete={vi.fn()} />)

    const hueRow = screen.getByText('ユーフォルビア オベサ').closest('tr')!
    expect(within(hueRow).getByText('HUE')).toBeInTheDocument()
    expect(within(hueRow).getByText('仕入れ')).toBeInTheDocument()
    expect(within(hueRow).queryByText('表示しない作家名')).not.toBeInTheDocument()
    expect(within(hueRow).getByText('¥1,500')).toBeInTheDocument()
    expect(within(hueRow).getByText('¥3,800')).toBeInTheDocument()

    const habitatRow = screen.getByText('アガベ ポタトルム').closest('tr')!
    expect(within(habitatRow).getByText('Habitat Oides')).toBeInTheDocument()
    expect(within(habitatRow).queryByText('実生')).not.toBeInTheDocument()
    expect(within(habitatRow).getByText('量産鉢')).toBeInTheDocument()
  })

  it('削除対象のIDを親へ渡す', () => {
    const onDelete = vi.fn()
    render(<PriceCalcEntriesList entries={entries} emptyMessage="空です" onDelete={onDelete} />)

    fireEvent.click(within(screen.getByText('ユーフォルビア オベサ').closest('tr')!).getByRole('button', { name: '削除' }))

    expect(onDelete).toHaveBeenCalledWith('hue-1')
  })

  it('空のときは親から渡された案内だけを表示する', () => {
    render(<PriceCalcEntriesList entries={[]} emptyMessage="このブランドの登録はありません。" onDelete={vi.fn()} />)

    expect(screen.getByText('このブランドの登録はありません。')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
