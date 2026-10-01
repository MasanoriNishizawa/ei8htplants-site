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
