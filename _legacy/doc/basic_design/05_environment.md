# 環境構成・デプロイ

## 環境一覧

| 環境 | 起動方法 | 認証情報 |
|---|---|---|
| ローカル | `uvicorn main:app --reload` | `secret_key.json` + `.env` |
| 本番（Render） | 自動（`uvicorn main:app`） | Render 環境変数 |

---

## 環境変数一覧

| 変数名 | 必須 | 説明 |
|---|---|---|
| `SECRET_KEY` | ○ | セッション署名キー。`python -c "import secrets; print(secrets.token_hex(32))"` で生成 |
| `ADMIN_USER` | ○ | 管理画面ログインID |
| `ADMIN_PASS` | ○ | 管理画面パスワード（空文字のままだとログイン不可） |
| `GOOGLE_CREDENTIALS` | ○ | `secret_key.json` の内容を JSON 文字列としてそのまま貼り付け |
| `GMAIL_CLIENT_ID` | ○ | Gmail OAuth2 クライアントID（Google Cloud Console から取得） |
| `GMAIL_CLIENT_SECRET` | ○ | 同上 |
| `GMAIL_REFRESH_TOKEN` | ○ | habitatoides@gmail.com のリフレッシュトークン |
| `GMAIL_SENDER` | ○ | `habitatoides@gmail.com` |
| `GMAIL_SENDER_NAME` | - | 送信者表示名（デフォルト: `Habitat Oides`） |
| `CONTACT_GMAIL_REFRESH_TOKEN` | ○ | ei8htplants@gmail.com のリフレッシュトークン |

---

## Gmail OAuth2 セットアップ手順

1. **Google Cloud Console** でプロジェクトを作成・選択
2. **Gmail API** を有効化
3. **OAuth 同意画面**を設定 → テストユーザーに両 Gmail アドレスを追加
4. **OAuth 2.0 クライアントID** を作成（種類: デスクトップアプリ）
5. `CLIENT_ID` と `CLIENT_SECRET` を取得
6. `get_gmail_token.py` を実行（habitatoides・ei8htplants それぞれで）
7. 取得した `refresh_token` を Render 環境変数に設定

---

## Render デプロイ設定

| 項目 | 値 |
|---|---|
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

- 無料プラン: 非アクティブ時スリープ（初回アクセス ~30 秒遅延）
- インメモリキャッシュは再起動でリセット

---

## Google サービスアカウント権限

| API | スコープ |
|---|---|
| Sheets API | `spreadsheets` |
| Drive API | `drive` |

スプレッドシートとドライブフォルダをサービスアカウントのメールアドレスと共有すること。

---

## gitignore 対象

```
secret_key.json       # サービスアカウントキー
get_gmail_token.py    # OAuth2 トークン取得スクリプト
.env                  # ローカル環境変数
```
