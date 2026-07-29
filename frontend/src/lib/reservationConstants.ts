export const STATUS_LABELS: Record<string, string> = {
  pending: '未確認',
  confirmed: '確定',
  cancelled: 'キャンセル',
}

export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fff3cd', color: '#856404' },
  confirmed: { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}
