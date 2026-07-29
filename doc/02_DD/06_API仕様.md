# DD-06 — API仕様

ベースURL（開発）: `http://localhost:8000/api`  
ベースURL（本番）: `https://<ドメイン>/api`

全リクエスト `Content-Type: application/json`（アップロードエンドポイントを除く）

---

## 共通エラーレスポンス形式

```json
{
  "detail": "エラーメッセージ"
}
```

| HTTPステータス | 原因 |
|---|---|
| 400 Bad Request | すでにキャンセル済みの予約に対してキャンセル操作を行った |
| 401 Unauthorized | Bearerトークン未送信または無効 |
| 404 Not Found | リソースが存在しない |
| 409 Conflict | WSセッションが満席 |
| 422 Unprocessable Entity | Pydanticバリデーションエラー（型不一致・必須フィールド欠如等） |
| 500 Internal Server Error | Supabase接続エラー・メール設定不備等 |

---

## Upload

### POST /api/upload

画像ファイルを Supabase Storage にアップロードし、公開URLを返す。

**認証**: Bearer JWT 必須

**リクエスト**: `multipart/form-data`

| フィールド | 型 | 説明 |
|---|---|---|
| `file` | File | アップロードするファイル |

**制約**

| 項目 | 値 |
|---|---|
| 許可 MIME タイプ | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| 最大ファイルサイズ | 10MB |
| ファイル名 | `{uuid}{拡張子}` で保存（元ファイル名を使用しない） |

**レスポンス `200`**

```json
{
  "url": "https://xxxx.supabase.co/storage/v1/object/public/images/abcd-1234.jpg"
}
```

**エラー**

| ステータス | 原因 |
|---|---|
| `400` | 許可されていない MIME タイプ |
| `413` | ファイルサイズが 10MB 超 |
| `401` | Bearerトークン未送信または無効 |

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

**認証**: Bearer JWT 必須

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

**認証**: Bearer JWT 必須

**リクエストボディ**: POST と同形式  
**レスポンス `200`**: 更新後のイベント

---

### DELETE /api/events/{event_id}

イベント削除。`event_images` はカスケード削除。

**認証**: Bearer JWT 必須

**レスポンス `200`**: `{"ok": true}`

---

### GET /api/events/finances

全イベントの収支データ一括取得。

**認証**: Bearer JWT 必須

**レスポンス `200`**: 下記オブジェクトの配列（収支登録済みイベントのみ）

---

### GET /api/events/{event_id}/finances

イベント単件の収支データ取得。未登録の場合はデフォルト値を返す。

**認証**: Bearer JWT 必須

**レスポンス `200`**

```json
{
  "id": "uuid",
  "event_id": "uuid",
  "sales": 150000,
  "booth_fee": 20000,
  "distance": 80,
  "gas_price": 170,
  "expressway_toll": 3000,
  "accommodation": 0,
  "ws_participants": 10,
  "payment_flag": true,
  "other_expenses": 5000,
  "other_expenses_note": "消耗品",
  "notes": "備考",
  "updated_at": "2024-10-01T10:00:00+09:00"
}
```

---

### PUT /api/events/{event_id}/finances

イベントの収支データを登録・更新（upsert）。

**認証**: Bearer JWT 必須

**リクエストボディ**: `GET` レスポンスから `id`, `event_id`, `updated_at` を除いた形式

**レスポンス `200`**: upsert後のレコード

---

### GET /api/events/{event_id}/sessions

イベントに紐付くWSセッション一覧と各セッションの予約数を取得。

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "event_id": "uuid",
    "time_label": "10:00〜11:30",
    "max_participants": 8,
    "reserved_count": 3,
    "display_order": 0
  }
]
```

`display_order` 昇順。セッションが未登録の場合は空配列 `[]`。

---

### PATCH /api/events/{event_id}/page

イベント専用サイトのコンテンツを更新。

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "page_content": {
    "hero": { "image_url": "https://...", "tagline": "...", "subtitle": "..." },
    "venue": { "address": "...", "access": "...", "map_url": "..." },
    "concept": "テキスト",
    "lineup": [{ "title": "...", "description": "...", "image_url": "..." }],
    "workshop": { "title": "...", "description": "...", "note": "..." },
    "guests": [{ "name": "...", "role": "...", "bio": "...", "image_url": "...", "instagram_url": "..." }],
    "archive": { "enabled": true, "title": "...", "message": "...", "gallery": ["url1"] }
  }
}
```

**レスポンス `200`**: 更新後のイベント（imagesを含む）

---

### PUT /api/events/{event_id}/sessions

イベントのWSセッションを全置換。

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "sessions": [
    { "time_label": "10:00〜11:30", "max_participants": 8 },
    { "time_label": "13:00〜14:30", "max_participants": 8 }
  ]
}
```

既存セッションを全削除して再挿入。`display_order` はリスト順に 0, 1, 2... を付与。

**レスポンス `200`**: 作成後のセッション配列

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

**認証**: Bearer JWT 必須

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

### PATCH /api/gallery/{image_id}

ギャラリー画像の表示順を更新。隣接画像と `display_order` を swap する際に2回呼ぶ。

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "display_order": 3
}
```

**レスポンス `200`**: 更新後のレコード

---

### DELETE /api/gallery/{image_id}

**認証**: Bearer JWT 必須

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

**認証**: Bearer JWT 必須

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

**認証**: Bearer JWT 必須

**リクエストボディ**: POST と同形式  
**レスポンス `200`**: 更新後のレコード

---

### DELETE /api/stockists/{stockist_id}

**認証**: Bearer JWT 必須

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

**認証**: Bearer JWT 必須

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

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "is_read": true
}
```

**レスポンス `200`**: 更新後のレコード

---

### POST /api/contacts/{contact_id}/reply

問い合わせ者へ返信メールを送信する。送信後、該当レコードを既読に更新する。

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "subject": "Re: ei8ht plants お問い合わせ", // required
  "body": "メール本文テキスト"                 // required
}
```

**レスポンス `200`**: `{"ok": true}`  
**レスポンス `404`**: 対象の問い合わせが存在しない  
**レスポンス `500`**: `{"detail": "Mail not configured"}` (環境変数未設定時)

---

## Reserve

### POST /api/reserve

ワークショップ予約作成。予約者宛に確認メールを送信する。

**リクエストボディ**

```json
{
  "event_id": "uuid",           // required
  "name": "山田太郎",            // required
  "email": "taro@example.com",  // required, EmailStr
  "phone": "090-0000-0000",     // optional
  "participants": 2,            // optional, default 1
  "note": "備考テキスト",        // optional
  "session_id": "uuid",         // optional, WSセッションUUID
  "bring_plant": false,         // optional, default false
  "bring_pot": false,           // optional, default false
  "preferred_date": "2025-10-01", // optional, 複数日イベントで選択した日付
  "preferred_time": "13:00"     // optional（現在フロントから未使用）
}
```

定員チェックは `participants` カラムの合計値で行う（行数ではない）。

**レスポンス `200`**: 作成されたレコード（statusは"pending"）  
**レスポンス `409`**: `{"detail": "このセッションは満席です"}` （`session_id` 指定時に定員超過）

---

### GET /api/reserves

予約一覧取得（管理者用）。

**認証**: Bearer JWT 必須

**クエリパラメータ**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `event_id` | string (UUID) | なし | 指定すると該当イベントの予約のみ返す |

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
    "session_id": "uuid",
    "bring_plant": false,
    "bring_pot": true,
    "preferred_date": "2025-10-01",
    "preferred_time": null,
    "created_at": "2024-10-01T10:00:00+09:00"
  }
]
```

`created_at` 降順で返す。

---

### PATCH /api/reserves/{reservation_id}

予約ステータス更新（管理者用）。

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "status": "confirmed"    // "pending" | "confirmed" | "cancelled"
}
```

**副作用**: `status = "confirmed"` かつ `cancel_token` が未設定の場合:
1. 8桁ランダム数字のキャンセルトークンを生成して保存
2. キャンセルリンクを含む確定メールを予約者に送信（`_send_cancel_link_email`）
3. `_sync_reserved_count(session_id)` でデノーマライズ値を更新

**レスポンス `200`**: 更新後のレコード

---

### POST /api/reserve/cancel

キャンセルトークンで予約をキャンセルする。認証不要（一般ユーザー向け）。

**リクエストボディ**

```json
{
  "token": "12345678"    // 8桁数字
}
```

**処理**:
1. `cancel_token = token` の予約を全件取得（ステータス不問）
2. 1件も存在しない場合 → 404
3. 未キャンセルのものが存在しない場合 → 400
4. 最新の未キャンセル行を `cancelled` に更新
5. `_sync_reserved_count(session_id)` でデノーマライズ値を更新

**レスポンス `200`**: 更新後のレコード  
**レスポンス `400`**: `{"detail": "この予約はすでにキャンセル済みです"}`  
**レスポンス `404`**: `{"detail": "キャンセルIDが見つかりません"}`

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

**認証**: Bearer JWT 必須

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

**認証**: Bearer JWT 必須

**レスポンス `200`**: `{"ok": true}`

---

## APIクライアント (`lib/api.ts`) との対応

```
api.upload(file)                         → POST   /api/upload  (multipart/form-data, auth)
api.stats()                              → 内部で複数エンドポイントを並列呼び出し
api.events.list(past)                    → GET    /api/events?past={past}
api.events.get(id)                       → GET    /api/events/{id}
api.events.create(body)                  → POST   /api/events  (auth)
api.events.update(id, body)              → PUT    /api/events/{id}  (auth)
api.events.delete(id)                    → DELETE /api/events/{id}  (auth)
api.events.getAllFinances()              → GET    /api/events/finances  (auth)
api.events.getFinances(id)               → GET    /api/events/{id}/finances  (auth)
api.events.saveFinances(id, body)        → PUT    /api/events/{id}/finances  (auth)
api.events.getSessions(id)               → GET    /api/events/{id}/sessions
api.events.saveSessions(id, sessions)    → PUT    /api/events/{id}/sessions  (auth)
api.events.savePageContent(id, content)  → PATCH  /api/events/{id}/page  (auth)
api.gallery.list(brand?)                 → GET    /api/gallery[?brand=...]
api.gallery.add(body)                    → POST   /api/gallery  (auth)
api.gallery.updateOrder(id, n)           → PATCH  /api/gallery/{id}  (auth)
api.gallery.delete(id)                   → DELETE /api/gallery/{id}  (auth)
api.stockists.list()                     → GET    /api/stockists
api.stockists.add(body)                  → POST   /api/stockists  (auth)
api.stockists.patch(id, body)            → PATCH  /api/stockists/{id}  (auth)
api.stockists.delete(id)                 → DELETE /api/stockists/{id}  (auth)
api.contact.send(body)                   → POST   /api/contact
api.contact.list()                       → GET    /api/contacts  (auth)
api.contact.markRead(id, b)              → PATCH  /api/contacts/{id}  (auth)
api.contact.reply(id, sub, body)         → POST   /api/contacts/{id}/reply  (auth)
api.reserve.create(body)                 → POST   /api/reserve
api.reserve.list(eventId?)               → GET    /api/reserves[?event_id={eventId}]  (auth)
api.reserve.updateStatus(id, s)          → PATCH  /api/reserves/{id}  (auth)
api.reserve.cancel(token)                → POST   /api/reserve/cancel  (Response 生で返す)
api.collaborations.list()                → GET    /api/collaborations
api.collaborations.add(body)             → POST   /api/collaborations  (auth)
api.collaborations.delete(id)            → DELETE /api/collaborations/{id}  (auth)
```
