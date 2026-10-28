import { useT } from '../lib/lang'

/**
 * 画面ごとに分けたプログラム（React.lazy で読み込むページ）を読み込んでいるあいだに、
 * 中身の部分にだけ出す控えめな表示。ヘッダー・フッター・サイドメニューはそのまま残るので、レイアウトは崩れない
 *
 * ページ遷移は React Router が startTransition で行うため、一度表示したあとの遷移では
 * 新しいページの読み込みが終わるまで今のページを出し続け、この表示はほとんど出ない（主に最初に開いたとき用）
 * @returns 読み込み中の表示
 */
export default function PageLoading() {
  // 読み込み中の文言を表示言語に合わせる関数
  const t = useT()
  return (
    // flex: 1 で中身の領域を埋め、フッターがヘッダーの直下に上がってこないようにする
    <div
      role="status"
      aria-live="polite"
      style={{ flex: 1, minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontSize: 13, letterSpacing: 1, color: 'var(--c-muted)' }}
    >
      {t('読み込み中...', 'Loading...')}
    </div>
  )
}
