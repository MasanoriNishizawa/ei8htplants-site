# ei8htplants-site — 開発ルールと体制

> **【最優先】チャットの出力はすべて日本語で書く。** 途中経過・報告・エラーの説明も含め、英語の文を出さない（コマンド名・ファイル名・API パスなどの固有表記はそのままでよい）。担当への指示と担当からの報告も日本語で書く。

ei8ht plants / Habitat Oides / HUE by ei8ht plants の公式サイト・管理画面。
- バックエンド: FastAPI（`backend/app/`）＋ Supabase（DB・Storage）＋ Resend（メール）
- フロントエンド: React 19 + TypeScript + Vite（`frontend/src`）。ビルド結果は `frontend/dist/` に出力してコミットする
- 本番: Render（`main` ブランチへのプッシュで自動デプロイ）

## 体制（マルチエージェント）

メインのセッションが **PM** として依頼を受け、担当に振り分けて結果をまとめる。担当は `.claude/agents/` に定義している。

| 担当 | 役割 |
|---|---|
| PM（メインのセッション） | 依頼の整理・仕様決定・担当への指示・結果確認・ユーザーへの報告・コミットとプッシュ |
| `frontend` | `frontend/src` の実装・修正（画面・CSS）。コミット・プッシュはしない |
| `backend` | `backend/app/` の実装・修正（API・DB）。コミット・プッシュはしない |
| `test-engineer` | 自動テストの追加・実行（`frontend/src/**/__tests__/`・`frontend/e2e/`・`backend/tests/`）。アプリのコードは直さない |
| `qa` | 実装後のコードレビューとデグレ確認（コードは直さない。報告だけ） |
| `docs` | `doc/` 設計書・テストケース一覧の更新。コミット・プッシュはしない |
| `docs-reviewer` | プッシュ前の設計書の確認（管理画面での表示・文章の正確さ）。直さず報告 |

### 作業の流れ

1. **PM**: 依頼を仕様に落とす。決められないことだけユーザーに聞く
2. **実装**: `frontend` / `backend` に仕様を渡す（両方必要なら API の形を先に決めてから並行して進める）
3. **テスト**: `test-engineer` に、変更した動作を確かめるテストの追加と全テスト実行を依頼する。失敗があれば実装担当に戻す
4. **レビュー**: `qa` にコードレビューとデグレ確認を依頼する。問題があれば実装担当に戻す
5. **記録**: `docs` に設計書・テストケース一覧の更新を依頼する（**機能を変えたら毎回必ず**）
6. **設計書の確認（プッシュ前に毎回）**: `docs-reviewer` に、更新した設計書の管理画面での表示と文章を確認してもらう。問題があれば `docs` に戻して直し、もう一度確認する
7. **仕上げ（PM）**: `python scripts/run_tests.py --note "何を変えたか"` で全テスト → `frontend/dist/` と `doc/` を含めてコミット → `main` にプッシュ

**プッシュしてよい条件**：設計書が更新済み・`docs-reviewer` の確認で問題なし・`scripts/run_tests.py` が ✅。どれかが欠けていたらプッシュしない。

担当は同時に同じ作業フォルダで作業することがある。**`git stash`・`git reset`・`git checkout -- ファイル`・`git clean` など、コミットしていない変更を退避・取り消す操作は担当は行わない**。変更前と比べたいときは `git diff` や `git show HEAD:ファイル` を使う。コミット・プッシュは PM だけが行う。

小さな修正（1〜2ファイル・数行）は担当に振らず PM が直接行ってよい。その場合もテスト・記録・レビューの手順は省かない。

## 全員が守るルール

### コメント
すべてのソースに日本語で詳しいコメントを書く。
- 関数・コンポーネント: 何をするか・引数・戻り値（TS は JSDoc の `@param`/`@returns`、Python は docstring）
- 処理の中: 「1. 〜 2. 〜」のステップコメント
- 変数・state・定数: 何を入れているか
- CSS: どの要素に当たるか・どんな設定か

### ビルドとデプロイ
- フロントを変えたら `cd frontend && npm run build` → `frontend/dist/` もコミット → `main` にプッシュ
- コミットメッセージは末尾に `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

### 記録
機能を変えたら必ず更新する。
- 設計書 `doc/`（変更の種類に応じて対象ファイルを選ぶ）
- テストケース一覧 `doc/04_TEST/07_テストケース一覧.md`（テストを追加・変更・削除したとき）

### データと秘密情報
- 秘密の値は `.env` から読む。コード・ログ・報告・コミットに書かない
- `.env` と `secret_key.json` は `.gitignore` に含まれており、絶対にコミットしない
- `SUPABASE_SERVICE_ROLE_KEY` はログにも出力しない

### テストと確認
- 自動テストは本番につながらない（Supabase は MSW/モックで代替、外部接続は禁止）
  - TypeScript チェック: `cd frontend && npx tsc --noEmit`
  - フロントのロジック（Vitest）: `cd frontend && npx vitest run`
  - 画面テスト（Playwright）: `cd frontend && npx playwright test`
  - バックエンド（pytest）: `cd backend && python -m pytest`
- **全テストは `python scripts/run_tests.py --note "何を変えたか"` でまとめて実行する**
  - 結果は `doc/04_TEST/08_テスト実行ログ.md` に自動追加される
  - 1つでも失敗があれば終了コード 1（コミットしてはいけない合図）
- 機能を追加・変更したら、その動作のテストも追加する
- テストを追加・変更・削除したら `doc/04_TEST/07_テストケース一覧.md` を更新する
- フロントは `npm run build` が通ること
- 確認できなかったことは「できなかった」と報告する
