// Node（Vitest）で API をモックする MSW のサーバー。テストの通信を本物のバックエンドに出さないために使う
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** handlers.ts の全ハンドラを登録したテスト用のモック。src/test/setup.ts で起動・リセット・終了する */
export const server = setupServer(...handlers)
