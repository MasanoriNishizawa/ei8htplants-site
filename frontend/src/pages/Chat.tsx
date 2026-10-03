import { useEffect, useRef, useState } from 'react'
import PageMeta from '../components/PageMeta'
import { useT } from '../lib/lang'

const API = import.meta.env.VITE_API_URL ?? ''

interface Message {
  role: 'user' | 'model'
  content: string
}

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g
// URL末尾に来やすい句読点・括弧類（日本語・ASCII）
const TRAILING_PUNCT = /[）」、。！？』】〕\)\].,;:!?'"]+$/

/** テキスト内のURLをリンクに変換して返す */
function renderWithLinks(line: string) {
  const parts = line.split(URL_SPLIT_RE)
  return parts.flatMap((part, i) => {
    if (!part.startsWith('http')) return [<span key={i}>{part}</span>]
    const url = part.replace(TRAILING_PUNCT, '')
    const trailing = part.slice(url.length)
    const link = <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecorationColor: 'currentColor' }}>{url}</a>
    return trailing ? [link, <span key={`${i}t`}>{trailing}</span>] : [link]
  })
}

/** メッセージ本文を改行・URL対応で表示するサブコンポーネント。
 * @param text - 表示するテキスト
 */
function MessageText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <span>
      {lines.map((line, i) => (
        <span key={i}>{renderWithLinks(line)}{i < lines.length - 1 && <br />}</span>
      ))}
    </span>
  )
}

/** 植物相談・ワークショップ案内AIチャットページ */
export default function Chat() {
  const t = useT()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatAreaRef = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)

  // 初回表示時のウェルカムメッセージ
  useEffect(() => {
    setMessages([{
      role: 'model',
      content: t(
        'こんにちは。ei8ht plants のAIコンシェルジュです。\n植物の育て方・管理のご相談や、ワークショップ・予約に関するご質問にお答えします。\nどうぞお気軽にご質問ください。',
        'Hello! I\'m the ei8ht plants AI concierge.\nI can help you with plant care, management advice, and questions about our workshops and reservations.\nFeel free to ask anything!'
      ),
    }])
  }, [])

  // メッセージ追加時にチャットエリア内を最下部へスクロール（初回ウェルカムメッセージは除く）
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const el = chatAreaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      if (res.status === 429) {
        setMessages([...next, {
          role: 'model',
          content: t(
            'メッセージの送信回数が上限に達しました。しばらく経ってからもう一度お試しください。',
            'You have reached the message limit. Please wait a moment and try again.'
          ),
        }])
        return
      }
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMessages([...next, { role: 'model', content: data.reply }])
    } catch {
      setMessages([...next, {
        role: 'model',
        content: t(
          '申し訳ありません、エラーが発生しました。しばらく経ってからもう一度お試しください。',
          'Sorry, an error occurred. Please try again later.'
        ),
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter で改行、Enter のみで送信（IME変換中は送信しない）
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      <PageMeta
        title={t('AI コンシェルジュ | ei8ht plants', 'AI Concierge | ei8ht plants')}
        description={t(
          '植物の育て方・管理のご相談や、ワークショップ・予約に関するご質問にAIがお答えします。',
          'Ask our AI about plant care, management tips, workshops, and reservations.'
        )}
      />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px 80px' }}>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif",
          fontSize: 'clamp(24px, 4vw, 36px)',
          fontWeight: 300,
          letterSpacing: '0.06em',
          margin: '0 0 8px',
          color: 'var(--c-ink)',
        }}>
          {t('AI コンシェルジュ', 'AI Concierge')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: '0 0 32px', letterSpacing: '0.03em' }}>
          {t(
            '植物の育て方・ワークショップに関するご質問にお答えします',
            'Ask about plant care and workshops'
          )}
        </p>

        {/* チャット表示エリア */}
        <div ref={chatAreaRef} style={{
          border: '1px solid #dddde8',
          borderRadius: 4,
          minHeight: 400,
          maxHeight: 560,
          overflowY: 'auto',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          background: '#fafafa',
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: msg.role === 'user' ? '#2d3a24' : '#ffffff',
                color: msg.role === 'user' ? '#ffffff' : 'var(--c-body)',
                fontSize: 14,
                lineHeight: 1.8,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                border: msg.role === 'model' ? '1px solid #eee' : 'none',
              }}>
                <MessageText text={msg.content} />
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: '12px 12px 12px 2px',
                background: '#ffffff',
                border: '1px solid #eee',
                fontSize: 14,
                color: 'var(--c-muted)',
              }}>
                ...
              </div>
            </div>
          )}

        </div>

        {/* 入力エリア */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('メッセージを入力（Enterで送信）', 'Type a message (Enter to send)')}
            rows={3}
            style={{
              flex: 1,
              padding: '12px 14px',
              border: '1px solid #dddde8',
              borderRadius: 4,
              fontSize: 14,
              fontFamily: 'inherit',
              lineHeight: 1.6,
              resize: 'none',
              outline: 'none',
              color: 'var(--c-body)',
              background: '#fff',
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            style={{
              padding: '12px 20px',
              background: input.trim() && !loading ? '#2d3a24' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontSize: 14,
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
              alignSelf: 'stretch',
            }}
          >
            {t('送信', 'Send')}
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#bbb', marginTop: 8, letterSpacing: '0.03em', lineHeight: 1.8 }}>
          {t(
            '※ AIの回答は参考情報です。詳細はお問い合わせフォームよりご確認ください。',
            '※ AI responses are for reference only. For details, please use the contact form.'
          )}<br />
          {t(
            '※ 会話内容はサービス品質向上のため記録されます。',
            '※ Conversations are logged to improve service quality.'
          )}
        </p>
      </div>
    </>
  )
}
