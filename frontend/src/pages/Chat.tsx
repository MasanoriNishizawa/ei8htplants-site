import { useEffect, useRef, useState } from 'react'
import PageMeta from '../components/PageMeta'
import { useT } from '../lib/lang'
import { api } from '../lib/api'
import { MAX_MESSAGE_CHARS, toSendHistory, type ChatMessage } from '../lib/chatHistory'

/** 画面に表示するチャットメッセージ（定義は lib/chatHistory.ts） */
type Message = ChatMessage

/** 本文を URL とそれ以外に分ける正規表現（括弧で囲んでいるので split の結果に URL も残る） */
const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g
/** URL末尾に来やすい句読点・括弧類（日本語・ASCII）。リンクから外して後ろに普通の文字として出す */
const TRAILING_PUNCT = /[）」、。！？』】〕)\].,;:!?'"]+$/

/**
 * テキスト内のURLをリンクに変換して返す
 * @param line - 1 行分の本文
 * @returns 文字とリンクの要素の配列
 */
function renderWithLinks(line: string) {
  // URL とそれ以外を交互に並べた配列
  const parts = line.split(URL_SPLIT_RE)
  return parts.flatMap((part, i) => {
    if (!part.startsWith('http')) return [<span key={i}>{part}</span>]
    // 末尾の句読点を除いた URL と、除いた句読点
    const url = part.replace(TRAILING_PUNCT, '')
    const trailing = part.slice(url.length)
    const link = <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecorationColor: 'currentColor' }}>{url}</a>
    return trailing ? [link, <span key={`${i}t`}>{trailing}</span>] : [link]
  })
}

/**
 * メッセージ本文を改行・URL対応で表示するサブコンポーネント
 * @param text - 表示するテキスト
 * @returns 行ごとに改行を入れた本文
 */
function MessageText({ text }: { text: string }) {
  // 改行で分けた行
  const lines = text.split('\n')
  return (
    <span>
      {lines.map((line, i) => (
        <span key={i}>{renderWithLinks(line)}{i < lines.length - 1 && <br />}</span>
      ))}
    </span>
  )
}

/**
 * 植物相談・ワークショップ案内AIチャットページ
 * @returns チャットの画面
 */
export default function Chat() {
  const t = useT()
  // 利用者と AI のやりとり（先頭の歓迎メッセージは含めない。下の welcome を毎回の表示で先頭に付ける）
  const [messages, setMessages] = useState<Message[]>([])
  // 入力欄の文字
  const [input, setInput] = useState('')
  // AI の返事を待っているあいだ true
  const [loading, setLoading] = useState(false)
  // チャットの表示エリア（新しいメッセージが来たら下までスクロールする）
  const chatAreaRef = useRef<HTMLDivElement>(null)
  // 最初の表示かどうか（最初はスクロールしない）
  const isFirstRender = useRef(true)

  // 歓迎メッセージ。state に入れず毎回 t() で作るので、言語を切り替えると表示も送る履歴も今の言語になる
  const welcome: Message = {
    role: 'model',
    content: t(
      'こんにちは。ei8ht plants のAIコンシェルジュです。\n植物の育て方・管理のご相談や、ワークショップ・予約に関するご質問にお答えします。\nどうぞお気軽にご質問ください。',
      'Hello! I\'m the ei8ht plants AI concierge.\nI can help you with plant care, management advice, and questions about our workshops and reservations.\nFeel free to ask anything!'
    ),
  }

  // メッセージ追加時にチャットエリア内を最下部へスクロール（初回ウェルカムメッセージは除く）
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const el = chatAreaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  /**
   * 入力したメッセージを送り、AI の返事を表示する
   * 1. 空・返事待ちなら何もしない
   * 2. 利用者のメッセージを画面に足し、入力欄を空にする
   * 3. API に会話履歴を送る
   * 4. 結果（回数制限・入力エラー・空の返事・成功・通信の失敗）ごとに表示を足す
   */
  const send = async () => {
    // 1. 送れるか確かめる
    const text = input.trim()
    if (!text || loading) return

    // 2. 利用者のメッセージを足す
    const userMsg: Message = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      // 3. 送信（api.chat.send は状態コードで案内を分けられるよう Response をそのまま返す）。
      //    送る履歴は、これまでどおり先頭に歓迎メッセージを付ける
      const res = await api.chat.send(toSendHistory([welcome, ...next]))
      // 4. 送信回数の上限（サーバーの回数制限）に達したときの案内。表示専用で履歴には入れない
      if (res.status === 429) {
        setMessages([...next, {
          role: 'model',
          content: t(
            'メッセージの送信回数が上限に達しました。しばらく経ってからもう一度お試しください。',
            'You have reached the message limit. Please wait a moment and try again.'
          ),
          localOnly: true,
        }])
        return
      }
      // 入力チェック（件数・文字数など）で弾かれたときの案内。表示専用で履歴には入れない
      if (res.status === 422) {
        setMessages([...next, {
          role: 'model',
          content: t(
            'メッセージを送れませんでした。内容を短くするか、ページを開き直してください。',
            'Your message could not be sent. Please shorten it or reload the page.'
          ),
          localOnly: true,
        }])
        return
      }
      // そのほかの失敗は下の catch で共通の案内にする
      if (!res.ok) throw new Error()
      // 応答の本文（reply に AI の返事が入る）
      const data = await res.json()
      // AI が安全フィルタなどで本文を返さなかった（reply が空・null）ときは、表示専用の案内にする。
      // 空の返事を履歴に入れると次の送信で壊れるため、送る履歴には入れない（返事の無い質問として除かれる）
      if (typeof data.reply !== 'string' || data.reply.trim() === '') {
        setMessages([...next, {
          role: 'model',
          content: t(
            'うまくお答えできませんでした。言い方を変えてもう一度お試しください。',
            'Sorry, I could not answer that. Please try rephrasing your question.'
          ),
          localOnly: true,
        }])
        return
      }
      // 返事を足す
      setMessages([...next, { role: 'model', content: data.reply }])
    } catch {
      // 通信の失敗・サーバーのエラー。表示専用で履歴には入れない
      setMessages([...next, {
        role: 'model',
        content: t(
          '申し訳ありません、エラーが発生しました。しばらく経ってからもう一度お試しください。',
          'Sorry, an error occurred. Please try again later.'
        ),
        localOnly: true,
      }])
    } finally {
      setLoading(false)
    }
  }

  /**
   * 入力欄でキーを押したとき、Enter だけなら送信する
   * @param e - キーボードのイベント
   */
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
        title={t('AI コンシェルジュ', 'AI Concierge')}
        description={t(
          '植物の育て方・管理のご相談や、ワークショップ・予約に関するご質問にAIがお答えします。',
          'Ask our AI about plant care, management tips, workshops, and reservations.'
        )}
      />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px 80px' }}>
        {/* ページの見出しと説明 */}
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

        {/* チャット表示エリア（中だけスクロールする） */}
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
          {/* 歓迎メッセージとやりとり。利用者は右寄せの濃い緑、AI は左寄せの白い吹き出し */}
          {[welcome, ...messages].map((msg, i) => (
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

          {/* 返事を待っているあいだの「...」 */}
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

        {/* 入力エリア（入力欄と送信ボタン。空・返事待ちのときは押せない） */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_MESSAGE_CHARS}
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

        {/* 注意書き */}
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
