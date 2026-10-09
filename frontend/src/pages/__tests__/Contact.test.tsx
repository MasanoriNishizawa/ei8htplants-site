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
    vi.mocked(api.contact.send).mockResolvedValue(undefined as any)
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
