import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useT } from '../lib/lang'

/**
 * 読み込みに失敗したときに出す控えめな案内と再読み込みボタン（公開サイト・管理画面の両方で使う）
 * クラスコンポーネントではフックを使えないため、日英の切り替え（useT）はこの関数コンポーネントで行う
 * @returns 案内の表示
 */
function LoadErrorFallback() {
  const t = useT()
  return (
    <div
      role="alert"
      style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--c-body)' }}>
        {t('ページを読み込めませんでした。再読み込みしてください。', 'Failed to load the page. Please reload.')}
      </p>
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

/** LoadErrorBoundary の state */
interface LoadErrorBoundaryState {
  /** 子の描画中にエラーが起きたかどうか（true なら案内に切り替える） */
  hasError: boolean
}

/**
 * 画面ごとに分けたファイル（React.lazy）の読み込み失敗などで、画面全体が真っ白にならないようにする境界
 * 子の描画でエラーが投げられたら、「ページを読み込めませんでした」の案内と再読み込みボタンに切り替える
 * （新しい版の公開で古いファイルが消えた・ネットワークが切れた、などで main.tsx の自動再読み込みが効かなかったとき用）
 * @param props.children - 包む中身
 * @returns 中身、またはエラー時の案内
 */
export default class LoadErrorBoundary extends Component<{ children: ReactNode }, LoadErrorBoundaryState> {
  state: LoadErrorBoundaryState = { hasError: false }

  /**
   * 子でエラーが起きたときに、案内を出す state に切り替える
   * @returns 新しい state
   */
  static getDerivedStateFromError(): LoadErrorBoundaryState {
    return { hasError: true }
  }

  /**
   * 原因を調べられるよう、エラーを開発者ツールのコンソールに出す
   * @param error - 投げられたエラー
   * @param info - どのコンポーネントで起きたか
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('画面の読み込みに失敗しました', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) return <LoadErrorFallback />
    return this.props.children
  }
}
