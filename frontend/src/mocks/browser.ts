// ブラウザで API をモックする MSW の Service Worker（`npm run mock` / E2E 用。本物のバックエンドにはつながない）
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** handlers.ts の全ハンドラを登録したブラウザ用のモック。main.tsx でモックモードのときだけ start する */
export const worker = setupWorker(...handlers)
