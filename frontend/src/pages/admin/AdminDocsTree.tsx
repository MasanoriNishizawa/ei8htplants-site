import { useState } from 'react'
import type { DocTreeNode } from '../../lib/api'

/** 設計書ツリーを描画するために使うノード型。 */
type TreeNode = DocTreeNode

/**
 * 設計書のフォルダとファイルを再帰的に表示するリスト。
 * フォルダの開閉状態は各階層のコンポーネントで保持し、未操作のフォルダは選択中のファイルを含む場合に開く。
 * @param nodes - 表示する階層のノード一覧
 * @param selected - 現在選択中のファイルパス
 * @param onSelect - ファイルが選択されたときの通知先
 * @param depth - 現在の階層。左側のインデント計算に使う
 * @returns フォルダとファイルのボタンを含むリスト
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
  /** この階層でユーザーが明示的に開閉したフォルダの状態。 */
  const [open, setOpen] = useState<Record<string, boolean>>({})

  /**
   * ユーザーが開閉を指定していないフォルダは、選択中ファイルの親なら開いた状態にする。
   * @param path - 開閉を判定するフォルダパス
   * @returns フォルダが開いていれば true
   */
  const isOpen = (path: string) => open[path] ?? selected.startsWith(`${path}/`)

  /**
   * フォルダの現在状態を反転し、この階層の state に保存する。
   * @param path - 開閉するフォルダパス
   * @returns 戻り値なし
   */
  const toggle = (path: string) =>
    setOpen((prev) => ({ ...prev, [path]: !(prev[path] ?? selected.startsWith(`${path}/`)) }))

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {nodes.map((node) => (
        <li key={node.path}>
          {/* フォルダは開閉操作、ファイルは選択操作として表示する。Markdown 拡張子は表示名から除く。 */}
          {node.type === 'dir' ? (
            <>
              <button
                onClick={() => toggle(node.path)}
                aria-expanded={isOpen(node.path)}
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
                <span aria-hidden="true" style={{ fontSize: 10 }}>{isOpen(node.path) ? '▼' : '▶'}</span>
                {node.name}
              </button>
              {isOpen(node.path) && node.children && (
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
              aria-current={selected === node.path ? 'true' : undefined}
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

/**
 * 設計書ページの目次サイドバーとファイルツリーを表示する。
 * ツリー取得や URL 更新、目次開閉の state は親ページに残し、操作結果だけ callback で通知する。
 * @param nodes - API から取得した設計書ツリー
 * @param selected - URL から決まる現在選択中のファイルパス
 * @param tocOpen - スマートフォン表示で目次が開いているか
 * @param treeError - ツリー取得に失敗したときの表示文言
 * @param onSelect - ファイル選択時に親へパスを通知する関数
 * @param onToggleToc - 目次開閉ボタンが押されたときに親へ通知する関数
 * @returns 目次見出し、目次開閉ボタン、エラー表示、再帰ツリー
 */
export default function AdminDocsTree({
  nodes,
  selected,
  tocOpen,
  treeError,
  onSelect,
  onToggleToc,
}: {
  nodes: TreeNode[]
  selected: string
  tocOpen: boolean
  treeError: string
  onSelect: (path: string) => void
  onToggleToc: () => void
}) {
  return (
    <aside
      className={`admin-docs-toc${tocOpen ? '' : ' toc-collapsed'}`}
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 12px 8px' }}>
        <h2
          style={{
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--c-muted)',
            margin: 0,
            fontWeight: 400,
          }}
        >
          設計書
        </h2>
        {/* スマートフォンでは目次を開閉し、aria-controls でツリー領域を示す。 */}
        <button
          type="button"
          className="admin-docs-toc-toggle"
          onClick={onToggleToc}
          aria-expanded={tocOpen}
          aria-controls="admin-docs-tree"
          style={{ display: 'none', background: 'none', border: '1px solid #dddde8', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: 'var(--c-body)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {tocOpen ? '目次を閉じる' : '目次を開く'}
        </button>
      </div>
      {/* エラー文はツリー表示の開閉状態にかかわらず目次欄で確認できる。 */}
      {treeError && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 8px 12px' }}>{treeError}</p>
      )}
      <div id="admin-docs-tree" className="admin-docs-tree">
        <FileTree nodes={nodes} selected={selected} onSelect={onSelect} />
      </div>
    </aside>
  )
}
