import { useEffect, useState } from 'react'
import { api, type ChatLog } from '../../lib/api'
import { failMessage } from './errorMessage'

/**
 * 日時を「月/日 時:分」の短い形にする
 * @param s - ISO 形式の日時
 * @returns 表示用の文字列
 */
const fmt = (s: string) =>
  new Date(s).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * AIチャット会話ログ閲覧画面（/admin/chat-logs）
 * 1行ごとに日時と質問の冒頭を出し、押すとユーザーの質問と AI の返答の全文を開く
 * @returns 会話ログの一覧
 */
export default function AdminChatLogs() {
  /** 会話ログ（新しい順・最大 200 件） */
  const [logs, setLogs] = useState<ChatLog[]>([])
  /** 読み込み中か */
  const [loading, setLoading] = useState(true)
  /** 開いているログの id（null なら全部閉じている） */
  const [expanded, setExpanded] = useState<string | null>(null)
  /** 読み込みの失敗の文言（空なら失敗なし） */
  const [error, setError] = useState('')

  // 画面を開いたときにログを読み込む。失敗したら一覧を空にしてエラーを出す
  useEffect(() => {
    // 1. 保存されている会話ログを取得して一覧へ反映する
    api.chatLogs.list()
      .then(setLogs)
      .catch((e: unknown) => {
        // 2. 読み込みに失敗したら一覧を空にし、利用者へ理由を表示する
        setLogs([])
        setError(failMessage('チャット履歴の読み込みに失敗しました', e))
      })
      .finally(() => {
        // 3. 成功・失敗のどちらでも読み込み表示を終了する
        setLoading(false)
      })
  }, [])

  return (
    <div style={{ maxWidth: 800 }}>
      {/* 見出しと件数 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>チャット履歴</h1>
        <span style={{ fontSize: 13, color: '#aaa' }}>{logs.length} 件</span>
      </div>

      {/* 読み込みの失敗 */}
      {error && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, background: '#fdf0ef', padding: '10px 14px', borderRadius: 4 }}>{error}</p>
      )}
      {/* 読み込み中・履歴なし・一覧（失敗したときは何も出さない） */}
      {loading ? (
        <p style={{ color: '#888', fontSize: 14 }}>読み込み中...</p>
      ) : error ? null : logs.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>まだ履歴がありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map((log) => {
            /** この行が開いているかどうか */
            const open = expanded === log.id
            return (
              <div
                key={log.id}
                style={{ border: '1px solid #dddde8', borderRadius: 4, overflow: 'hidden', background: '#fff' }}
              >
                {/* 折りたたみヘッダー */}
                <button
                  onClick={() => setExpanded(open ? null : log.id)}
                  aria-expanded={open}
                  style={{
                    width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>{fmt(log.created_at)}</span>
                  <span style={{ fontSize: 14, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.user_message}
                  </span>
                  {/* 送信元を見分ける値（IP アドレスをハッシュにしたもの。無ければ出さない） */}
                  {log.ip_hash && (
                    <span style={{ fontSize: 10, color: '#ccc', flexShrink: 0, fontFamily: 'monospace' }}>
                      {log.ip_hash}
                    </span>
                  )}
                  <span aria-hidden="true" style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
                </button>

                {/* 展開時の詳細 */}
                {open && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f0f0f0' }}>
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ background: '#f5f5f5', borderRadius: 4, padding: '10px 14px' }}>
                        <p style={{ margin: '0 0 4px', fontSize: 11, color: '#999', letterSpacing: '0.05em' }}>ユーザー</p>
                        <p style={{ margin: 0, fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{log.user_message}</p>
                      </div>
                      <div style={{ background: '#f0f4ee', borderRadius: 4, padding: '10px 14px' }}>
                        <p style={{ margin: '0 0 4px', fontSize: 11, color: '#999', letterSpacing: '0.05em' }}>AI</p>
                        <p style={{ margin: 0, fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{log.ai_reply}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
