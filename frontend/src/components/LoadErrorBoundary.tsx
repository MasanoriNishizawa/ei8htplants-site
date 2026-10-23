import { Component, type ErrorInfo, type ReactNode } from 'react'
import LoadErrorFallback from './LoadErrorFallback'

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
  /** 最初はエラーなし */
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

  /**
   * エラーがあれば案内を、なければ中身をそのまま描画する
   * @returns 案内、または中身
   */
  render() {
    if (this.state.hasError) return <LoadErrorFallback />
    return this.props.children
  }
}
