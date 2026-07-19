# API設計

公開 API は1エンドポイント。それ以外はすべて SSR（HTML レスポンス）。

---

## `GET /api/reserve/availability`

WS予約フォームが日付・時間帯変更のたびに呼び出す残席確認 API。

### クエリパラメータ

| パラメータ | 必須 | 説明 |
|---|---|---|
| `event_name` | ○ | イベント名 |
| `date` | ○ | 希望日（YYYY-MM-DD） |
| `time` | ○ | 時間帯（HH:MM-HH:MM） |

### レスポンス（JSON）

```json
{ "available": 3, "max": 4 }
```

Sheets API エラー時は `available = max = 4` を返す（安全側フォールバック）。

---

## `POST /admin/reservations/memo`

管理画面からAJAXで呼び出すメモ保存 API。

### 認証

セッション必須。未認証時は `302 /admin/login`。

### リクエスト（`application/x-www-form-urlencoded`）

| フィールド | 型 | 説明 |
|---|---|---|
| `row` | integer | スプレッドシートの行番号（1-indexed） |
| `memo` | string | メモ本文 |

### レスポンス

```json
{ "ok": true }
```
