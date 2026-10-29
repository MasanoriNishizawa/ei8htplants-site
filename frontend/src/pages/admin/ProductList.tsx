import type { Product } from '../../lib/api'
import { formatYen } from '../../lib/format'

/** 商品一覧の表示に必要な値と、行ごとの操作を親画面へ渡すための型 */
interface ProductListProps {
  /** 一覧に表示する商品 */
  products: Product[]
  /** 商品一覧を読み込み中か */
  loading: boolean
  /** 商品一覧の操作で発生したエラー。空の場合はエラーなし */
  pageError: string
  /** 削除または公開切り替えを処理中の商品 ID */
  busyId: string | null
  /** 商品の公開状態を切り替える親画面の処理 */
  onTogglePublish: (product: Product) => void
  /** 商品の編集モーダルを開く親画面の処理 */
  onEdit: (product: Product) => void
  /** 商品を削除する親画面の処理 */
  onDelete: (product: Product) => void
}

/**
 * 管理画面の商品一覧を表示し、操作を親画面へ通知する。
 * 1. 読み込み中は読み込み表示を出す
 * 2. 商品の表と、エラーがない場合だけ空一覧の案内を表示する
 * @param props - 表示する商品、状態、親画面の操作関数
 * @returns 商品一覧の表示
 */
export default function ProductList({
  products,
  loading,
  pageError,
  busyId,
  onTogglePublish,
  onEdit,
  onDelete,
}: ProductListProps) {
  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #dddde8', textAlign: 'left' }}>
            {/* 「操作」の列はスマホでは右端に固定する（index.css の .admin-sticky-col。横にスクロールしても編集・削除が見える） */}
            {['画像', '商品名', 'カテゴリー', '価格', '在庫', '状態', '操作'].map((heading) => (
              <th
                key={heading}
                className={heading === '操作' ? 'admin-sticky-col' : undefined}
                style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--c-body)', whiteSpace: 'nowrap', ...(heading === '操作' ? { background: 'var(--c-bg)' } : {}) }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
              {/* 1枚目の画像（無ければ灰色の四角） */}
              <td style={{ padding: '10px 14px' }}>
                {product.image_urls[0] ? (
                  <img src={product.image_urls[0]} alt="" style={{ width: 48, height: 48, objectFit: 'cover', display: 'block', border: '1px solid #dddde8' }} />
                ) : <div style={{ width: 48, height: 48, background: '#f5f5f8', border: '1px solid #dddde8' }} />}
              </td>
              <td style={{ padding: '10px 14px' }}>{product.name}</td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>{product.category ?? '—'}</td>
              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{formatYen(product.price)}</td>
              <td style={{ padding: '10px 14px', color: product.stock === 0 ? '#c0392b' : '#1c2417' }}>{product.stock}</td>
              {/* 公開状態（押すとその場で切り替える） */}
              <td style={{ padding: '10px 14px' }}>
                <button
                  onClick={() => onTogglePublish(product)}
                  disabled={busyId === product.id}
                  aria-label={`「${product.name}」の公開状態を切り替える（いまは${product.is_published ? '公開中' : '非公開'}）`}
                  style={{
                    padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontFamily: 'inherit',
                    background: product.is_published ? '#d4edda' : '#f0f0f5',
                    color: product.is_published ? '#155724' : '#666',
                  }}
                >
                  {product.is_published ? '公開中' : '非公開'}
                </button>
              </td>
              {/* 編集・削除（スマホでは右端に固定する） */}
              <td className="admin-sticky-col" style={{ padding: '10px 14px', background: 'var(--c-bg)', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => onEdit(product)} style={{ padding: '5px 14px', border: '1px solid #dddde8', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>
                  <button onClick={() => onDelete(product)} disabled={busyId === product.id} style={{ padding: '5px 14px', border: '1px solid #f8d7da', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#c0392b' }}>削除</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {products.length === 0 && !pageError && <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-muted)' }}>商品がありません。</p>}
    </div>
  )
}
