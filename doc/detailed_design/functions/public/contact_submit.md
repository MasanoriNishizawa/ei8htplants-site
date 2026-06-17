# お問い合わせ送信機能 詳細設計書

## 1. 機能概要

| 項目 | 内容 |
|------|------|
| 機能名 | お問い合わせ送信 |
| エンドポイント | `POST /contact` |
| 担当モジュール | `app/routes/public.py` → `contact_submit()` |
| 書き込み関数 | `app/sheets.py` → `create_contact()` |
| メール関数 | `app/email.py` → `send_contact_notification()`, `send_contact_confirmation()` |
| 説明 | お問い合わせフォームからの送信を受け取り、スプレッドシートに記録し、運営への通知メールとユーザーへの受付確認メールを送信する。 |

---

## 2. エンドポイントシグネチャ

```python
@router.post("/contact", response_class=HTMLResponse)
async def contact_submit(request: Request) -> RedirectResponse | HTMLResponse
```

### 受け取るフォームフィールド

| フィールド名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `name` | `str` | ◯ | 送信者名（フロントで必須チェック済み） |
| `email` | `str` | ◯ | メールアドレス（フロントで必須・形式チェック済み） |
| `subject` | `str` | ✗ | 件名（任意） |
| `message` | `str` | ◯ | お問い合わせ内容（フロントで必須チェック済み） |

### 戻り値

| 条件 | 戻り値 | ステータスコード |
|------|--------|----------------|
| 正常 | `RedirectResponse("/contact?sent=1")` | 303 |
| `create_contact()` 失敗 | `HTMLResponse(f"Error: {str(e)}")` | 500 |

---

## 3. 処理フロー詳細

```python
async def contact_submit(request: Request):
    form = await request.form()

    # 1. フォームデータを辞書に変換（strip で前後の空白を除去）
    data = {
        "name":    str(form.get("name",    "")).strip(),
        "email":   str(form.get("email",   "")).strip(),
        "subject": str(form.get("subject", "")).strip(),
        "message": str(form.get("message", "")).strip(),
    }

    try:
        # 2. スプレッドシートに記録（同期・スレッド実行）
        await asyncio.to_thread(create_contact, data)

        # 3. 運営への通知メール（非同期・fire-and-forget）
        _fire(asyncio.to_thread(send_contact_notification, data))

        # 4. ユーザーへの受付確認メール（非同期・fire-and-forget）
        _fire(asyncio.to_thread(send_contact_confirmation, data))

    except Exception as e:
        # create_contact が失敗した場合のみ 500 エラー
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)

    # 5. PRG パターンでリダイレクト
    return RedirectResponse("/contact?sent=1", status_code=303)
```

---

## 4. `create_contact()` 詳細

```python
def create_contact(data: dict) -> None
```

### 引数

| 引数 | 型 | 説明 |
|------|----|------|
| `data` | `dict` | `{"name": str, "email": str, "subject": str, "message": str}` |

### 処理フロー

```
1. get_gc().open_by_key(SPREADSHEET_ID) でスプレッドシートを開く
2. sh.worksheet("お問い合わせ") でシートを取得
   存在しない場合:
     ws = sh.add_worksheet(title="お問い合わせ", rows=1000, cols=5)
     ws.append_row(["タイムスタンプ", "お名前", "メール", "件名", "内容"],
                   value_input_option="RAW")
3. timestamp = datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S")
4. ws.append_row([timestamp, data["name"], data["email"],
                  data["subject"], data["message"]],
                 value_input_option="RAW")
```

### お問い合わせシートのカラム構成

| 列 | カラム名 | 内容 |
|----|---------|------|
| A | タイムスタンプ | JST: `YYYY-MM-DD HH:MM:SS` |
| B | お名前 | フォームの name フィールド |
| C | メール | フォームの email フィールド |
| D | 件名 | フォームの subject フィールド（空文字可） |
| E | 内容 | フォームの message フィールド |

---

## 5. メール送信詳細

### `send_contact_notification()` — 運営向け通知メール

| 項目 | 内容 |
|------|------|
| 送信元 | `ei8htplants@gmail.com` |
| 送信先 | `ei8htplants@gmail.com`（自分宛て） |
| 件名 | `【お問い合わせ】{subject} — {name}` |
| OAuth RT | `settings.contact_gmail_refresh_token`（CONTACT_GMAIL_REFRESH_TOKEN 環境変数） |

本文:

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

### `send_contact_confirmation()` — ユーザー向け受付確認メール

| 項目 | 内容 |
|------|------|
| 送信元 | `ei8htplants@gmail.com` |
| 送信先 | `data["email"]` |
| 件名 | `【お問い合わせ受付】{subject or "お問い合わせ"} — ei8ht plants` |
| OAuth RT | `settings.contact_gmail_refresh_token` |

本文:

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
https://ei8htplants.onrender.com/contact
```

---

## 6. 非同期処理の設計

### 処理順序と同期・非同期の使い分け

```
await asyncio.to_thread(create_contact, data)   ← 完了を待つ（同期的）
  │ ↓ シートへの書き込みが保証されてからリダイレクト
_fire(send_contact_notification(data))           ← 非同期（fire-and-forget）
_fire(send_contact_confirmation(data))           ← 非同期（fire-and-forget）
  │ ↓ メール送信を待たずにリダイレクトを返す
return RedirectResponse(...)
```

- シートへの書き込みは `await` で確実に完了を待つ（ユーザーデータの保全）
- メール送信は `_fire()` で非同期実行（ユーザーへのレスポンス速度を優先）
- メール失敗は上位に伝播しない（シートへの記録は成功しているため）

---

## 7. シーケンス図

```
ブラウザ              FastAPI              Google Sheets      Gmail API
  |                     |                       |                |
  |--- POST /contact --->|                       |                |
  |  name/email/...      |                       |                |
  |                     |-- await to_thread(create_contact) --->  |
  |                     |   (asyncio.to_thread で同期実行)        |
  |                     |   1. worksheet("お問い合わせ") 取得      |
  |                     |   2. シートが存在しない場合は作成         |
  |                     |   3. タイムスタンプ付きで1行追記          |
  |                     |<-- (完了) --------------------------------|
  |                     |                                         |
  |                     |-- _fire(to_thread(send_contact_notification)) → (非同期)
  |                     |   送信元: ei8htplants@gmail.com          |
  |                     |   送信先: ei8htplants@gmail.com          |
  |                     |-- _fire(to_thread(send_contact_confirmation)) → (非同期)
  |                     |   送信元: ei8htplants@gmail.com          |
  |                     |   送信先: data["email"]                  |
  |                     |                                         |
  |<-- 303 Redirect /contact?sent=1                               |
  |--- GET /contact?sent=1 -->|                                   |
  |<-- 200 HTML（緑バナー）   |                                   |
  |                  (非同期) Gmail API でメール送信 2通 -------->  |
```

---

## 8. バリデーションルール

### フロントエンド（HTML5）

| フィールド | 属性 | バリデーション |
|-----------|------|--------------|
| お名前 | `required` | 未入力はフォーム送信不可 |
| メールアドレス | `required`, `type="email"` | 未入力・不正なメール形式は送信不可 |
| 件名 | なし | 任意（送信可） |
| 内容 | `required` | 未入力はフォーム送信不可 |

### バックエンド（最低限の処理のみ）

| フィールド | 処理 |
|-----------|------|
| `name` | `str(form.get("name", "")).strip()` — 空文字許容（フロントに依存） |
| `email` | `str(form.get("email", "")).strip()` — 形式チェックなし。空の場合はメール送信スキップ |
| `subject` | `str(form.get("subject", "")).strip()` — 空文字許容 |
| `message` | `str(form.get("message", "")).strip()` — 空文字許容 |

---

## 9. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `create_contact()` Sheets API 失敗 | `gspread.exceptions.APIError` など | `except Exception` → `HTMLResponse("Error: ...", 500)` |
| `send_contact_notification()` 失敗 | — | `email.py` 内 `except Exception: print("[email] ERROR ...")` で握りつぶし |
| `send_contact_confirmation()` 失敗 | — | 同上。ユーザーは `?sent=1` のバナーを見るが確認メールは届かない |
| Gmail API 認証失敗（refresh token 無効） | — | `email.py` 内: SKIP ログを出力して `return`（例外なし） |
| メール宛先が空 | — | `email.py` 内: SKIP ログを出力して `return` |

---

## 10. 環境変数と送信アカウントの関係

| 機能 | 使用する refresh_token | 送信元アドレス |
|------|----------------------|--------------|
| WS予約確認メール | `GMAIL_REFRESH_TOKEN` | `habitatoides@gmail.com` |
| お問い合わせ確認・通知 | `CONTACT_GMAIL_REFRESH_TOKEN` | `ei8htplants@gmail.com` |

- お問い合わせ機能は `ei8htplants@gmail.com` アカウントを使用（WS予約とは別アカウント）
- 確認メールと通知メールで同じアカウントを使用（送信元も宛先も `ei8htplants@gmail.com`）

---

## 11. 正常系・準正常系・異常系パターン

### 正常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| N1 | 全必須フィールドを入力して送信 | シートに記録、メール2通送信、`/contact?sent=1` にリダイレクト |
| N2 | 件名を空のまま送信 | 件名は空文字でシートに記録。件名なしの件名でメール送信 |

### 準正常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| Q1 | `CONTACT_GMAIL_REFRESH_TOKEN` 未設定 | シートへの記録は成功。メール送信をスキップ（SKIP ログ）。`/contact?sent=1` にリダイレクト |
| Q2 | `email` フィールドが空（フロントバリデーション回避） | シートへの記録は成功（email 列が空）。確認メールはアドレスなしでスキップ |
| Q3 | 初回送信（「お問い合わせ」シートが存在しない） | シートを自動作成してヘッダー行追加後、データを記録 |

### 異常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| E1 | Sheets API 認証失敗 | `HTMLResponse("Error: ...", 500)` |
| E2 | Sheets API レート制限超過 | `HTMLResponse("Error: ...", 500)` |

---

## 12. 管理画面からの参照

お問い合わせデータは管理画面から参照可能。

```python
def get_all_contacts_for_admin() -> list[dict]:
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(CONTACT_SHEET_NAME)
    except Exception:
        return []
    rows = ws.get_all_records()
    return list(reversed(rows))  # 新しい順（reversedで反転）
```

- キャッシュなし（管理画面は常に最新データを表示）
- `reversed()` で新着順に並び替え
