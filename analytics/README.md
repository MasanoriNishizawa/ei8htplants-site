# ei8ht plants 分析ダッシュボード（Streamlit）

本番の Supabase を **読み取り専用** で参照し、イベント収支・ワークショップ・ショップ・問い合わせを分析するツール。
サイト本体とは独立していて、自分の PC で動かすほか、Render の別 Web サービスとして公開できる（「Render への公開」参照）。
どちらの場合も、管理画面と同じ Supabase のアカウントでログインしないと画面は見られない。

## 起動

```bash
cd analytics
python3.12 -m venv .venv            # 初回だけ
.venv/bin/pip install -r requirements.txt   # 初回だけ
.venv/bin/streamlit run app.py      # → http://localhost:8501
```

接続情報はリポジトリ直下の `.env`（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`）から読む。

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

## Render への公開

サイト本体とは別の Web サービスとして作る（同じリポジトリを使う）。

| 項目 | 設定 |
|---|---|
| 種類 | Web Service（Python） |
| Root Directory | `analytics` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `streamlit run app.py --server.address 0.0.0.0 --server.port $PORT --server.headless true` |
| Python | `analytics/.python-version`（3.12.9）で指定。念のため環境変数 `PYTHON_VERSION=3.12.9` も設定する |
| Build Filters（Included Paths） | `analytics/**`（サイト本体だけを変えたときに、こちらまで再デプロイしないため。サイト本体のサービスには `frontend/**`・`backend/**` などを設定するとよい） |

- `.streamlit/config.toml` の `address = "localhost"` はローカル用。Render では Start Command の引数で上書きする
- XSRF 保護など Streamlit の既定の安全設定は無効にしない。エラーの詳細は画面に出さない設定（`showErrorDetails = "none"`）
- 無料枠は 15 分使わないと止まり、次に開くとき 1 分ほど待つ。メモリは 512MB で余裕が小さいので、落ちる場合は有料枠にする
- ログインは Render のサーバーから Supabase に送られるため、第三者がここで失敗を繰り返すと Supabase の回数制限にかかり、しばらく正規の利用者もログインできなくなることがある

### 環境変数（Render の Environment に設定する。値はここに書かない）

| 名前 | 必須 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 必須 | Supabase の URL（ログインとデータ取得） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必須 | ログイン（Supabase Auth）に使う公開キー |
| `SUPABASE_SERVICE_ROLE_KEY` | 必須 | データの読み取り（GET のみ）。ログインには使わない |
| `ANALYTICS_ALLOWED_EMAILS` | 推奨（実質必須） | 閲覧を許可するメールアドレス（カンマ区切り、大文字小文字は区別しない）。未設定なら Supabase にログインできる人を全員許可する。Supabase で新規登録ができる設定だと第三者が登録して見られてしまうため、必ず設定する |
| `GA_PROPERTY_ID` | 任意 | GA4 のプロパティ ID（アクセス解析の画面で使う） |
| `GA_CREDENTIALS` | 任意 | GA4 のサービスアカウント鍵ファイルの場所。Render の **Secret Files** に鍵ファイルを置き、そのパス（`/etc/secrets/<ファイル名>`）を入れる |

Render では環境変数が直接入るため `.env` は不要（`.env` が無くても動く）。

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
