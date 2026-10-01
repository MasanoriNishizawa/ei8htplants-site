import { useEffect, useState } from 'react'
import { marked } from 'marked'

const API = import.meta.env.VITE_API_URL ?? ''

type TreeNode = {
  type: 'file' | 'dir'
  name: string
  path: string
  children?: TreeNode[]
}

/**
 * 設計書ファイルツリーを再帰的に描画するサイドバーコンポーネント
 * @param nodes - 表示するツリーノード一覧
 * @param selected - 現在選択中のファイルパス
 * @param onSelect - ファイル選択時のコールバック
 * @param depth - 現在のネスト深さ（インデント計算用）
 */
function FileTree({
  nodes,
  selected,
  onSelect,
  depth = 0,
}: {
  nodes: TreeNode[]
  selected: string
  onSelect: (path: string) => void
  depth?: number
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const toggle = (path: string) =>
    setOpen((prev) => ({ ...prev, [path]: !prev[path] }))

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {nodes.map((node) => (
        <li key={node.path}>
          {node.type === 'dir' ? (
            <>
              <button
                onClick={() => toggle(node.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: `6px 8px 6px ${depth * 12 + 8}px`,
                  fontSize: 13,
                  color: 'var(--c-muted)',
                  letterSpacing: '0.5px',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 10 }}>{open[node.path] ? '▼' : '▶'}</span>
                {node.name}
              </button>
              {open[node.path] && node.children && (
                <FileTree
                  nodes={node.children}
                  selected={selected}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              )}
            </>
          ) : (
            <button
              onClick={() => onSelect(node.path)}
              style={{
                display: 'block',
                width: '100%',
                background: selected === node.path ? '#f0f4ee' : 'none',
                border: 'none',
                cursor: 'pointer',
                padding: `6px 8px 6px ${depth * 12 + 20}px`,
                fontSize: 13,
                color: selected === node.path ? 'var(--c-ink)' : 'var(--c-body)',
                textAlign: 'left',
                fontFamily: 'inherit',
                borderRadius: 4,
              }}
            >
              {node.name.replace(/\.md$/, '')}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** 設計書（Markdown ファイル）をサイドバーのツリーから選択してビューアーで閲覧するページ */
export default function AdminDocs() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [selected, setSelected] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 初回マウント時にファイルツリーを取得する（依存配列空 = マウント時1回のみ実行）
  useEffect(() => {
    fetch(`${API}/api/docs/tree`)
      .then((r) => r.json())
      .then(setTree)
      .catch(() => setError('設計書ツリーの取得に失敗しました'))
  }, [])

  const selectFile = async (path: string) => {
    setSelected(path)
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/docs/content?path=${encodeURIComponent(path)}`)
      if (!res.ok) throw new Error()
      const text = await res.text()
      setContent(await marked.parse(text))
    } catch {
      setError('ファイルの取得に失敗しました')
      setContent('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 80px)' }}>
      {/* サイドバー */}
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid #dddde8',
          padding: '16px 8px',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 80px)',
          position: 'sticky',
          top: 0,
        }}
      >
        <h2
          style={{
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--c-muted)',
            margin: '0 0 12px 8px',
            fontWeight: 400,
          }}
        >
          設計書
        </h2>
        {error && !content && (
          <p style={{ fontSize: 13, color: '#c0392b', padding: '0 8px' }}>{error}</p>
        )}
        <FileTree nodes={tree} selected={selected} onSelect={selectFile} />
      </aside>

      {/* コンテンツ */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', minWidth: 0 }}>
        {!selected && (
          <p style={{ color: 'var(--c-muted)', fontSize: 14 }}>
            左のツリーからファイルを選択してください。
          </p>
        )}
        {loading && <p style={{ color: 'var(--c-muted)', fontSize: 14 }}>読み込み中...</p>}
        {error && content === '' && !loading && (
          <p style={{ color: '#c0392b', fontSize: 14 }}>{error}</p>
        )}
        {content && !loading && (
          <div
            className="docs-markdown"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </div>
  )
}
