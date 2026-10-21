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
| `400` | 許可されていない MIME タイプ、またはファイルサイズが 10MB 超 |
| `401` | Bearerトークン未送信または無効 |

---

### POST /api/upload/video

動画ファイルを Supabase Storage `videos` バケットにアップロードし、公開URLを返す。

**認証**: Bearer JWT 必須

**リクエスト**: `multipart/form-data`

| フィールド | 型 | 説明 |
|---|---|---|
| `file` | File | アップロードするファイル |

**制約**

| 項目 | 値 |
|---|---|
| 許可 MIME タイプ | `video/mp4`, `video/quicktime`, `video/webm`, `video/x-m4v` |
| 最大ファイルサイズ | 500MB |
| ファイル名 | `{uuid}{拡張子}` で保存 |

**レスポンス `200`**

```json
{ "url": "https://xxxx.supabase.co/storage/v1/object/public/videos/abcd-1234.mp4" }
```

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

- 管理者専用の管理情報（`admin_info`。搬入・宿泊・出店料・出店要項など）は応答に含めない（2026-10-16 修正。それ以前は誰でも見られる応答に含まれていた）。管理情報は認証が必要な `GET /api/events/{event_id}/admin-info` で取得する
- 2026-10-16 対策済み（017 の実行で完了）: 以前は FastAPI の応答から除いていても、events テーブルに管理情報の列があったため、Supabase に直接問い合わせると読める状態だった。管理情報は未ログインでは読めない専用テーブル `event_admin_info` に移した（events の古い `admin_info` 列は 017 マイグレーションで削除する。[データベース詳細](05_データベース詳細.md) の event_admin_info の節を参照）。017 を実行するまでは古い列が残るため、応答から `admin_info` を取り除く処理はそのまま残している。017 を実行するまでは events の `admin_info` 列に古い管理情報が残り、未ログインでも Supabase に直接問い合わせると読める。対策が完了するのは 017 の実行後

---

### GET /api/events/{event_id}

イベント単件取得。

**パスパラメータ**: `event_id` (UUID)

**レスポンス `200`**: 上記配列の要素1件（一覧と同じく `admin_info` は含めない）  
**レスポンス `404`**: `{"detail": "Not Found"}`

この取得処理は POST `/api/events`・PUT `/api/events/{event_id}`・PATCH `/api/events/{event_id}/page` の応答を作るときにも使われるため、それらの応答にも `admin_info` は含まれない。

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

**クエリパラメータ**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `date` | string (YYYY-MM-DD) | なし | 指定すると該当日の予約数のみを `reserved_count` に反映する。複数日イベントで日付ごとの空き枠を表示する際に使用。省略時は全日合計 |

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

`reserved_count` はライブ計算値（毎回DBから集計）。`ws_sessions.reserved_count` カラムのデノーマライズ値を使わず、`workshop_reservations` の `participants` 合計で算出する。`session_id` が無効な予約は `preferred_time` 文字列でフォールバック照合する。

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

### GET /api/events/admin-info/dashboard

管理画面のダッシュボード（「出店料の支払い」「今後の搬入予定」）用に、イベントごとの管理情報をまとめて返す（2026-10-21 追加）。

**認証**: Bearer JWT 必須

**対象のイベント**（今日は日本時間）

- 終了日（無ければ開始日）が今日以降のイベント全部
- 終了済みでも、出店料が未払い（`booth_fee_paid` が false）で、出店料（0・空以外）か支払い期限が入っているイベント

**並び順**: 開始日の昇順

**レスポンス `200`**

```json
{
  "items": [
    {
      "event_id": "uuid",
      "name": "秋の植物市",
      "start_date": "2026-10-24",
      "end_date": "2026-10-25",
      "location": "代々木公園",
      "carry_in_time": "2026-10-24T08:00",
      "carry_out_time": "2026-10-25T17:00",
      "hotel_name": null,
      "booth_fee": 14000,
      "booth_fee_pay_method": "事前振込",
      "booth_fee_due": "2026-10-18",
      "booth_fee_paid": false
    }
  ]
}
```

- 管理情報（`event_admin_info`）が無いイベントは、管理情報の項目がすべて `null`、`booth_fee_paid` は `false`
- 「出店料の支払い」「今後の搬入予定」への振り分けと並べ替えは画面側で行う（[DD-03](03_フロントエンドロジック.md) 22節）
- `/api/events/{event_id}/...` より前に登録している（`admin-info` をイベントの ID と取り違えないため）

**エラー**

| ステータス | 原因 |
|---|---|
| `401` | Bearer トークン未送信または無効 |
| `500` | 読み取りエラー（`{"detail": "ダッシュボードの管理情報の取得に失敗しました"}`） |

---

### GET /api/events/{event_id}/admin-info

イベントの管理情報（搬入・搬出時間、宿泊ホテル、出店料、出店要項など）を取得する。

**認証**: Bearer JWT 必須

**パスパラメータ**: `event_id` (UUID)

**レスポンス `200`**

```json
{
  "carry_in_time": "2026-10-24T09:00",
  "carry_out_time": "2026-10-24T17:00",
  "hotel_name": "〇〇ホテル",
  "hotel_fee": 12000,
  "booth_fee": 30000,
  "booth_fee_pay_method": "事前振込",
  "booth_fee_due": "2026-10-01",
  "booth_fee_paid": false,
  "notes": "注意事項メモ",
  "guidelines_text": "主催者から届いた出店要項の本文",
  "guidelines_image_urls": ["https://.../guideline1.jpg"]
}
```

管理情報は専用テーブル `event_admin_info` から読み出す（2026-10-16 変更。それ以前は events テーブルの `admin_info` 列から読んでいた）。管理情報が未登録の場合（このイベントの行がない場合）は空オブジェクト `{}` を返す。保存されている内容をそのまま返すため、出店要項の項目（2026-10-16 追加）がなかった頃に保存した管理情報では `guidelines_text`・`guidelines_image_urls` が応答に含まれない。

**エラー**

| ステータス | 原因 |
|---|---|
| `401` | Bearer トークン未送信または無効 |
| `500` | Supabase 取得エラー |

---

### PUT /api/events/{event_id}/admin-info

イベントの管理情報を保存する。専用テーブル `event_admin_info` に1イベント1行で保存する（このイベントの行がすでにあれば上書き、なければ新しく作る）。保存時に `updated_at`（最終更新日時）も書き込む（2026-10-16 変更。それ以前は events テーブルの `admin_info` 列に上書き保存していた）。

処理の順番:
1. events テーブルに指定したイベントがあるか確かめる。なければ `404` を返して何も保存しない
2. `event_admin_info` に管理情報を保存する

送受信する項目（リクエスト・レスポンスの形）は変更前と同じ。

**認証**: Bearer JWT 必須

**パスパラメータ**: `event_id` (UUID)

**リクエストボディ**（`AdminInfoBody` スキーマ。全フィールド任意）

```json
{
  "carry_in_time": "2026-10-24T09:00",
  "carry_out_time": "2026-10-24T17:00",
  "hotel_name": "〇〇ホテル",
  "hotel_fee": 12000,
  "booth_fee": 30000,
  "booth_fee_pay_method": "事前振込",
  "booth_fee_due": "2026-10-01",
  "booth_fee_paid": false,
  "notes": "注意事項メモ",
  "guidelines_text": "主催者から届いた出店要項の本文",
  "guidelines_image_urls": ["https://.../guideline1.jpg", "https://.../guideline2.png"]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `carry_in_time` | string \| null | 搬入日時（例: "2026-10-24T09:00"） |
| `carry_out_time` | string \| null | 搬出日時 |
| `hotel_name` | string \| null | 宿泊ホテル名 |
| `hotel_fee` | integer \| null | 宿泊料金（円） |
| `booth_fee` | integer \| null | 出店料（円） |
| `booth_fee_pay_method` | string \| null | 支払い方法（"当日現金" / "事前振込" / "その他"） |
| `booth_fee_due` | string \| null | 支払い期限（例: "2026-10-01"） |
| `booth_fee_paid` | boolean | 支払い済みフラグ（デフォルト: false） |
| `notes` | string \| null | 備考・メモ |
| `guidelines_text` | string \| null | 出店要項の文章（2026-10-16 追加） |
| `guidelines_image_urls` | string[] | 出店要項の画像 URL の一覧。アップロードした順（2026-10-16 追加。省略時は空の一覧 `[]`） |

**レスポンス `200`**: `{"ok": true}`

**エラー**

| ステータス | 原因 |
|---|---|
| `401` | Bearer トークン未送信または無効 |
| `404` | 指定した `event_id` のイベントが events テーブルに存在しない |
| `422` | Pydantic バリデーションエラー |
| `500` | Supabase 保存エラー |

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
  "preferred_time": "13:00",    // optional（現在フロントから未使用）
  "lang": "ja"                  // optional, "ja" | "en"。省略時は日本語メールを送信
}
```

定員チェックは `participants` カラムの合計値で行う（行数ではない）。

**副作用**:
1. キャンセルトークン（8桁ランダム数字）を生成して `cancel_token` に保存
2. `_send_confirmation()` で予約受付メールを送信（キャンセルリンク含む。`lang` で日本語/英語を切り替え）
3. `_send_admin_notification()` で管理者へ通知メールを送信

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
    "cancel_token": "12345678",
    "lang": "ja",
    "email_failed": null,
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
  "status": "pending"    // "pending" | "confirmed" | "cancelled"
}
```

`confirmed` は後方互換のため受け付けるが、新規では使用しない。実質的な遷移は `pending` → `cancelled`。

**副作用**:
1. DBの `status` カラムを更新
2. `session_id` がある場合 → `_sync_reserved_count(session_id)` でデノーマライズ値を更新
3. `status = 'cancelled'` の場合 → `_send_cancel_confirmation()` でキャンセル完了メールを予約者に送信

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

## Chat

### POST /api/chat

Gemini（`gemini-flash-lite-latest`）を使った植物相談・ワークショップ案内チャット。会話履歴を送信し、モデルの返答を受け取る。

**認証**: 不要

**リクエストボディ**

```json
{
  "messages": [
    { "role": "user",  "content": "アガベの水やり頻度を教えてください" },
    { "role": "model", "content": "アガベは乾燥を好む植物です..." },
    { "role": "user",  "content": "冬はどうすれば良いですか？" }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `messages` | `Message[]` | 会話履歴（最後の要素が今回の質問）。1〜40 件 |
| `messages[].role` | `"user"` \| `"model"` | 送り手。この2つ以外は受け付けない |
| `messages[].content` | `string` | 本文。1〜2,000 文字で、空白・改行だけは不可。前後の空白は削らずにそのまま使う |

**入力の条件（2026-10-20 追加）**

次のどれかに当てはまると `422` を返す。この判定は処理の最初に行うため、Gemini は呼ばず、送信回数の制限にも数えない。

| 条件 | 例 |
|---|---|
| `messages` が 0 件、または 41 件以上 | `{"messages": []}` |
| `role` が `user`・`model` 以外 | `"role": "system"` |
| `content` が空文字、または空白・改行だけ | `"content": " \n "` |
| `content` が 2,001 文字以上（過去の AI の返事も含めてどの1件でも） | — |
| 最後のメッセージの `role` が `user` でない | 最後が `model` |

上限は `backend/app/routes/chat.py` の定数 `MAX_MESSAGE_CHARS = 2000`・`MAX_MESSAGES = 40`。文字数は絵文字も 1 文字として数える（Python の文字数と同じ数え方）。画面側（`frontend/src/lib/chatHistory.ts`）も同じ上限で送る前に整える。

**バックエンド処理**

1. 入力の条件を確かめる（合わなければ `422`）
2. `GEMINI_API_KEY` が未設定なら `503`
3. 送り元の IP ごとに 1 分間 10 回までに制限（超えたら `429`）
4. `system_instruction` に ei8ht plants コンシェルジュ用プロンプトと、サイトの公開データ・有効な Q&A を設定
5. `messages` の末尾1件を今回のユーザーメッセージとし、それ以前を Gemini `history` として渡す
6. 返答を `chat_logs` テーブルに保存（失敗してもチャットは成功扱い）

**レスポンス `200`**

```json
{
  "reply": "冬のアガベは..."
}
```

AI が安全フィルタなどで本文を返さなかった場合、`reply` が空や `null` になることがある。画面はこのとき「うまくお答えできませんでした。言い方を変えてもう一度お試しください。」と表示し、その質問は次の送信に含めない。

**エラー**

| ステータス | 原因 |
|---|---|
| `422` | 入力の条件に合わない（上の表。2026-10-20 追加）。画面には「メッセージを送れませんでした。内容を短くするか、ページを開き直してください。」と出す |
| `429` | 送信回数の上限（1 分間に 10 回）を超えた |
| `503` | `GEMINI_API_KEY` が未設定（`{"detail": "Chat is not available"}`） |
| `500` | Gemini API 呼び出し失敗 |

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

## SEO（robots.txt・sitemap.xml。2026-10-21 追加）

検索エンジン向けのファイル。`/api` の下ではなくサイトの直下にある。認証は不要。詳しくは [FT-26 検索エンジン・SNS 向けの情報](../01_BD/features/15_検索エンジン・SNS向け情報.md)。

### GET /robots.txt

**レスポンス `200`**（`text/plain`）

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /cancel
Disallow: /checkout
Disallow: /order

Sitemap: https://ei8htplants.com/sitemap.xml
```

`/api` は Disallow にしない（Google がページを描画するときに `/api/...` を読むため）。

### GET /sitemap.xml

**レスポンス `200`**（`application/xml`）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://ei8htplants.com/</loc></url>
  <url><loc>https://ei8htplants.com/events/autumn-market-2026</loc></url>
  <url><loc>https://ei8htplants.com/journal/uuid</loc><lastmod>2026-10-01</lastmod></url>
  <url><loc>https://ei8htplants.com/shop/uuid</loc><lastmod>2026-09-15</lastmod></url>
</urlset>
```

- 載せるもの: 固定ページ 17 件・イベント全件（slug、無ければ ID）・公開中の記事（lastmod は公開日、無ければ作成日）・公開中の商品（lastmod は作成日）
- 60 秒キャッシュする。イベント・記事・商品のどれかの読み取りに失敗したときは、読めた分だけ返し、キャッシュしない（エラーのステータスにはしない）

### ページを返すときのメタ情報（API ではない）

`/api`・`/assets` など以外のパス（dist の中にファイルが無いもの）は、SPA の `index.html` にページごとのタイトル・説明・canonical・OGP・X のカード・構造化データを入れて返す（ステータスは常に `200`、`text/html`）。作るのに失敗したときは元の `index.html` を返す。dist の外を指すパスでもファイルは返さず、`index.html` を返す。処理は [DD-04](04_バックエンドロジック.md) の12節・14節。

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
api.events.getSessions(id, date?)         → GET    /api/events/{id}/sessions[?date=YYYY-MM-DD]
api.events.saveSessions(id, sessions)    → PUT    /api/events/{id}/sessions  (auth)
api.events.savePageContent(id, content)  → PATCH  /api/events/{id}/page  (auth)
api.events.getAdminInfo(id)              → GET    /api/events/{id}/admin-info  (auth)
api.events.saveAdminInfo(id, body)       → PUT    /api/events/{id}/admin-info  (auth)
api.events.getAdminInfoDashboard()       → GET    /api/events/admin-info/dashboard  (auth)  ← 2026-10-21 追加。res.items を返す
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
api.products.list(all?)                  → GET    /api/products[?all=true]
api.products.get(id)                     → GET    /api/products/{id}
api.products.create(body)                → POST   /api/products  (auth)
api.products.update(id, body)            → PUT    /api/products/{id}  (auth)
api.products.delete(id)                  → DELETE /api/products/{id}  (auth)
api.products.updateStock(id, stock)      → PATCH  /api/products/{id}/stock  (auth)
api.orders.create(body)                  → POST   /api/orders
api.orders.list()                        → GET    /api/orders  (auth)
api.orders.get(id)                       → GET    /api/orders/{id}  (auth)
api.orders.updateStatus(id, status)      → PATCH  /api/orders/{id}  (auth)
api.articles.list()                      → GET    /api/articles
api.articles.get(id)                     → GET    /api/articles/{id}
api.articles.create(body)                → POST   /api/articles  (auth)
api.articles.update(id, body)            → PUT    /api/articles/{id}  (auth)
api.articles.delete(id)                  → DELETE /api/articles/{id}  (auth)
api.shipping.calculate(postalCode, subtotal) → POST /api/shipping/calculate
api.upload(file)                         → POST   /api/upload  (auth)  ← 画像
api.uploadVideo(file)                    → POST   /api/upload/video  (auth)  ← 動画
```

### `(auth)` の付いた呼び出しで送るトークン（2026-10-20 変更）

`(auth)` の付いた呼び出し（`authRequest`・`api.upload`・`api.uploadVideo`）は、共通の関数 `getAccessToken()` で `Authorization: Bearer <トークン>` のトークンを決める。

| 状態 | 送るトークン |
|---|---|
| 管理画面にログインしている（Supabase のセッションがある） | そのセッションのトークン |
| ログインしていない・開発用のログイン省略モード | ダミーのトークン `dev-skip-admin-auth`（テスト用のモックが受け取る） |
| ログインしていない・通常 | 送らずに「401 Unauthorized」のエラーにする |

開発用のログイン省略モードは `frontend/src/lib/devAuth.ts` の `SKIP_ADMIN_AUTH` で判定する。開発サーバーで `VITE_SKIP_ADMIN_AUTH=true` のとき（`npm run mock:e2e`）だけ働き、本番ビルドでは常に無効。本物のバックエンドはダミーのトークンを受け付けず `401` を返す。

管理画面の「チャット Q&A」（`AdminChatQA.tsx`）と「チャットログ」（`AdminChatLogs.tsx`）は `api.ts` を通さず自分でセッションを読んでいるため、このダミーのトークンは使わない。

2026-10-21 から、`getAccessToken()` は Supabase のプログラム（`lib/supabase.ts`）を呼ばれたときに初めて読み込む（`await import('./supabase')`）。公開ページだけを見る人が読み込まないようにして、最初の表示を速くするため。

*最終更新: 2026-10-21（GET /api/events/admin-info/dashboard・GET /robots.txt・GET /sitemap.xml を追加。ページを返すときのメタ情報を追加）*
