// 開発用の管理画面ログイン省略モードの判定（lib/devAuth.ts）のテスト
// SKIP_ADMIN_AUTH は読み込み時に決まる定数なので、環境変数を差し替えるたびにモジュールを読み込み直して確かめる
import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * 環境変数を差し替えたうえで devAuth.ts を読み込み直す
 * @param dev - import.meta.env.DEV の値（開発サーバーなら true、本番ビルドなら false）
 * @param skip - VITE_SKIP_ADMIN_AUTH の値（undefined なら未設定）
 * @returns 読み込み直した devAuth モジュール
 */
async function loadDevAuth(dev: boolean, skip: string | undefined) {
  // 1. 環境変数を差し替える
  vi.stubEnv('DEV', dev)
  vi.stubEnv('VITE_SKIP_ADMIN_AUTH', skip as string)
  // 2. キャッシュを捨てて読み込み直す（定数を作り直すため）
  vi.resetModules()
  return import('../devAuth')
}

describe('SKIP_ADMIN_AUTH', () => {
  afterEach(() => {
    // 差し替えた環境変数を元に戻す
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('開発サーバー（DEV）で VITE_SKIP_ADMIN_AUTH=true のとき true になる', async () => {
    const m = await loadDevAuth(true, 'true')
    expect(m.SKIP_ADMIN_AUTH).toBe(true)
  })

  it('本番ビルド（DEV=false）では VITE_SKIP_ADMIN_AUTH=true でも false になる', async () => {
    const m = await loadDevAuth(false, 'true')
    expect(m.SKIP_ADMIN_AUTH).toBe(false)
  })

  it('DEV でも VITE_SKIP_ADMIN_AUTH が未設定なら false になる', async () => {
    const m = await loadDevAuth(true, undefined)
    expect(m.SKIP_ADMIN_AUTH).toBe(false)
  })

  it('DEV でも VITE_SKIP_ADMIN_AUTH が "true" 以外（"1"・"TRUE"・"false"）なら false になる', async () => {
    for (const v of ['1', 'TRUE', 'false', '']) {
      const m = await loadDevAuth(true, v)
      expect(m.SKIP_ADMIN_AUTH, `VITE_SKIP_ADMIN_AUTH=${JSON.stringify(v)}`).toBe(false)
    }
  })

  it('DEV=true でも MODE が production なら VITE_SKIP_ADMIN_AUTH=true でも false になる', async () => {
    // vite build --mode development のように DEV と production が食い違っても、production では働かせない
    vi.stubEnv('MODE', 'production')
    const m = await loadDevAuth(true, 'true')
    expect(m.SKIP_ADMIN_AUTH).toBe(false)
  })

  it('MODE が production 以外（development・test）で DEV=true・VITE_SKIP_ADMIN_AUTH=true なら true になる', async () => {
    for (const mode of ['development', 'test']) {
      vi.stubEnv('MODE', mode)
      const m = await loadDevAuth(true, 'true')
      expect(m.SKIP_ADMIN_AUTH, `MODE=${mode}`).toBe(true)
    }
  })

  it('ダミートークンは "dev-skip-admin-auth" になっている', async () => {
    const m = await loadDevAuth(true, 'true')
    expect(m.DEV_SKIP_AUTH_TOKEN).toBe('dev-skip-admin-auth')
  })
})
