import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const API = import.meta.env.VITE_API_URL ?? ''

interface ChatLog {
  id: string
  user_message: string
  ai_reply: string
  ip_hash: string | null
  created_at: string
}

const fmt = (s: string) =>
  new Date(s).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** AIチャット会話ログ閲覧画面 */
export default function AdminChatLogs() {
  const [logs, setLogs] = useState<ChatLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!supabase) return
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch(`${API}/api/chat-logs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      setLogs(res.ok ? await res.json() : [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>チャット履歴</h1>
        <span style={{ fontSize: 13, color: '#aaa' }}>{logs.length} 件</span>
      </div>

      {loading ? (
        <p style={{ color: '#888', fontSize: 14 }}>読み込み中...</p>
      ) : logs.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>まだ履歴がありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map((log) => {
            const open = expanded === log.id
            return (
              <div
                key={log.id}
                style={{ border: '1px solid #dddde8', borderRadius: 4, overflow: 'hidden', background: '#fff' }}
              >
                {/* 折りたたみヘッダー */}
                <button
                  onClick={() => setExpanded(open ? null : log.id)}
                  style={{
                    width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>{fmt(log.created_at)}</span>
                  <span style={{ fontSize: 14, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.user_message}
                  </span>
                  {log.ip_hash && (
                    <span style={{ fontSize: 10, color: '#ccc', flexShrink: 0, fontFamily: 'monospace' }}>
                      {log.ip_hash}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
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
