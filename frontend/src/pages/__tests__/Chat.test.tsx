// 公開 AI チャット画面（pages/Chat.tsx）のテスト
// POST /api/chat は MSW（src/mocks/node.ts の server）でテストごとにモックする。本物の API・Gemini には接続しない
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { server } from '../../mocks/node'
import Chat from '../Chat'

/** 422 のときに出る案内（日本語） */
const MSG_422 = 'メッセージを送れませんでした。内容を短くするか、ページを開き直してください。'

/** 200 でも返事の本文が無いときに出る案内（日本語） */
const MSG_NO_REPLY = 'うまくお答えできませんでした。言い方を変えてもう一度お試しください。'

/** /api/chat に送られたリクエスト本文を記録する配列 */
type SentBody = { messages: { role: string; content: string }[] }

/**
 * /api/chat のモックを設定する
 * @param responses - 呼ばれた順に返すステータスと本文（足りなくなったら最後のものを繰り返す）
 * @returns 送られた本文を入れていく配列
 */
function mockChatApi(responses: { status: number; body: unknown }[]): SentBody[] {
  const sent: SentBody[] = []
  server.use(
    http.post('*/api/chat', async ({ request }) => {
      // 1. 送られた本文を記録する
      sent.push((await request.json()) as SentBody)
      // 2. 呼ばれた順に応答を返す
      const r = responses[Math.min(sent.length - 1, responses.length - 1)]
      // 本文は任意の JSON（テストで null や数値の reply も試す）なので、MSW の JSON の型として渡す
      return HttpResponse.json(r.body as JsonBodyType, { status: r.status })
    }),
  )
  return sent
}

/**
 * 入力欄に文字を入れて送信ボタンを押す
 * @param text - 送る文
 */
async function typeAndSend(text: string) {
  // 1. 入力欄に文字を入れる
  fireEvent.change(screen.getByPlaceholderText('メッセージを入力（Enterで送信）'), { target: { value: text } })
  // 2. 前の送信が終わって送信ボタンが押せる状態になるのを待ってから押す
  const button = screen.getByRole('button', { name: '送信' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
}

describe('Chat 画面', () => {
  it('入力欄の maxLength が 2,000 になっている', () => {
    render(<Chat />)
    const textarea = screen.getByPlaceholderText('メッセージを入力（Enterで送信）')
    expect(textarea).toHaveAttribute('maxLength', '2000')
  })

  it('正常に返事が来ると、AI の返事が表示される', async () => {
    const sent = mockChatApi([{ status: 200, body: { reply: 'アガベは日当たりを好みます' } }])
    render(<Chat />)
    await typeAndSend('アガベの育て方は？')
    expect(await screen.findByText('アガベは日当たりを好みます')).toBeInTheDocument()
    // 送った履歴は「挨拶（model）→ 質問（user）」の 2 件
    expect(sent).toHaveLength(1)
    expect(sent[0].messages.map((m) => m.role)).toEqual(['model', 'user'])
    expect(sent[0].messages[1].content).toBe('アガベの育て方は？')
  })

  it('API が 422 を返すと「メッセージを送れませんでした」の案内が出る', async () => {
    mockChatApi([{ status: 422, body: { detail: [] } }])
    render(<Chat />)
    await typeAndSend('長すぎる質問')
    expect(await screen.findByText(MSG_422)).toBeInTheDocument()
    // 送った質問は画面に残っている
    expect(screen.getByText('長すぎる質問')).toBeInTheDocument()
  })

  it('422 の案内とその質問は、次に送る履歴に含まれない', async () => {
    // 1. 1 回目は 422、2 回目は 200 を返す
    const sent = mockChatApi([
      { status: 422, body: { detail: [] } },
      { status: 200, body: { reply: '返事です' } },
    ])
    render(<Chat />)
    await typeAndSend('質問a')
    await screen.findByText(MSG_422)
    // 2. 続けて次の質問を送る（送信ボタンが押せるようになるのを待ってから押す）
    await typeAndSend('質問b')
    await screen.findByText('返事です')
    // 3. 2 回目の送信は「挨拶 → 質問b」だけで、案内（localOnly）と返事のない質問a は入っていない
    expect(sent).toHaveLength(2)
    expect(sent[1].messages).toHaveLength(2)
    expect(sent[1].messages[0].role).toBe('model')
    expect(sent[1].messages[1]).toEqual({ role: 'user', content: '質問b' })
    expect(sent[1].messages.some((m) => m.content === MSG_422)).toBe(false)
  })

  it('429（回数の上限）の案内も次に送る履歴に含まれない', async () => {
    const sent = mockChatApi([
      { status: 429, body: { detail: 'rate limit' } },
      { status: 200, body: { reply: 'OK' } },
    ])
    render(<Chat />)
    await typeAndSend('質問1')
    expect(await screen.findByText(/送信回数が上限に達しました/)).toBeInTheDocument()
    await typeAndSend('質問2')
    await screen.findByText('OK')
    expect(sent[1].messages.map((m) => m.content)).not.toContain('質問1')
    expect(sent[1].messages.some((m) => m.content.includes('上限に達しました'))).toBe(false)
  })

  it('200 でも reply が null なら案内が出て、次の送信には案内と前の質問が含まれず、送信も壊れない', async () => {
    // 1. 1 回目は reply: null、2 回目は通常の返事を返す
    const sent = mockChatApi([
      { status: 200, body: { reply: null } },
      { status: 200, body: { reply: '2回目の返事' } },
    ])
    render(<Chat />)
    await typeAndSend('質問a')
    // 2. 表示専用の案内が出る（「エラーが発生しました」ではない）
    expect(await screen.findByText(MSG_NO_REPLY)).toBeInTheDocument()
    expect(screen.queryByText(/エラーが発生しました/)).toBeNull()
    // 3. 続けて送ると、正常に返事が表示される（TypeError などで壊れない）
    await typeAndSend('質問b')
    expect(await screen.findByText('2回目の返事')).toBeInTheDocument()
    // 4. 2 回目の送信内容は「挨拶 → 質問b」だけ
    expect(sent).toHaveLength(2)
    expect(sent[1].messages).toHaveLength(2)
    expect(sent[1].messages[0].role).toBe('model')
    expect(sent[1].messages[1]).toEqual({ role: 'user', content: '質問b' })
    expect(sent[1].messages.some((m) => m.content === MSG_NO_REPLY || m.content === '質問a')).toBe(false)
  })

  it.each([
    ['空文字', ''],
    ['空白・改行だけ', '  \n '],
    ['文字列でない（数値）', 123],
    ['reply が無い', undefined],
  ])('200 でも reply が %s なら同じ案内が出る', async (_label, reply) => {
    mockChatApi([{ status: 200, body: reply === undefined ? {} : { reply } }])
    render(<Chat />)
    await typeAndSend('質問')
    expect(await screen.findByText(MSG_NO_REPLY)).toBeInTheDocument()
  })
})

describe('Chat 画面のページ情報', () => {
  it('タイトルは「AI コンシェルジュ | ei8ht plants」になり、サイト名が二重にならない', async () => {
    render(<Chat />)
    // React 19 は <title> を document.head に入れる
    await waitFor(() => expect(document.title).toBe('AI コンシェルジュ | ei8ht plants'))
    expect(document.title.split('ei8ht plants')).toHaveLength(2)
    const og = document.head.querySelector('meta[property="og:title"]')
    expect(og).toHaveAttribute('content', 'AI コンシェルジュ | ei8ht plants')
  })
})
