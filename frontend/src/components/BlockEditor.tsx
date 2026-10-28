import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Block } from '../lib/blocks'

/** BlockEditor に渡す値 */
interface Props {
  /** 今のブロック配列 */
  blocks: Block[]
  /** ブロック配列が変わったときに新しい配列を受け取る（呼び出し側の setState をそのまま渡せる） */
  onChange: (blocks: Block[]) => void
}

/** 見出し・本文の入力欄の共通の見た目 */
const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #dddde8',
  fontSize: 14, fontFamily: 'inherit', color: 'var(--c-ink)', background: '#fff',
  outline: 'none', padding: '9px 12px',
}

/** 画像ブロック（url を持つブロック） */
type ImageBlock = Extract<Block, { type: 'image' }>

/** 画像のアップロード中・失敗の状態（画像ブロックのオブジェクトごとに持つ。成功したら消す） */
type UploadState = 'uploading' | 'failed'

/**
 * 見出し・テキスト・画像ブロックをドラッグ不要で並べ替え・追加・削除できるエディタ（管理画面の記事・商品の本文用）
 * 管理画面だけで使うので、表示の文字は日本語だけにしている
 * @param blocks - 現在のブロック配列
 * @param onChange - ブロック配列変更時のコールバック
 * @returns エディタの要素
 */
export default function BlockEditor({ blocks, onChange }: Props) {
  // いちばん新しい blocks。画像のアップロードを待っているあいだに本文が打たれても、
  // アップロード完了時に古い blocks で上書きして入力を消さないよう、完了時はこちらを使う
  const blocksRef = useRef(blocks)
  useEffect(() => { blocksRef.current = blocks }, [blocks])
  // 画像ブロックごとのアップロードの状態。並べ替え・追加で位置（index）が変わっても追えるよう、
  // ブロックのオブジェクトそのものをキーにする（本文の入力では画像ブロックのオブジェクトは作り直されない）
  const [uploads, setUploads] = useState<Map<Block, UploadState>>(() => new Map())

  /**
   * アップロードの状態を 1 件変える
   * @param block - 対象の画像ブロック
   * @param state - 新しい状態（null なら消す）
   * @returns なし
   */
  const setUpload = (block: Block, state: UploadState | null) => {
    setUploads((prev) => {
      // Map は作り直さないと再描画されないので、写してから変える
      const next = new Map(prev)
      if (state) next.set(block, state)
      else next.delete(block)
      return next
    })
  }

  /**
   * index の位置のブロックを書き換える
   * @param i - 位置
   * @param patch - 変える項目
   * @returns 更新後のブロック配列を onChange に渡す
   */
  const update = (i: number, patch: Partial<Block>) =>
    onChange(blocks.map((b, idx) => idx === i ? { ...b, ...patch } as Block : b))

  /**
   * index の位置のブロックを削除する
   * @param i - 位置
   * @returns 削除後のブロック配列を onChange に渡す
   */
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i))

  /**
   * ブロックを 1 つ上か下へ動かす（端では何もしない）
   * @param i - 位置
   * @param dir - -1 なら上、1 なら下
   * @returns なし。端の位置ではブロック配列を変更しない
   */
  const move = (i: number, dir: -1 | 1) => {
    /** 入れ替え処理で元の blocks 配列を変更しないための複製 */
    const next = [...blocks]
    // 入れ替える相手の位置
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  /**
   * ブロックを追加する
   * @param afterIdx - この位置の後ろに追加する（-1 なら先頭）
   * @param block - 追加するブロック
   * @returns なし。追加後のブロック配列を onChange に渡す
   */
  const insert = (afterIdx: number, block: Block) => {
    /** 挿入処理で元の blocks 配列を変更しないための複製 */
    const next = [...blocks]
    next.splice(afterIdx + 1, 0, block)
    onChange(next)
  }

  /**
   * 画像ファイルをアップロードして、画像ブロックに URL を入れる
   * 1. アップロード前の画像ブロックを控え、「アップロード中」にする
   * 2. アップロードする
   * 3. 完了時点の最新の blocks から同じブロックを探して URL を入れる（そのあいだの本文の入力を消さない）。
   *    ブロックが削除されていたら何もしない
   * 4. 失敗したら「失敗」の表示にする
   * @param i - アップロードを始めたときの画像ブロックの位置
   * @param file - 選んだ画像ファイル
   * @returns なし。成功・失敗の状態をブロックに反映する
   */
  const handleImageFile = async (i: number, file: File) => {
    // 1. 対象のブロックを控えてアップロード中にする
    const target = blocks[i]
    setUpload(target, 'uploading')
    try {
      // 2. アップロード
      const url = await api.upload(file)
      // 3. 最新の blocks の中での今の位置を探し、URL を入れたブロックに差し替える
      /** アップロード開始後の入力を反映した最新のブロック一覧 */
      const latest = blocksRef.current
      /** 対象画像ブロックの現在位置（削除済みなら -1） */
      const idx = latest.indexOf(target)
      setUpload(target, null)
      if (idx < 0) return
      // URL を保存した画像ブロック。アップロード開始時のブロックを置き換える
      const replaced: ImageBlock = { type: 'image', url }
      onChange(latest.map((b, k) => (k === idx ? replaced : b)))
    } catch {
      // 4. 失敗の表示
      setUpload(target, 'failed')
    }
  }

  /**
   * 操作ボタンの見た目
   * @param color - 文字色
   * @param bg - 背景色
   * @returns 文字色と背景色を反映したボタン用 CSSProperties
   */
  const btnStyle = (color = '#fff', bg = '#1c2417'): React.CSSProperties => ({
    padding: '5px 12px', border: 'none', background: bg, color,
    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
  })

  /**
   * ブロックのあいだに出す「+ 見出し / + テキスト / + 画像」の追加ボタンの列。
   * 普段は薄く表示し、マウスを乗せるかキーボードで選んだときに濃くする（CSS の .block-editor-addbar）
   * @param afterIdx - この位置の後ろに追加する（-1 なら先頭）
   * @returns 追加ボタンの列
   */
  const AddBar = ({ afterIdx }: { afterIdx: number }) => (
    <div className="block-editor-addbar">
      <button type="button" style={btnStyle('#1c2417', '#f0f0f0')} onClick={() => insert(afterIdx, { type: 'heading', value: '' })}>+ 見出し</button>
      <button type="button" style={btnStyle('#1c2417', '#f0f0f0')} onClick={() => insert(afterIdx, { type: 'text', value: '' })}>+ テキスト</button>
      <button type="button" style={btnStyle('#1c2417', '#f0f0f0')} onClick={() => insert(afterIdx, { type: 'image', url: '' })}>+ 画像</button>
    </div>
  )

  return (
    <div>
      {/* 先頭に追加するボタンの列 */}
      <AddBar afterIdx={-1} />

      {/* ブロックごとに、本体・操作ボタン・その後ろに追加するボタンの列を出す */}
      {blocks.map((block, i) => (
        <div key={i}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
            {/* ブロック本体 */}
            <div style={{ flex: 1 }}>
              {/* 見出しは 1 行の入力欄 */}
              {block.type === 'heading' && (
                <input
                  aria-label="見出し"
                  style={{ ...inputBase, fontWeight: 500, fontSize: 15 }}
                  placeholder="見出し"
                  value={block.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              )}
              {/* テキストは高さを変えられる複数行の入力欄 */}
              {block.type === 'text' && (
                <textarea
                  aria-label="本文"
                  style={{ ...inputBase, height: 120, resize: 'vertical', lineHeight: 1.8 }}
                  placeholder="テキストを入力..."
                  value={block.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              )}
              {/* 画像は、URL があれば画像と「外す」ボタン、アップロード中は案内、それ以外はファイル選択 */}
              {block.type === 'image' && (
                <div style={{ border: '1px solid #dddde8', padding: 12, background: '#fafafa' }}>
                  {block.url ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={block.url} alt="" style={{ maxWidth: '100%', maxHeight: 200, display: 'block', objectFit: 'contain' }} />
                      <button
                        type="button"
                        aria-label="この画像を外す"
                        onClick={() => update(i, { url: '' })}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px 7px', fontSize: 12 }}
                      >
                        ×
                      </button>
                    </div>
                  ) : uploads.get(block) === 'uploading' ? (
                    <p role="status" style={{ margin: 0, padding: '8px 0', fontSize: 12, color: '#999' }}>アップロード中...</p>
                  ) : (
                    <label style={{ display: 'inline-block', padding: '8px 16px', border: '1px dashed #dddde8', cursor: 'pointer', fontSize: 12, color: '#999' }}>
                      {uploads.get(block) === 'failed' && (
                        <span role="alert" style={{ display: 'block', color: '#c0392b', marginBottom: 4 }}>アップロードに失敗しました。もう一度選んでください。</span>
                      )}
                      クリックして画像をアップロード
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          // 選んだファイル（1 つだけ）
                          const f = e.target.files?.[0]
                          if (f) handleImageFile(i, f)
                          // 同じファイルをもう一度選んでも onChange が起きるよう、選択を空に戻す
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
              <button type="button" aria-label="1つ上へ移動" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...btnStyle('#666', '#f0f0f0'), padding: '4px 8px' }}>↑</button>
              <button type="button" aria-label="1つ下へ移動" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} style={{ ...btnStyle('#666', '#f0f0f0'), padding: '4px 8px' }}>↓</button>
              <button type="button" aria-label="このブロックを削除" onClick={() => remove(i)} style={{ ...btnStyle('#c0392b', '#fff8f8'), padding: '4px 8px', border: '1px solid #f8d7da' }}>×</button>
            </div>
          </div>

          <AddBar afterIdx={i} />
        </div>
      ))}

      {/* ブロックが 1 つも無いときの案内 */}
      {blocks.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#ccc', padding: '16px 0' }}>
          上のボタンでブロックを追加してください
        </p>
      )}
    </div>
  )
}
