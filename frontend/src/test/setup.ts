// Vitest の全テストの前に読み込む準備ファイル（vitest.config.ts の setupFiles）。
// toBeInTheDocument などの判定を使えるようにし、API を MSW のモックで受ける
import '@testing-library/jest-dom/vitest'
import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from '../mocks/node'
// 保存（PUT）でメモリに持ったモックの値をテストごとに初期状態へ戻す
import { resetSavedMockData } from '../mocks/handlers'

// 全テストの前にモックを起動する。モックの無い通信は警告だけ出す（テストは止めない）
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  // 1. テスト内で上書きしたハンドラを戻す
  server.resetHandlers()
  // 2. 保存された管理情報・収支を消す
  resetSavedMockData()
})
// 全テストのあとにモックを止める
afterAll(() => server.close())
