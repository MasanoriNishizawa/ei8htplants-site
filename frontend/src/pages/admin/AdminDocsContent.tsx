/**
 * 設計書ビューアーの本文領域を、読み込み状態に応じて表示する部品。
 * 本文の取得・変換やリンク処理は親画面が行い、この部品は受け取った状態とイベントを描画へ反映する。
 * @param props - 選択状態、本文、表示状態、スクロール用参照、本文リンクのクリック処理
 * @returns 設計書本文領域の JSX
 */
export default function AdminDocsContent({
  selected,
  loading,
  error,
  content,
  contentAreaRef,
  contentRef,
  onContentClick,
}: {
  /** URL から得た選択中の設計書パス。未選択なら空文字 */
  selected: string
  /** 本文を取得中か */
  loading: boolean
  /** 本文の取得に失敗したときの表示文言 */
  error: string
  /** Markdown を変換・無害化してリンク処理を済ませた HTML */
  content: string
  /** スマホで本文先頭へ移動するための領域参照 */
  contentAreaRef: React.RefObject<HTMLDivElement | null>
  /** 見出しへのスクロール先を探すための本文参照 */
  contentRef: React.RefObject<HTMLDivElement | null>
  /** 本文中の内部リンクを親画面で処理するコールバック */
  onContentClick: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  return (
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
        /* 本文のクリックは親画面のコールバックでまとめて受ける */
        <div
          ref={contentRef}
          className="docs-markdown"
          onClick={onContentClick}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
    </div>
  )
}
