import { useT } from '../lib/lang'

/**
 * 読み込みに失敗したときに出す控えめな案内と再読み込みボタン（公開サイト・管理画面の両方で使う）
 * クラスコンポーネントではフックを使えないため、日英の切り替え（useT）はこの関数コンポーネントで行う
 * @returns 案内の表示
 */
export default function LoadErrorFallback() {
  const t = useT()
  return (
    <div
      role="alert"
      style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}
    >
      {/* 案内文 */}
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--c-body)' }}>
        {t('ページを読み込めませんでした。再読み込みしてください。', 'Failed to load the page. Please reload.')}
      </p>
      {/* 押すとページ全体を読み込み直す */}
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ padding: '10px 24px', background: 'none', border: '1px solid var(--c-border)', borderRadius: 4, fontSize: 13, letterSpacing: 1, color: 'var(--c-ink)', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {t('再読み込み', 'Reload')}
      </button>
    </div>
  )
}
