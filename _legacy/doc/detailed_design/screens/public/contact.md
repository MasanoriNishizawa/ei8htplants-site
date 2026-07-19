# お問い合わせ画面 詳細設計書

## 1. 画面概要

| 項目 | 内容 |
|------|------|
| 画面名 | お問い合わせフォーム |
| URL | `/contact`（フォーム表示） / `/contact?sent=1`（送信完了） |
| テンプレート | `templates/contact.html` |
| HTTPメソッド | GET（表示） / POST（送信） |
| 担当ルート | `app/routes/public.py` → `contact_form()`, `contact_submit()` |
| 説明 | 一般ユーザー向けのお問い合わせフォーム。送信後は Google スプレッドシートに記録し、ユーザーへの受付確認メールと運営への通知メールを送信する。 |

---

## 2. GETエンドポイントシグネチャ

```python
@router.get("/contact", response_class=HTMLResponse)
async def contact_form(request: Request, sent: str = None) -> HTMLResponse
```

### 引数

| 引数 | 型 | 必須 | 説明 |
|------|----|------|------|
| `request` | `Request` | ◯ | FastAPI リクエストオブジェクト |
| `sent` | `str \| None` | ✗ | "1" の場合、送信完了バナーを表示 |

### テンプレートコンテキスト

| 変数名 | 型 | 説明 |
|--------|-----|------|
| `sent` | `bool` | `sent == "1"` で評価。True の場合、緑のバナーを表示 |

### 戻り値

| 条件 | ステータスコード |
|------|----------------|
| 常に TemplateResponse | 200 |

---

## 3. POSTエンドポイントシグネチャ

```python
@router.post("/contact", response_class=HTMLResponse)
async def contact_submit(request: Request) -> RedirectResponse | HTMLResponse
```

### 処理フロー

```
1. フォームデータを取得:
   data = {
       "name":    form.get("name").strip(),
       "email":   form.get("email").strip(),
       "subject": form.get("subject").strip(),
       "message": form.get("message").strip(),
   }
2. create_contact(data) でスプレッドシートに記録（同期・await to_thread）
3. _fire(send_contact_notification(data))  // 運営に通知（非同期）
4. _fire(send_contact_confirmation(data))  // ユーザーに受付確認（非同期）
5. RedirectResponse("/contact?sent=1", status_code=303)
```

### 戻り値

| 条件 | 戻り値 | ステータスコード |
|------|--------|----------------|
| 正常 | `RedirectResponse("/contact?sent=1")` | 303 |
| `create_contact()` 失敗 | `HTMLResponse(f"Error: {str(e)}")` | 500 |

---

## 4. 画面レイアウト

```
[.contact-container]
  [.contact-header]
    <p>ei8ht plants</p>        ← contact-label
    <h1>Contact</h1>           ← contact-title
    <p>ご質問・ご依頼など...</p>← contact-desc（返信は通常2〜3営業日以内）

  {% if sent %}
  [.sent-banner]  ← 緑バナー
    「お問い合わせを受け付けました。内容を確認次第、ご連絡いたします。」
  {% endif %}

  [form  method="post"  action="/contact"  .form-card]
    --- セクション: お客様情報 ---
    [input#name     type="text"   name="name"     required]  お名前
    [input#email    type="email"  name="email"    required]  メールアドレス

    --- セクション: お問い合わせ内容 ---
    [input#subject  type="text"   name="subject"]            件名（任意）
    [textarea#message             name="message"  required]  内容

    [button  type="submit"  .btn-submit]  送信する

  [p.notice]
    Instagram DM へのリンク（@ei8ht.plants / @habitatoides）
```

---

## 5. フロントエンド動作

### バリデーション（HTML5）

| フィールド | 属性 | バリデーション |
|-----------|------|--------------|
| お名前 | `required` | 未入力は送信不可 |
| メールアドレス | `required`, `type="email"` | 未入力・不正なメール形式は送信不可 |
| 件名 | なし | 任意 |
| 内容 | `required` | 未入力は送信不可 |

### JS（特記事項なし）

contact.html には独自の JavaScript は含まれていない。ブラウザの HTML5 標準バリデーションのみ使用。

---

## 6. 正常系・準正常系・異常系パターン

### 正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| N1 | `/contact` にアクセス | お問い合わせフォームが表示される |
| N2 | 全必須フィールドを入力して「送信する」 | POST → 303 Redirect → `/contact?sent=1` → 緑バナー表示 |
| N3 | 件名を空のまま送信 | 空文字としてシートに記録される |

### 準正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| Q1 | `/contact?sent=1` に直接アクセス | 緑バナーが表示される（フォームも表示） |
| Q2 | メール送信が失敗（環境変数未設定など） | シートへの記録は成功。メール送信エラーはログに出力して握りつぶし。ユーザーには 303 リダイレクトが返る |

### 異常系

| # | 操作 | 期待結果 |
|---|------|---------|
| E1 | `create_contact()` が Sheets API エラー | `HTMLResponse("Error: ...", 500)` |

---

## 7. シーケンス図

```
ブラウザ              FastAPI              Google Sheets      Gmail API
  |                     |                       |                |
  |--- POST /contact --->|                       |                |
  |  name/email/...      |                       |                |
  |                     |-- create_contact(data) ------------->|
  |                     |   (await asyncio.to_thread)          |
  |                     |   タイムスタンプ付きで「お問い合わせ」シートに追記
  |                     |<-- (完了) -----------------------------|
  |                     |                                        |
  |                     |-- _fire(send_contact_notification) --> (非同期)
  |                     |   ei8htplants@gmail.com に通知メール
  |                     |-- _fire(send_contact_confirmation) --> (非同期)
  |                     |   ユーザーに受付確認メール
  |                     |                                        |
  |<-- 303 Redirect /contact?sent=1                              |
  |--- GET /contact?sent=1 -->|                                  |
  |<-- 200 HTML（緑バナー）   |                                  |
  |                (非同期) send_contact_notification ----------->|
  |                (非同期) send_contact_confirmation ----------->|
```

---

## 8. バリデーションルール

### フロントエンド

| フィールド | バリデーション |
|-----------|--------------|
| お名前 | `required` |
| メールアドレス | `required`, `type="email"` |
| 件名 | 任意 |
| 内容 | `required` |

### バックエンド

| フィールド | 処理 |
|-----------|------|
| name | `str(form.get("name", "")).strip()` — 空文字許容（フロントで必須チェック済み） |
| email | `str(form.get("email", "")).strip()` — 空文字の場合、確認メール送信をスキップ |
| subject | `str(form.get("subject", "")).strip()` — 空文字許容 |
| message | `str(form.get("message", "")).strip()` — 空文字許容 |

---

## 9. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `create_contact()` Sheets API 失敗 | `gspread.exceptions.APIError` など | `except Exception` でキャッチ → `HTMLResponse("Error: ...", 500)` |
| `send_contact_notification()` 失敗 | — | `email.py` 内で `except Exception: print("[email] ERROR ...")` で握りつぶし。ユーザー体験に影響なし |
| `send_contact_confirmation()` 失敗 | — | 同上。ユーザーはリダイレクト後にバナーを見るが、確認メールは届かない可能性がある |
| Gmail API 認証失敗（refresh token 無効） | — | `email.py` 内で SKIP ログを出力して処理終了 |

---

## 10. スプレッドシート書き込み詳細

### 書き込みシート

シート名: `お問い合わせ`（存在しない場合は自動作成）

### カラム構成

| 列 | カラム名 | 内容 |
|----|---------|------|
| A | タイムスタンプ | JST の `YYYY-MM-DD HH:MM:SS` |
| B | お名前 | フォームの name フィールド |
| C | メール | フォームの email フィールド |
| D | 件名 | フォームの subject フィールド |
| E | 内容 | フォームの message フィールド |

---

## 11. メール送信詳細

### ユーザーへの受付確認メール（`send_contact_confirmation`）

- 送信元: `ei8htplants@gmail.com`
- 送信先: フォームの email フィールド
- 件名: `【お問い合わせ受付】{subject} — ei8ht plants`
- 使用する OAuth リフレッシュトークン: `CONTACT_GMAIL_REFRESH_TOKEN`
- 本文内容: 件名・内容の折り返し確認 + `https://ei8htplants.onrender.com/contact` リンク

### 運営への通知メール（`send_contact_notification`）

- 送信元: `ei8htplants@gmail.com`
- 送信先: `ei8htplants@gmail.com`（自分宛て）
- 件名: `【お問い合わせ】{subject} — {name}`
- 使用する OAuth リフレッシュトークン: `CONTACT_GMAIL_REFRESH_TOKEN`
- 本文内容: 名前・メール・件名・内容を一覧表示

### 送信条件チェック

```python
if not refresh_token or not settings.gmail_client_id:
    print("[email] SKIP: ...")
    return  # メール送信をスキップ（例外を投げない）
```
