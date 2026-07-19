# キャンセル処理機能 詳細設計書

## 1. 機能概要

| 項目 | 内容 |
|------|------|
| 機能名 | ワークショップ予約キャンセル |
| エンドポイント | `POST /cancel` |
| 担当モジュール | `app/routes/public.py` → `cancel_submit()` |
| 書き込み関数 | `app/sheets.py` → `cancel_reservation()`, `get_reservation_by_token()` |
| メール関数 | `app/email.py` → `send_cancellation_confirmation()`, `send_cancellation_notification()` |
| 説明 | キャンセルトークン付きリンクからアクセスしたユーザーが予約をキャンセルする機能。シートのキャンセル済みフラグを更新し、ユーザーと運営にメールを送信する。 |

---

## 2. エンドポイントシグネチャ

```python
@router.post("/cancel", response_class=HTMLResponse)
async def cancel_submit(request: Request) -> RedirectResponse
```

### 受け取るフォームフィールド

| フィールド名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `token` | `str` | ◯ | キャンセルトークン（UUID）。空文字の場合は処理をスキップ |
| `reason` | `str` | ✗ | キャンセル理由（任意テキスト） |

### 戻り値

| 条件 | 戻り値 | ステータスコード |
|------|--------|----------------|
| 常に（処理の成否に関わらず） | `RedirectResponse(f"/cancel?token={token}&done=1")` | 303 |

---

## 3. 処理フロー詳細

```python
async def cancel_submit(request: Request):
    form = await request.form()
    token  = str(form.get("token", "")).strip()
    reason = str(form.get("reason", "")).strip()

    if token:
        # 1. トークンで予約データを取得（メール送信に使用）
        reservation = await asyncio.to_thread(get_reservation_by_token, token)

        # 2. シートのキャンセル済みフラグを更新
        await asyncio.to_thread(cancel_reservation, token, reason)

        # 3. 予約データが取得できた場合のみメール送信
        if reservation:
            _fire(asyncio.to_thread(send_cancellation_confirmation, reservation, reason))
            _fire(asyncio.to_thread(send_cancellation_notification, reservation, reason))

    # 4. token の有無・処理の成否に関わらずリダイレクト
    return RedirectResponse(f"/cancel?token={token}&done=1", status_code=303)
```

---

## 4. `get_reservation_by_token()` 詳細

```python
def get_reservation_by_token(token: str) -> dict | None
```

### 処理フロー

```
1. get_gc().open_by_key(SPREADSHEET_ID) でスプレッドシートを開く
2. ws.worksheet("WS予約") でシートを取得
   存在しない場合: None を返す
3. ws.get_all_records() で全行を辞書リストとして取得
4. 各行の "キャンセルトークン" フィールドと token を比較
5. 一致する行があれば dict を返す
6. 一致しない場合は None を返す
```

### 戻り値

| 条件 | 戻り値 |
|------|--------|
| トークンが見つかった | 予約データの dict（シートの全カラムを含む） |
| シートが存在しない | None |
| トークンが見つからない | None |

---

## 5. `cancel_reservation()` 詳細

```python
def cancel_reservation(token: str, reason: str = "") -> bool
```

### 引数

| 引数 | 型 | 説明 |
|------|----|------|
| `token` | `str` | キャンセルトークン（UUID） |
| `reason` | `str` | キャンセル理由（空文字可） |

### 処理フロー

```
1. get_gc().open_by_key(SPREADSHEET_ID) でスプレッドシートを開く
2. ws.worksheet("WS予約") でシートを取得
   存在しない場合: False を返す
3. headers = ws.row_values(1) でヘッダー行を取得
4. 必要な列インデックスを特定:
   - token_col  = headers.index("キャンセルトークン") + 1
   - done_col   = headers.index("キャンセル済み") + 1
   - reason_col = headers.index("キャンセル理由") + 1
   - dt_col     = headers.index("キャンセル日時") + 1
   → いずれかが存在しない場合: ValueError → False を返す
5. col_vals = ws.col_values(token_col) でトークン列の全値を取得
6. ヘッダー行(index=0)をスキップして各値を比較
7. token が一致する行（row=i）を見つけたら:
   - ts = datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S")
   - ws.update_cell(i, done_col, "TRUE")
   - ws.update_cell(i, reason_col, reason)
   - ws.update_cell(i, dt_col, ts)
   - True を返す
8. 見つからない場合: False を返す
```

### セル更新の詳細

| カラム | 更新内容 |
|-------|---------|
| キャンセル済み | `"TRUE"` |
| キャンセル理由 | reason パラメータの値（空文字可） |
| キャンセル日時 | JST の `YYYY-MM-DD HH:MM:SS` |

### 注意

- `ws.update_cell()` を 3 回個別に呼び出す（1 APIリクエスト × 3）
- セル更新は逐次実行（バッチ更新なし）

---

## 6. メール送信詳細

### `send_cancellation_confirmation()` — ユーザー向けキャンセル完了メール

| 項目 | 内容 |
|------|------|
| 送信元 | `habitatoides@gmail.com`（settings.gmail_sender） |
| 送信先 | `reservation["メール"]` |
| 件名 | `【予約キャンセル完了】{イベント名} — ei8ht plants` |
| OAuth RT | `settings.gmail_refresh_token` |

本文の構成:

```
{お名前} 様

以下のご予約のキャンセルを承りました。

━━━━━━━━━━━━━━━━━━
イベント　：{イベント名}
ご希望日　：{希望日（YYYY/MM/DD形式）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
━━━━━━━━━━━━━━━━━━

またのご参加をお待ちしております。
ご不明な点がございましたら公式ホームページ内「CONTACT」よりお問い合わせください。
https://ei8htplants.onrender.com/contact

ei8ht plants / Habitat Oides
https://ei8htplants.onrender.com/events
```

### `send_cancellation_notification()` — 運営向けキャンセル通知メール

| 項目 | 内容 |
|------|------|
| 送信元 | `habitatoides@gmail.com` |
| 送信先 | `habitatoides@gmail.com`（自分宛て） |
| 件名 | `【キャンセル通知】{イベント名} — {お名前} 様` |
| OAuth RT | `settings.gmail_refresh_token` |

本文の構成:

```
ワークショップ予約がキャンセルされました。

━━━━━━━━━━━━━━━━━━
【キャンセル対象予約】
イベント　：{イベント名}
お名前　　：{お名前} 様
ご希望日　：{希望日（YYYY/MM/DD形式）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
キャンセル理由：{reason}（reason がある場合のみ）
━━━━━━━━━━━━━━━━━━
```

---

## 7. 処理の依存関係と非同期設計

```
await asyncio.to_thread(get_reservation_by_token, token)
  │ ← reservation を確認してからキャンセル処理を行う
  ↓
await asyncio.to_thread(cancel_reservation, token, reason)
  │ ← シートへの書き込みが完了してからメール送信
  ↓
_fire(send_cancellation_confirmation)  ← 非同期（fire-and-forget）
_fire(send_cancellation_notification)  ← 非同期（fire-and-forget）
```

- `get_reservation_by_token` と `cancel_reservation` は順次実行（await）
- メール送信は `_fire()` で非同期実行（リダイレクトレスポンスを待たせない）
- メール送信の成否はキャンセル処理の成否に影響しない

---

## 8. シーケンス図

```
ブラウザ         FastAPI          asyncio.to_thread  Google Sheets     Gmail API
  |                |                    |                  |               |
  |--POST /cancel->|                   |                  |               |
  |  token=UUID    |                   |                  |               |
  |  reason=テキスト|                  |                  |               |
  |                |-- await to_thread(get_reservation_by_token) ----->   |
  |                |                    |-- ws.get_all_records() ------>  |
  |                |                    |<-- rows[] ----------------------|
  |                |                    | トークン一致行を検索             |
  |                |<-- reservation dict|                                 |
  |                |                                                      |
  |                |-- await to_thread(cancel_reservation) ---------->    |
  |                |                    |-- ws.row_values(1) -------->    |
  |                |                    |<-- headers --------------------|
  |                |                    |-- ws.col_values(token_col) -->  |
  |                |                    |<-- col_vals --------------------|
  |                |                    | トークン一致行を特定             |
  |                |                    |-- ws.update_cell(i, done_col, "TRUE") -->
  |                |                    |-- ws.update_cell(i, reason_col, reason) -->
  |                |                    |-- ws.update_cell(i, dt_col, ts) -->
  |                |                    |<-- (完了) -----------------------|
  |                |<-- True ----------|                                   |
  |                |                                                       |
  |                |-- _fire(to_thread(send_cancellation_confirmation)) --> (非同期)
  |                |   ユーザーにキャンセル完了メール
  |                |-- _fire(to_thread(send_cancellation_notification)) --> (非同期)
  |                |   運営にキャンセル通知メール
  |                |                                                       |
  |<--303 Redirect-|                                                       |
  |  /cancel?token=UUID&done=1
```

---

## 9. バリデーションルール

### フロントエンド

| フィールド | バリデーション |
|-----------|--------------|
| token | hidden フィールド（改ざん防止は実装なし） |
| キャンセル理由 | 任意。`confirm()` ダイアログで意図確認あり |

### バックエンド

| フィールド | 処理 |
|-----------|------|
| `token` | `str(form.get("token", "")).strip()` — 空文字の場合は処理全体をスキップ |
| `reason` | `str(form.get("reason", "")).strip()` — バリデーションなし |

### セキュリティ上の注意

- token は UUID v4（128ビット乱数）のため推測攻撃は現実的でない
- CSRF 対策は未実装（セッションベースのトークン検証なし）
- token が URL に含まれるため、ブラウザ履歴に残る可能性がある

---

## 10. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `get_reservation_by_token()` シートなし | — | None を返す → メール送信スキップ |
| `cancel_reservation()` シートなし | — | False を返す（処理は続行し、303 リダイレクトが返る） |
| `cancel_reservation()` ヘッダー列不足 | `ValueError` | False を返す（例外を上位に伝播しない） |
| `cancel_reservation()` シートへの書き込み失敗 | `gspread.exceptions.APIError` | `cancel_submit` に `try/except` がないため、`HTMLResponse(500)` になる可能性あり |
| `send_cancellation_confirmation()` 失敗 | — | `email.py` 内で `except Exception: print(...)` で握りつぶし |
| `send_cancellation_notification()` 失敗 | — | 同上 |

---

## 11. 正常系・準正常系・異常系パターン

### 正常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| N1 | 有効なトークンでキャンセル実行（キャンセル理由あり） | シート更新 + メール2通送信 + `/cancel?token=UUID&done=1` に 303 リダイレクト |
| N2 | 有効なトークンでキャンセル実行（キャンセル理由なし） | シート更新（理由は空文字）+ メール2通送信 + リダイレクト |

### 準正常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| Q1 | token が空文字で POST | `cancel_reservation` は呼ばれない。`/cancel?token=&done=1` にリダイレクト |
| Q2 | 存在しない token で POST | `get_reservation_by_token` → None → メール送信スキップ。`cancel_reservation` は呼ばれる（False 返却） → リダイレクト |
| Q3 | 既にキャンセル済みのトークンで再度 POST | `cancel_reservation` は再度実行される（二重キャンセルが可能） → キャンセル日時が上書きされる |
| Q4 | Gmail 環境変数未設定 | メール送信スキップ（SKIP ログ出力）。シート更新は成功 |

### 異常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| E1 | Sheets API の認証失敗 | `cancel_submit` に `try/except` がないため例外が伝播 → FastAPI デフォルトの 500 レスポンス |

---

## 12. 状態遷移（WS予約シートの行）

```
[初期状態] 予約直後
  キャンセル済み: ""
  キャンセル理由: ""
  キャンセル日時: ""

  ↓ cancel_reservation(token, reason) 実行

[キャンセル完了]
  キャンセル済み: "TRUE"
  キャンセル理由: reason（空文字可）
  キャンセル日時: "YYYY-MM-DD HH:MM:SS"（JST）
```

- キャンセル後の取り消し機能は未実装
- 管理画面から手動でフラグを変更することは可能（Sheets 直接編集）
