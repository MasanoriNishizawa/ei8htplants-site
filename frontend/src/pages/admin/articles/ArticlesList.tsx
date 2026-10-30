import type { Article } from '../../../lib/api'
import { formatJstDate } from '../../../lib/localDate'

/**
 * 記事一覧の表示に必要なデータと操作を定義する。
 */
interface ArticlesListProps {
  /** 一覧に表示する記事。 */
  articles: Article[]
  /** 記事一覧を取得しているか。 */
  loading: boolean
  /** ページに一覧エラーが表示されているか。 */
  hasPageError: boolean
  /** 操作中の記事 ID。該当記事の操作ボタンを無効化する。 */
  busyId: string | null
  /** 指定した記事の公開状態を切り替える。 */
  onTogglePublish: (article: Article) => void
  /** 指定した記事の編集画面を開く。 */
  onEdit: (article: Article) => void
  /** 指定した記事の削除を開始する。 */
  onDelete: (article: Article) => void
}

/**
 * 公開日を日本時間の「2026/01/02」形式にする。
 * 1. 日時がない場合は一覧で使う記号を返す。
 * 2. 値がある場合は共通の日付整形関数で表示する。
 *
 * @param publishedAt - 記事の公開日時。未公開の場合は null。
 * @returns 一覧に表示する公開日。
 */
function formatPublishedDate(publishedAt: string | null): string {
  if (!publishedAt) return '—'
  return formatJstDate(publishedAt, true)
}

/**
 * 記事の読み込み表示、一覧表、記事がない場合の表示を描画する。
 * 記事の取得や公開切替・編集・削除の処理は親から受け取る。
 *
 * @param props - 記事一覧のデータと親ページの操作コールバック。
 * @returns 記事一覧の表示。
 */
export default function ArticlesList({
  articles,
  loading,
  hasPageError,
  busyId,
  onTogglePublish,
  onEdit,
  onDelete,
}: ArticlesListProps) {
  // 1. 読み込み中は表を出さず、完了後に一覧と空状態を表示する。
  return loading ? <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p> : (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
            {['画像', 'タイトル', 'タグ', '公開日', '状態', '操作'].map((heading) => (
              <th key={heading} style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--c-body)', whiteSpace: 'nowrap' }}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {articles.map((article) => (
            <tr key={article.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
              {/* 1枚目の画像（無ければ灰色の四角） */}
              <td style={{ padding: '10px 14px' }}>
                {article.image_urls[0]
                  ? <img src={article.image_urls[0]} alt="" style={{ width: 48, height: 48, objectFit: 'cover', display: 'block', border: '1px solid #dddde8' }} />
                  : <div style={{ width: 48, height: 48, background: '#f5f5f8', border: '1px solid #dddde8' }} />}
              </td>
              <td style={{ padding: '10px 14px', maxWidth: 240 }}>
                <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.title}</p>
              </td>
              <td style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {article.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 11, padding: '2px 8px', background: '#f0f0f5', color: '#666' }}>{tag}</span>
                  ))}
                </div>
              </td>
              <td style={{ padding: '10px 14px', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>{formatPublishedDate(article.published_at)}</td>
              {/* 公開状態（押すとその場で切り替える） */}
              <td style={{ padding: '10px 14px' }}>
                <button
                  onClick={() => onTogglePublish(article)}
                  disabled={busyId === article.id}
                  aria-label={`「${article.title}」の公開状態を切り替える（いまは${article.is_published ? '公開中' : '非公開'}）`}
                  style={{
                    padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontFamily: 'inherit',
                    background: article.is_published ? '#d4edda' : '#f0f0f5',
                    color: article.is_published ? '#155724' : '#666',
                  }}
                >
                  {article.is_published ? '公開中' : '非公開'}
                </button>
              </td>
              <td style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => onEdit(article)} style={{ padding: '5px 14px', border: '1px solid #dddde8', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>
                  <button onClick={() => onDelete(article)} disabled={busyId === article.id} style={{ padding: '5px 14px', border: '1px solid #f8d7da', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#c0392b' }}>削除</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!hasPageError && articles.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>記事がありません。</p>}
    </div>
  )
}
