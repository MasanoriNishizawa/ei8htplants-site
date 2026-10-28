/**
 * 管理画面の編集ダイアログ・フォームの閉じ方のテスト
 * - 取扱店（Stockists）の編集ダイアログ: 幕・Esc・キャンセルで閉じる。書きかけなら確認。保存中は閉じない。
 *   ブランドを外して付け直しただけ（並び順が変わる）なら書きかけにしない
 * - 問い合わせ（Contacts）の返信: キャンセル・×・幕・Esc で閉じる。書きかけなら確認。送信中は閉じない
 * - チャットの Q&A（AdminChatQA）: Esc でフォームを閉じる。書きかけなら確認。変換中の Esc では閉じない
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { api, type ContactRecord, type Stockist } from '../../../lib/api'
import AdminStockists from '../Stockists'
import AdminContacts from '../Contacts'
import AdminChatQA from '../AdminChatQA'
import { UNSAVED_CLOSE_MESSAGE } from '../UnsavedChanges'

// 使う api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      stockists: { list: vi.fn(), add: vi.fn(), patch: vi.fn(), delete: vi.fn() },
      contact: { list: vi.fn(), markRead: vi.fn(), reply: vi.fn() },
      chatQa: { list: vi.fn(), add: vi.fn(), update: vi.fn(), delete: vi.fn() },
    },
  }
})

/** 2 ブランドを扱う取扱店 */
const STOCKIST: Stockist = { id: 's-1', name: 'Botany Tokyo', area: '東京', address: null, url: null, brands: ['ei8ht plants', 'HUE'] }
/** 問い合わせ 1 件 */
const CONTACT: ContactRecord = { id: 'c-1', name: '山田 花子', email: 'hanako@example.com', message: '質問です', is_read: false, created_at: '2026-10-01T00:00:00Z' }

/** confirm のモック */
let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
})

afterEach(() => {
  confirmSpy.mockRestore()
})

describe('取扱店の編集ダイアログ（Stockists）', () => {
  /**
   *  編集ダイアログを開いて返す
   * @returns 非同期処理の結果を返す Promise。
   */
  async function openEdit() {
    vi.mocked(api.stockists.list).mockReset().mockResolvedValue([STOCKIST])
    render(<AdminStockists />)
    fireEvent.click(await screen.findByRole('button', { name: '編集' }))
    return screen.getByRole('dialog', { name: '取扱店を編集' })
  }

  /**
   *  編集ダイアログ（閉じていれば null）
   * @returns 戻り値なし。
   */
  const editDialog = () => screen.queryByRole('dialog', { name: '取扱店を編集' })

  it('変更していなければ、幕・Esc・キャンセルのどれでも確認なしに閉じる', async () => {
    let d = await openEdit()
    fireEvent.click(d.parentElement!)
    expect(editDialog()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(editDialog()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    d = screen.getByRole('dialog', { name: '取扱店を編集' })
    fireEvent.click(within(d).getByRole('button', { name: 'キャンセル' }))
    expect(editDialog()).toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('書きかけなら幕・Esc・キャンセルで確認が出て、キャンセルすれば開いたまま', async () => {
    const d = await openEdit()
    fireEvent.change(within(d).getByLabelText('エリア'), { target: { value: '名古屋' } })
    fireEvent.click(d.parentElement!)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(within(d).getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenCalledTimes(3)
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CLOSE_MESSAGE)
    expect(editDialog()).not.toBeNull()
  })

  it('ダイアログの中を押しても閉じない（幕だけで閉じる）', async () => {
    const d = await openEdit()
    fireEvent.click(within(d).getByText('取扱店を編集'))
    expect(editDialog()).not.toBeNull()
  })

  it('ブランドを外して付け直しただけ（並び順が変わる）なら書きかけにならず、確認なしに閉じる', async () => {
    const d = await openEdit()
    const box = within(d).getByRole('checkbox', { name: 'ei8ht plants' })
    fireEvent.click(box)
    fireEvent.click(box)
    expect(box).toBeChecked()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(editDialog()).toBeNull()
  })

  it('住所（読み込みは null）を入力して消しても書きかけにならない', async () => {
    const d = await openEdit()
    const address = within(d).getByLabelText('住所')
    fireEvent.change(address, { target: { value: '東京都' } })
    fireEvent.change(address, { target: { value: '' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(editDialog()).toBeNull()
  })

  it('保存中は幕・Esc・キャンセルのどれでも閉じず、確認も出さない', async () => {
    vi.mocked(api.stockists.patch).mockReset().mockReturnValue(new Promise(() => {}))
    const d = await openEdit()
    fireEvent.change(within(d).getByLabelText('エリア'), { target: { value: '名古屋' } })
    fireEvent.click(within(d).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(within(d).getByRole('button', { name: '保存' })).toBeDisabled())
    fireEvent.click(d.parentElement!)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(within(d).getByRole('button', { name: 'キャンセル' }))
    expect(editDialog()).not.toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

describe('問い合わせの返信（Contacts）', () => {
  /**
   *  返信のモーダルを開いて返す
   * @returns 非同期処理の結果を返す Promise。
   */
  async function openReply() {
    vi.mocked(api.contact.list).mockReset().mockResolvedValue([CONTACT])
    render(<AdminContacts />)
    fireEvent.click(await screen.findByRole('button', { name: '返信' }))
    return screen.getByRole('dialog')
  }

  /**
   *  返信のモーダル（閉じていれば null）
   * @returns 戻り値なし。
   */
  const replyDialog = () => screen.queryByRole('dialog')

  it('書きかけでなければ、キャンセル・×・幕・Esc のどれでも確認なしに閉じる', async () => {
    let d = await openReply()
    fireEvent.click(within(d).getByRole('button', { name: 'キャンセル' }))
    expect(replyDialog()).toBeNull()
    d = await openReplyAgain()
    fireEvent.click(within(d).getByRole('button', { name: '閉じる' }))
    expect(replyDialog()).toBeNull()
    d = await openReplyAgain()
    fireEvent.click(d.parentElement!)
    expect(replyDialog()).toBeNull()
    await openReplyAgain()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(replyDialog()).toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  /**
   *  一覧の「返信」をもう一度押してモーダルを返す
   * @returns 非同期処理の結果を返す Promise。
   */
  async function openReplyAgain() {
    fireEvent.click(screen.getByRole('button', { name: '返信' }))
    return screen.getByRole('dialog')
  }

  it('本文を書きかけると、キャンセル・×・幕・Esc で確認が出て、キャンセルすれば開いたまま', async () => {
    const d = await openReply()
    fireEvent.change(within(d).getByLabelText('本文'), { target: { value: 'お問い合わせありがとうございます' } })
    fireEvent.click(within(d).getByRole('button', { name: 'キャンセル' }))
    fireEvent.click(within(d).getByRole('button', { name: '閉じる' }))
    fireEvent.click(d.parentElement!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(confirmSpy).toHaveBeenCalledTimes(4)
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CLOSE_MESSAGE)
    expect(replyDialog()).not.toBeNull()
  })

  it('日本語の変換中の Esc では閉じない', async () => {
    await openReply()
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(replyDialog()).not.toBeNull()
  })

  it('送信中はキャンセル・×・幕・Esc のどれでも閉じず、確認も出さない', async () => {
    vi.mocked(api.contact.reply).mockReset().mockReturnValue(new Promise(() => {}))
    const d = await openReply()
    fireEvent.change(within(d).getByLabelText('本文'), { target: { value: '返信の本文' } })
    fireEvent.click(within(d).getByRole('button', { name: '送信する' }))
    expect(await within(d).findByRole('button', { name: '送信中...' })).toBeDisabled()
    fireEvent.click(within(d).getByRole('button', { name: 'キャンセル' }))
    fireEvent.click(within(d).getByRole('button', { name: '閉じる' }))
    fireEvent.click(d.parentElement!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(replyDialog()).not.toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

describe('チャットの Q&A のフォーム（AdminChatQA）', () => {
  /**
   *  追加のフォームを開く
   * @returns 戻り値なし。
   */
  async function openAdd() {
    vi.mocked(api.chatQa.list).mockReset().mockResolvedValue([])
    render(<AdminChatQA />)
    fireEvent.click(await screen.findByRole('button', { name: '+ 追加' }))
    expect(screen.getByLabelText('質問')).toBeInTheDocument()
  }

  it('何も入れていなければ Esc で確認なしにフォームが閉じる', async () => {
    await openAdd()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByLabelText('質問')).toBeNull()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('書きかけなら Esc で確認が出て、キャンセルすれば開いたまま', async () => {
    await openAdd()
    fireEvent.change(screen.getByLabelText('質問'), { target: { value: '営業時間は？' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CLOSE_MESSAGE)
    expect(screen.getByLabelText('質問')).toHaveValue('営業時間は？')
  })

  it('日本語の変換中の Esc では閉じない', async () => {
    await openAdd()
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(screen.getByLabelText('質問')).toBeInTheDocument()
  })
})
