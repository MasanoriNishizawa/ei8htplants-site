/*
 * 画面の移動で使う小さな型と関数
 *
 * 管理画面では「戻る」リンクの行き先を、移動するときの state（<Link state={{ from: '/admin/...' }}>）で渡している。
 * location.state は unknown なので、読む側はこの型・関数を通して安全に取り出す
 */

/** 戻り先を渡すときの location.state の形 */
export interface BackLinkState {
  /** 戻り先のパス（例: '/admin/finances'） */
  from?: string
}

/**
 * location.state から戻り先のパスを取り出す
 * @param state - useLocation().state（どんな値でもよい）
 * @param fallback - 戻り先が渡されていないときのパス
 * @returns 戻り先のパス
 */
export function backPathFrom(state: unknown, fallback: string): string {
  if (typeof state === 'object' && state !== null) {
    // 遷移 state に含まれる戻り先候補
    const from = (state as BackLinkState).from
    if (typeof from === 'string' && from) return from
  }
  return fallback
}
