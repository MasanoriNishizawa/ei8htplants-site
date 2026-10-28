import { useEffect, useState } from 'react'
import { api, type ContactRecord } from '../../lib/api'
import { clickableProps } from './a11y'
import { failMessage } from './errorMessage'
import { confirmDiscard, useEscapeToClose, useUnsavedChanges } from './UnsavedChanges'

/** 返信モーダルの入力内容 */
interface ReplyState {
  /** 返信するお問い合わせの id */
  contactId: string
  /** 送信先（お問い合わせのメールアドレス） */
  email: string
  /** 件名 */
  subject: string
  /** 本文 */
  body: string
  /** 開いたときの件名（変更があるかの判定に使う） */
  initialSubject: string
  /** 開いたときの本文（変更があるかの判定に使う） */
  initialBody: string
}

/**
 * お問い合わせ一覧の確認・既読管理・メール返信を行うページ
 * @returns お問い合わせの一覧と返信モーダル
 */
export default function AdminContacts() {
  /** お問い合わせの一覧 */
  const [contacts, setContacts] = useState<ContactRecord[]>([])
  /** 一覧を読み込み中か */
  const [loading, setLoading] = useState(true)
  /** 本文を開いているお問い合わせの id（null なら全部閉じている） */
  const [expanded, setExpanded] = useState<string | null>(null)
  /** 既読の切り替え・返信の送信の失敗の文言（3 秒で消える） */
  const [updateError, setUpdateError] = useState<string | null>(null)
  /** 一覧の読み込みの失敗の文言（消えない） */
  const [loadError, setLoadError] = useState('')
  /** 返信モーダルの入力内容（null なら閉じている） */
  const [reply, setReply] = useState<ReplyState | null>(null)
  /** 返信を送信中か */
  const [replySending, setReplySending] = useState(false)
  /** 返信を送ったメールアドレス（送信完了の案内に使う。4 秒で消える） */
  const [replyDone, setReplyDone] = useState<string | null>(null)

  /** 返信モーダルに、開いたときから変更があるか */
  const replyDirty = !!reply && (reply.subject !== reply.initialSubject || reply.body !== reply.initialBody)
  // 書きかけの返信があるあいだは、サイドメニューでの移動・再読み込みでも確認を出す
  useUnsavedChanges(replyDirty)

  /**
   * 一覧を読み込む。失敗したら「お問い合わせはありません」と区別できるようエラーを出す
   * @returns 読み込みが終わる Promise
   */
  const load = () => api.contact.list()
    .then(setContacts)
    .catch((e: unknown) => setLoadError(failMessage('お問い合わせの読み込みに失敗しました', e)))
    .finally(() => setLoading(false))
  // 画面を開いたときに一覧を読み込む
  useEffect(() => { load() }, [])

  /**
   * 返信モーダルを閉じる（キャンセル・×・暗い背景・Esc。記事・商品のモーダルと同じ扱い）。
   * 送信中は閉じず、書きかけの内容があれば確認する
   * @returns 戻り値なし。
   */
  const closeReply = () => {
    if (replySending) return
    if (!confirmDiscard(replyDirty)) return
    setReply(null)
  }
  // 返信モーダルを開いているあいだは Esc キーでも閉じる
  useEscapeToClose(reply !== null, closeReply)

  /**
   * 既読・未読を切り替える。失敗したら 3 秒エラーを出す
   * @param c - 対象のお問い合わせ
   * @returns 戻り値なし。
   */
  const toggleRead = async (c: ContactRecord) => {
    try {
      await api.contact.markRead(c.id, !c.is_read)
      setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, is_read: !c.is_read } : x))
    } catch (e) {
      setUpdateError(failMessage('更新に失敗しました', e))
      setTimeout(() => setUpdateError(null), 3000)
    }
  }

  /**
   * 返信モーダルを開き、件名・本文のひな形を入れる
   * @param c - 返信するお問い合わせ
   * @returns 戻り値なし。
   */
  const openReply = (c: ContactRecord) => {
    /** 件名のひな形 */
    const subject = `Re: ei8ht plants お問い合わせ`
    /** 本文のひな形（宛名とお礼の一文） */
    const body = `${c.name} 様\n\nお問い合わせいただきありがとうございます。\n\n`
    setReply({ contactId: c.id, email: c.email, subject, body, initialSubject: subject, initialBody: body })
  }

  /**
   * 返信メールを送る
   * 1. 送信中にする
   * 2. 送れたら該当のお問い合わせを既読にし、モーダルを閉じて完了の案内を出す
   * 3. 失敗したらモーダルを開いたまま（入力は残る）エラーを出す
   * 4. 送信中を戻す
   * @returns 戻り値なし。
   */
  const sendReply = async () => {
    if (!reply) return
    // 1. 送信中にする
    setReplySending(true)
    try {
      // 2. 送信と既読・完了の案内
      await api.contact.reply(reply.contactId, reply.subject, reply.body)
      setContacts((prev) => prev.map((x) => x.id === reply.contactId ? { ...x, is_read: true } : x))
      setReplyDone(reply.email)
      setReply(null)
      setTimeout(() => setReplyDone(null), 4000)
    } catch (e) {
      // 3. 失敗
      setUpdateError(failMessage('返信の送信に失敗しました', e))
      setTimeout(() => setUpdateError(null), 3000)
    } finally {
      // 4. 送信中を戻す
      setReplySending(false)
    }
  }

  /** 未読の件数（見出しの横のバッジ） */
  const unreadCount = contacts.filter((c) => !c.is_read).length

  /** 返信モーダルの件名・本文の入力欄の見た目（件名の input では resize を外して使う） */
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #dddde8',
    borderRadius: 4, fontSize: 14, fontFamily: 'inherit', background: '#ffffff',
    boxSizing: 'border-box', resize: 'vertical' as const,
  }

  return (
    <div>
      {/* 見出しと未読の件数のバッジ */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>お問い合わせ</h2>
        {unreadCount > 0 && (
          <span style={{ background: '#c0392b', color: '#fff', borderRadius: 4, fontSize: 12, padding: '2px 10px', fontWeight: 600 }}>
            未読 {unreadCount}
          </span>
        )}
      </div>

      {/* 読み込みの失敗・操作の失敗・返信の完了の案内 */}
      {loadError && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, marginBottom: 12, padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>
          {loadError}
        </p>
      )}
      {updateError && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, marginBottom: 12, padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>
          {updateError}
        </p>
      )}
      {replyDone && (
        <p style={{ color: '#2d5a2d', fontSize: 13, marginBottom: 12, padding: '8px 14px', background: '#f0f6f0', borderRadius: 4, border: '1px solid #b0d4b0' }}>
          {replyDone} に返信を送信しました。
        </p>
      )}

      {/* お問い合わせの一覧（未読は黄色の背景） */}
      {loading ? (
        <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contacts.map((c) => (
            <div key={c.id} style={{ background: c.is_read ? '#ffffff' : '#fef9f0', border: `1px solid ${c.is_read ? '#dddde8' : '#e8c870'}`, borderRadius: 4, overflow: 'hidden' }}>
              {/* 行を押すと本文を開閉する。中の「既読」「返信」ボタンは押しても開閉しない（stopPropagation） */}
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '14px 18px', cursor: 'pointer', alignItems: 'center' }}
                {...clickableProps(() => setExpanded(expanded === c.id ? null : c.id), expanded === c.id)}
              >
                {/* 左: 未読の印・名前・メールアドレス・受信日時 */}
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                    {!c.is_read && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#e8a020', flexShrink: 0 }} />}
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>{c.email}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>
                    {new Date(c.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {/* 右: 既読の切り替え・返信・開閉の印 */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={(e) => { e.stopPropagation(); toggleRead(c) }}
                    style={{ padding: '6px 14px', border: '1px solid #dddde8', borderRadius: 2, fontSize: 12, cursor: 'pointer', background: '#fff', color: 'var(--c-body)', whiteSpace: 'nowrap' }}>
                    {c.is_read ? '未読に戻す' : '既読にする'}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); openReply(c) }}
                    style={{ padding: '6px 14px', border: '1px solid #4a6741', borderRadius: 2, fontSize: 12, cursor: 'pointer', background: '#f0f6f0', color: '#4a6741', whiteSpace: 'nowrap' }}>
                    返信
                  </button>
                  <span aria-hidden="true" style={{ fontSize: 14, color: 'var(--c-muted)', transform: expanded === c.id ? 'rotate(180deg)' : 'none', transition: '0.2s', display: 'inline-block' }}>▼</span>
                </div>
              </div>
              {/* 開いているときの本文 */}
              {expanded === c.id && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f0f0f5' }}>
                  <p style={{ fontSize: 15, color: 'var(--c-ink)', lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: '14px 0 0' }}>{c.message}</p>
                </div>
              )}
            </div>
          ))}
          {contacts.length === 0 && !loadError && <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>お問い合わせはありません。</p>}
        </div>
      )}

      {/* 返信モーダル（暗い背景を押したら、書きかけがあれば確認してから閉じる） */}
      {reply && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeReply() }}>
          <div role="dialog" aria-modal="true" aria-labelledby="contact-reply-title" style={{ background: '#fff', borderRadius: 4, padding: 32, width: '100%', maxWidth: 560, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 id="contact-reply-title" style={{ margin: 0, fontWeight: 500, fontSize: 18 }}>返信: {reply.email}</h3>
              <button onClick={closeReply} aria-label="閉じる" style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--c-muted)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="contact-reply-subject" style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: 'var(--c-muted)', marginBottom: 6 }}>件名</label>
              <input id="contact-reply-subject" style={{ ...inputStyle, resize: undefined }} value={reply.subject} onChange={(e) => setReply({ ...reply, subject: e.target.value })} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="contact-reply-body" style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: 'var(--c-muted)', marginBottom: 6 }}>本文</label>
              <textarea id="contact-reply-body" rows={10} style={inputStyle} value={reply.body} onChange={(e) => setReply({ ...reply, body: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={closeReply} style={{ padding: '10px 20px', border: '1px solid #dddde8', borderRadius: 4, background: 'none', cursor: 'pointer', fontSize: 14 }}>キャンセル</button>
              <button onClick={sendReply} disabled={replySending} style={{ padding: '10px 24px', border: 'none', borderRadius: 4, background: 'var(--c-ink)', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
                {replySending ? '送信中...' : '送信する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
