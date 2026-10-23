// ESLint の設定（ESLint 9 の flat config 形式）。`npx eslint .`（npm run lint）で確認する。
// TypeScript の推奨ルール（typescript-eslint）と、React のフックの使い方のルール（eslint-plugin-react-hooks）を使う
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // 1. 確認しないフォルダ（ビルド結果・テストの結果・依存パッケージ・MSW が作るファイル）
  {
    ignores: ['dist', 'coverage', 'test-results', 'playwright-report', 'node_modules', 'public/mockServiceWorker.js'],
  },
  // 2. アプリと設定ファイルの TypeScript 全体に当てるルール
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // フックの呼び出し順のルール（rules-of-hooks）と依存配列の確認（exhaustive-deps）
      ...reactHooks.configs.recommended.rules,
      // 共通フック useApi の依存配列も useEffect と同じように確認する
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '(useApi)' }],
      // 開発中の画面の自動更新（Fast Refresh）が効くよう、部品のファイルからは部品だけを書き出す（警告のみ）
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 使っていない変数は、名前を _ で始めたものだけ許す
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // 3. テスト（Vitest・Playwright）と Node で動く設定ファイルは Node のグローバル変数も使える
  {
    files: ['**/__tests__/**/*.{ts,tsx}', 'e2e/**/*.ts', 'src/test/**/*.ts', 'src/mocks/**/*.ts', '*.config.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
)
