/** 予約ステータスの表示ラベル・色・選択肢を定義する定数ファイル */
export const STATUS_LABELS: Record<string, string> = {
  pending: '受付済',
  confirmed: '受付済',
  cancelled: 'キャンセル',
}

export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#d4edda', color: '#155724' },
  confirmed: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}

// ドロップダウンに表示するステータス選択肢（確定済みの後方互換エイリアスは除外）
export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: '受付済' },
  { value: 'cancelled', label: 'キャンセル' },
]
