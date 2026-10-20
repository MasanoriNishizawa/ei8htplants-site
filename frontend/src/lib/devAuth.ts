// 開発用の管理画面ログイン省略モードの判定をまとめたファイル。
// lib/supabase.ts はテストで vi.mock により丸ごと差し替えられることが多いため、別ファイルに分けている

/**
 * 開発用の管理画面ログイン省略モードかどうか（E2E 用の `npm run mock:e2e` で true になる）。
 * true のとき、AdminLayout はログイン画面を出さず、api.ts の認証つきリクエストは
 * セッションが無ければダミーのトークン（DEV_SKIP_AUTH_TOKEN）を付けて送る（MSW のモックが受け取る）。
 *
 * 安全性: `import.meta.env.DEV` は `vite build`（本番ビルド）では false に置き換わるため、
 * 本番では VITE_SKIP_ADMIN_AUTH を何に設定しても常に false になり、ログイン省略・ダミートークンは働かない。
 * ただしビルド時のシェルに NODE_ENV=development があると DEV が true のままになるため、
 * 念のため「モードが production でないこと」も条件に加えている（npm run build は production モード）。
 * また本物のバックエンドはダミートークンを JWT として検証できないので、仮に送られても 401 になる。
 */
export const SKIP_ADMIN_AUTH: boolean =
  import.meta.env.DEV &&
  import.meta.env.MODE !== 'production' &&
  import.meta.env.VITE_SKIP_ADMIN_AUTH === 'true'

/** ログイン省略モードでセッションが無いときに Authorization に付けるダミーのトークン */
export const DEV_SKIP_AUTH_TOKEN = 'dev-skip-admin-auth'
