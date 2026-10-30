import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Contact from '../Contact'
import { api } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  api: {
    contact: {
      send: vi.fn(),
    },
  },
}))

/**
 * お問い合わせフォームにテスト用の値を入力する。
 * @returns 戻り値なし。
 */
function fillForm() {
  fireEvent.change(screen.getByPlaceholderText('例: 山田 花子'), { target: { value: 'テスト太郎' } })
  fireEvent.change(screen.getByPlaceholderText('yourname@example.com'), { target: { value: 'test@example.com' } })
  fireEvent.change(screen.getByPlaceholderText('お問い合わせ内容をご記入ください'), { target: { value: 'テストメッセージ' } })
}

describe('Contact フォーム ステートマシン', () => {
  beforeEach(() => {
    vi.mocked(api.contact.send).mockReset()
  })

  it('初期状態は idle: 送信ボタンが表示される', () => {
    render(<Contact />)
    expect(screen.getByRole('button', { name: '送信する' })).toBeDefined()
    expect(screen.queryByText('送信中...')).toBeNull()
  })

  it('送信中は loading: ボタンが「送信中...」になり disabled になる', async () => {
    vi.mocked(api.contact.send).mockReturnValue(new Promise(() => {}))
    render(<Contact />)
    fillForm()
    fireEvent.submit(screen.getByRole('button', { name: '送信する' }).closest('form')!)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '送信中...' })).toBeDefined()
      expect(screen.getByRole('button', { name: '送信中...' })).toBeDisabled()
    })
  })

  it('送信成功後は done: フォームが非表示になり完了メッセージが表示される', async () => {
    vi.mocked(api.contact.send).mockResolvedValue({ ok: true })
    render(<Contact />)
    fillForm()
    fireEvent.submit(screen.getByRole('button', { name: '送信する' }).closest('form')!)
    await waitFor(() => {
      expect(screen.getByText(/お問い合わせを受け付けました/)).toBeDefined()
    })
    expect(screen.queryByRole('button', { name: '送信する' })).toBeNull()
  })

  it('送信失敗後は error: エラーメッセージが表示されボタンが再度押せる', async () => {
    vi.mocked(api.contact.send).mockRejectedValue(new Error('network error'))
    render(<Contact />)
    fillForm()
    fireEvent.submit(screen.getByRole('button', { name: '送信する' }).closest('form')!)
    await waitFor(() => {
      expect(screen.getByText(/送信に失敗しました/)).toBeDefined()
    })
    expect(screen.getByRole('button', { name: '送信する' })).not.toBeDisabled()
  })
})

describe('Contact フォームの文字数の上限と回数制限', () => {
  beforeEach(() => {
    vi.mocked(api.contact.send).mockReset()
  })

  it('お名前の欄に maxLength（100 文字）が付いている', () => {
    render(<Contact />)
    expect(screen.getByPlaceholderText('例: 山田 花子')).toHaveAttribute('maxLength', '100')
  })

  it('内容の欄に maxLength（5,000 文字）が付いている', () => {
    render(<Contact />)
    expect(screen.getByPlaceholderText('お問い合わせ内容をご記入ください')).toHaveAttribute('maxLength', '5000')
  })

  it('サーバーが 429 を返すと送信回数の上限の文言が出て、「送信に失敗しました」は出ない', async () => {
    // api の request は失敗時に「429 詳細」の形の Error を投げる
    vi.mocked(api.contact.send).mockRejectedValue(new Error('429 too many requests'))
    render(<Contact />)
    fillForm()
    fireEvent.submit(screen.getByRole('button', { name: '送信する' }).closest('form')!)
    expect(await screen.findByText('送信回数の上限に達しました。しばらく待ってからもう一度お試しください。')).toBeInTheDocument()
    expect(screen.queryByText('送信に失敗しました。再度お試しください。')).toBeNull()
    // ボタンはまた押せる
    expect(screen.getByRole('button', { name: '送信する' })).toBeEnabled()
  })

  it('429 以外の失敗（500）は「送信に失敗しました」の文言になる', async () => {
    vi.mocked(api.contact.send).mockRejectedValue(new Error('500 Internal Server Error'))
    render(<Contact />)
    fillForm()
    fireEvent.submit(screen.getByRole('button', { name: '送信する' }).closest('form')!)
    expect(await screen.findByText('送信に失敗しました。再度お試しください。')).toBeInTheDocument()
    expect(screen.queryByText(/送信回数の上限/)).toBeNull()
  })
})
