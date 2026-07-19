# お問い合わせ管理機能 詳細設計

- モジュール: `app/routes/admin.py`, `app/sheets.py`, `app/email.py`
- 認証: 管理画面エンドポイントで `_check_auth()` 必須

---

## 1. 機能概要

お問い合わせフォームから送信されたデータを管理者が閲覧するための読み取り機能。
フロントエンド（公開ページ）からの書き込み、管理画面からの読み取りという二方向の処理を持つ。

### 処理の全体像:
```
[公開ページ /contact] → POST → create_contact() → Sheets 書き込み → メール2通送信
[管理画面 /admin/contacts] → GET → get_all_contacts_for_admin() → 一覧表示
```

---

## 2. お問い合わせシート構造

### シート名: `お問い合わせ`

| 列名 | 型 | 書き込み元 | 説明 |
|------|-----|----------|------|
| タイムスタンプ | str | create_contact() | "YYYY-MM-DD HH:MM:SS" (JST) |
| お名前 | str | フォーム `name` フィールド | |
| メール | str | フォーム `email` フィールド | |
| 件名 | str | フォーム `subject` フィールド | |
| 内容 | str | フォーム `message` フィールド | |

シートが存在しない場合は `create_contact()` が自動作成する（管理画面読み取り時は空リストを返す）。

---

## 3. お問い合わせ書き込み機能（公開ページから呼び出し）

### create_contact(data: dict) -> None

```python
def create_contact(data: dict) -> None
```

**引数 data のキー:**
| キー | 対応フィールド |
|------|--------------|
| "name" | お名前 |
| "email" | メール |
| "subject" | 件名 |
| "message" | 内容 |

**処理フロー:**
1. `sh.worksheet(CONTACT_SHEET_NAME)` でシートを取得
2. シートが存在しない場合（gspread 例外）:
   ```python
   ws = sh.add_worksheet(title=CONTACT_SHEET_NAME, rows=1000, cols=5)
   ws.append_row(
       ["タイムスタンプ", "お名前", "メール", "件名", "内容"],
       value_input_option="RAW",
   )
   ```
3. タイムスタンプを JST で生成:
   ```python
   timestamp = datetime.now(_JST).strftime("%Y-%m-%d %H:%M:%S")
   ```
4. `ws.append_row([timestamp, name, email, subject, message], value_input_option="RAW")` で書き込み

**`value_input_option="RAW"` の意味:**
Sheets が入力内容を自動解釈・変換しないように RAW 書き込みを指定する。メールアドレスや URL を含む場合でも原文そのままで保存される。

---

## 4. お問い合わせ読み取り機能（管理画面から呼び出し）

### get_all_contacts_for_admin() -> list[dict]

```python
def get_all_contacts_for_admin() -> list[dict]
```

**処理フロー:**
1. `sh.worksheet(CONTACT_SHEET_NAME)` でシートを取得
2. シートが存在しない場合（gspread 例外）: `[]` を返す
3. `ws.get_all_records()` でヘッダーをキーとした辞書のリストを取得
4. `list(reversed(rows))` で新しい順（タイムスタンプ降順）に変換
5. リストを返す

**`get_all_records()` vs `get_all_values()` の違い:**
| 関数 | ヘッダー | 行番号 | 用途 |
|------|---------|--------|------|
| get_all_records() | キーとして使用 | 含まれない | 読み取り専用（閲覧目的） |
| get_all_values() | 別途取得が必要 | i で把握できる | 行番号が必要な操作（更新・削除） |

お問い合わせは読み取り専用のため `get_all_records()` で十分。

---

## 5. メール送信仕様

### 5-1. send_contact_confirmation（ユーザー向け受付確認メール）

**関数シグネチャ:**
```python
def send_contact_confirmation(data: dict) -> None
```

**送信元:** `ei8htplants@gmail.com`（`_CONTACT_SENDER`）
**送信者名:** "ei8ht plants"
**宛先:** `data.get("email")` — お問い合わせ者のメールアドレス
**件名:** `【お問い合わせ受付】{data.get('subject', 'お問い合わせ')} — ei8ht plants`
**使用 OAuth2 リフレッシュトークン:** `settings.contact_gmail_refresh_token`（`CONTACT_GMAIL_REFRESH_TOKEN` 環境変数）

**本文テンプレート:**
```
{name} 様

この度は ei8ht plants へのお問い合わせありがとうございます。
以下の内容でお問い合わせを受け付けました。
内容を確認次第、ご連絡いたします。

━━━━━━━━━━━━━━━━━━
件名：{subject}

【内容】
{message}
━━━━━━━━━━━━━━━━━━

ei8ht plants
@ei8ht.plants  |  @habitatoides
{SITE_URL}/contact
```

**スキップ条件:**
- `CONTACT_GMAIL_REFRESH_TOKEN` が未設定（`not refresh_token`）
- `GMAIL_CLIENT_ID` が未設定（`not settings.gmail_client_id`）
- `data.get("email")` が空文字

### 5-2. send_contact_notification（管理者向け新着通知メール）

**関数シグネチャ:**
```python
def send_contact_notification(data: dict) -> None
```

**送信元:** `ei8htplants@gmail.com`（`_CONTACT_SENDER`）
**送信者名:** "ei8ht plants 新規問合せ"
**宛先:** `ei8htplants@gmail.com`（管理者自身 = `_CONTACT_SENDER`）
**件名:** `【お問い合わせ】{subject} — {name}`

**本文テンプレート:**
```
新しいお問い合わせが届きました。

━━━━━━━━━━━━━━━━━━
お名前：{name}
メール：{email}
件名　：{subject}

【内容】
{message}
━━━━━━━━━━━━━━━━━━

※このメールは ei8ht plants サイトから自動送信されています。
```

**スキップ条件:**
- `CONTACT_GMAIL_REFRESH_TOKEN` が未設定
- `GMAIL_CLIENT_ID` が未設定

---

## 6. Gmail API 送信の内部処理

### _get_gmail_service(refresh_token: str)

```python
def _get_gmail_service(refresh_token: str)
```

**処理:**
1. `Credentials` オブジェクトを生成（`token=None` — 初回は未取得）
2. `creds.refresh(Request())` でアクセストークンを取得
3. `build("gmail", "v1", credentials=creds, cache_discovery=False)` で Gmail サービスを構築

**`cache_discovery=False` の理由:** サーバーレス環境でのファイルキャッシュ問題を回避するため。

### _send_via_api(refresh_token, sender_email, sender_name, to, subject, body)

```python
def _send_via_api(
    refresh_token: str,
    sender_email: str,
    sender_name: str,
    to: str,
    subject: str,
    body: str
) -> None
```

**処理:**
1. `_get_gmail_service(refresh_token)` でサービス取得
2. `MIMEText(body, "plain", "utf-8")` でメッセージ構築
3. ヘッダー設定:
   ```python
   msg["To"] = to
   msg["From"] = formataddr((sender_name, sender_email))
   msg["Subject"] = subject
   ```
4. `base64.urlsafe_b64encode(msg.as_bytes()).decode()` で raw 形式にエンコード
5. `service.users().messages().send(userId="me", body={"raw": raw}).execute()` で送信

**SMTP を使わない理由:** クラウドホスティング環境（Render）ではポート25/587のブロックを受ける場合がある。Gmail API（HTTPS）を使うことでポートブロックを回避している。

---

## 7. 環境変数一覧

| 環境変数 | 説明 | 使用箇所 |
|---------|------|---------|
| `CONTACT_GMAIL_REFRESH_TOKEN` | `ei8htplants@gmail.com` の OAuth2 リフレッシュトークン | お問い合わせメール送受信 |
| `GMAIL_CLIENT_ID` | OAuth2 クライアント ID | 全メール送信 |
| `GMAIL_CLIENT_SECRET` | OAuth2 クライアントシークレット | 全メール送信 |

---

## 8. シーケンス図

### お問い合わせ受信からメール送信まで（公開ページ側）

```
ブラウザ (公開)    FastAPI /contact     Google Sheets       Gmail API
  |                    |                      |                  |
  |--POST /contact---->|                      |                  |
  |  name, email,      |                      |                  |
  |  subject, message  |--create_contact(data)-->                |
  |                    |                      |--append_row()    |
  |                    |<--完了---------------|                  |
  |                    |--send_contact_confirmation(data)------->|
  |                    |                      |  OAuth2 refresh  |
  |                    |                      |  MIMEText 送信   |
  |                    |                      |  → 送信者宛      |
  |                    |--send_contact_notification(data)------->|
  |                    |                      |  → 管理者宛      |
  |<--302 /contact?sent=1---|                 |                  |
```

### 管理画面でのお問い合わせ閲覧

```
ブラウザ (管理)    FastAPI /admin/contacts    Google Sheets
  |                    |                           |
  |--GET /admin/contacts-->                         |
  |                    |--_check_auth()            |
  |                    |--get_all_contacts_for_admin()-->
  |                    |                           |--worksheet("お問い合わせ")
  |                    |                           |--get_all_records()
  |                    |<--reversed(rows)----------|
  |<--200 一覧HTML-----|
```

---

## 9. パターン一覧

### 書き込み（公開ページから）

| パターン | 条件 | 結果 |
|----------|------|------|
| 正常: 完全成功 | Sheets 書き込み成功 + メール2通送信成功 | 302 /contact?sent=1 |
| 準正常: メール設定未完了 | CONTACT_GMAIL_REFRESH_TOKEN 未設定 | Sheets 書き込みのみ、メールスキップ（ログ出力） |
| 準正常: メールアドレス空 | data.get("email")="" | 管理者通知のみ送信、確認メールスキップ |
| 準正常: シート未存在 | 初回書き込み時 | シート自動作成 + ヘッダー追加 + データ書き込み |
| 異常: Sheets API エラー | append_row 例外 | 呼び出し元のエラーハンドリングに依存 |

### 読み取り（管理画面から）

| パターン | 条件 | 結果 |
|----------|------|------|
| 正常: データあり | シートに1件以上 | contacts リスト（新しい順）を表示 |
| 正常: データなし | シートが空 | 空リスト → "お問い合わせはまだありません" |
| 準正常: シート未存在 | worksheet() が例外 | 空リスト → "お問い合わせはまだありません" |
| 異常: 未認証 | セッションなし | 302 /admin/login |
