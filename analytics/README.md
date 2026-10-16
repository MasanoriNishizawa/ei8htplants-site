# ei8ht plants 分析ダッシュボード（Streamlit）

本番の Supabase を **読み取り専用** で参照し、イベント収支・ワークショップ・ショップ・問い合わせを分析するツール。
サイト本体とは独立していて、自分の PC で動かすほか、Streamlit Community Cloud で公開できる（「Streamlit Community Cloud への公開」参照）。
どちらの場合も、管理画面と同じ Supabase のアカウントでログインしないと画面は見られない。

## 起動

```bash
cd analytics
python3.12 -m venv .venv            # 初回だけ
.venv/bin/pip install -r requirements.txt   # 初回だけ
.venv/bin/streamlit run app.py      # → http://localhost:8501
```

接続情報はリポジトリ直下の `.env`（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`）から読む。

- Python は 3.12 を使う。`analytics/.python-version`（3.12.9）はローカル用（pyenv などが読む）。Community Cloud では使われない
- Community Cloud と同じくリポジトリ直下から起動することもできる: `analytics/.venv/bin/streamlit run analytics/app.py`
  （このときはリポジトリ直下の `.streamlit/config.toml` が読まれ、ポートは既定の 8501）

## 画面

| 画面 | 内容 |
|---|---|
| 概要 | 売上・収支・出店回数・WS 予約人数、月別の推移、今後のイベント |
| イベント収支 | 収支ランキング、損益分岐点、支出の内訳、ブランド別・WS 有無別の比較 |
| ワークショップ | 予約数、キャンセル率、時間枠の埋まり率、予約のタイミング、リピーター |
| ショップ | 月別売上、商品ランキング、都道府県別、RFM、併売分析、在庫（有効な注文が 5 件以上で表示） |
| 問い合わせ・記事 | 問い合わせ件数の推移と未読数、記事の公開本数とタグ |
| 予測・シミュレーション | 今期の着地見込み（ブートストラップ）、売上の要因分析（回帰）、出店判断シミュレーター |

## データの扱い

- 通信は GET だけ。書き込み・削除・RPC は行わない（`lib/data.py`）
- 取得する列を限定し、氏名・電話・住所・問い合わせ本文は読み込まない
- メールアドレスはリピート判定のためだけに取得し、すぐハッシュ化して元の値は捨てる
- 収支の計算式は管理画面（`frontend/src/lib/api.ts` の `computeFinances`）と同じ。式を変えるときは `lib/finance.py` も揃える
- 売上が 0 円の収支は「未開催・入力前」として集計から外す

## Streamlit Community Cloud への公開

サイト本体（Render）とは別に、Streamlit Community Cloud（無料）で公開する。同じ GitHub リポジトリを使う。

### アプリの作り方（share.streamlit.io の「Create app」）

| 項目 | 設定 |
|---|---|
| Repository | このリポジトリ（ei8htplants-site） |
| Branch | `main` |
| Main file path | `analytics/app.py` |
| App URL（カスタム URL） | 例: `ei8htplants-analytics`（→ `https://ei8htplants-analytics.streamlit.app`） |
| Advanced settings → Python version | `3.12` |
| Advanced settings → Secrets | 下の「Secrets に入れる値」を TOML で貼る |

- 依存パッケージは `analytics/requirements.txt`（エントリポイントと同じフォルダ）から入る
- Python の版は設定画面で選ぶ。`analytics/.python-version`（3.12.9）は Community Cloud では使われず、ローカルの pyenv など向けに残している
- `main` にプッシュすると自動で更新される
- しばらく使わないとアプリは休止し、次に開くときは起動を待つ必要がある（画面の案内に従って起こす）

### 設定ファイル（`.streamlit/config.toml`）が2つある理由

- Community Cloud は作業ディレクトリが常にリポジトリ直下で、設定は **リポジトリ直下の `.streamlit/config.toml`** しか読まない
- ローカルで `analytics` フォルダから起動したときは `analytics/.streamlit/config.toml` が使われる
- テーマ・エラー表示・利用状況の送信の設定（`[theme]`・`[client]`・`[browser]`）は **両方をそろえる**。`[server]`（アドレス・ポート）はローカル用の `analytics/.streamlit/config.toml` にだけ書く（Community Cloud が決めるため）
- エラーの詳細を画面に出さない設定（`showErrorDetails = "none"`）は、設定ファイルが読まれなくても効くよう `app.py` の先頭でも `st.set_option` で入れている
- XSRF 保護など Streamlit の既定の安全設定は無効にしない
- ログインは Community Cloud のサーバーから Supabase に送られるため、第三者がここで失敗を繰り返すと Supabase の回数制限にかかり、しばらく正規の利用者もログインできなくなることがある

### Secrets に入れる値（アプリの Settings → Secrets。値はここに書かない）

| 名前 | 必須 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 必須 | Supabase の URL（ログインとデータ取得） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必須 | ログイン（Supabase Auth）に使う公開キー |
| `SUPABASE_SERVICE_ROLE_KEY` | 必須 | データの読み取り（GET のみ）。ログインには使わない |
| `ANALYTICS_ALLOWED_EMAILS` | 推奨（実質必須） | 閲覧を許可するメールアドレス（カンマ区切り、大文字小文字は区別しない）。未設定なら Supabase にログインできる人を全員許可する。Supabase で新規登録ができる設定だと第三者が登録して見られてしまうため、必ず設定する |
| `GA_PROPERTY_ID` | 任意 | GA4 のプロパティ ID（数字。アクセス解析の画面で使う） |
| `GA_CREDENTIALS_JSON` | 任意 | GA4 のサービスアカウント鍵ファイルの **中身**（JSON）。Community Cloud にはファイルを置く仕組みが無いため、中身をそのまま入れる |

書き方の例（値はすべてダミー。実際の値に置き換える）:

```toml
NEXT_PUBLIC_SUPABASE_URL = "https://xxxxxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY = "ダミーの anon キー"
SUPABASE_SERVICE_ROLE_KEY = "ダミーの service_role キー"
ANALYTICS_ALLOWED_EMAILS = "owner@example.com,staff@example.com"
GA_PROPERTY_ID = "123456789"
GA_CREDENTIALS_JSON = '''
{
  "type": "service_account",
  "project_id": "example-project",
  "private_key_id": "0123456789abcdef",
  "private_key": "-----BEGIN PRIVATE KEY-----\nダミー\n-----END PRIVATE KEY-----\n",
  "client_email": "analytics-reader@example-project.iam.gserviceaccount.com",
  "token_uri": "https://oauth2.googleapis.com/token"
}
'''
```

- 値は **すべてトップレベル**（`[セクション]` の下に入れない）に書く。トップレベルの値だけが環境変数としても読めるため
  （`app.py` の最初で `st.secrets` を読み込み、環境変数に反映させている。`lib/secrets_env.py`）
- `GA_CREDENTIALS_JSON` は鍵ファイルの中身を **`'''`（シングルクォート3つ）で囲んで** そのまま貼る。`'''` の中では `\n` がそのまま残るので、JSON として正しく読める
- 鍵の中身は画面にもログにも出さない。JSON として読めないときは、中身を含まないエラーメッセージ（何行目付近か・足りない項目名）だけを出す
- ローカルで鍵ファイルを使う `GA_CREDENTIALS`（ファイルの場所）も引き続き使える。`GA_CREDENTIALS_JSON` と両方あれば `GA_CREDENTIALS_JSON` を優先する
- Community Cloud では `.env` は不要（`.env` が無くても動く）。ローカルで `.streamlit/secrets.toml` を作った場合は、`.env` より Secrets の値が優先される

### ログインの仕組み（`lib/auth.py`）

- 画面を開くとログインフォーム（メールアドレス・パスワード）だけが表示され、ログインするまでダッシュボードもデータの読み込みも行わない
- 認証は Supabase Auth の REST API（`POST /auth/v1/token?grant_type=password`）を anon キーで呼ぶ。管理画面と同じアカウントが使える
- `ANALYTICS_ALLOWED_EMAILS` が設定されていれば、そこにないアカウントは「このアカウントでは閲覧できません」と表示して入れない
- ログイン状態はブラウザのセッション（`st.session_state`）にメールアドレスだけを持つ。パスワード・トークンは保持せず、画面にもログにも出さない。ブラウザを再読み込みすると再ログインが必要
- 同じセッションで 5 回続けて失敗すると、最後の失敗から 60 秒はログインを試さない（Supabase 側のレート制限と合わせた簡易対策）
- サイドバーに「ログイン中: メールアドレス」と「ログアウト」ボタンを表示する

## テスト

```bash
.venv/bin/python -m pytest tests   # 本番には接続しない
```
