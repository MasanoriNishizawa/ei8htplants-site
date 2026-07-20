# DD-06 — API仕様

ベースURL（開発）: `http://localhost:8000/api`  
ベースURL（本番）: `https://<ドメイン>/api`

全リクエスト `Content-Type: application/json`

---

## 共通エラーレスポンス形式

```json
{
  "detail": "エラーメッセージ"
}
```

| HTTPステータス | 原因 |
|---|---|
| 422 Unprocessable Entity | Pydanticバリデーションエラー（型不一致・必須フィールド欠如等） |
| 404 Not Found | リソースが存在しない |
| 500 Internal Server Error | Supabase接続エラー・メール設定不備等 |

---

## Events

### GET /api/events

イベント一覧取得。

**クエリパラメータ**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `past` | boolean | `false` | `true`で過去イベント、`false`で開催予定 |

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "name": "イベント名",
    "start_date": "2024-10-01",
    "end_date": "2024-10-02",
    "time": "11:00〜17:00",
    "location": "会場名",
    "booth_number": "A-01",
    "address": "東京都...",
    "official_url": "https://example.com",
    "brands": ["ei8ht plants", "Habitat Oides"],
    "has_workshop": true,
    "ws_requires_reservation": true,
    "is_past": false,
    "display_order": 0,
    "images": [
      { "id": "uuid", "url": "https://...", "display_order": 0 }
    ]
  }
]
```

---

### GET /api/events/{event_id}

イベント単件取得。

**パスパラメータ**: `event_id` (UUID)

**レスポンス `200`**: 上記配列の要素1件  
**レスポンス `404`**: `{"detail": "Not Found"}`

---

### POST /api/events

イベント作成。

**リクエストボディ**

```json
{
  "name": "イベント名",              // required
  "start_date": "2024-10-01",       // required, "YYYY-MM-DD"
  "location": "会場名",             // required
  "end_date": "2024-10-02",         // optional
  "time": "11:00〜17:00",           // optional
  "booth_number": "A-01",           // optional
  "address": "東京都...",            // optional
  "official_url": "https://...",    // optional
  "brands": ["ei8ht plants"],       // optional, default []
  "has_workshop": true,             // optional, default false
  "ws_requires_reservation": true,  // optional, default true
  "is_past": false,                 // optional, default false
  "image_urls": ["https://..."]     // optional, default []
}
```

**レスポンス `200`**: 作成後のイベント（imagesを含む）

---

### PUT /api/events/{event_id}

イベント更新。画像を全置換。

**リクエストボディ**: POST と同形式  
**レスポンス `200`**: 更新後のイベント

---

### DELETE /api/events/{event_id}

イベント削除。`event_images` はカスケード削除。

**レスポンス `200`**: `{"ok": true}`

---

## Gallery

### GET /api/gallery

ギャラリー画像一覧取得。

**クエリパラメータ**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `brand` | string | なし | ブランド名でフィルタ。省略時は全件 |

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "url": "https://...",
    "alt": "説明テキスト",
    "brand": "ei8ht plants",
    "display_order": 0
  }
]
```

`brand` が null の画像は全件取得に含まれる（特定ブランドフィルタからは除外される）。

---

### POST /api/gallery

ギャラリー画像追加。

**リクエストボディ**

```json
{
  "url": "https://...",    // required
  "alt": "説明",           // optional
  "brand": "HUE"           // optional, null で全ブランド共通
}
```

**レスポンス `200`**: 作成された画像レコード

---

### DELETE /api/gallery/{image_id}

**レスポンス `200`**: `{"ok": true}`

---

## Stockists

### GET /api/stockists

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "name": "店舗名",
    "area": "東京",
    "address": "東京都...",
    "url": "https://...",
    "brands": ["ei8ht plants", "HUE"],
    "display_order": 0
  }
]
```

---

### POST /api/stockists

**リクエストボディ**

```json
{
  "name": "店舗名",     // required
  "area": "東京",       // optional
  "address": "住所",    // optional
  "url": "https://...", // optional
  "brands": []          // optional, default []
}
```

**レスポンス `200`**: 作成されたレコード

---

### PATCH /api/stockists/{stockist_id}

取扱店情報更新。

**リクエストボディ**: POST と同形式  
**レスポンス `200`**: 更新後のレコード

---

### DELETE /api/stockists/{stockist_id}

**レスポンス `200`**: `{"ok": true}`

---

## Contact

### POST /api/contact

お問い合わせ送信。DBへの保存とメール送信を行う。

**リクエストボディ**

```json
{
  "name": "山田太郎",           // required
  "email": "taro@example.com",  // required, EmailStr バリデーション
  "message": "お問い合わせ内容" // required
}
```

**レスポンス `200`**: `{"ok": true}`  
**レスポンス `500`**: `{"detail": "Mail not configured"}` (環境変数未設定時)

---

### GET /api/contacts

お問い合わせ一覧取得（管理者用）。

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "name": "山田太郎",
    "email": "taro@example.com",
    "message": "お問い合わせ内容",
    "is_read": false,
    "created_at": "2024-10-01T10:00:00+09:00"
  }
]
```

`created_at` 降順で返す。

---

### PATCH /api/contacts/{contact_id}

既読状態を更新。

**リクエストボディ**

```json
{
  "is_read": true
}
```

**レスポンス `200`**: 更新後のレコード

---

## Reserve

### POST /api/reserve

ワークショップ予約作成。

**リクエストボディ**

```json
{
  "event_id": "uuid",          // required
  "name": "山田太郎",           // required
  "email": "taro@example.com", // required, EmailStr
  "phone": "090-0000-0000",    // optional
  "participants": 2,           // optional, default 1
  "note": "備考テキスト"        // optional
}
```

**レスポンス `200`**: 作成されたレコード（statusは"pending"）

---

### GET /api/reserves

予約一覧取得（管理者用）。

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "event_id": "uuid",
    "name": "山田太郎",
    "email": "taro@example.com",
    "phone": null,
    "participants": 2,
    "note": null,
    "status": "pending",
    "created_at": "2024-10-01T10:00:00+09:00"
  }
]
```

`created_at` 降順で返す。

---

### PATCH /api/reserves/{reservation_id}

予約ステータス更新（管理者用）。

**リクエストボディ**

```json
{
  "status": "confirmed"    // "pending" | "confirmed" | "cancelled"
}
```

**レスポンス `200`**: 更新後のレコード

---

## Collaborations

### GET /api/collaborations

コラボレーション一覧取得。

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "title": "タイトル",
    "partner_name": "パートナー名",
    "description": "説明テキスト",
    "video_url": "https://...",
    "image_url": "https://...",
    "event_date": "2024-09-01",
    "display_order": 0,
    "created_at": "2024-09-01T00:00:00+09:00"
  }
]
```

`display_order` 昇順で返す。

---

### POST /api/collaborations

コラボレーション追加。

**リクエストボディ**

```json
{
  "title": "タイトル",          // required
  "partner_name": "パートナー", // optional
  "description": "説明",       // optional
  "video_url": "https://...",  // optional
  "image_url": "https://...",  // optional
  "event_date": "2024-09-01"   // optional, "YYYY-MM-DD"
}
```

**レスポンス `200`**: 作成されたレコード（display_order は既存件数）

---

### DELETE /api/collaborations/{collab_id}

**レスポンス `200`**: `{"ok": true}`

---

## APIクライアント (`lib/api.ts`) との対応

```
api.events.list(past)         → GET  /api/events?past={past}
api.events.get(id)            → GET  /api/events/{id}
api.gallery.list(brand?)      → GET  /api/gallery[?brand=...]
api.stockists.list()          → GET  /api/stockists
api.stockists.patch(id, body) → PATCH /api/stockists/{id}
api.contact.send(body)        → POST  /api/contact
api.contact.list()            → GET  /api/contacts
api.contact.markRead(id, b)   → PATCH /api/contacts/{id}
api.reserve.create(body)      → POST  /api/reserve
api.reserve.list()            → GET  /api/reserves
api.reserve.updateStatus(id,s)→ PATCH /api/reserves/{id}
api.collaborations.list()     → GET  /api/collaborations
api.collaborations.add(body)  → POST  /api/collaborations
api.collaborations.delete(id) → DELETE /api/collaborations/{id}
```
