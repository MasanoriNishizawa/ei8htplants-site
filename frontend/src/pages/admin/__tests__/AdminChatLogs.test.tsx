/**
 * 管理画面のチャット履歴一覧の表示を確認する。
 * api.chatLogs.list はモックし、実際のバックエンドへ接続しない。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AdminChatLogs from '../AdminChatLogs'
import { api, type ChatLog } from '../../../lib/api'

// チャット履歴 API だけをテストごとに置き換え、他の API 実装はそのまま使う。
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      chatLogs: { list: vi.fn() },
    },
  }
})

/** 画面テストで使う会話履歴 */
const LOG: ChatLog = {
  id: 'log-1',
  user_message: '次のイベントはいつですか？',
  ai_reply: 'イベント一覧をご覧ください。',
  ip_hash: null,
  created_at: '2026-10-01T10:00:00Z',
}

describe('管理画面のチャット履歴', () => {
  beforeEach(() => {
    // 1. 前のケースの応答を消し、既定で履歴1件を返す。
    vi.mocked(api.chatLogs.list).mockReset()
    vi.mocked(api.chatLogs.list).mockResolvedValue([LOG])
  })

  it('FE-DA-01: 履歴取得に成功すると質問と件数を表示し、行を開くとAIの返答を表示する', async () => {
    render(<AdminChatLogs />)

    // 1. 一覧に質問と件数が出るのを待ち、履歴行を開く。
    const row = await screen.findByRole('button', { name: /次のイベントはいつですか/ })
    expect(screen.getByText('1 件')).toBeInTheDocument()
    fireEvent.click(row)

    // 2. 展開後に質問と AI の返答の全文が表示される。
    expect(screen.getByText('イベント一覧をご覧ください。')).toBeInTheDocument()
    expect(row).toHaveAttribute('aria-expanded', 'true')
  })

  it('FE-DA-02: 履歴が0件なら件数と空一覧の案内を表示する', async () => {
    vi.mocked(api.chatLogs.list).mockResolvedValue([])
    render(<AdminChatLogs />)

    // 1. 読み込み完了後に0件表示と空一覧の案内を確認する。
    expect(await screen.findByText('まだ履歴がありません。')).toBeInTheDocument()
    expect(screen.getByText('0 件')).toBeInTheDocument()
  })

  it('FE-DA-03: 履歴の取得に失敗するとエラーを表示し、空一覧の案内は出さない', async () => {
    vi.mocked(api.chatLogs.list).mockRejectedValue(new Error('network'))
    render(<AdminChatLogs />)

    // 1. 失敗案内が出て、通常の空一覧と誤認する案内が出ないことを確認する。
    expect(await screen.findByRole('alert')).toHaveTextContent('チャット履歴の読み込みに失敗しました（network）')
    expect(screen.queryByText('まだ履歴がありません。')).not.toBeInTheDocument()
  })
})
