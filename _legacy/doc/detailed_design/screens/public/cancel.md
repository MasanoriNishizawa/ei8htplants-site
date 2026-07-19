# キャンセル確認画面 詳細設計書

## 1. 画面概要

| 項目 | 内容 |
|------|------|
| 画面名 | 予約キャンセル確認 |
| URL | `/cancel?token={token}` または `/cancel?token={token}&done=1` |
| テンプレート | `templates/cancel.html` |
| HTTPメソッド | GET（表示） / POST（キャンセル実行） |
| 担当ルート | `app/routes/public.py` → `cancel_form()`, `cancel_submit()` |
| 説明 | 予約確認メールに含まれるキャンセルリンク（`/cancel?token=UUID`）からアクセスする画面。予約内容を確認してキャンセルを実行する。 |

---

## 2. GETエンドポイントシグネチャ

```python
@router.get("/cancel", response_class=HTMLResponse)
async def cancel_form(request: Request, token: str = "", done: str = "") -> HTMLResponse
```

### 引数

| 引数 | 型 | 必須 | 説明 |
|------|----|------|------|
| `request` | `Request` | ◯ | FastAPI リクエストオブジェクト |
| `token` | `str` | ✗ | キャンセルトークン（UUID）。空文字の場合は `reservation = None` |
| `done` | `str` | ✗ | "1" の場合、キャンセル完了状態を表示 |

### 処理フロー

```
1. token が空でない → asyncio.to_thread(get_reservation_by_token, token) で予約データを取得
2. token が空     → reservation = None
3. TemplateResponse("cancel.html", {reservation, token, done=(done=="1")}) を返す
```

### 戻り値

| 条件 | ステータスコード |
|------|----------------|
| 常に TemplateResponse | 200 |

---

## 3. POSTエンドポイントシグネチャ

```python
@router.post("/cancel", response_class=HTMLResponse)
async def cancel_submit(request: Request) -> RedirectResponse
```

### 処理フロー

```
1. フォームから token, reason を取得してstrip()
2. token が空でない場合:
   a. get_reservation_by_token(token) で予約データを取得
   b. cancel_reservation(token, reason) でシートを更新
   c. reservation が存在する場合:
      - _fire(send_cancellation_confirmation(reservation, reason))  // ユーザーに確認メール（非同期）
      - _fire(send_cancellation_notification(reservation, reason))  // 運営に通知メール（非同期）
3. RedirectResponse(f"/cancel?token={token}&done=1", status_code=303) を返す
```

### 戻り値

| 条件 | 戻り値 | ステータスコード |
|------|--------|----------------|
| 常に（token の有無に関わらず） | `RedirectResponse(f"/cancel?token={token}&done=1")` | 303 |

---

## 4. テンプレートコンテキスト

| 変数名 | 型 | 説明 |
|--------|-----|------|
| `reservation` | `dict \| None` | WS予約シートの行データ。token が無効・未指定の場合は None |
| `token` | `str` | キャンセルトークン。hiddenフィールドとしてフォームに埋め込む |
| `done` | `bool` | True のとき完了状態を表示（`done == "1"` で評価） |

---

## 5. 画面表示分岐

テンプレートは `done`, `reservation`, `reservation.get('キャンセル済み')` の 4 状態で表示を切り替える。

```
{% if done %}
  → キャンセル完了画面
{% elif not reservation %}
  → 無効なリンク画面
{% elif reservation.get('キャンセル済み') == 'TRUE' %}
  → キャンセル済み画面
{% else %}
  → キャンセル確認フォーム
{% endif %}
```

### 5-1. キャンセル完了画面

```
[.cancel-card]
  [.status-box]
    [.status-icon.done]  チェックマーク SVG
    <p>キャンセルが完了しました</p>
    <p>またのご参加をお待ちしております。</p>
    <a href="/events">イベント一覧へ</a>
```

### 5-2. 無効なリンク画面（token なし or 不一致）

```
[.cancel-card]
  [.status-box]
    [.status-icon.error]  × SVG（赤）
    <p>無効なリンクです</p>
    <p>このキャンセルリンクは無効または期限切れです。CONTACT にてお問い合わせください。</p>
    <a href="/events">イベント一覧へ</a>
```

### 5-3. キャンセル済み画面

```
[.cancel-card]
  [.status-box]
    [.status-icon.done]  チェックマーク SVG
    <p>キャンセル済みです</p>
    <p>このご予約はすでにキャンセルされています。</p>
    <a href="/events">イベント一覧へ</a>
```

### 5-4. キャンセル確認フォーム

```
[.cancel-card]
  [table.detail-table]
    - イベント: reservation['イベント名']
    - お名前:   reservation['お名前'] 様
    - 希望日:   reservation['希望日']
    - 時間帯:   reservation['希望時間帯']
    - 参加人数: reservation['参加人数'] 名

  [form  method="post"  action="/cancel"  id="cancel-form"]
    [hidden] token = {token}
    [textarea#reason  name="reason"]  キャンセル理由（任意）
    [button#btn-cancel  type="submit"]  予約をキャンセルする

  <p>キャンセル後の取り消しはできません。</p>
```

---

## 6. フロントエンド JS 詳細

### キャンセル確認ダイアログ + 二重送信防止

```javascript
const form = document.getElementById('cancel-form');
if (form) {
  form.addEventListener('submit', function(e) {
    // 1. すでに disabled なら何もしない（二重送信防止）
    if (btn.disabled) { e.preventDefault(); return; }

    // 2. confirm ダイアログで確認
    if (!confirm('予約をキャンセルしてよろしいですか？')) {
      e.preventDefault();
      return;
    }

    // 3. ボタンを disabled にしてテキストを "処理中..." に変更
    btn.disabled = true;
    btn.textContent = '処理中...';
  });
}
```

**ポイント:** `confirm()` でユーザーが「キャンセル」を押した場合は `e.preventDefault()` でフォーム送信を中断する。

---

## 7. 正常系・準正常系・異常系パターン

### 正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| N1 | メールのキャンセルリンクをクリック（`/cancel?token=UUID`） | 予約内容テーブルとキャンセルフォームが表示される |
| N2 | 「予約をキャンセルする」ボタンを押す → confirm「OK」 | POST /cancel → 303 Redirect → `/cancel?token=UUID&done=1` → 完了画面 |
| N3 | キャンセル理由を入力してキャンセル | シートの「キャンセル理由」列に理由が保存される |

### 準正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| Q1 | confirm ダイアログで「キャンセル（いいえ）」を選択 | フォームは送信されず、フォーム画面のまま |
| Q2 | すでにキャンセル済みのトークンでアクセス | 「キャンセル済みです」画面が表示される |
| Q3 | `?done=1` を URL に付けてアクセス（token なし） | 「キャンセルが完了しました」画面（`done=True` が優先） |
| Q4 | キャンセル理由を空のままキャンセル | reason="" としてシートに保存（空文字許容） |

### 異常系

| # | 操作 | 期待結果 |
|---|------|---------|
| E1 | token なしで `/cancel` にアクセス | `reservation = None` → 「無効なリンクです」画面 |
| E2 | 存在しない token でアクセス | `get_reservation_by_token()` → None → 「無効なリンクです」画面 |
| E3 | 空文字 token で POST | `cancel_reservation("", reason)` は呼ばれない。token が空のため処理をスキップして 303 リダイレクト |

---

## 8. シーケンス図（GETリクエスト）

```
ブラウザ                    FastAPI                    Google Sheets API
  |                           |                              |
  |--- GET /cancel?token=UUID->|                              |
  |                           |-- get_reservation_by_token(UUID) -->|
  |                           |   (WS予約シートをスキャン)           |
  |                           |<-- dict（予約データ）or None --------|
  |                           |                              |
  |<-- 200 HTML (cancel.html) |                              |
  |   (予約内容フォーム or エラー画面)
```

---

## 9. シーケンス図（POSTリクエスト）

```
ブラウザ              FastAPI              Google Sheets      Gmail API
  |                     |                       |                |
  |--- POST /cancel ---->|                       |                |
  |   token=UUID         |                       |                |
  |   reason=テキスト     |                       |                |
  |                     |-- get_reservation_by_token(token) ----->|
  |                     |<-- reservation dict -------------------|
  |                     |                                        |
  |                     |-- cancel_reservation(token, reason) --->|
  |                     |   キャンセル済み=TRUE, キャンセル理由, キャンセル日時を更新
  |                     |<-- (完了) -----------------------------|
  |                     |                                        |
  |                     |-- _fire(send_cancellation_confirmation)-> (非同期)
  |                     |   ユーザーにキャンセル完了メール
  |                     |-- _fire(send_cancellation_notification)-> (非同期)
  |                     |   運営にキャンセル通知メール
  |                     |                                        |
  |<-- 303 Redirect /cancel?token=UUID&done=1                    |
  |--- GET /cancel?token=UUID&done=1 -->|                        |
  |<-- 200 HTML（完了画面）              |                        |
```

---

## 10. バリデーションルール

### フロントエンド

| フィールド | バリデーション |
|-----------|--------------|
| キャンセル理由 | 任意（`required` なし） |
| 送信ボタン | confirm ダイアログで明示的に確認必須。二重送信防止あり |

### バックエンド

| フィールド | 処理 |
|-----------|------|
| `token` | `str(form.get("token", "")).strip()` — 空文字の場合はキャンセル処理をスキップ |
| `reason` | `str(form.get("reason", "")).strip()` — バリデーションなし（空文字許容） |

---

## 11. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `get_reservation_by_token()` が失敗 | Sheets API エラー | `reservation = None` → 「無効なリンクです」画面が表示される |
| `cancel_reservation()` が失敗 | Sheets API エラー | 例外が発生するが `cancel_submit()` に `try/except` がないため 500 エラーになる可能性あり |
| `send_cancellation_confirmation()` が失敗 | — | `email.py` 内で `except Exception: print(...)` で握りつぶし |
| `send_cancellation_notification()` が失敗 | — | 同上 |

---

## 12. 状態遷移

```
[アクセス経路]
  メール内キャンセルリンク → /cancel?token=UUID

[状態A] token なし / 不一致
  → 「無効なリンクです」+ イベント一覧へボタン

[状態B] キャンセル済みトークン
  → 「キャンセル済みです」+ イベント一覧へボタン

[状態C] 有効なトークン（未キャンセル）
  - 予約内容テーブルを表示
  - キャンセル理由テキストエリア
  - 「予約をキャンセルする」ボタン（enabled）

  ↓ ボタンクリック
[状態C-1] confirm ダイアログ表示
  「OK」→ フォーム送信
  「キャンセル」→ 状態Cに戻る

  ↓ 「OK」
[状態C-2] 送信中
  - ボタン disabled、テキスト「処理中...」

  ↓ POST成功 → 303リダイレクト
[状態D] 完了画面
  → 「キャンセルが完了しました」+ イベント一覧へボタン
```
