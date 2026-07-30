import { useRef } from 'react'
import { api } from '../lib/api'

export type Block =
  | { type: 'heading'; value: string }
  | { type: 'text'; value: string }
  | { type: 'image'; url: string }

interface Props {
  blocks: Block[]
  onChange: (blocks: Block[]) => void
}

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #dddde8',
  fontSize: 14, fontFamily: 'inherit', color: '#1c2417', background: '#fff',
  outline: 'none', padding: '9px 12px',
}

export function serializeBlocks(blocks: Block[]): string {
  return JSON.stringify(blocks)
}

export function parseBlocks(content: string | null | undefined): Block[] {
  if (!content) return []
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) return parsed
  } catch { /* fall through */ }
  // レガシー: ## 見出しテキストをブロックに変換
  const blocks: Block[] = []
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', value: line.replace(/^## /, '') })
    } else if (line.trim()) {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'text') {
        last.value += '\n' + line
      } else {
        blocks.push({ type: 'text', value: line })
      }
    }
  }
  return blocks
}

export default function BlockEditor({ blocks, onChange }: Props) {
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const update = (i: number, patch: Partial<Block>) =>
    onChange(blocks.map((b, idx) => idx === i ? { ...b, ...patch } as Block : b))

  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i))

  const move = (i: number, dir: -1 | 1) => {
    const next = [...blocks]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  const insert = (afterIdx: number, block: Block) => {
    const next = [...blocks]
    next.splice(afterIdx + 1, 0, block)
    onChange(next)
  }

  const handleImageFile = async (i: number, file: File) => {
    try {
      const url = await api.upload(file)
      update(i, { url } as any)
    } catch { /* ignore */ }
  }

  const btnStyle = (color = '#fff', bg = '#1c2417'): React.CSSProperties => ({
    padding: '5px 12px', border: 'none', background: bg, color,
    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
  })

  const AddBar = ({ afterIdx }: { afterIdx: number }) => (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '6px 0', opacity: 0.5 }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
    >
      <button style={btnStyle('#1c2417', '#f0f0f0')} onClick={() => insert(afterIdx, { type: 'heading', value: '' })}>+ 見出し</button>
      <button style={btnStyle('#1c2417', '#f0f0f0')} onClick={() => insert(afterIdx, { type: 'text', value: '' })}>+ テキスト</button>
      <button style={btnStyle('#1c2417', '#f0f0f0')} onClick={() => insert(afterIdx, { type: 'image', url: '' })}>+ 画像</button>
    </div>
  )

  return (
    <div>
      <AddBar afterIdx={-1} />

      {blocks.map((block, i) => (
        <div key={i}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
            {/* ブロック本体 */}
            <div style={{ flex: 1 }}>
              {block.type === 'heading' && (
                <input
                  style={{ ...inputBase, fontWeight: 500, fontSize: 15 }}
                  placeholder="見出し"
                  value={block.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              )}
              {block.type === 'text' && (
                <textarea
                  style={{ ...inputBase, height: 120, resize: 'vertical', lineHeight: 1.8 }}
                  placeholder="テキストを入力..."
                  value={block.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              )}
              {block.type === 'image' && (
                <div style={{ border: '1px solid #dddde8', padding: 12, background: '#fafafa' }}>
                  {block.url ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={block.url} alt="" style={{ maxWidth: '100%', maxHeight: 200, display: 'block', objectFit: 'contain' }} />
                      <button
                        onClick={() => update(i, { url: '' } as any)}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px 7px', fontSize: 12 }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label style={{ display: 'inline-block', padding: '8px 16px', border: '1px dashed #dddde8', cursor: 'pointer', fontSize: 12, color: '#999' }}>
                      クリックして画像をアップロード
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        ref={(el) => { fileRefs.current[i] = el }}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleImageFile(i, f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* 操作ボタン */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, paddingTop: 2 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...btnStyle('#666', '#f0f0f0'), padding: '4px 8px' }}>↑</button>
              <button onClick={() => move(i, 1)} disabled={i === blocks.length - 1} style={{ ...btnStyle('#666', '#f0f0f0'), padding: '4px 8px' }}>↓</button>
              <button onClick={() => remove(i)} style={{ ...btnStyle('#c0392b', '#fff8f8'), padding: '4px 8px', border: '1px solid #f8d7da' }}>×</button>
            </div>
          </div>

          <AddBar afterIdx={i} />
        </div>
      ))}

      {blocks.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#ccc', padding: '16px 0' }}>
          上のボタンでブロックを追加してください
        </p>
      )}
    </div>
  )
}
