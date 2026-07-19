# 機能設計：Google Sheets API ラッパー（共通）

## 概要

スプレッドシートへのすべての読み書きは `app/sheets.py` に集約。  
gspread ライブラリを使用し、OAuth2 サービスアカウント認証で接続する。

---

## スプレッドシート構成

| シート名 | 定数 | 用途 |
|---|---|---|
| `イベント一覧` | `EVENTS_SHEET_NAME` | イベントマスタ |
| `WS予約` | `WS_SHEET_NAME` | WS予約データ |
| `お問い合わせ` | `CONTACT_SHEET_NAME` | お問い合わせ受付 |

接続: `gspread.authorize(credentials).open_by_key(SPREADSHEET_ID)`

---

## 主要関数

### イベント系

| 関数 | 説明 |
|---|---|
| `get_all_events()` | 公開用（TTL キャッシュ 5分） |
| `get_all_events_for_admin()` | 管理用（キャッシュなし） |
| `create_event(data)` | 行追加 + キャッシュ無効化 |
| `update_event(row, data)` | 行上書き + キャッシュ無効化 |
| `delete_event(row)` | 行削除 + キャッシュ無効化 |
| `parse_date(s)` | `"YYYY-MM-DD"` → `date` / `None` |

### WS予約系

| 関数 | 説明 |
|---|---|
| `create_ws_reservation(data)` | 14列の行を追加、`_ensure_cancel_columns` 呼び出し |
| `get_all_ws_reservations_for_admin()` | 全件取得、各行に `_row`（行番号）を付与 |
| `get_ws_reservation_count(event)` | 有効（キャンセル未）の予約人数合計 |
| `get_reservation_by_token(token)` | キャンセルトークンで1件検索 |
| `cancel_reservation(token, reason)` | キャンセル済み/理由/日時を更新 |
| `update_reservation_memo(row_num, memo)` | メモ列のみ更新 |

### お問い合わせ系

| 関数 | 説明 |
|---|---|
| `create_contact(data)` | 行追加 |
| `get_all_contacts_for_admin()` | 全件取得、タイムスタンプ降順 |

---

## `_ensure_cancel_columns(ws)`

WS予約シートにキャンセル関連列が存在しない場合に自動追加。

```python
_WS_CANCEL_COLS = ["キャンセルトークン", "キャンセル済み", "キャンセル理由", "キャンセル日時", "メモ"]

def _ensure_cancel_columns(ws):
    headers = ws.row_values(1)
    missing = [c for c in _WS_CANCEL_COLS if c not in headers]
    if not missing:
        return
    needed_cols = len(headers) + len(missing)
    if ws.col_count < needed_cols:
        ws.resize(rows=ws.row_count, cols=needed_cols)  # グリッド超過を防ぐ
    for col_name in missing:
        col_index = len(ws.row_values(1)) + 1
        ws.update_cell(1, col_index, col_name)
```

> `try/except` の外で呼ぶことで、シート作成失敗と列追加処理が混同しないよう分離している。

---

## 非同期実行

sheets.py の関数はすべて同期（gspread は同期）。  
FastAPI のエンドポイントからは `asyncio.to_thread()` 経由で呼ぶ。

```python
reservations = await asyncio.to_thread(get_all_ws_reservations_for_admin)
```
