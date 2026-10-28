import { useId, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useT } from '../lib/lang'
import PageMeta from '../components/PageMeta'

/**
 * キャンセル ID に使える文字の範囲（英数字と - _ の 1〜64 文字）。
 * 新しい ID は約 22 文字、古い ID は 8 桁の数字で、どちらもこの範囲に入る
 */
const TOKEN_PATTERN = '[A-Za-z0-9_\\-]{1,64}'
/** キャンセル ID の最大の長さ（サーバーの上限と同じ） */
const TOKEN_MAX = 64

/**
 * ワークショップ予約をキャンセルするページ。メールのキャンセルIDを入力して実行する
 * @returns 予約キャンセルの画面
 */
export default function CancelReservation() {
  const t = useT()
  // URL のクエリ（メールのリンクから来たときは ?id= にキャンセル ID が入っている）
  const [params] = useSearchParams()
  // 入力中のキャンセル ID。クエリパラメータ ?id= があれば初期値として設定
  const [token, setToken] = useState(params.get('id') ?? '')
  // label と入力欄を結び付ける id
  const inputId = useId()
  // 送信の状態（idle: 入力中 / loading: 送信中 / done: キャンセル完了 / error: その他の失敗 / already: キャンセル済み / notfound: ID が見つからない / limited: 送信回数の上限）
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'already' | 'notfound' | 'limited' | 'error'>('idle')

  /**
   * キャンセルを送信する
   * 1. ID が空なら何もしない 2. API に送る 3. 応答のステータスコードに合わせて案内を切り替える
   * @param e - フォームの送信イベント（ページの再読み込みを止める）
   * @returns 戻り値なし。
   */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // 1. 空なら送らない
    if (!token.trim()) return
    setStatus('loading')
    try {
      // 2. 送信（前後の空白は除く）
      const res = await api.reserve.cancel(token.trim())
      // 3. 結果ごとの案内
      if (res.ok) {
        setStatus('done')
      } else if (res.status === 400) {
        // すでにキャンセル済みの場合
        setStatus('already')
      } else if (res.status === 404) {
        // キャンセルIDが見つからない場合
        setStatus('notfound')
      } else if (res.status === 429) {
        // 短い時間に何度も送った場合（サーバーの回数制限）
        setStatus('limited')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  // キャンセル ID の入力欄（大きめの等幅の文字）
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', border: '1px solid #ddd',
    fontSize: 16, fontFamily: 'monospace', outline: 'none', background: '#fff',
    boxSizing: 'border-box', color: 'var(--c-ink)', borderRadius: 0,
    letterSpacing: '0.05em',
    WebkitAppearance: 'none', appearance: 'none',
  }

  return (
    <>
      <PageMeta title={t('予約キャンセル', 'Cancel Reservation')} description={t('ワークショップ予約のキャンセルはこちらから。', 'Cancel your workshop reservation here.')} />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 20px 80px' }}>
        {/* ページの見出し */}
        <div style={{ textAlign: 'center', marginBottom: 40, paddingBottom: 32, borderBottom: '1px solid #dddde8' }}>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 14px' }}>Habitat Oides</p>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 200, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0, color: 'var(--c-ink)' }}>
            {t('予約キャンセル', 'Cancel Reservation')}
          </h1>
        </div>

        {/* キャンセルが済んだら完了の案内とイベント一覧へのリンク、それまでは入力フォームを出す */}
        {status === 'done' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: '#f5f5f8', border: '1px solid #dddde8', borderRadius: 4, padding: '36px 28px', marginBottom: 32 }}>
              <p style={{ fontSize: 18, fontWeight: 300, color: 'var(--c-ink)', margin: '0 0 12px' }}>{t('キャンセルが完了しました', 'Cancellation complete')}</p>
              <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.8, margin: 0 }}>
                {t(
                  <>ご予約のキャンセルを受け付けました。<br />またのご参加をお待ちしております。</>,
                  <>Your reservation has been cancelled.<br />We hope to see you at a future event.</>
                )}
              </p>
            </div>
            <Link to="/official/events" style={{ display: 'inline-block', padding: '12px 28px', border: '1px solid #dddde8', borderRadius: 4, color: 'var(--c-muted)', textDecoration: 'none', fontSize: 14 }}>
              {t('イベント一覧へ戻る', 'Back to Events')}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '36px' }}>
            <p style={{ fontSize: 14, color: 'var(--c-body)', lineHeight: 1.8, margin: '0 0 28px' }}>
              {t('確定メールに記載のキャンセルIDを入力してください。', 'Enter the cancellation ID from your confirmation email.')}
            </p>

            {/* キャンセル ID の入力欄 */}
            <div style={{ marginBottom: 24 }}>
              <label htmlFor={inputId} style={{ display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>
                {t('キャンセルID', 'Cancellation ID')}
              </label>
              <input
                id={inputId}
                required
                pattern={TOKEN_PATTERN}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                style={inputStyle}
                value={token}
                // 使えない文字（空白・記号など）はメールからの貼り付け時に混ざりやすいので取り除く
                onChange={(e) => setToken(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, TOKEN_MAX))}
                maxLength={TOKEN_MAX}
              />
            </div>

            {/* 失敗したときの案内（理由ごと） */}
            {status === 'notfound' && (
              <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px' }}>
                {t('キャンセルIDが見つかりません。メールをご確認ください。', 'Cancellation ID not found. Please check your confirmation email.')}
              </p>
            )}
            {status === 'already' && (
              <p role="alert" style={{ color: 'var(--c-muted)', fontSize: 13, margin: '0 0 16px' }}>
                {t('この予約はすでにキャンセル済みです。', 'This reservation has already been cancelled.')}
              </p>
            )}
            {status === 'limited' && (
              <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px' }}>
                {t('送信回数の上限に達しました。しばらく待ってからもう一度お試しください。', 'Too many attempts. Please wait a while and try again.')}
              </p>
            )}
            {status === 'error' && (
              <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px' }}>
                {t('エラーが発生しました。再度お試しください。', 'An error occurred. Please try again.')}
              </p>
            )}

            {/* 送信ボタン（送信中・未入力のときは押せない。未入力のときは薄く表示） */}
            <button
              type="submit"
              disabled={status === 'loading' || !token.trim()}
              style={{
                width: '100%', padding: 14, background: '#c0392b', color: '#fff',
                border: 'none', fontSize: 15, letterSpacing: '1px', cursor: 'pointer',
                fontFamily: 'inherit', borderRadius: 4,
                opacity: !token.trim() ? 0.5 : 1,
              }}
            >
              {status === 'loading' ? t('処理中...', 'Processing...') : t('予約をキャンセルする', 'Cancel Reservation')}
            </button>
          </form>
        )}
      </div>
    </>
  )
}
