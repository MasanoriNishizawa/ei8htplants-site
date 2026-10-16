import '@testing-library/jest-dom/vitest'
import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from '../mocks/node'
// 保存（PUT）でメモリに持ったモックの値をテストごとに初期状態へ戻す
import { resetSavedMockData } from '../mocks/handlers'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  // 1. テスト内で上書きしたハンドラを戻す
  server.resetHandlers()
  // 2. 保存された管理情報・収支を消す
  resetSavedMockData()
})
afterAll(() => server.close())
