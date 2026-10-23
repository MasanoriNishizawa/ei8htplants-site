import { useT } from '../lib/lang'

interface Props {
  /** 「再読み込み」ボタンを押したときの処理（useApi の reload）。省略するとボタンを出さない */
  onRetry?: () => void
  /** 案内文を変えたいときに渡す。省略時は共通の「読み込めませんでした」 */
  message?: string
}

/**
 * 公開ページで、データの読み込みに失敗したときに出す共通の案内。
 * 通信の失敗を「まだありません」と誤表示しないよう、一覧が空のときの表示とは分けて使う。
 * 読み上げソフトにすぐ伝わるよう role="alert" を付ける
 * @param onRetry - 再読み込みの処理（省略可）
 * @param message - 案内文（省略可）
 * @returns 案内と再読み込みボタン
 */
export default function LoadError({ onRetry, message }: Props) {
  const t = useT()
  return (
    // 案内の枠。一覧の代わりに中央寄せで出す
    <div role="alert" style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-muted)', fontSize: 14, lineHeight: 1.9 }}>
      <p style={{ margin: '0 0 16px' }}>
        {message ?? t(
          '読み込めませんでした。通信状況をご確認のうえ、もう一度お試しください。',
          'Could not load the content. Please check your connection and try again.',
        )}
      </p>
      {onRetry && (
        // 再読み込みボタン。枠線だけの控えめなボタン
        <button
          type="button"
          onClick={onRetry}
          style={{ padding: '8px 22px', border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink)', cursor: 'pointer', fontSize: 13, letterSpacing: 1, fontFamily: 'inherit' }}
        >
          {t('再読み込み', 'Retry')}
        </button>
      )}
    </div>
  )
}
