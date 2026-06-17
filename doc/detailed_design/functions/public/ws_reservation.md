# WS予約送信機能 詳細設計書

## 1. 機能概要

| 項目 | 内容 |
|------|------|
| 機能名 | ワークショップ予約送信 |
| エンドポイント | `POST /reserve` |
| 担当モジュール | `app/routes/public.py` → `reserve_submit()` |
| 書き込み関数 | `app/sheets.py` → `create_ws_reservation()` |
| メール関数 | `app/email.py` → `send_reservation_confirmation()`, `send_reservation_notification()` |
| 説明 | 予約フォームからの送信を受け取り、WS予約シートに記録し、ユーザーと運営にメールを送信する。 |

---

## 2. エンドポイントシグネチャ

```python
@router.post("/reserve", response_class=HTMLResponse)
async def reserve_submit(request: Request) -> RedirectResponse | HTMLResponse
```

### 引数

| 引数 | 型 | 説明 |
|------|----|------|
| `request` | `Request` | フォームデータを含む FastAPI リクエストオブジェクト |

### 受け取るフォームフィールド

| フィールド名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `row` | `int` | ◯ | スプレッドシートの行番号（リダイレクト先 URL に使用） |
| `event_name` | `str` | ◯ | イベント名（`hidden` フィールド） |
| `name` | `str` | ◯ | 申し込み者名 |
| `email` | `str` | ◯ | メールアドレス |
| `date` | `str` | ◯ | 希望日（`YYYY-MM-DD` 形式） |
| `time` | `str` | ◯ | 希望時間帯（例: `"13:00-14:00"`） |
| `participants` | `str` | ◯ | 参加人数（数値の文字列） |
| `bring-pot` | `str \| None` | ✗ | チェックで `"yes"`、未チェックで `None` |
| `bring-plant` | `str \| None` | ✗ | チェックで `"yes"`、未チェックで `None` |
| `message` | `str` | ✗ | 備考・質問 |

### 戻り値

| 条件 | 戻り値 | ステータスコード |
|------|--------|----------------|
| 正常完了 | `RedirectResponse(f"/reserve?row={row}")` | 303 |
| 例外発生 | `HTMLResponse(f"Reserve Error: {str(e)}")` | 500 |

---

## 3. 処理フロー詳細

```python
async def reserve_submit(request: Request):
    try:
        form = await request.form()

        # 1. フォームデータを辞書に変換
        row = int(form.get("row", 0))
        reservation_data = {
            "イベント名":  str(form.get("event_name", "")),
            "お名前":      str(form.get("name", "")),
            "メール":      str(form.get("email", "")),
            "希望日":      str(form.get("date", "")),
            "希望時間帯":  str(form.get("time", "")),
            "参加人数":    str(form.get("participants", "")),
            "お持ち込み":  ", ".join(filter(None, [
                "植木鉢" if form.get("bring-pot")   else "",
                "植物"   if form.get("bring-plant") else "",
            ])),
            "備考":        str(form.get("message", "")),
        }

        # 2. スプレッドシートに書き込み（同期・スレッド実行）
        await asyncio.to_thread(create_ws_reservation, reservation_data)
        # ↑ create_ws_reservation 内でキャンセルトークン(UUID)を生成し
        #   reservation_data["キャンセルトークン"] にセットする

        # 3. メール送信（非同期・fire-and-forget）
        _fire(asyncio.to_thread(send_reservation_confirmation, reservation_data))
        _fire(asyncio.to_thread(send_reservation_notification, reservation_data))

        # 4. フラッシュメッセージをセッションに保存
        if hasattr(request, "session"):
            request.session["reserve_flash"] = "ご予約を受け付けました。..."

        # 5. PRG パターンでリダイレクト
        return RedirectResponse(url=f"/reserve?row={row}", status_code=303)

    except Exception as e:
        return HTMLResponse(content=f"Reserve Error: {str(e)}", status_code=500)
```

---

## 4. `create_ws_reservation()` 詳細

```python
def create_ws_reservation(data: dict) -> None
```

### 引数

| 引数 | 型 | 説明 |
|------|----|------|
| `data` | `dict` | 予約データ（呼び出し後に `"キャンセルトークン"` キーが追加される） |

### 処理フロー

```
1. get_gc().open_by_key(SPREADSHEET_ID) でスプレッドシートを開く
2. WS_SHEET_NAME ("WS予約") シートを worksheet() で取得
   存在しない場合: add_worksheet(rows=1000, cols=14) で作成
   ヘッダー行を追記:
     ["タイムスタンプ", "イベント名", "お名前", "メール",
      "希望日", "希望時間帯", "参加人数", "お持ち込み", "備考",
      "キャンセルトークン", "キャンセル済み", "キャンセル理由", "キャンセル日時", "メモ"]
3. _ensure_cancel_columns(ws) でキャンセル関連列の存在を確認・追加
4. token = str(uuid.uuid4()) でキャンセルトークンを生成
5. data["キャンセルトークン"] = token （メール送信側がリンク生成に使用）
6. timestamp = datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S")
7. ws.append_row([timestamp, イベント名, お名前, メール, 希望日, 希望時間帯,
                  参加人数, お持ち込み, 備考, token, "", "", "", ""],
                 value_input_option="RAW")
```

### WS予約シートのカラム構成

| 列 | カラム名 | 内容 |
|----|---------|------|
| A | タイムスタンプ | JST: `YYYY-MM-DD HH:MM:SS` |
| B | イベント名 | フォームの event_name |
| C | お名前 | フォームの name |
| D | メール | フォームの email |
| E | 希望日 | フォームの date（YYYY-MM-DD） |
| F | 希望時間帯 | フォームの time（例: "13:00-14:00"） |
| G | 参加人数 | フォームの participants（数値文字列） |
| H | お持ち込み | "植木鉢, 植物" / "植木鉢" / "植物" / "" |
| I | 備考 | フォームの message |
| J | キャンセルトークン | UUID v4 |
| K | キャンセル済み | 初期: ""。キャンセル後: "TRUE" |
| L | キャンセル理由 | 初期: ""。キャンセル後: テキスト |
| M | キャンセル日時 | 初期: ""。キャンセル後: `YYYY-MM-DD HH:MM:SS` |
| N | メモ | 管理画面から設定可能 |

---

## 5. `_ensure_cancel_columns()` 詳細

```python
_WS_CANCEL_COLS = ["キャンセルトークン", "キャンセル済み", "キャンセル理由", "キャンセル日時", "メモ"]

def _ensure_cancel_columns(ws) -> None:
    headers = ws.row_values(1)
    missing = [c for c in _WS_CANCEL_COLS if c not in headers]
    if missing:
        needed_cols = len(headers) + len(missing)
        if ws.col_count < needed_cols:
            ws.resize(rows=ws.row_count, cols=needed_cols)
        start = len(headers) + 1
        for i, name in enumerate(missing):
            ws.update_cell(1, start + i, name)
```

- 目的: シートが古い形式（キャンセル列なし）の場合に後方互換性を保つ
- 不足カラムのみ末尾に追加する（既存データへの影響なし）

---

## 6. メール送信詳細

### `send_reservation_confirmation()` — ユーザー向け確認メール

| 項目 | 内容 |
|------|------|
| 送信元 | `habitatoides@gmail.com`（settings.gmail_sender） |
| 送信先 | `data["メール"]` |
| 件名 | `【ワークショップご予約確認】{イベント名} — ei8ht plants` |
| OAuth RT | `settings.gmail_refresh_token` |

本文の構成（`_build_reservation_body(data)` が生成）:

```
この度は Habitat Style Workshop へのお申し込みありがとうございます。
以下の内容でご予約を承りました。

━━━━━━━━━━━━━━━━━━
【ご予約内容】
イベント　：{イベント名}
お名前　　：{お名前} 様
ご希望日　：{希望日（YYYY/MM/DD形式）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
お持ち込み：{お持ち込み or "なし"}
備考　　　：{備考}（備考がある場合のみ）
━━━━━━━━━━━━━━━━━━

当日スタッフがご案内いたします。
ご不明な点がございましたら公式ホームページ内「CONTACT」よりお問い合わせください。
https://ei8htplants.onrender.com/contact

──────────────────
▼ キャンセルはこちら
https://ei8htplants.onrender.com/cancel?token={キャンセルトークン}
※ キャンセルの場合は上記リンクから手続きをお願いします。

ei8ht plants / Habitat Oides
https://ei8htplants.onrender.com/events
```

### `send_reservation_notification()` — 運営向け通知メール

| 項目 | 内容 |
|------|------|
| 送信元 | `habitatoides@gmail.com` |
| 送信先 | `habitatoides@gmail.com`（自分宛て） |
| 件名 | `【新規予約】{イベント名} — {お名前} 様` |
| OAuth RT | `settings.gmail_refresh_token` |

本文:

```
新しいワークショップ予約が入りました。

━━━━━━━━━━━━━━━━━━
イベント　：{イベント名}
お名前　　：{お名前} 様
メール　　：{メール}
ご希望日　：{希望日（YYYY/MM/DD形式）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
お持ち込み：{お持ち込み or "なし"}
備考　　　：{備考}（備考がある場合のみ）
━━━━━━━━━━━━━━━━━━
```

---

## 7. 非同期処理の設計

### `asyncio.to_thread` による同期関数の非同期化

- `create_ws_reservation` は gspread の同期 API を使用するため `asyncio.to_thread` でラップ
- `await asyncio.to_thread(...)` → 完了を待ってから次の処理に進む（予約確定を保証）

### `_fire()` による fire-and-forget

```python
def _fire(coro) -> None:
    task = asyncio.create_task(coro)
    _task_refs.add(task)           # GC による途中消去を防ぐため参照を保持
    task.add_done_callback(_task_refs.discard)  # 完了後に参照を解放
```

- メール送信は `_fire()` で非同期実行（レスポンスを待たせない）
- メール送信の失敗は `email.py` 内で捕捉してログ出力し、上位に例外を伝播させない
- **重要:** `create_ws_reservation()` が成功した後にリダイレクトが返るため、メール送信の失敗は予約の成立に影響しない

---

## 8. お持ち込みフィールドの変換ロジック

```python
"お持ち込み": ", ".join(filter(None, [
    "植木鉢" if form.get("bring-pot")   else "",
    "植物"   if form.get("bring-plant") else "",
]))
```

| bring-pot | bring-plant | 結果 |
|-----------|-------------|------|
| チェックなし | チェックなし | `""` |
| チェックあり | チェックなし | `"植木鉢"` |
| チェックなし | チェックあり | `"植物"` |
| チェックあり | チェックあり | `"植木鉢, 植物"` |

---

## 9. シーケンス図（詳細）

```
ブラウザ         FastAPI          asyncio.to_thread  Google Sheets     Gmail API
  |                |                    |                  |               |
  |--POST /reserve->|                   |                  |               |
  |                |-- await to_thread(create_ws_reservation) -------->    |
  |                |                    |                  |               |
  |                |                    |-- worksheet("WS予約") 取得 -->   |
  |                |                    |<-- ws オブジェクト --------------|
  |                |                    |-- _ensure_cancel_columns(ws) --> |
  |                |                    |-- uuid.uuid4() でトークン生成    |
  |                |                    |-- ws.append_row([...]) -------> |
  |                |                    |<-- (完了) ----------------------|
  |                |<-- (完了) ---------|                                  |
  |                |                                                       |
  |                |-- _fire(to_thread(send_reservation_confirmation))     |
  |                |   ├── (非同期開始)                                    |
  |                |   └── Gmail API でメール送信 ---------------------->  |
  |                |-- _fire(to_thread(send_reservation_notification))     |
  |                |   ├── (非同期開始)                                    |
  |                |   └── Gmail API でメール送信 ---------------------->  |
  |                |                                                       |
  |                | session["reserve_flash"] = "受付完了メッセージ"       |
  |<--303 Redirect-|                                                       |
  |   /reserve?row=N
```

---

## 10. バリデーションルール

### フロントエンド（POST 前に HTML5 + JS で保証）

| フィールド | 制約 |
|-----------|------|
| 希望日 | `required`、セレクト形式のため空値不可 |
| 希望時間帯 | `required`、残席確認が完了するまで disabled |
| 参加人数 | 残席 > 0 であることを API で確認済み |
| お名前 | `required` |
| メール | `required`, `type="email"` |

### バックエンド（現状はバリデーションなし）

- `row` のみ `int()` 変換を行い、失敗で例外発生 → 500 エラー
- その他フィールドは `str()` 変換のみ（空文字を許容）
- **注意:** バックエンドでのメールアドレス形式チェックは未実装。フロントのバリデーションに依存している。

---

## 11. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `int(form.get("row", 0))` | `ValueError` | `except Exception` → `HTMLResponse("Reserve Error: ...", 500)` |
| `create_ws_reservation()` Sheets API 失敗 | `gspread.exceptions.APIError` | 同上。この場合は予約データがシートに書き込まれていないことに注意 |
| `send_reservation_confirmation()` 失敗 | — | `email.py` 内 `except Exception: print(...)` で握りつぶし |
| `send_reservation_notification()` 失敗 | — | 同上 |
| Gmail API 認証失敗 | — | `email.py` 内: `if not refresh_token or not client_id: print("SKIP"); return` |
| メール宛先が空 | — | `email.py` 内: `if not recipient: print("SKIP"); return` |

---

## 12. 正常系・準正常系・異常系パターン

### 正常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| N1 | 全フィールドを入力して送信（bring-pot: on, bring-plant: on） | シートに "植木鉢, 植物" で記録、メール2通送信、モーダル表示 |
| N2 | 持ち込みチェックなし | シートの「お持ち込み」が "" で記録 |
| N3 | 備考を空白のまま送信 | シートに "" で記録、確認メールの備考行は省略 |

### 準正常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| Q1 | Gmail 環境変数未設定 | シートへの記録は成功。メール送信はスキップ（SKIP ログ出力） |
| Q2 | メールアドレスが空（フロントバリデーション回避時） | シートへの記録は成功。確認メール送信をスキップ |

### 異常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| E1 | Sheets API の認証失敗 | `HTMLResponse("Reserve Error: ...", 500)` |
| E2 | `row` が数値変換できない文字列 | `HTMLResponse("Reserve Error: ValueError ...", 500)` |
