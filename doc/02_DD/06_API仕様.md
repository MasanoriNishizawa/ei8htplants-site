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
| 400 Bad Request | すでにキャンセル済みの予約に対してキャンセル操作を行った・予約受付が終わったイベント・未対応の都道府県・非公開の商品の注文 など |
| 401 Unauthorized | Bearerトークン未送信または無効 |
| 402 Payment Required | Square の決済に失敗した（`POST /api/orders`） |
| 404 Not Found | リソースが存在しない |
| 409 Conflict | WSセッションが満席・在庫不足 |
| 422 Unprocessable Entity | Pydanticバリデーションエラー（型不一致・必須フィールド欠如・長さや数量の上限を超えた等） |
| 429 Too Many Requests | 公開の書き込み API の送りすぎ。同じ送り元 IP から、お問い合わせ・WS予約・予約のキャンセル・注文はそれぞれの API ごとに 1 分間 5 回まで、AI チャットは 1 分間 10 回まで（下の「回数制限の送り元 IP」） |
| 500 Internal Server Error | Supabase接続エラー・メール設定不備・注文の保存の失敗（お支払いは完了）・予期しない例外（`サーバーでエラーが発生しました。時間をおいて再度お試しください。`）等 |
| 502 Bad Gateway | 決済サービス（Square）につながらない・応答が読めない・応答を待つ間に時間切れ（`POST /api/orders`） |
| 503 Service Unavailable | AI チャットの設定（`GEMINI_API_KEY`）が無い |

**2026-10-22 からの変更（確定）**

- `GET /api/articles?all=true`・`GET /api/products?all=true` はログインが必要。ログインしていないときの `GET /api/articles/{id}`・`GET /api/products/{id}` は公開中のものだけ返す
- `GET /api/docs/tree`・`GET /api/docs/content` はログインが必要
- `POST /api/reserve/cancel` の応答は `{"ok": true}` だけ
- 存在しない ID を指定したときは `404` を返す
- お問い合わせ・WS予約・注文の入力に、長さや数量の上限を設ける。超えたときは `422`。値は次のとおり（各 API の節にも書いている）

| API | 上限 |
|---|---|
| `POST /api/orders` | 名前 1〜100 文字・電話 30・郵便番号 1〜10・都道府県 1〜10・市区町村 1〜100・番地 1〜200・建物名 200・備考 2,000・品目 1〜50・1品目の数量 1〜99・商品 ID 64・カードのトークン 1〜512 |
| `PATCH /api/orders/{id}` | 配送会社 50・追跡番号 100 |
| `POST /api/reserve` | 名前 1〜100 文字・電話 30・備考 2,000・人数 1〜10・イベント ID と時間枠 ID 64・希望時間 100・言語 10・希望日は `YYYY-MM-DD` |
| `POST /api/reserve/cancel` | キャンセル ID 1〜64 文字 |
| `POST /api/contact` | 名前 1〜100 文字・本文 1〜5,000 文字 |
| `POST /api/contacts/{id}/reply` | 件名 1〜200 文字・本文 1〜20,000 文字 |
| `POST /api/chat` | 会話 1〜40 件・1件 1〜2,000 文字 |

### ID の形が違うとき・存在しないとき（2026-10-23 追加）

URL や入力の ID が UUID の形でない文字（例 `abc`）のとき、それまではデータベースがエラーを返して `500` になっていた。今は「見つからない」と同じ扱いにする（`backend/app/db_utils.py` の `execute_or_404` など）。

| API | ID が UUID の形でない | 存在しない UUID |
|---|---|---|
| `GET /api/events/{id}/sessions` | `404`（`イベントが見つかりません`） | `200` で `[]` |
| `GET /api/events/{id}/sessions?date=…` で date が `YYYY-MM-DD` の形でない | `400`（`日付の形が正しくありません`） | — |
| `PUT /api/events/{id}`・`PUT /api/events/{id}/finances`・`PUT /api/events/{id}/sessions`・`PATCH /api/events/{id}/page`・`PUT /api/events/{id}/admin-info` | `404` | `404`（`イベントが見つかりません`） |
| `DELETE /api/events/{id}`・`GET /api/events/{id}/finances`・`GET /api/events/{id}/admin-info` | `404` | 従来どおり（DELETE は `{"ok": true}`、GET は空の値） |
| 管理用の `PATCH`・`DELETE`（collaborations・pot-artists・media-appearances・price-calc-entries・chat-qa・gallery・stockists・articles・products（`/stock` も）・contacts・orders・reserves） | `404` | PATCH は `404`。DELETE は従来どおり `{"ok": true}`（[課題表](../03_PM/04_課題・リスク管理表.md) の I-12） |
| `GET /api/reserves?event_id=…` | `404`（`イベントが見つかりません`） | `200` で `[]` |
| `POST /api/orders` のカートの `product_id` | `404`（`商品が見つかりません`） | `404`（同じ） |
| `POST /api/reserve/walkin` の `event_id`・`session_id` | `400`（`イベントまたは時間枠が正しくありません`） | `400`（同じ） |

### 回数制限の送り元 IP（2026-10-23 変更）

公開の書き込み API は、送り元の IP ごとに回数を数え、超えたら `429`（`送信回数の上限に達しました。しばらく待ってから再試行してください。`）を返す（`backend/app/rate_limit.py`）。お問い合わせ（`POST /api/contact`）・WS予約（`POST /api/reserve`）・予約のキャンセル（`POST /api/reserve/cancel`）・注文（`POST /api/orders`）はそれぞれの API ごとに 1 分間 5 回まで、AI チャット（`POST /api/chat`）は 1 分間 10 回まで。本番は Cloudflare → Render の中継を通るため、送り元の IP は `client_ip()` で次の順に決める。

1. `CF-Connecting-IP`（Cloudflare が付ける、利用者の IP）
2. `X-Forwarded-For` の**右端**（Render の中継が付け足す「接続してきた相手」の IP）。先頭は利用者が自由に書けるので使わない
3. 接続してきた相手の IP（ローカルで動かすときやテスト）

- それまでは接続してきた相手（中継）の IP で数えていたため、全員が同じ IP として数えられ、ほかの人の送信で正しい利用者が `429` になるおそれがあった
- IP は 64 文字までに切ってから数える。覚えておく IP は最大 1 万件で、超えたら古いものから捨てる（でたらめな値を大量に送られてメモリを使い切らないため）
- Cloudflare を通さずに Render の URL へ直接送られたときは、`CF-Connecting-IP` を利用者が書けるので、制限をすり抜けられる（[課題表](../03_PM/04_課題・リスク管理表.md) の I-19）
- 数はサーバーのメモリにだけ持つ（再起動で消える）

### サーバーの文言を変えるときの注意（2026-10-23 追加）

画面は、次のサーバーの説明（`detail`）の文字を見て、利用者への案内を出し分けている。文言を変えるときは画面も合わせて直す（[DD-07](07_エラーハンドリング.md) の「サーバーの文言に合わせて出し分けている箇所」）。

- `POST /api/reserve` の `400` の4種: `このイベントの予約受付は終了しています`・`この日の予約受付は終了しています`・`予約日がイベントの開催期間外です`・`ワークショップの時間枠が正しくありません`（画面 `pages/Reserve.tsx`）
- `POST /api/orders` の `500`「…お支払いは完了しています…」と `502`「決済の結果を確認できませんでした…」（画面 `pages/Checkout.tsx`。取り違えると二重払いにつながる）

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
| ファイル名 | `{uuid}.{拡張子}` で保存。拡張子は申告された種類（Content-Type）から決める（元のファイル名は使わない） |
| 中身の確認 | ファイルの先頭のバイトが、申告された種類のものかを確かめる（違えば `400`「ファイルの中身が形式と一致しません」） |

保存先のバケット（`images`）は、プロセスで最初のアップロードのときに「無ければ作る」を呼び、作れた・「already exists」「duplicate」で既にあると分かったら、以後は呼ばない。それ以外の失敗のときは、次のアップロードでもう一度確かめる（2026-10-22 変更。[DD-04](04_バックエンドロジック.md) 16章）。

**レスポンス `200`**

```json
{
  "url": "https://xxxx.supabase.co/storage/v1/object/public/images/abcd-1234.jpg"
}
```

**エラー**

| ステータス | 原因 |
|---|---|
| `400` | 許可されていない MIME タイプ・ファイルサイズが 10MB 超・中身が申告と違う |
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
| ファイル名 | `{uuid}.{拡張子}` で保存（拡張子は Content-Type から） |
| 中身の確認・バケットの確認 | 画像と同じ（バケットは `videos`） |

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

**パスパラメータ**: `event_id`（URL スラッグか UUID。スラッグで先に探し、無ければ UUID で探す）

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
  "slug": "plant-market-2026",      // optional（URL スラッグ。空文字は null として保存）
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
  "daily_times": {"2026-10-24": "10:00〜17:00"}, // optional（日ごとの開催時間）
  "image_urls": ["https://..."]     // optional, default []
}
```

**レスポンス `200`**: 作成後のイベント（imagesを含む）

`is_past` は送らない（2026-10-22 に削除。過去かどうかは取得のたびに日付から決める）。

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
| `date` | string (YYYY-MM-DD) | なし | 指定すると該当日の予約数のみを `reserved_count` に反映する。複数日イベントで日付ごとの空き枠を表示する際に使用。省略時は全日合計。`YYYY-MM-DD` の形でなければ `400`（2026-10-23） |

`event_id` が UUID の形でなければ `404`（2026-10-23）。存在しない UUID なら `[]`。

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

**入力の上限**: 名前 1〜100 文字・本文 1〜5,000 文字（超えたら `422`）。回数制限: 同じ送り元 IP から 1 分間に 5 回まで（超えたら `429`）

**レスポンス `200`**: `{"ok": true}`

DB に保存したあと、管理者への通知（件名 `[ei8ht plants] お問い合わせ: {名前}`）と、問い合わせた人への自動返信（件名 `お問い合わせを受け付けました | ei8ht plants`）を送る。メールを送れなくても、`RESEND_API_KEY` が未設定でも `200` を返す（2026-10-22 に修正。それまでは未設定のとき `500` と書いていた）。2026-10-22 から、名前・本文の長さに上限を設けた（上の「入力の上限」）。

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

**入力の上限**: 件名 1〜200 文字・本文 1〜20,000 文字（超えたら `422`）

**レスポンス `200`**: `{"ok": true}`  
**レスポンス `404`**: 対象の問い合わせが存在しない（ID の形が違うときも）  
**レスポンス `500`**: `RESEND_API_KEY` が未設定（`RESEND_API_KEY が設定されていません`）、またはメールを送れなかった（`メール送信に失敗しました。時間をおいて再度お試しください。`。失敗の中身は文言に入れず、ログに種類だけを残す）。送れなかったときは既読にしない

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

**入力の上限**（超えたら `422`）: 名前 1〜100 文字・電話 30 文字まで・備考 2,000 文字まで・人数 1〜10・`event_id`・`session_id` は 64 文字まで・`preferred_date` は `YYYY-MM-DD` の形・`preferred_time` 100 文字まで・`lang` 10 文字まで。メールアドレスはメールの形かを確かめる

**処理**:
1. 回数制限（同じ送り元 IP から 1 分間に 5 回まで。超えたら `429`）
2. イベントを読む（無ければ `404`）。受付の期間か・予約日が開催期間の中かを確かめる（下の `400`）
3. 時間枠があれば、そのイベントの時間枠かを確かめ（違えば `400`）、時間枠のロックの中で満席を確かめて保存する（満席なら `409`）
4. キャンセルトークン（`secrets.token_urlsafe(16)`。英数字と `-` `_` の約22文字。2026-10-22 から。それまでは8桁の数字）を作って `cancel_token` に保存
5. `_send_confirmation()` で予約受付メールを送信（キャンセルリンク含む。`lang` で日本語/英語を切り替え）。送れなければ `email_failed: true`
6. `_send_admin_notification()` で管理者へ通知メールを送信

**レスポンス `200`**: 作成されたレコード（statusは"pending"。`cancel_token` を含む。メールを送れたら `resend_email_id`、送るときにエラーになったら `email_failed: true` も入る）

**エラー**

| ステータス | detail | いつ |
|---|---|---|
| `400` | `このイベントの予約受付は終了しています` | イベントの最終日（終了日、無ければ開始日）が日本時間の今日より前 |
| `400` | `予約日がイベントの開催期間外です` | `preferred_date` が開始日〜最終日の外 |
| `400` | `この日の予約受付は終了しています` | `preferred_date` が日本時間の今日より前 |
| `400` | `ワークショップの時間枠が正しくありません` | `session_id` の時間枠が無い・別のイベントの時間枠 |
| `404` | `イベントが見つかりません` | イベントが無い（ID の形が違うときも） |
| `409` | `このセッションは満席です` | `session_id` 指定時に定員超過 |
| `422` | 項目ごとのエラーの配列 | 入力の上限・形に合わない |
| `429` | `送信回数の上限に達しました。しばらく待ってから再試行してください。` | 同じ送り元 IP から 1 分間に 6 回目以降 |

`400` の4つの文言は、予約画面が文字で見分けて案内を出し分けている（上の「サーバーの文言を変えるときの注意」）。

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
    "cancel_token": "例: 約22文字の英数字と - _（古い予約は8桁の数字）",
    "lang": "ja",
    "email_failed": null,
    "resend_email_id": "Resend のメール ID",
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

`confirmed` は管理画面の当日参加（`POST /api/reserve/walkin`）で作る予約の状態。画面では `pending` と同じ「受付済」と出る。予約フォームの予約は `pending`。

**処理**:
1. 予約を読む（無い・ID の形が違うときは `404`）
2. 状態が変わらないときは何もせず、今の予約を返す（メールも送らない）
3. キャンセルから受付済などに戻すときで時間枠があれば、予約と同じ時間枠のロックの中で満席を確かめる。満席なら `409`
4. DBの `status` カラムを更新し、`session_id` がある場合は `_sync_reserved_count(session_id)` でデノーマライズ値を更新
5. `status = 'cancelled'` に変えたときだけ `_send_cancel_confirmation()` でキャンセル完了メールを予約者に送信（送れなくても状態の変更は成立）

**レスポンス `200`**: 更新後のレコード  
**レスポンス `404`**: `{"detail": "Not found"}`（予約が無い・ID の形が違う）  
**レスポンス `409`**: `{"detail": "この時間枠は満席のため、キャンセルを取り消せません"}`

---

### POST /api/reserve/cancel

キャンセルトークンで予約をキャンセルする。認証不要（一般ユーザー向け）。

**リクエストボディ**

```json
{
  "token": "受付メールのキャンセル ID"    // 1〜64 文字（今は約22文字の英数字と - _。古い予約は8桁の数字）
}
```

**処理**:
1. 回数制限（同じ送り元 IP から 1 分間に 5 回まで。トークンの総当たり対策。超えたら `429`）
2. `cancel_token = token` の予約を新しい順に全件取得（ステータス不問）
3. 1件も存在しない場合 → `404`
4. 未キャンセルのものが存在しない場合 → `400`
5. 最新の未キャンセル行を `cancelled` に更新し、`_sync_reserved_count(session_id)` でデノーマライズ値を更新
6. キャンセルのメールを送る（送れなくてもキャンセルは成立）

**レスポンス `200`**: `{"ok": true}`（2026-10-22 から。予約者の名前・メールなどは返さない）  
**レスポンス `400`**: `{"detail": "この予約はすでにキャンセル済みです"}`  
**レスポンス `404`**: `{"detail": "キャンセルIDが見つかりません"}`  
**レスポンス `422`**: トークンが空・64 文字を超える  
**レスポンス `429`**: `{"detail": "送信回数の上限に達しました。しばらく待ってから再試行してください。"}`

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

## Reserve（当日参加・Resend の知らせ）

### POST /api/reserve/walkin

予約なしで来た人を「当日参加」として登録する（管理画面の WS予約一覧の「当日参加を追加」）。確認メールは送らない。

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "event_id": "uuid",              // required
  "participants": 1,               // optional, default 1
  "session_id": "uuid",            // optional, 時間枠
  "preferred_time": "10:00〜11:00", // optional
  "preferred_date": "2026-10-24"   // optional
}
```

**処理**:
1. 名前 `当日参加`・送らない用のダミーのメールアドレス（`walkin-{ランダムな12文字}@nomail.invalid`）・状態 `confirmed`・新しいキャンセル ID で予約を作る。`event_id`・`session_id` が UUID の形でない・存在しないときは `400`（`イベントまたは時間枠が正しくありません`。2026-10-23）
2. `session_id` があれば、その時間枠の予約人数（`reserved_count`）を数え直す

**レスポンス `200`**: 作成された予約の記録

満席かどうかの確認は、この API では行わない（画面で残りの枠の数までしか選べないようにしている）。

---

### POST /api/reserve/webhook/resend

Resend からの「メールの配信結果」の知らせ（Webhook）を受け取る。

**認証**: なし（今のコードでは、Resend からの知らせかどうかの署名の確認もしていない）

**リクエストボディ**（Resend の形式。使う部分だけ）

```json
{
  "type": "email.bounced",           // "email.bounced" か "email.failed" のときだけ処理する
  "data": { "email_id": "Resend のメール ID" }  // email_id が無ければ data.id を使う
}
```

**処理**: 種類が `email.bounced`・`email.failed` で、メール ID があれば、`resend_email_id` が同じ予約の `email_failed` を `true` にする。そのほかの知らせ・読めない内容・更新の失敗は何もしない。

**レスポンス `200`**: 常に `{"ok": true}`

---

## Products

### GET /api/products

商品の一覧。`display_order` の小さい順。

**クエリパラメータ**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `all` | boolean | `false` | `true` で非公開の商品も含めた全件。`false` は公開中（`is_published = true`）だけ |

**認証**: `all=false` は不要。**2026-10-22 から `all=true` はログイン（Bearer JWT）が必要**（それまでは誰でも全件を取れた）

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "name": "アガベ チタノタ",
    "description": "BlockEditor の JSON 文字列",
    "price": 12000,
    "stock": 3,
    "image_urls": ["https://..."],
    "tags": ["アガベ"],
    "is_published": true,
    "display_order": 0,
    "category": "アガベ",
    "created_at": "2026-09-15T00:00:00+09:00"
  }
]
```

---

### GET /api/products/{product_id}

商品1件。

**認証**: 不要。**2026-10-22 から、ログインしていないときは公開中の商品だけ返す**（非公開の商品は `404`。それまでは非公開でも返していた）

**レスポンス `200`**: 商品1件（一覧と同じ形）
**レスポンス `404`**: `{"detail": "Not found"}`

---

### POST /api/products

商品の追加。

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "name": "商品名",             // required
  "description": "...",        // optional（BlockEditor の JSON 文字列）
  "price": 12000,              // required（円・税込）
  "stock": 3,                  // optional, default 0
  "image_urls": [],            // optional
  "tags": [],                  // optional
  "is_published": false,       // optional, default false
  "display_order": 0,          // optional, default 0
  "category": "アガベ"          // optional。アガベ・塊根植物・灌木・サボテン・観葉植物・ハビタットスタイル・ハビタットスタイル資材・園芸資材・鉢 のどれか
}
```

**レスポンス `200`**: 作成された商品

---

### PUT /api/products/{product_id}

商品の更新（POST と同じ形の全項目で上書き）。

**認証**: Bearer JWT 必須
**レスポンス `200`**: 更新後の商品  
**レスポンス `404`**: 商品が無い・ID の形が違う（`Not found`）

---

### DELETE /api/products/{product_id}

**認証**: Bearer JWT 必須
**レスポンス `200`**: `{"ok": true}`

---

### PATCH /api/products/{product_id}/stock

在庫数だけを更新する。

**認証**: Bearer JWT 必須
**リクエストボディ**: `{"stock": 5}`
**レスポンス `200`**: 更新後の商品

---

## Shipping

### GET /api/shipping/rate

都道府県の送料を返す。

**認証**: 不要
**クエリパラメータ**: `prefecture`（例: `東京都`。必須）

**レスポンス `200`**: `{"fee": 1000}`
**レスポンス `400`**: `{"detail": "未対応の都道府県です: …"}`

送料は `backend/app/routes/shipping.py` の表で決める（¥1,000〜¥1,800。北海道 ¥1,600、沖縄県 ¥1,800 など）。

---

### GET /api/shipping/prefectures

送料の表にある都道府県の一覧（47件の文字の配列）。

**認証**: 不要

---

## Orders

### POST /api/orders

注文と決済。購入手続きの画面（`/checkout`）から呼ぶ。

**認証**: 不要

**リクエストボディ**

```json
{
  "customer_name": "山田太郎",       // required
  "customer_email": "taro@example.com", // required, EmailStr
  "customer_phone": "090-...",       // optional
  "postal_code": "100-0001",         // required
  "prefecture": "東京都",            // required（送料の表にある都道府県）
  "city": "千代田区",                // required
  "address_line1": "1-1-1",          // required
  "address_line2": "○○ビル 101",     // optional
  "note": "備考",                    // optional
  "items": [                         // required
    { "product_id": "uuid", "quantity": 1 }
  ],
  "source_id": "Square のカードのトークン" // required
}
```

**入力の上限**（超えたら `422`。2026-10-22 から）: 名前 1〜100 文字・電話 30・郵便番号 1〜10・都道府県 1〜10・市区町村 1〜100・番地（`address_line1`）1〜200・建物名（`address_line2`）200・備考 2,000・品目 1〜50・1品目の数量 1〜99・商品 ID 64・カードのトークン 1〜512。画面（`/checkout`）の入力欄も同じ上限にしている

**処理**:
1. 回数制限（同じ送り元 IP から 1 分間に 5 回まで。超えたら `429`）。`SQUARE_ACCESS_TOKEN` が未設定なら `500`（`Square が設定されていません`）
2. 都道府県から送料を決める（表に無ければ `400`）
3. 商品を読み、無ければ `404`（`商品が見つかりません`。商品 ID が UUID の形でないときも同じ。2026-10-23）、非公開なら `400`（`この商品は現在購入できません: 商品名`）
4. 在庫が足りなければ `409`（`在庫が不足しています: 商品名、…`）
5. 商品ごとに在庫を減らす（`decrement_stock`）。ほかの注文と同時で足りなくなったら、減らした分を戻して `409`
6. 小計 + 送料 を Square の Payments API で決済する。結果ごとに次のとおり（2026-10-23 に今のコードに合わせた）
   - カードが拒否された・Square が失敗を返した → 在庫を戻して `402`（Square の説明。無ければ `決済に失敗しました`）
   - Square につながらない（接続の時間切れ） → 決済はされていないので在庫を戻して `502`（`決済サービスにつながりませんでした。時間をおいて再度お試しください。`）
   - 応答が読めない・通信の失敗 → 在庫を戻して `502`（`決済サービスでエラーが発生しました。時間をおいて再度お試しください。`）
   - 送ったあと応答を待つ間に時間切れ → 決済された可能性があるので**在庫は戻さず**、管理者に「決済の応答が時間切れ」のメールを送り（Square の画面で決済の有無を確かめて手で処理してもらう）、`502`（`決済の結果を確認できませんでした。二重のお支払いを防ぐため、再度ご注文される前にお問い合わせページよりご連絡ください。`）。画面はこの文言を見て「注文し直さずに連絡して」と案内する（上の「サーバーの文言を変えるときの注意」）
7. `orders`（状態 `paid`）と `order_items` を記録する。失敗したら管理者に「CRITICAL: 課金済み注文レコード作成失敗」のメールを送り、`500`（`注文処理中にエラーが発生しました。お支払いは完了しています。…`）
8. 購入者に確認メール、管理者に新規注文のメールを送る（送れなくても注文は成功）

**レスポンス `200`**: `{"order_id": "uuid"}`

---

### GET /api/orders

全注文（新しい順）。

**認証**: Bearer JWT 必須
**レスポンス `200`**: 注文の配列（`orders` の全列。`carrier`・`tracking_number` を含む）

---

### GET /api/orders/{order_id}

注文1件と、その明細。

**認証**: Bearer JWT 必須

**レスポンス `200`**: 注文の全列に `items`（`order_items` の配列: 商品名・単価・数量など）を足したもの
**レスポンス `404`**: `{"detail": "Not found"}`

---

### PATCH /api/orders/{order_id}

注文の状態を変える。

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "status": "shipped",          // "paid" | "shipped" | "delivered" | "cancelled"
  "carrier": "ヤマト運輸",       // optional。status が shipped のときだけ保存する
  "tracking_number": "1234..."  // optional。status が shipped のときだけ保存する
}
```

**副作用**: `shipped` にしたとき、購入者に発送のお知らせを送る（配送会社・追跡番号があれば本文に入れ、ヤマト運輸・佐川急便・日本郵便は追跡ページの URL も入れる）。ほかの状態ではメールを送らない。

**レスポンス `200`**: 更新後の注文

---

## Articles

### GET /api/articles

記事の一覧。`display_order` の小さい順、同じなら新しい順。

**クエリパラメータ**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `all` | boolean | `false` | `true` で非公開の記事も含めた全件。`false` は公開中（`is_published = true`）だけ |

**認証**: `all=false` は不要。**2026-10-22 から `all=true` はログイン（Bearer JWT）が必要**

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "title": "記事のタイトル",
    "content": "BlockEditor の JSON 文字列",
    "image_urls": ["https://..."],
    "tags": ["育て方"],
    "product_ids": ["uuid"],
    "is_published": true,
    "display_order": 0,
    "published_at": "2026-10-01T00:00:00+00:00",
    "created_at": "2026-09-30T00:00:00+00:00"
  }
]
```

---

### GET /api/articles/{article_id}

記事1件。

**認証**: 不要。**2026-10-22 から、ログインしていないときは公開中の記事だけ返す**（非公開は `404`）

**レスポンス `200`**: 記事1件
**レスポンス `404`**: `{"detail": "Not found"}`

---

### POST /api/articles

**認証**: Bearer JWT 必須

**リクエストボディ**

```json
{
  "title": "タイトル",      // required
  "content": "...",        // optional
  "image_urls": [],        // optional
  "tags": [],              // optional
  "product_ids": [],       // optional（関連商品の ID）
  "is_published": false,   // optional, default false
  "display_order": 0       // optional, default 0
}
```

`is_published` が `true` なら、`published_at` に今の時刻を入れる。

**レスポンス `200`**: 作成された記事

---

### PUT /api/articles/{article_id}

POST と同じ形の全項目で上書きする。初めて公開する（今まで `published_at` が空）ときだけ `published_at` に今の時刻を入れる。

**認証**: Bearer JWT 必須
**レスポンス `200`**: 更新後の記事  
**レスポンス `404`**: 記事が無い・ID の形が違う（`Not found`）

---

### DELETE /api/articles/{article_id}

**認証**: Bearer JWT 必須
**レスポンス `200`**: `{"ok": true}`

---

## Pot Artists（鉢作家）

| メソッド | パス | 認証 | 内容 |
|---|---|---|---|
| GET | `/api/pot-artists` | 不要 | 一覧（登録の古い順）。`[{"id", "name", "created_at"}]` |
| POST | `/api/pot-artists` | Bearer JWT 必須 | 追加。ボディ `{"name": "作家名"}`。作成した記録を返す |
| DELETE | `/api/pot-artists/{artist_id}` | Bearer JWT 必須 | 削除。`{"ok": true}` |

データベースの読み書きでエラーが起きたときは `500`（`detail` にエラーの内容）。

---

## Price Calc Entries（販売価格計算の登録リスト）

| メソッド | パス | 認証 | 内容 |
|---|---|---|---|
| GET | `/api/price-calc-entries` | Bearer JWT 必須 | 一覧（新しい順） |
| POST | `/api/price-calc-entries` | Bearer JWT 必須 | 追加。作成した記録を返す |
| DELETE | `/api/price-calc-entries/{entry_id}` | Bearer JWT 必須 | 削除。`{"ok": true}` |

**POST のリクエストボディ**

```json
{
  "brand": "habitatoides",        // required（ei8htplants / habitatoides / hue）
  "plant_name": "アガベ ポタトルム", // required
  "pot_artist_name": "作家A",      // optional（量産鉢・ei8htplants・hue なら null）
  "cost": 8000,                    // required（元値。仕入れなら仕入れ値、生産なら卸価格。小数も可）
  "selling_price": 20000,          // required（販売価格。小数も可）
  "mode": "purchase"               // optional（production = 生産 / purchase = 仕入れ。省略すると null。2026-10-25 追加）
}
```

- 推奨販売価格の計算（原価率が目標原価率以下になるキリの良い金額）は画面側（`frontend/src/lib/priceCalc.ts`）で行い、API は送られた `cost`・`selling_price` をそのまま保存する。目標原価率は保存しない。生産か仕入れかは `mode` に入れて保存する（画面は生産で `production`、仕入れで `purchase` を送る）。上の例は仕入れで元値 8,000 円・目標原価率 40% の推奨販売価格 20,000 円（生産なら、卸価格を `cost`、その 2 倍を `selling_price` として送る）
- `brand` は1文字以上の文字であればそのまま保存する（API では種類を確かめない）。HUE の記録は 2026-10-23 から画面で登録できるようになった

- `mode` に `production`・`purchase` 以外の値を送ると `422`（入力の誤り）。一覧（GET）の各記録にも `mode` が入る（種類を保存するようになる前の記録は `null`）
- `mode` の列は `021_price_calc_entries_mode.sql` で足した

データベースの読み書きでエラーが起きたときは `500`。

---

## Media Appearances（出演情報）

| メソッド | パス | 認証 | 内容 |
|---|---|---|---|
| GET | `/api/media-appearances` | 不要 | 一覧（公開日の新しい順） |
| POST | `/api/media-appearances` | Bearer JWT 必須 | 追加。作成した記録を返す |
| DELETE | `/api/media-appearances/{item_id}` | Bearer JWT 必須 | 削除。`{"ok": true}` |

**POST のリクエストボディ**

```json
{
  "title": "番組名",                                   // required
  "youtube_url": "https://www.youtube.com/watch?v=...", // required
  "description": "出演内容",                           // optional
  "published_at": "2026-10-01",                        // optional
  "display_order": 0                                   // optional, default 0
}
```

YouTube の URL かどうかの確認は画面（管理画面）で行い、サーバーでは確認しない。データベースの読み書きでエラーが起きたときは `500`。

---

## Chat Q&A（AI チャットの Q&A）

| メソッド | パス | 認証 | 内容 |
|---|---|---|---|
| GET | `/api/chat-qa` | 不要 | 全件（無効のものも含む。`sort_order` の小さい順）。エラーは `500` |
| POST | `/api/chat-qa` | Bearer JWT 必須 | 追加。作成した記録を返す |
| PATCH | `/api/chat-qa/{qa_id}` | Bearer JWT 必須 | 更新（ボディは POST と同じ形の全項目）。更新後の記録を返す |
| DELETE | `/api/chat-qa/{qa_id}` | Bearer JWT 必須 | 削除。`{"ok": true}` |

**POST・PATCH のリクエストボディ**

```json
{
  "question": "予約は必要ですか？",       // required
  "answer": "ワークショップは事前予約制です。", // required
  "sort_order": 0,                       // optional, default 0
  "enabled": true                        // optional, default true。false にすると AI への指示文から外す
}
```

管理画面は一覧をログインして取り出す（`api.chatQa.list()`）が、今のサーバーは一覧の取得にログインを求めていない。

---

## Chat Logs（AI チャットの記録）

### GET /api/chat-logs

AI チャットの質問と返事の記録を、新しい順に最大200件返す。

**認証**: Bearer JWT 必須

**レスポンス `200`**

```json
[
  {
    "id": "uuid",
    "user_message": "アガベの水やりは？",
    "ai_reply": "アガベは乾燥を好む植物です…",
    "ip_hash": "1a2b3c4d5e6f7a8b",
    "created_at": "2026-10-21T05:30:00+00:00"
  }
]
```

`ip_hash` は送った所の IP アドレスから作った16文字の記号（IP アドレスそのものは保存しない）。

---

## Docs（設計書の閲覧）

管理画面の「設計書」（`/admin/docs`）が、リポジトリの `doc/` フォルダの Markdown を読むための API。

### GET /api/docs/tree

`doc/` のフォルダとファイルの一覧（`.md` のファイルだけ。名前が `.` で始まるものと `__pycache__` は除く）。

**認証**: **2026-10-22 から Bearer JWT 必須**（それまでは誰でも読めた）

**レスポンス `200`**

```json
[
  { "type": "dir", "name": "01_BD", "path": "01_BD", "children": [
      { "type": "file", "name": "00_INDEX.md", "path": "01_BD/00_INDEX.md" }
  ] }
]
```

**レスポンス `404`**: `doc` フォルダが無い（`doc directory not found`）

---

### GET /api/docs/content

Markdown のファイルの中身をそのまま（`text/plain`）返す。

**認証**: **2026-10-22 から Bearer JWT 必須**（それまでは誰でも読めた）
**クエリパラメータ**: `path`（`doc/` からの場所。例: `01_BD/00_INDEX.md`。必須）

**レスポンス `200`**: ファイルの本文（UTF-8 のテキスト）
**レスポンス `400`**: `doc/` の外を指している（`invalid path`）
**レスポンス `404`**: ファイルが無い・`.md` ではない（`file not found`）

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
api.orders.updateStatus(id, status, carrier?, trackingNumber?) → PATCH /api/orders/{id}  (auth)
api.articles.list(all?)                  → GET    /api/articles[?all=true]
api.articles.get(id)                     → GET    /api/articles/{id}
api.articles.create(body)                → POST   /api/articles  (auth)
api.articles.update(id, body)            → PUT    /api/articles/{id}  (auth)
api.articles.delete(id)                  → DELETE /api/articles/{id}  (auth)
api.reserve.addWalkin(body)              → POST   /api/reserve/walkin  (auth)
api.shipping.getRate(prefecture)         → GET    /api/shipping/rate?prefecture=...
api.shipping.getPrefectures()            → GET    /api/shipping/prefectures
api.potArtists.list()                    → GET    /api/pot-artists
api.potArtists.add(name)                 → POST   /api/pot-artists  (auth)
api.potArtists.delete(id)                → DELETE /api/pot-artists/{id}  (auth)
api.priceCalcEntries.list()              → GET    /api/price-calc-entries  (auth)
api.priceCalcEntries.add(body)           → POST   /api/price-calc-entries  (auth)
api.priceCalcEntries.delete(id)          → DELETE /api/price-calc-entries/{id}  (auth)
api.mediaAppearances.list()              → GET    /api/media-appearances
api.mediaAppearances.add(body)           → POST   /api/media-appearances  (auth)
api.mediaAppearances.delete(id)          → DELETE /api/media-appearances/{id}  (auth)
api.chatQa.list()                        → GET    /api/chat-qa  (auth)
api.chatQa.add(body)                     → POST   /api/chat-qa  (auth)
api.chatQa.update(id, body)              → PATCH  /api/chat-qa/{id}  (auth)
api.chatQa.delete(id)                    → DELETE /api/chat-qa/{id}  (auth)
api.chatLogs.list()                      → GET    /api/chat-logs  (auth)
api.docs.tree()                          → GET    /api/docs/tree  (auth)
api.docs.content(path)                   → GET    /api/docs/content?path=...  (auth)
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

管理画面の「チャット Q&A」（`AdminChatQA.tsx`）と「チャット履歴」（`AdminChatLogs.tsx`）は、2026-10-22 から `api.ts`（`api.chatQa`・`api.chatLogs`）を通すように変わり、このトークンの決め方を使う（それまでは自分でセッションを読んでいた）。

2026-10-21 から、`getAccessToken()` は Supabase のプログラム（`lib/supabase.ts`）を呼ばれたときに初めて読み込む（`await import('./supabase')`）。公開ページだけを見る人が読み込まないようにして、最初の表示を速くするため。

*最終更新: 2026-10-25（Price Calc Entries に mode（生産・仕入れ）を追加）／2026-10-25（Price Calc Entries の cost に生産の卸価格を追記。生産か仕入れかは保存しない）／2026-10-23（Price Calc Entries に目標原価率を保存しないことを追記）／2026-10-23（Price Calc Entries の brand に hue を追加、例の販売価格を新しい計算に合わせた）／2026-10-23（429・502 の説明、入力の上限の実際の値、注文の決済の失敗ごとの応答、予約の 400 の4種と 429、状態の変更の 404・409、キャンセルの応答とキャンセル ID の形、商品・記事の更新の 404 を追記）／2026-10-23（ID の形が違うとき・存在しないときの応答、回数制限の送り元 IP、サーバーの文言を変えるときの注意を追加。当日参加・注文の ID の扱い）／2026-10-22（アップロードの中身の確認・拡張子・バケットの確認を追記）／2026-10-22（Products・Shipping・Orders・Articles・Pot Artists・Price Calc Entries・Media Appearances・Chat Q&A・Chat Logs・Docs と、POST /api/reserve/walkin・POST /api/reserve/webhook/resend を追加。2026-10-22 からの変更（ログインが必要になる API・キャンセルの応答・入力の上限）を追記。お問い合わせのメール未設定時の動きを直した）*
