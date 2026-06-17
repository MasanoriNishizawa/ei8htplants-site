# API 設計

公開 API は残席確認の1エンドポイントのみ。  
その他はすべてサーバーサイドレンダリング（HTMLレスポンス）。

---

## 公開 API

### `GET /api/reserve/availability`

指定イベント×日付×時間帯の残席数を返す。  
WS予約フォームの参加人数セレクトが日付・時間帯の変更ごとに呼び出す。

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `event_name` | string | ○ | イベント名（シートの「イベント名」と一致） |
| `date` | string | ○ | 希望日（"YYYY-MM-DD"） |
| `time` | string | ○ | 時間帯（"HH:MM-HH:MM"） |

**レスポンス**

```json
{
  "available": 3,
  "max": 4
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `available` | integer | 残り予約可能人数（0以上） |
| `max` | integer | 最大定員（常に4） |

**エラー時** （Sheets API エラーなど）:
```json
{
  "available": 4,
  "max": 4,
  "error": "エラーメッセージ"
}
```
エラー時は安全側に max と同値の available を返す。

---

## 管理 API

### `POST /admin/reservations/memo`

メモを保存する。管理画面からAJAXで呼び出す（ページ遷移なし）。

**認証**: セッション必須。未認証時は `302 /admin/login`。

**リクエストボディ** (`application/x-www-form-urlencoded`)

| フィールド | 型 | 説明 |
|---|---|---|
| `row` | integer | スプレッドシートの行番号（1-indexed） |
| `memo` | string | メモ本文 |

**レスポンス**

```json
{ "ok": true }
```

---

## フロントエンドの Ajax 実装

```javascript
// 残席確認（reserve.html）
fetch(`/api/reserve/availability?event_name=...&date=...&time=...`)
  .then(r => r.json())
  .then(data => { /* 参加人数セレクトを再生成 */ })

// メモ保存（admin_reservations.html）
fetch('/admin/reservations/memo', {
  method: 'POST',
  body: new URLSearchParams({ row, memo })
})
  .then(r => r.json())
  .then(() => { /* 保存済み表示 */ })
```
