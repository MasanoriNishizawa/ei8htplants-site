/**
 * 時間枠の行の一覧（pages/admin/eventForm/WsSessionRows.tsx）の並べ替えボタンのテスト（2026-11-16 追加）
 * - onMove を渡すと各行に「↑」「↓」を出す。読み上げ名は「◯行目を上へ／下へ」（日ごとの枠は頭に「7月2日（金）の」が付く）
 * - 先頭の行の「↑」・末尾の行の「↓」は押せない。押すと親へ（位置, -1 / 1）を伝える
 * - onMove を渡さなければ「↑」「↓」は出さない（削除の「×」は出る）
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WsSessionRows from '../WsSessionRows'
import type { SessionInput } from '../../eventTime'

/** 3 行の枠 */
const SESSIONS: SessionInput[] = [
  { id: 'a', time_label: '10:00', max_participants: 5 },
  { id: 'b', time_label: '11:00', max_participants: 5 },
  { id: 'c', time_label: '12:00', max_participants: 5 },
]

/**
 * 行の一覧を描く
 * @param over - 上書きする props
 * @returns 渡した props
 */
function renderRows(over: Partial<React.ComponentProps<typeof WsSessionRows>> = {}) {
  const props: React.ComponentProps<typeof WsSessionRows> = {
    sessions: SESSIONS, inputStyle: {}, emptyText: '枠なし', onRemove: vi.fn(), onChange: vi.fn(), onMove: vi.fn(), ...over,
  }
  render(<WsSessionRows {...props} />)
  return props
}

describe('WsSessionRows の並べ替えボタン', () => {
  it('FE-EY-01 各行に「◯行目を上へ」「◯行目を下へ」のボタンが出る', () => {
    renderRows()
    for (const n of [1, 2, 3]) {
      expect(screen.getByRole('button', { name: `${n}行目を上へ` })).toHaveTextContent('↑')
      expect(screen.getByRole('button', { name: `${n}行目を下へ` })).toHaveTextContent('↓')
    }
  })

  it('FE-EY-02 先頭の「↑」と末尾の「↓」は押せず、ほかは押せる', () => {
    renderRows()
    expect(screen.getByRole('button', { name: '1行目を上へ' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '3行目を下へ' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '1行目を下へ' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '2行目を上へ' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '2行目を下へ' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '3行目を上へ' })).toBeEnabled()
  })

  it('FE-EY-03 押すと親へ位置と向き（上へ -1・下へ 1）を伝える。押せないボタンは伝えない', () => {
    const props = renderRows()
    fireEvent.click(screen.getByRole('button', { name: '2行目を上へ' }))
    fireEvent.click(screen.getByRole('button', { name: '2行目を下へ' }))
    fireEvent.click(screen.getByRole('button', { name: '1行目を上へ' }))
    expect(props.onMove).toHaveBeenNthCalledWith(1, 1, -1)
    expect(props.onMove).toHaveBeenNthCalledWith(2, 1, 1)
    expect(props.onMove).toHaveBeenCalledTimes(2)
  })

  it('FE-EY-04 日ごとの枠では読み上げ名の頭に日付が付く（「7月2日（金）の2行目を上へ」）', () => {
    renderRows({ labelPrefix: '7月2日（金）の' })
    expect(screen.getByRole('button', { name: '7月2日（金）の2行目を上へ' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '7月2日（金）の3行目を下へ' })).toBeDisabled()
  })

  it('FE-EY-05 1 行だけなら「↑」「↓」の両方が押せない', () => {
    renderRows({ sessions: [SESSIONS[0]] })
    expect(screen.getByRole('button', { name: '1行目を上へ' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '1行目を下へ' })).toBeDisabled()
  })

  it('FE-EY-06 onMove を渡さなければ「↑」「↓」は出さない（削除のボタンは出る）', () => {
    renderRows({ onMove: undefined })
    expect(screen.queryByRole('button', { name: /行目を上へ|行目を下へ/ })).toBeNull()
    expect(screen.getByRole('button', { name: '1回目のセッションを消す' })).toBeInTheDocument()
  })
})
