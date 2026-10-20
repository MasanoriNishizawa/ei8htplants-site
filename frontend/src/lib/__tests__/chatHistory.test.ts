// 公開 AI チャットの送信履歴を作る処理（lib/chatHistory.ts）のテスト
// サーバー（backend/app/routes/chat.py）の入力チェック（role・件数 40・本文 2,000 文字・最後が user）に
// 合う形に整えられることを確かめる
import { describe, it, expect } from 'vitest'
import {
  toSendHistory,
  clampContent,
  MAX_SEND_MESSAGES,
  MAX_MESSAGE_CHARS,
  type ChatMessage,
} from '../chatHistory'

/** 先頭の挨拶（AI 側の表示用メッセージ。送る履歴にも残る） */
const GREETING: ChatMessage = { role: 'model', content: 'こんにちは。AIコンシェルジュです。' }

describe('定数', () => {
  it('件数・文字数の上限がサーバーと同じ 40 件・2,000 文字になっている', () => {
    expect(MAX_SEND_MESSAGES).toBe(40)
    expect(MAX_MESSAGE_CHARS).toBe(2000)
  })
})

describe('clampContent', () => {
  it('2,000 文字ちょうどならそのまま返る', () => {
    const text = 'あ'.repeat(2000)
    expect(clampContent(text)).toBe(text)
  })

  it('2,001 文字なら先頭 2,000 文字に切られる', () => {
    const text = 'a'.repeat(1999) + 'bc'
    const result = clampContent(text)
    expect(result).toHaveLength(2000)
    expect(result.endsWith('b')).toBe(true)
  })

  it('短い本文や空文字はそのまま返る', () => {
    expect(clampContent('アガベ')).toBe('アガベ')
    expect(clampContent('')).toBe('')
  })

  it('絵文字（サロゲートペア）はコードポイント単位で数えられ、途中で壊れずに 2,000 個で切られる', () => {
    // 1. 絵文字 2,001 個（UTF-16 では 4,002 単位）を用意する
    const text = '🌱'.repeat(2001)
    // 2. 切った結果がコードポイントで 2,000 個・すべて完全な絵文字であることを確認する
    const result = clampContent(text)
    expect(Array.from(result)).toHaveLength(2000)
    expect(result).toBe('🌱'.repeat(2000))
    // 3. 壊れたサロゲート（単独の上位・下位サロゲート）が含まれていないこと
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(result)).toBe(false)
  })

  it('絵文字 1,000 個（UTF-16 では 2,000 単位）は切られない', () => {
    const text = '🌱'.repeat(1000)
    expect(clampContent(text)).toBe(text)
  })

  it('ASCII 1,999 文字 + 絵文字 2 個（コードポイント 2,001）のとき、最初の絵文字までが残る', () => {
    // UTF-16 の length は 2,003 だがコードポイントで 2,000 個目が最初の絵文字になる
    const text = 'a'.repeat(1999) + '🌱🌵'
    expect(clampContent(text)).toBe('a'.repeat(1999) + '🌱')
  })
})

describe('toSendHistory', () => {
  it('挨拶 → 質問a → エラー案内（localOnly）→ 質問b のとき「挨拶 → 質問b」になる', () => {
    // 1. 質問a はエラーで返事が付かなかった状態を作る
    const history: ChatMessage[] = [
      GREETING,
      { role: 'user', content: '質問a' },
      { role: 'model', content: 'エラーが発生しました', localOnly: true },
      { role: 'user', content: '質問b' },
    ]
    // 2. 案内と返事のない質問a が除かれ、user が続けて並ばないことを確認する
    expect(toSendHistory(history)).toEqual([
      { role: 'model', content: GREETING.content },
      { role: 'user', content: '質問b' },
    ])
  })

  it('返事の付いた往復はそのまま送られる', () => {
    const history: ChatMessage[] = [
      GREETING,
      { role: 'user', content: '質問1' },
      { role: 'model', content: '返答1' },
      { role: 'user', content: '質問2' },
    ]
    expect(toSendHistory(history)).toEqual(history.map(({ role, content }) => ({ role, content })))
  })

  it('localOnly の印は送る履歴に含まれない（role と content だけになる）', () => {
    const result = toSendHistory([GREETING, { role: 'user', content: '質問' }])
    for (const m of result) expect(Object.keys(m).sort()).toEqual(['content', 'role'])
  })

  it('61 件の履歴は直近 40 件になり、最後は今回の質問（user）のまま', () => {
    // 1. 挨拶 + 30 往復 = 61 件（最後は user）を作る
    const history: ChatMessage[] = [GREETING]
    for (let i = 0; i < 30; i++) {
      history.push({ role: 'user', content: `質問${i}` })
      history.push({ role: 'model', content: `返答${i}` })
    }
    history.push({ role: 'user', content: '最後の質問' })
    expect(history).toHaveLength(62)
    history.splice(1, 1) // 先頭の質問0を消して 61 件にする（挨拶 → 返答0 と model が続く形）
    expect(history).toHaveLength(61)

    // 2. 40 件・最後が user・直近のものが残ることを確認する
    const result = toSendHistory(history)
    expect(result).toHaveLength(40)
    expect(result[result.length - 1]).toEqual({ role: 'user', content: '最後の質問' })
    expect(result[result.length - 2]).toEqual({ role: 'model', content: '返答29' })
  })

  it('各本文が 2,000 文字以内に切られる（AI の長い返答が履歴に残っていても送れる）', () => {
    const history: ChatMessage[] = [
      GREETING,
      { role: 'user', content: '質問' },
      { role: 'model', content: 'x'.repeat(5000) },
      { role: 'user', content: 'y'.repeat(2500) },
    ]
    const result = toSendHistory(history)
    expect(result).toHaveLength(4)
    for (const m of result) expect(Array.from(m.content).length).toBeLessThanOrEqual(2000)
    expect(result[2].content).toBe('x'.repeat(2000))
    expect(result[3].content).toBe('y'.repeat(2000))
  })

  it('本文が空白・改行だけのメッセージは除かれる', () => {
    const history: ChatMessage[] = [
      GREETING,
      { role: 'user', content: '質問1' },
      { role: 'model', content: '  \n\t ' },
      { role: 'user', content: '質問2' },
    ]
    // 空白だけの返答が除かれると質問1 は返事なしになるので、質問1 も除かれる
    expect(toSendHistory(history)).toEqual([
      { role: 'model', content: GREETING.content },
      { role: 'user', content: '質問2' },
    ])
  })

  it('空白だけでない本文は前後の空白を削らずに送る', () => {
    const result = toSendHistory([GREETING, { role: 'user', content: '  アガベ  ' }])
    expect(result[1].content).toBe('  アガベ  ')
  })

  it('エラーが続いて返事のない質問が複数あっても、最後の質問だけが残る', () => {
    const history: ChatMessage[] = [
      GREETING,
      { role: 'user', content: '質問a' },
      { role: 'model', content: '回数の上限です', localOnly: true },
      { role: 'user', content: '質問b' },
      { role: 'model', content: '送れませんでした', localOnly: true },
      { role: 'user', content: '質問c' },
    ]
    expect(toSendHistory(history)).toEqual([
      { role: 'model', content: GREETING.content },
      { role: 'user', content: '質問c' },
    ])
  })

  it('送る履歴では user が 2 件続けて並ばない', () => {
    const history: ChatMessage[] = [
      GREETING,
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
      { role: 'model', content: '返答' },
      { role: 'user', content: 'c' },
    ]
    const result = toSendHistory(history)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].role === 'user' && result[i - 1].role === 'user').toBe(false)
    }
    expect(result[result.length - 1].role).toBe('user')
  })

  it('content が null・undefined・数値のメッセージを含んでも例外にならず、そのメッセージは除外される', () => {
    // 1. API が reply: null を返したときなど、文字列でない本文が履歴に入った状態を作る
    const history = [
      GREETING,
      { role: 'user', content: '質問a' },
      { role: 'model', content: null },
      { role: 'user', content: '質問b' },
      { role: 'model', content: undefined },
      { role: 'model', content: 123 },
      { role: 'user', content: '質問c' },
    ] as unknown as ChatMessage[]
    // 2. 例外にならないこと
    expect(() => toSendHistory(history)).not.toThrow()
    // 3. 文字列でない本文と、そのせいで返事の無くなった質問 a・b が除かれ「挨拶 → 質問c」になる
    expect(toSendHistory(history)).toEqual([
      { role: 'model', content: GREETING.content },
      { role: 'user', content: '質問c' },
    ])
  })
})
