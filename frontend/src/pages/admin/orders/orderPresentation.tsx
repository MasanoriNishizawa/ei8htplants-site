/** 発送モーダルで選択できる配送会社 */
export const CARRIERS = ['ヤマト運輸', '佐川急便', '日本郵便（ゆうパック）', 'その他']

/** 注文ステータスの値と画面表示名の対応表 */
export const STATUS_LABELS: Record<string, string> = {
  paid: '支払済', shipped: '発送済', delivered: '配達完了', cancelled: 'キャンセル',
}

/** 注文詳細・発送モーダルでエラーを赤く目立たせる共通表示スタイル */
export const ORDER_ERROR_BOX_STYLE: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/** 配送会社などの入力欄で使う、注文管理画面の共通入力スタイル */
export const ORDER_INPUT_STYLE: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #dddde8', fontSize: 13,
  fontFamily: 'inherit', color: 'var(--c-ink)', background: '#fff',
  cursor: 'pointer', outline: 'none',
}

/** ステータス詳細の色付きバッジ表示に必要な値 */
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  paid:      { bg: '#fff3cd', color: '#856404' },
  shipped:   { bg: '#cce5ff', color: '#004085' },
  delivered: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}

/** 注文ステータスを色付きバッジで表示する。
 * @param props - バッジに表示するステータスキー
 * @returns 色付きのステータスバッジ
 */
export function StatusBadge({ status }: { status: string }) {
  /** ステータスに対応する配色。未登録値は灰色で表示する */
  const style = STATUS_COLORS[status] ?? { bg: '#f0f0f5', color: '#666' }
  /** ステータスキーに対応する日本語名。未知の値はそのまま表示する */
  const label = STATUS_LABELS[status] ?? status

  return (
    <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, background: style.bg, color: style.color, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}
