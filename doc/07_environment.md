# 環境構成・デプロイ

## 1. 環境一覧

| 環境 | 説明 | 起動方法 |
|---|---|---|
| ローカル開発 | `secret_key.json` + `.env` を使用 | `python main.py` または `uvicorn main:app --reload` |
| 本番（Render） | 環境変数で設定 | Render が `uvicorn main:app` を自動実行 |

---

## 2. 環境変数一覧

| 変数名 | 必須 | 説明 | 設定例 |
|---|---|---|---|
| `SECRET_KEY` | ○ | セッション署名キー（長いランダム文字列） | `python -c "import secrets; print(secrets.token_hex(32))"` で生成 |
| `ADMIN_USER` | ○ | 管理画面ログインID | `admin` |
| `ADMIN_PASS` | ○ | 管理画面ログインパスワード | 任意の強いパスワード |
| `GOOGLE_CREDENTIALS` | ○ | `secret_key.json` の内容をそのままJSONとして貼り付け | `{"type": "service_account", ...}` |
| `GMAIL_CLIENT_ID` | ○ | Gmail OAuth2 クライアントID | Google Cloud Console から取得 |
| `GMAIL_CLIENT_SECRET` | ○ | Gmail OAuth2 クライアントシークレット | 同上 |
| `GMAIL_REFRESH_TOKEN` | ○ | habitatoides@gmail.com のリフレッシュトークン | `get_gmail_token.py` で取得 |
| `GMAIL_SENDER` | ○ | WS メール送信元アドレス | `habitatoides@gmail.com` |
| `GMAIL_SENDER_NAME` | - | 送信者表示名 | `Habitat Oides` |
| `CONTACT_GMAIL_REFRESH_TOKEN` | ○ | ei8htplants@gmail.com のリフレッシュトークン | `get_gmail_token.py` で取得 |

---

## 3. ローカル開発セットアップ

```bash
# 1. 依存パッケージインストール
pip install -r requirements.txt

# 2. Google サービスアカウントキーを配置
# secret_key.json → プロジェクトルートに配置（.gitignore 済み）

# 3. .env ファイルを作成
SECRET_KEY=<任意>
ADMIN_USER=admin
ADMIN_PASS=<任意>
GMAIL_CLIENT_ID=<取得値>
GMAIL_CLIENT_SECRET=<取得値>
GMAIL_REFRESH_TOKEN=<取得値>
GMAIL_SENDER=habitatoides@gmail.com
CONTACT_GMAIL_REFRESH_TOKEN=<取得値>

# 4. 起動
uvicorn main:app --reload
```

---

## 4. Gmail OAuth2 セットアップ手順

メール送信には Gmail API を使用する（Render 環境では SMTP ポートが閉鎖されているため）。

### 4.1 Google Cloud Console 設定

1. プロジェクト作成（または既存プロジェクトを使用）
2. Gmail API を有効化
3. OAuth 同意画面を設定
   - アプリ名、ユーザーサポートメール、デベロッパーメールを入力
   - **テストユーザー**に habitatoides@gmail.com と ei8htplants@gmail.com を追加
4. OAuth 2.0 クライアント ID を作成（種類: デスクトップアプリ）
5. `CLIENT_ID` と `CLIENT_SECRET` をメモ

### 4.2 リフレッシュトークン取得

```bash
# get_gmail_token.py を使用（gitignore 済み）
# SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
python get_gmail_token.py

# ブラウザが開くので対象アカウントでログイン → 許可
# コンソールに refresh_token が表示されるのでコピー
# habitatoides@gmail.com と ei8htplants@gmail.com でそれぞれ実行
```

### 4.3 Render への設定

Render ダッシュボード → Environment → 上記の全環境変数を設定

---

## 5. Render デプロイ設定

| 項目 | 値 |
|---|---|
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Python Version | 3.x |

- **無料プランの制限**: 非アクティブ状態が続くとスリープ。初回アクセス時に ~30 秒の遅延が発生
- **インメモリキャッシュ**: サーバー再起動でクリアされる（再起動後の最初のアクセスで Sheets API から再取得）

---

## 6. Google サービスアカウントの権限

サービスアカウント (`secret_key.json`) に付与が必要な権限:

| API | スコープ | 用途 |
|---|---|---|
| Google Sheets API | `spreadsheets` | イベント・予約・お問い合わせの読み書き |
| Google Drive API | `drive` | ギャラリー画像フォルダの一覧取得 |

スプレッドシートとドライブフォルダをサービスアカウントのメールアドレスと共有する必要がある。

---

## 7. gitignore の対象ファイル

```
secret_key.json       # Google サービスアカウントキー
get_gmail_token.py    # OAuth2 トークン取得スクリプト
.env                  # ローカル環境変数
__pycache__/
*.pyc
.DS_Store
.claude/
```
