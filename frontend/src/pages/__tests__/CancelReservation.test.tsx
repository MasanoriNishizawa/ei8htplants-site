/**
 * 予約のキャンセル画面（pages/CancelReservation.tsx）のテスト（MSW を使う）
 * - キャンセル ID は英数字と - _ の 1〜64 文字（入力欄の pattern・maxLength、使えない文字は取り除く）
 * - URL の ?id= が初期値になる
 * - 応答 {ok: true}（200）で完了、400 キャンセル済み・404 見つからない・429 回数制限・500 その他の案内
 * POST /api/reserve/cancel は server.use でテストごとに決める。本番には接続しない
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/node'
import CancelReservation from '../CancelReservation'

/**
 * キャンセル画面を開く
 * @param query - URL のクエリ（例: '?id=abc'）
 * @returns render の結果
 */
function renderCancel(query = '') {
  return render(
    <MemoryRouter initialEntries={[`/cancel${query}`]}>
      <Routes>
        <Route path="/cancel" element={<CancelReservation />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * POST /api/reserve/cancel の応答を決め、送られた本文を記録する
 * @param status - ステータスコード
 * @param body - 本文
 * @returns 送られた本文の配列
 */
function mockCancelApi(status: number, body: object): { token: string }[] {
  const sent: { token: string }[] = []
  server.use(
    http.post('*/api/reserve/cancel', async ({ request }) => {
      sent.push((await request.json()) as { token: string })
      return HttpResponse.json(body, { status })
    }),
  )
  return sent
}

/** キャンセル ID の入力欄を返す */
const tokenInput = () => screen.getByLabelText('キャンセルID') as HTMLInputElement

describe('CancelReservation の入力欄', () => {
  it('入力欄の pattern は英数字と - _ の 1〜64 文字、maxLength は 64', () => {
    renderCancel()
    expect(tokenInput()).toHaveAttribute('pattern', '[A-Za-z0-9_\\-]{1,64}')
    expect(tokenInput()).toHaveAttribute('maxLength', '64')
  })

  it('pattern は 22 文字の新しい ID・8 桁の古い ID・- _ を含む ID に合い、65 文字や記号入りには合わない', () => {
    renderCancel()
    const re = new RegExp(`^(?:${tokenInput().getAttribute('pattern')})$`)
    expect(re.test('AbCdEfGhIjKlMnOpQrStUv')).toBe(true)
    expect(re.test('12345678')).toBe(true)
    expect(re.test('a-b_c')).toBe(true)
    expect(re.test('a'.repeat(64))).toBe(true)
    expect(re.test('a'.repeat(65))).toBe(false)
    expect(re.test('abc!')).toBe(false)
  })

  it('空白や記号を含めて貼り付けると、使えない文字が取り除かれる', () => {
    renderCancel()
    fireEvent.change(tokenInput(), { target: { value: ' ab c-d_e!@#\n' } })
    expect(tokenInput().value).toBe('abc-d_e')
  })

  it('65 文字以上を貼り付けても 64 文字までに切り詰められる', () => {
    renderCancel()
    fireEvent.change(tokenInput(), { target: { value: 'x'.repeat(80) } })
    expect(tokenInput().value).toHaveLength(64)
  })

  it('URL の ?id= が入力欄の初期値になる', () => {
    renderCancel('?id=abc123')
    expect(tokenInput().value).toBe('abc123')
  })

  it('未入力のときはキャンセルのボタンを押せない', () => {
    renderCancel()
    expect(screen.getByRole('button', { name: '予約をキャンセルする' })).toBeDisabled()
  })
})

describe('CancelReservation の送信結果', () => {
  it('応答が {ok: true}（200）なら「キャンセルが完了しました」が出て、送ったトークンが本文に入る', async () => {
    const sent = mockCancelApi(200, { ok: true })
    renderCancel('?id=Tok_en-1')
    fireEvent.click(screen.getByRole('button', { name: '予約をキャンセルする' }))
    expect(await screen.findByText('キャンセルが完了しました')).toBeInTheDocument()
    expect(sent).toEqual([{ token: 'Tok_en-1' }])
    expect(screen.getByRole('link', { name: 'イベント一覧へ戻る' })).toHaveAttribute('href', '/official/events')
  })

  it.each([
    [400, 'この予約はすでにキャンセル済みです。'],
    [404, 'キャンセルIDが見つかりません。メールをご確認ください。'],
    [429, '送信回数の上限に達しました。しばらく待ってからもう一度お試しください。'],
    [500, 'エラーが発生しました。再度お試しください。'],
  ])('応答が %i のときは「%s」の案内が出て、フォームは残る', async (status, message) => {
    mockCancelApi(status, { detail: 'x' })
    renderCancel('?id=abc')
    fireEvent.click(screen.getByRole('button', { name: '予約をキャンセルする' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: '予約をキャンセルする' })).toBeEnabled()
  })

  it('通信そのものが失敗したときも「エラーが発生しました」の案内が出る', async () => {
    server.use(http.post('*/api/reserve/cancel', () => HttpResponse.error()))
    renderCancel('?id=abc')
    fireEvent.click(screen.getByRole('button', { name: '予約をキャンセルする' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('エラーが発生しました。再度お試しください。')
  })
})
