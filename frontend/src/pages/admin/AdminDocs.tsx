import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api, type DocTreeNode } from '../../lib/api'
import { processDocLinks } from './docLinks'

/** 設計書のファイルツリーの1項目（api.ts の型をこの画面ではこの名前で使う） */
type TreeNode = DocTreeNode

/**
 * 設計書ファイルツリーを再帰的に描画するサイドバーコンポーネント
 * @param nodes - 表示するツリーノード一覧
 * @param selected - 現在選択中のファイルパス
 * @param onSelect - ファイル選択時のコールバック
 * @param depth - 現在のネスト深さ（インデント計算用）
 * @returns フォルダとファイルのボタンを並べたリスト（開いているフォルダの中は再帰で描画する）
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
  /** フォルダのパス → 開いているかどうか */
  const [open, setOpen] = useState<Record<string, boolean>>({})

  /**
   * フォルダが開いているかどうか。自分で開閉していないフォルダは、選択中のファイルを含むときだけ開く
   * （設計書の中のリンクから別のフォルダのファイルを開いたとき、ツリーでもそのファイルが見えるようにする）
   * @param path - フォルダのパス
   * @returns 開いていれば true
   */
  const isOpen = (path: string) => open[path] ?? selected.startsWith(`${path}/`)

  /**
   * フォルダの開閉を切り替える
   * @param path - フォルダのパス
   */
  const toggle = (path: string) =>
    setOpen((prev) => ({ ...prev, [path]: !(prev[path] ?? selected.startsWith(`${path}/`)) }))

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {nodes.map((node) => (
        <li key={node.path}>
          {/* フォルダは開閉ボタン（開いていれば中身を1段深く描画）、ファイルは選ぶボタン（.md は表示しない） */}
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

/** スマホ幅（index.css の .admin-docs の切り替えと同じ 768px 以下）かどうか */
const isNarrowScreen = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches

/**
 * 設計書（Markdown ファイル）をサイドバーのツリーから選択してビューアーで閲覧するページ。
 * 開いている設計書は URL の ?path= に入れるので、ブラウザの戻るで前の設計書に戻れ、URL を直接開いても同じ設計書が開く。
 * 768px 以下では目次（折りたたみ可）を上、本文を下に縦に並べる（index.css の .admin-docs）
 * @returns 左（スマホでは上）のファイルツリーと右（スマホでは下）の本文
 */
export default function AdminDocs() {
  /** URL のクエリ（?path= に開いている設計書の doc/ からのパスを入れる） */
  const [searchParams, setSearchParams] = useSearchParams()
  /** 選択中のファイルのパス（URL の ?path= から読む。未選択は空文字） */
  const selected = searchParams.get('path') ?? ''
  /** doc/ のファイルツリー */
  const [tree, setTree] = useState<TreeNode[]>([])
  /** スマホで目次を開いているか（PC では CSS で常に表示する）。最初に設計書が指定されていなければ開いておく */
  const [tocOpen, setTocOpen] = useState(() => !searchParams.get('path'))
  /** 本文の欄の外枠（スマホで設計書を選んだとき、ここまでスクロールする） */
  const contentAreaRef = useRef<HTMLDivElement>(null)
  /** 次の描画の後に本文の先頭までスクロールするか（スマホで設計書を選んだときに true にする） */
  const scrollBodyPending = useRef(false)
  /** 表示する本文の HTML（Markdown を変換し、DOMPurify で無害化したもの） */
  const [content, setContent] = useState('')
  /** 本文を読み込み中か */
  const [loading, setLoading] = useState(false)
  /** 目次（ファイルツリー）の読み込みの失敗の文言。目次の欄に出す */
  const [treeError, setTreeError] = useState('')
  /** 本文の読み込みの失敗の文言。本文の欄に出す（別の設計書を選んだり、未選択に戻ったりしたら消す） */
  const [error, setError] = useState('')
  /**
   * 最後に選んだファイルの読み込みの番号。
   * 続けて別のファイルを選んだとき、先に選んだファイルの応答が後から届いても上書きしないために使う
   */
  const latestRequest = useRef(0)
  /** 本文を表示した後にスクロールする見出しの id（リンクの #見出し。無ければ空文字） */
  const [pendingAnchor, setPendingAnchor] = useState('')
  /** 本文の欄の要素（見出しを探してスクロールするため） */
  const contentRef = useRef<HTMLDivElement>(null)

  // 初回マウント時にファイルツリーを取得する（依存配列空 = マウント時1回のみ実行）
  useEffect(() => {
    api.docs.tree()
      .then(setTree)
      .catch(() => setTreeError('設計書ツリーの取得に失敗しました'))
  }, [])

  /**
   * ファイルを選ぶ（ツリー・本文の .md リンクの両方から呼ぶ。今開いているファイルなら見出しへのスクロールだけ）
   * 1. URL の ?path= を変える（履歴に積むので、ブラウザの戻るで前の設計書に戻れる）。読み込みは下の useEffect が行う
   * 2. スマホでは目次を閉じ、本文が見える位置までスクロールする
   * @param path - 選んだファイルのパス
   * @param anchor - 表示した後にスクロールする見出しの id（省略時は先頭を表示）
   */
  const selectFile = (path: string, anchor = '') => {
    // 同じファイルを選び直したときは読み込み直さない（見出しの指定があればそこへスクロールするだけ）
    if (path === selected) {
      if (anchor) scrollToAnchor(anchor)
      return
    }
    // 1. URL に反映する。読み込み中の表示もここで同時に出し、前の本文のまま見出しを探してしまわないようにする
    setPendingAnchor(anchor)
    setLoading(true)
    setSearchParams({ path })
    // 2. スマホでは本文を見せる
    if (isNarrowScreen()) {
      setTocOpen(false)
      // 目次を閉じた後の位置で本文の先頭へスクロールしたいので、描画後の useEffect に任せる
      if (!anchor) scrollBodyPending.current = true
    }
  }

  // スマホで設計書を選んだ後、目次が閉じて描画し直されてから本文の先頭までスクロールする
  useEffect(() => {
    if (!scrollBodyPending.current) return
    scrollBodyPending.current = false
    contentAreaRef.current?.scrollIntoView?.({ block: 'start' })
  }, [selected, tocOpen])

  /**
   * 本文を読み込んで表示する
   * 1. この読み込みに番号を振る
   * 2. 本文を取得して Markdown を HTML に変換し、DOMPurify で無害化する
   *    （設計書は管理者しか書けないが、Markdown にはそのまま HTML を書けるので、念のためスクリプト等を取り除く）
   *    無害化の後で、本文の中のリンク（.md・外部・#見出し）と見出しの id を整える（docLinks.ts）
   * 3. その間に別のファイルが選ばれていたら、結果を捨てる（最後に選んだファイルだけを表示する）
   * @param path - 読み込むファイルのパス
   */
  const loadFile = async (path: string) => {
    // 1. 番号を振る
    /** この読み込みの番号 */
    const requestId = ++latestRequest.current
    setLoading(true)
    setError('')
    try {
      // 2. 取得・変換・無害化
      /** Markdown の本文 */
      const text = await api.docs.content(path)
      /** 無害化してリンクを整えた HTML */
      const html = processDocLinks(DOMPurify.sanitize(await marked.parse(text)), path)
      // 3. 古い応答は捨てる
      if (requestId !== latestRequest.current) return
      setContent(html)
    } catch {
      if (requestId !== latestRequest.current) return
      setError('ファイルの取得に失敗しました')
      setContent('')
    } finally {
      if (requestId === latestRequest.current) setLoading(false)
    }
  }

  // URL の ?path= が変わったら（ツリー・リンクで選んだとき、ブラウザの戻る・進む、URL を直接開いたとき）その本文を読み込む
  useEffect(() => {
    if (!selected) {
      // 未選択に戻ったら（戻るで ?path= の無い URL に戻ったとき）本文を消す
      latestRequest.current++
      setContent('')
      setLoading(false)
      setError('')
      return
    }
    void loadFile(selected)
  }, [selected])

  /**
   * 見出しの id の要素までスクロールする
   * @param anchor - 見出しの id
   * @returns 見つかってスクロールしたら true
   */
  const scrollToAnchor = (anchor: string): boolean => {
    // id に記号や日本語が入っていてもよいよう、セレクターを組み立てずに id を比べて探す
    /** 見つかった見出しの要素 */
    const el = Array.from(contentRef.current?.querySelectorAll('[id]') ?? []).find((n) => n.id === anchor)
    if (!el) return false
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return true
  }

  // 本文を表示し終えたら、リンクで指定された見出しまでスクロールする（無ければ何もしない）
  useEffect(() => {
    if (loading || !content || !pendingAnchor) return
    scrollToAnchor(pendingAnchor)
    setPendingAnchor('')
  }, [loading, content, pendingAnchor])

  /**
   * 本文の中のリンクのクリックを受け取る（リンクは HTML の文字列で入れているので、まとめてここで受ける）
   * 1. 設計書（.md）へのリンクは、画面を移動せずにそのファイルを開く（同じファイルなら見出しへスクロールするだけ）
   * 2. 同じファイルの中の見出しへのリンクは、URL を変えずにスクロールする
   * 3. 外部リンクなどはブラウザに任せる（外部は新しいタブで開く）
   * @param e - クリックのイベント
   */
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ctrl・Cmd を押しながらのクリック（新しいタブで開く操作）はブラウザに任せる
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    /** 押されたリンクの要素（リンク以外を押したときは null） */
    const link = (e.target as HTMLElement).closest('a')
    if (!link) return
    /** 開く設計書の doc/ からのパス（設計書へのリンクでなければ null） */
    const docPath = link.getAttribute('data-doc-path')
    /** スクロールする見出しの id（無ければ空文字） */
    const anchor = link.getAttribute('data-doc-anchor') ?? ''
    // 1. 設計書へのリンク
    if (docPath) {
      e.preventDefault()
      if (docPath === selected) {
        if (anchor) scrollToAnchor(anchor)
      } else {
        void selectFile(docPath, anchor)
      }
      return
    }
    // 2. 同じファイルの中の見出し
    if (anchor) {
      e.preventDefault()
      scrollToAnchor(anchor)
    }
    // 3. それ以外は何もせず、ブラウザの動きに任せる
  }

  return (
    <div className="admin-docs" style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 80px)' }}>
      {/* サイドバー（目次）。スマホでは本文の上に置き、tocOpen が false のときはツリーを隠す */}
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
          {/* 目次の開閉ボタン（スマホだけ。PC では index.css で隠す） */}
          <button
            type="button"
            className="admin-docs-toc-toggle"
            onClick={() => setTocOpen((v) => !v)}
            aria-expanded={tocOpen}
            aria-controls="admin-docs-tree"
            style={{ display: 'none', background: 'none', border: '1px solid #dddde8', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: 'var(--c-body)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {tocOpen ? '目次を閉じる' : '目次を開く'}
          </button>
        </div>
        {/* 目次の読み込みの失敗（目次を閉じていても見えるよう、ツリーの外に出す） */}
        {treeError && (
          <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 8px 12px' }}>{treeError}</p>
        )}
        <div id="admin-docs-tree" className="admin-docs-tree">
          <FileTree nodes={tree} selected={selected} onSelect={selectFile} />
        </div>
      </aside>

      {/* コンテンツ */}
      <div ref={contentAreaRef} className="admin-docs-body" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', minWidth: 0 }}>
        {/* 本文の読み込みの失敗 */}
        {error && !loading && (
          <p role="alert" style={{ color: '#c0392b', fontSize: 14 }}>{error}</p>
        )}
        {/* ファイルを選ぶ前の案内 */}
        {!selected && (
          <p style={{ color: 'var(--c-muted)', fontSize: 14 }}>
            目次からファイルを選択してください。
          </p>
        )}
        {loading && <p style={{ color: 'var(--c-muted)', fontSize: 14 }}>読み込み中...</p>}
        {content && !loading && !error && (
          /* 本文（リンクのクリックは handleContentClick でまとめて受ける） */
          <div
            ref={contentRef}
            className="docs-markdown"
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </div>
  )
}
