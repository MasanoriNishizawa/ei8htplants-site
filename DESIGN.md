# ei8ht plants サイト — 詳細設計書

**バージョン**: 1.1  
**最終更新**: 2026-06-12  
**対象リポジトリ**: ei8htplants-site

---

## 目次

1. [システム概要](#1-システム概要)
2. [要件定義](#2-要件定義)
3. [基本設計](#3-基本設計)
4. [データ仕様（Google Sheets）](#4-データ仕様google-sheets)
5. [共通基盤](#5-共通基盤)
6. [公開ページ機能詳細](#6-公開ページ機能詳細)
   - 6.1 ホームページ
   - 6.2 イベント一覧
   - 6.3 WS予約フォーム
   - 6.4 残席確認 API
   - 6.5 ギャラリー
   - 6.6 植物標本（Specimen）
   - 6.7 コラボレーション
   - 6.8 コンセプト
   - 6.9 ブランドページ（ei8ht plants）
   - 6.10 ブランドページ（Habitat Oides）
   - 6.11 Habitat Oides ワークショップ
   - 6.12 ブランドページ（HUE）
7. [管理画面](#7-管理画面)
   - 7.1 認証
   - 7.2 イベント CRUD
   - 7.3 WS 予約一覧
8. [フロントエンド共通設計](#8-フロントエンド共通設計)
9. [デプロイ・環境変数](#9-デプロイ環境変数)

---

## 1. システム概要

### アーキテクチャ

```
ブラウザ
  │ HTTP リクエスト
  ▼
FastAPI (uvicorn)
  │
  ├── Jinja2 テンプレートエンジン → HTML レスポンス
  │
  ├── app/routes/public.py  ← 公開ページルーター
  ├── app/routes/admin.py   ← 管理画面ルーター（認証必須）
  │
  ├── app/sheets.py         ← Google Sheets 読み書き
  │       └── app/cache.py  ← TTL インメモリキャッシュ（5〜10 分）
  │
  ├── app/drive.py          ← Google Drive 画像 URL 取得
  │       └── app/cache.py  ← TTL インメモリキャッシュ（10 分）
  │
  └── app/google_client.py  ← gspread / Drive API シングルトンクライアント
          └── app/config.py ← 環境変数・認証情報
```

### 技術スタック

| 区分 | 技術 | バージョン |
|---|---|---|
| 言語 | Python | 3.9 |
| Web フレームワーク | FastAPI + uvicorn | 0.128.8 / 0.39.0 |
| テンプレートエンジン | Jinja2 | 3.1.6 |
| Sheets API クライアント | gspread | 6.2.1 |
| Drive API クライアント | google-api-python-client | 2.194.0 |
| セッション | itsdangerous（Starlette SessionMiddleware） | 2.2.0 |
| ホスティング | Render（Free Plan） | — |
| データ永続化 | Google Sheets | — |
| 画像ホスティング | Google Drive | — |

---

## 2. 要件定義

### 2.1 機能要件

#### 公開サイト

| ID | 要件 |
|---|---|
| F-01 | トップページに最新イベント 1 件と全ブランドのギャラリー画像をマーキー表示する |
| F-02 | イベント一覧ページで開催予定・過去イベントを切り替えて表示する |
| F-03 | WSフラグ=TRUE のイベントに予約フォームを表示し、Google Sheets に書き込む |
| F-04 | 予約フォームで日付・時間帯を選択した時点で残席数をリアルタイムに取得する |
| F-05 | ブランド別の Google Drive フォルダから画像を取得してギャラリー表示する |
| F-06 | 植物標本シートから品種名・画像を取得してスライダー付きカードで表示する |
| F-07 | PROJECTS シートからコラボ案件を取得して一覧表示する |
| F-08 | ブランドごとに独立したランディングページを提供する（ei8htplants / habitatoides / hue） |
| F-09 | Habitat Oides のワークショップ紹介・予約導線を提供する |
| F-10 | お問い合わせフォームからの送信をスプレッドシートに記録し、通知メールと受付確認メールを自動送信する |

#### 管理画面

| ID | 要件 |
|---|---|
| A-01 | ID/パスワード認証でログインし、セッション Cookie で認証状態を維持する |
| A-02 | イベントを Google Sheets に追加・編集・削除できる |
| A-03 | WS 予約一覧をイベント別に絞り込み・集計して表示する |
| A-04 | 書き込み操作後にキャッシュを即時無効化してサイトへ即反映する |

### 2.2 非機能要件

| ID | 要件 | 実装 |
|---|---|---|
| NF-01 | Google API レート制限対策 | TTL キャッシュ（イベント 5 分、ギャラリー 10 分） |
| NF-02 | 認証情報の保護 | `secret_key.json` を `.gitignore` 管理外に保持 / 本番では環境変数 `GOOGLE_CREDENTIALS` を使用 |
| NF-03 | セッション安全性 | `SECRET_KEY` 環境変数でセッション Cookie を署名 |
| NF-04 | レスポンシブ対応 | CSS Grid / Flexbox でスマートフォン・PC 両対応 |
| NF-05 | データ永続化 | Render 無料プランのファイルシステムはデプロイ時リセットされるため Google Sheets を DB として使用 |

---

## 3. 基本設計

### 3.1 モジュール構成

```
app/
├── __init__.py          create_app() — アプリファクトリ
│                          SessionMiddleware (SECRET_KEY)
│                          /static マウント
│                          public router  (prefix="")
│                          admin router   (prefix="/admin")
│
├── config.py            Settings (pydantic_settings)
│                          secret_key / admin_user / admin_pass / google_credentials
│                          SPREADSHEET_ID / SCOPES / FOLDERS
│
├── cache.py             TTLCache クラス
│                          get / set / delete / clear_prefix
│                          module-level singleton: cache = TTLCache(ttl=300)
│
├── google_client.py     get_gc()    → gspread.Client（シングルトン）
│                        get_drive() → googleapiclient.discovery（シングルトン）
│
├── sheets.py            イベント・WS予約・お問い合わせの読み書きロジック
│                          get_events_data / get_all_events_for_admin / get_event_row
│                          create_event / update_event / delete_event
│                          create_ws_reservation / get_ws_reservation_count
│                          get_all_ws_reservations
│                          create_contact
│
├── drive.py             get_gallery_images(brand, page_size) → list[str]
│                        get_home_gallery_images()             → list[str]
│
├── auth.py              is_authenticated(request) → bool
│                        login(request, user, pass) → bool
│                        logout(request)
│
├── templates.py         Jinja2Templates インスタンス
│                          カスタムフィルター: urlize
│
├── email.py             Gmail SMTP メール送信
│                          send_reservation_confirmation  (WS予約確認 → 申込者)
│                          send_contact_notification      (問い合わせ通知 → ei8htplants@gmail.com)
│                          send_contact_confirmation      (問い合わせ受付確認 → 送信者)
│
└── routes/
    ├── public.py        公開ルーター（全エンドポイント）
    └── admin.py         管理ルーター（認証後のみ）
```

### 3.2 リクエストフロー（公開ページの典型例）

```
ブラウザ GET /events
  → public.read_events()
      → get_events_data(is_past=False)
            cache.get("events:current")
              ヒット → return cached list
              ミス  → Sheets API (get_all_values)
                      → _enrich_event() × N件
                      → sort by start_obj
                      → cache.set("events:current", result, ttl=300)
      → templates.TemplateResponse("events.html", context)
  → HTML レスポンス
```

### 3.3 キャッシュ戦略

| キャッシュキー | TTL | 無効化タイミング |
|---|---|---|
| `events:current` | 300 秒（5 分） | create_event / update_event / delete_event 呼び出し後 |
| `events:past` | 300 秒（5 分） | 同上 |
| `gallery:{brand}` | 600 秒（10 分） | 自動期限切れのみ（Drive は書き込みなし） |
| `gallery:home` | 600 秒（10 分） | 同上 |

---

## 4. データ仕様（Google Sheets）

**スプレッドシート ID**: `1_18mozgallwxSZ_u9d5iCdP9CftT7nZ9lgo-v3jbzwU`

### 4.1 イベントシート（index=0 / シート1）

ヘッダー行は 1 行目。データは 2 行目以降。

| 列名 | 型 | 説明 | 例 |
|---|---|---|---|
| 開始日 | 日付 | 開催開始日（YYYY/MM/DD または YYYY-MM-DD） | `2026/06/14` |
| 終了日 | 日付 | 開催終了日（単日なら開始日と同じ） | `2026/06/15` |
| イベント名 | 文字列 | イベント正式名称 | `Habitat Style Workshop vol.3` |
| 販売ブランド | 文字列 | カンマ区切り複数可 | `ei8ht plants, Habitat Oides` |
| 開催時間 | 文字列 | WS 時間スロット生成に使用（後述） | `10:00〜17:00` |
| 場所 | 文字列 | 会場名 | `○○ギャラリー` |
| ブース番号 | 文字列 | ブース番号（任意） | `B-12` |
| 住所 | 文字列 | Google マップリンク生成に使用 | `東京都渋谷区○○1-2-3` |
| 公式サイトURL | 文字列 | イベント公式 URL（任意） | `https://example.com` |
| WSフラグ | TRUE/FALSE | WS予約ボタンを表示するか | `TRUE` |
| WS予約URL | 文字列 | 旧 GAS URL 列（現在未使用） | — |
| 画像 | 文字列 | Drive URL またはファイル ID をカンマ区切りで複数指定 | `https://drive.google.com/file/d/XXX/view` |

**`_enrich_event()` が追加する計算済みフィールド**:

| フィールド | 型 | 説明 |
|---|---|---|
| `display_date` | str | 表示用日付文字列。単日: `2026年6月15日`、期間: `2026年6月14日 〜 15日` |
| `map_url` | str | `https://www.google.com/maps/search/?api=1&query={住所}` |
| `start_obj` | date | ソート・期間判定用の Python date オブジェクト |
| `is_past` | bool | 終了日が今日より前なら True |
| `image_urls` | list[str] | Drive サムネイル URL のリスト |
| `_row` | int | スプレッドシートの実際の行番号（`/reserve?row=N` 生成に使用） |

### 4.2 Specimen シート

| 列名 | 型 | 説明 |
|---|---|---|
| 品種名 | 文字列 | 植物の品種名 |
| 画像1 | 文字列 | Drive URL またはファイル ID |
| 画像2 | 文字列 | Drive URL またはファイル ID（任意） |
| 画像3 | 文字列 | Drive URL またはファイル ID（任意） |

- 画像が 1 枚もない行はリストに含めない
- ei8htplants ブランドページには先頭 6 件のみのプレビューを表示

### 4.3 PROJECTS シート（コラボレーション）

| 列名 | 型 | 説明 |
|---|---|---|
| タイトル | 文字列 | コラボ案件のタイトル |
| 日付 | 文字列 | 実施日 |
| コラボ先 | 文字列 | コラボ相手の名称 |
| コラボ内容 | 文字列 | 詳細説明（改行含む場合あり） |
| 画像 | 文字列 | Drive URL をカンマ区切りで複数指定 |

- テンプレートには `image_urls` リストとして展開して渡す

### 4.5 お問い合わせシート（`お問い合わせ`）

FastAPI の `create_contact()` が自動作成・追記する。

| 列 | 列名 | 型 | 説明 |
|---|---|---|---|
| A | タイムスタンプ | 日時文字列 | `YYYY-MM-DD HH:MM:SS` 形式 |
| B | お名前 | 文字列 | — |
| C | メール | 文字列 | 受付確認メールの送信先 |
| D | 件名 | 文字列 | 任意 |
| E | 内容 | 文字列 | 問い合わせ本文 |

---

### 4.4 WS予約シート（`WS予約`）

FastAPI の `create_ws_reservation()` が自動作成・追記する。

| 列 | 列名 | 型 | 説明 |
|---|---|---|---|
| A | タイムスタンプ | 日時文字列 | `YYYY-MM-DD HH:MM:SS` 形式 |
| B | イベント名 | 文字列 | フォームの hidden フィールドから取得 |
| C | お名前 | 文字列 | — |
| D | メール | 文字列 | — |
| E | 電話番号 | 文字列 | 任意 |
| F | 希望日 | 文字列 | `YYYY-MM-DD` 形式 |
| G | 希望時間帯 | 文字列 | `HH:MM-HH:MM` 形式 |
| H | 参加人数 | 文字列（数値） | `get_ws_reservation_count()` での集計に使用 |
| I | お持ち込み | 文字列 | `植木鉢, 植物` など（カンマ区切り） |
| J | 備考 | 文字列 | 任意 |

- 残席確認は `get_ws_reservation_count(event_name, date, time_slot)` が列 B / F / G / H を参照して集計

---

## 5. 共通基盤

### 5.1 TTL キャッシュ（`app/cache.py`）

```python
class TTLCache:
    def get(key: str) -> Any | None
    def set(key: str, value: Any, ttl: int = None)  # ttl 省略時はコンストラクタの値を使用
    def delete(key: str)
    def clear_prefix(prefix: str)  # 前方一致で複数キーを一括削除
```

- スレッドセーフではない（uvicorn シングルプロセス前提）
- module-level singleton: `cache = TTLCache(ttl=300)`
- ギャラリー取得時は `ttl=600` を明示的に指定

### 5.2 Google API クライアント（`app/google_client.py`）

```python
def get_gc() -> gspread.Client       # gspread 認証済みクライアント（シングルトン）
def get_drive() -> Resource          # Drive API v3 クライアント（シングルトン）
```

- 認証情報は `config.Settings.google_credentials` から取得
- ローカル: `secret_key.json` を読み込み
- 本番 (Render): 環境変数 `GOOGLE_CREDENTIALS` の JSON 文字列をパース

### 5.3 セッション認証（`app/auth.py`）

```python
def is_authenticated(request: Request) -> bool
def login(request: Request, username: str, password: str) -> bool
def logout(request: Request)
```

- `starlette.middleware.sessions.SessionMiddleware` を使用
- セッションキー: `request.session["admin"]`
- Cookie は `SECRET_KEY` 環境変数で署名（`itsdangerous`）

### 5.4 Drive 画像取得（`app/drive.py`）

```python
def get_gallery_images(brand: str, page_size: int = 50) -> list[str]
def get_home_gallery_images() -> list[str]
```

- `brand` は `config.FOLDERS` の辞書キー（`"ei8ht_plants"`, `"habitat_oides"`, `"hue"`）に対応
- Drive API の `files.list()` でフォルダ内ファイルを取得
- サムネイル URL: `https://drive.google.com/thumbnail?id={file_id}&sz=w1000`
- キャッシュキー: `gallery:{brand}` または `gallery:home`（TTL 600 秒）
- `get_home_gallery_images()` は全ブランドを合算してシャッフルして返す

### 5.5 URL / 日付ユーティリティ（`app/sheets.py`）

```python
def get_display_url(drive_url_or_id: str) -> str
    # 対応形式:
    #   "https://drive.google.com/file/d/<ID>/view"
    #   "https://drive.google.com/open?id=<ID>"
    #   "...?id=<ID>"
    #   "<ID>"  (ファイル ID のみ)
    # 出力: "https://drive.google.com/thumbnail?id=<ID>&sz=w1000"

def parse_date(date_val) -> date | None
    # スプレッドシートの日付セル（"2026/06/15" または "2026-06-15 00:00:00"）を date に変換
    # パース失敗時は None
```

### 5.6 Jinja2 カスタムフィルター（`app/templates.py`）

| フィルター | 説明 |
|---|---|
| `urlize` | テキスト内の URL を `<a>` タグに変換（XSS 対策: escape 後に変換） |

---

## 6. 公開ページ機能詳細

### 6.1 ホームページ（`/`）

**ルート**: `GET /`  
**関数**: `public.read_home(request)`  
**テンプレート**: `templates/home.html`

#### データフロー

```
get_events_data(is_past=False)
  → cache "events:current" ヒット or Sheets API
  → active_events[0]  →  next_event（存在しなければ None）

get_home_gallery_images()
  → cache "gallery:home" ヒット or Drive API（全ブランド合算・シャッフル）
  → gallery_images
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `next_event` | dict \| None | `_enrich_event()` 済み。None のとき「イベントなし」を表示 |
| `gallery_images` | list[str] | サムネイル URL のリスト（マーキーアニメーション用） |

#### フロントエンド

- ギャラリーは CSS `@keyframes marquee` で無限スクロール（60 秒/ループ）
- 画像は 2 列に並べて逆方向に流すことで奥行きを演出

---

### 6.2 イベント一覧（`/events`）

**ルート**: `GET /events?page=past`  
**関数**: `public.read_events(request, page: str = None)`  
**テンプレート**: `templates/events.html`  
**マクロ**: `templates/_macros.html::create_event_card(item, is_next=False)`

#### クエリパラメータ

| パラメータ | 値 | 説明 |
|---|---|---|
| `page` | `"past"` | 過去イベント一覧を表示 |
| `page` | 未指定 | 開催予定イベント一覧を表示 |

#### データフロー

```
get_events_data(is_past=True/False)
  →  is_past=False のとき:
       events_list[0]     → pinned_event（NEXT EVENT として大きく表示）
       events_list[1:]    → scheduled_events（グリッド表示）
  →  is_past=True のとき:
       全件               → scheduled_events（ピン留めなし）
       pinned_event = None
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `pinned_event` | dict \| None | NEXT EVENT 表示用（is_past=True のとき None） |
| `scheduled_events` | list[dict] | グリッドに並べるイベント一覧 |
| `is_past` | bool | テンプレートの条件分岐・タイトル切り替えに使用 |

#### イベントカードの表示項目

`_macros.html::create_event_card()` がレンダリングする内容:

- イベント名
- `display_date`（`_enrich_event()` で生成）
- 販売ブランド（タグ表示）
- 場所・住所（`map_url` リンク付き）
- 画像（`image_urls[0]` をサムネイルとして表示）
- WSフラグ=TRUE のとき「ワークショップを予約する」ボタン（`/reserve?row={_row}` へのリンク）

---

### 6.3 WS 予約フォーム（`/reserve`）

**ルート**: `GET /reserve?row=N` / `POST /reserve`  
**関数**: `public.reserve_form()` / `public.reserve_submit()`  
**テンプレート**: `templates/reserve.html`

#### GET `/reserve?row=N`

```
row が None → RedirectResponse("/events")

get_event_row(row)
  → event dict（Sheets から直接取得）

event["WSフラグ"] != "TRUE" → RedirectResponse("/events")

_enrich_event(event)

_generate_date_options(開始日, 終了日)
  → [{"value": "YYYY-MM-DD", "label": "2026年6月15日（日）"}, ...]

_generate_time_map(開始日, 終了日, 開催時間)
  → {"YYYY-MM-DD": ["11:00-12:00", "12:00-13:00", ...], ...}

json.dumps(time_map) → time_map_json（<script type="application/json"> に埋め込み）

has_time_slots = any(slots for slots in time_map.values())
  True  → 時間帯セレクトボックスを表示
  False → フリーテキスト入力にフォールバック

request.session.pop("reserve_flash", None) → flash（前回の POST 成功メッセージ）
```

**`_generate_time_map()` の時間スロット生成ルール**:

`開催時間` 列の書式:
- `"10:00〜17:00"` → 全日同一の時間帯
- `"10:00〜17:00 / 11:00〜18:00"` → スラッシュ区切りで日ごとに異なる
- `"10:00〜17:00\n11:00〜18:00"` → 改行区切り（同上）

スロット生成式（`_generate_ws_slots()`）:
- 開始時間の +1 時間 〜 終了時間の -1 時間 を 1 時間単位で生成
- 例: `10:00〜17:00` → `["11:00-12:00", "12:00-13:00", ..., "15:00-16:00"]`
- パース失敗時は `[]` を返し、テンプレートはテキスト入力に切り替える

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `event` | dict | `_enrich_event()` 済みのイベントデータ |
| `row` | int | スプレッドシート行番号（フォームの hidden フィールドに埋め込む） |
| `date_options` | list[dict] | `{value, label}` のリスト |
| `time_map_json` | str | 日付→スロットの JSON 文字列 |
| `has_time_slots` | bool | False のとき時間帯をテキスト入力に切り替え |
| `flash` | str \| None | 前回 POST 成功時のメッセージ |

#### POST `/reserve`

```
form データ取得:
  row          → int（どのイベントか特定するため使用）
  event_name   → str
  name         → str
  email        → str
  phone        → str（任意）
  date         → str（YYYY-MM-DD）
  time         → str（HH:MM-HH:MM）
  participants → str（数値）
  bring-pot    → "yes" or 未送信
  bring-plant  → "yes" or 未送信
  message      → str（任意）

create_ws_reservation({
  "イベント名": ..., "お名前": ..., "メール": ..., "電話番号": ...,
  "希望日": ..., "希望時間帯": ..., "参加人数": ...,
  "お持ち込み": "植木鉢, 植物"（選択された項目のみカンマ結合）,
  "備考": ...,
})
→ WS予約シートに 1 行追記

request.session["reserve_flash"] = "ご予約を受け付けました。..."
→ RedirectResponse(f"/reserve?row={row}", status_code=303)
```

**注意**: バリデーションはフロントエンドの `required` 属性のみ。サーバーサイドの入力検証は未実装（ブラウザ bypass の場合でも Sheets に書き込まれる）。

---

### 6.4 残席確認 API（`/api/reserve/availability`）

**ルート**: `GET /api/reserve/availability`  
**関数**: `public.ws_availability(event_name, date, time)`  
**レスポンス**: `application/json`

#### クエリパラメータ

| パラメータ | 型 | 説明 |
|---|---|---|
| `event_name` | str | イベント名（WS予約シートの B 列と照合） |
| `date` | str | `YYYY-MM-DD` 形式 |
| `time` | str | `HH:MM-HH:MM` 形式 |

#### レスポンス

```json
{"available": 3, "max": 4}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `available` | int | 残席数（0 のとき満席） |
| `max` | int | 最大定員（定数 `WS_MAX_PARTICIPANTS = 4`） |

エラー時:
```json
{"available": 4, "max": 4, "error": "エラー内容"}
```
エラー時はフォールバックとして全席分の選択肢を表示する（`reserve.html` の catch ブロック）。

#### `get_ws_reservation_count()` の照合ロジック

```python
# WS予約シートの各行に対して以下を照合
str(row[1]) == event_name          # B: イベント名
row[5].replace("/", "-") == date   # F: 希望日（区切り文字を正規化）
str(row[6]) == time_slot           # G: 希望時間帯
count += int(row[7])               # H: 参加人数を合算
```

#### フロントエンド動作（`reserve.html` の JS）

```
onDateChange()
  → TIME_MAP[date] からスロットリストを取得
  → 時間帯 <select> を再構築
  → resetParticipants()（参加人数・送信ボタンをロック）

onDateTimeChange()
  → date と time の両方が選択済みか確認
  → fetch("/api/reserve/availability?event_name=...&date=...&time=...")
  → available <= 0: 「満席」を表示、参加人数 disabled
  → available >= 1: 1〜available の選択肢を生成、送信ボタン有効化
  → catch: フォールバックで 1〜4 の選択肢を表示
```

---

### 6.5 ギャラリー（`/gallery`）

**ルート**: `GET /gallery?brand=ei8ht_plants`  
**関数**: `public.read_gallery(request, brand: str = "ei8ht_plants")`  
**テンプレート**: `templates/gallery.html`

#### クエリパラメータ

| `brand` 値 | 説明 |
|---|---|
| `ei8ht_plants` | デフォルト |
| `habitat_oides` | Habitat Oides |
| `hue` | HUE by ei8ht plants |

#### データフロー

```
get_gallery_images(brand=brand)
  → cache.get(f"gallery:{brand}")
      ヒット → return cached list
      ミス  → Drive API: files.list(q="'{folder_id}' in parents")
              → ファイル ID リスト → サムネイル URL リスト
              → cache.set(f"gallery:{brand}", result, ttl=600)
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `images` | list[str] | サムネイル URL のリスト |
| `current_brand` | str | タブのアクティブ状態管理に使用 |

---

### 6.6 植物標本（`/specimen`）

**ルート**: `GET /specimen`  
**関数**: `public.read_specimen(request)`  
**テンプレート**: `templates/specimen.html`

#### データフロー

```
Sheets "Specimen" シート → get_all_records()
  →  各行:
       品種名 → name
       画像1/画像2/画像3 → get_display_url() → image_urls （空文字除外）
       image_urls が 1 枚以上の行のみ specimen_list に追加
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `specimens` | list[dict] | `{name: str, all_images: list[str]}` |

#### フロントエンド（スライダー）

- 各カードに `window["imgs_{n}"]`（画像 URL 配列）と `window["cur_{n}"]`（現在インデックス）をグローバルに保持
- `doRotate(event, id, dir)`: クリックで前後の画像に切り替え（opacity フェード）
- `goToStore(itemName)`: `https://ei8htplants.square.site/s/search?q={itemName}` を別タブで開く
- `DOMContentLoaded`: 全画像をプリロード

---

### 6.7 コラボレーション（`/collaborations`）

**ルート**: `GET /collaborations`  
**関数**: `public.read_collaborations(request)`  
**テンプレート**: `templates/collaborations.html`

#### データフロー

```
Sheets "PROJECTS" シート → get_all_records()
  →  各 item:
       item["画像"] → カンマ区切り → get_display_url() × N → item["image_urls"]
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `projects` | list[dict] | PROJECTS シートの全行 + `image_urls` フィールドを追加 |

**注意**: PROJECTS シートの読み取りはキャッシュなし（毎回 Sheets API を呼ぶ）。

---

### 6.8 コンセプト（`/concept`）

**ルート**: `GET /concept`  
**関数**: `public.read_concept(request)`  
**テンプレート**: `templates/concept.html`

- 静的コンテンツのみ。Google API 呼び出しなし。
- ブランドライン説明（Habitat Oides / HUE by ei8ht plants）をカード形式で表示。

---

### 6.9 ブランドページ — ei8ht plants（`/ei8htplants`）

**ルート**: `GET /ei8htplants`  
**関数**: `public.read_ei8htplants(request)`  
**テンプレート**: `templates/ei8htplants.html`

#### データフロー

```
get_gallery_images(brand="ei8ht_plants")
  → gallery_images

Sheets "Specimen" シート → get_all_records()
  → 先頭 6 件の画像 1 枚目のみ取得
  → specimen_preview = [{"name": ..., "image": ...}, ...]
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `gallery_preview` | list[str] | 先頭 8 枚のサムネイル URL |
| `specimen_preview` | list[dict] | `{name, image}` の先頭 6 件 |

---

### 6.10 ブランドページ — Habitat Oides（`/habitatoides`）

**ルート**: `GET /habitatoides`  
**関数**: `public.read_habitatoides(request)`  
**テンプレート**: `templates/habitatoides.html`

#### データフロー

```
get_gallery_images(brand="habitat_oides")
  → gallery_preview[:8]
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `gallery_preview` | list[str] | 先頭 8 枚のサムネイル URL |

---

### 6.11 Habitat Oides ワークショップ（`/habitatoides/workshop`）

**ルート**: `GET /habitatoides/workshop`  
**関数**: `public.read_habitatoides_workshop(request)`  
**テンプレート**: `templates/habitatoides_workshop.html`

#### データフロー

```
_brand_events("Habitat Oides")
  → get_events_data(is_past=False)
  → 販売ブランド列に "Habitat Oides" を含む開催予定イベントを抽出

[e for e in events if WSフラグ == "TRUE"]
  → ws_events（予約ボタン付きで表示）
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `ws_events` | list[dict] | `_enrich_event()` 済みの WS フラグ付きイベント |

---

### 6.12 ブランドページ — HUE（`/hue`）

**ルート**: `GET /hue`  
**関数**: `public.read_hue(request)`  
**テンプレート**: `templates/hue.html`

#### データフロー

```
get_gallery_images(brand="hue")
  → gallery_preview[:8]
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `gallery_preview` | list[str] | 先頭 8 枚のサムネイル URL |

---

### 6.13 お問い合わせ（`/contact`）

**ルート**: `GET /contact?sent=1` / `POST /contact`  
**関数**: `public.contact_form` / `public.contact_submit`  
**テンプレート**: `templates/contact.html`

#### フォームフィールド

| フィールド | name 属性 | 必須 |
|---|---|---|
| お名前 | `name` | ✓ |
| メールアドレス | `email` | ✓ |
| 件名 | `subject` | — |
| 内容 | `message` | ✓ |

#### POST フロー

```
form データ取得 → create_contact(data)
  → 「お問い合わせ」シートに 1 行追記（シートがなければ自動作成）

send_contact_notification(data)
  → FROM: ei8ht plants 新規問合せ <ei8htplants@gmail.com>
  → TO: ei8htplants@gmail.com
  → 認証: CONTACT_GMAIL_APP_PASSWORD

send_contact_confirmation(data)
  → FROM: ei8ht plants <ei8htplants@gmail.com>
  → TO: フォームに入力されたメールアドレス
  → 認証: CONTACT_GMAIL_APP_PASSWORD

→ RedirectResponse("/contact?sent=1", 303)
```

送信完了後は `?sent=1` パラメータで完了メッセージを表示（セッション不使用）。

---

## 7. 管理画面

**URL プレフィックス**: `/admin`（`app/__init__.py` でルーター登録時に付与）

全エンドポイントは `_check_auth(request)` を先頭で呼び出し、未認証なら `/admin/login` へリダイレクトする。

### 7.1 認証

| ルート | 関数 | 説明 |
|---|---|---|
| `GET /admin/login` | `admin_login_get` | 既にログイン済みなら `/admin/events` へリダイレクト |
| `POST /admin/login` | `admin_login_post` | 認証成功 → `/admin/events`、失敗 → エラーメッセージ再表示 |
| `GET /admin/logout` | `admin_logout` | セッションをクリアして `/admin/login` へ |
| `GET /admin/` | `admin_root` | `/admin/events` へリダイレクト |

**`login()` の認証ロジック** (`app/auth.py`):
```python
username == settings.admin_user and password == settings.admin_pass
  → request.session["admin"] = True
```

### 7.2 イベント CRUD

#### イベント一覧

**ルート**: `GET /admin/events`  
**テンプレート**: `templates/admin/events.html`

```
session.pop("flash", None) → 書き込み操作後の 1 回限りメッセージを取得・削除
get_all_events_for_admin() → キャッシュなし・開始日降順
```

#### 新規作成

**ルート**: `GET /admin/events/new` / `POST /admin/events/new`

```
GET:
  event={}, row=None, title="新規イベント追加", brand_options=BRAND_OPTIONS
  → admin/event_form.html（全フィールド空）

POST:
  _parse_event_form(request)
    → form.getlist("販売ブランド") → カンマ結合
    → form.get("WSフラグ") → "TRUE" / "FALSE"
  → create_event(data) → Sheets appendRow + cache.clear_prefix("events:")
  → session["flash"] = "イベントを作成しました" or f"エラー: {e}"
  → RedirectResponse("/admin/events")
```

#### 編集

**ルート**: `GET /admin/events/{row}` / `POST /admin/events/{row}`

```
GET:
  get_event_row(row) → Sheets から指定行を直接取得
  → admin/event_form.html（既存値で初期化）

POST:
  _parse_event_form(request) → data
  → update_event(row, data)
       headers を取得して列順に並べ → range A{row}:Z{row} を一括更新
       cache.clear_prefix("events:")
  → session["flash"] = "イベントを更新しました" or f"エラー: {e}"
  → RedirectResponse("/admin/events")
```

**`_col_letter(n)` の変換例**:  
`1 → "A"`, `12 → "L"`, `26 → "Z"`, `27 → "AA"`

#### 削除

**ルート**: `POST /admin/events/{row}/delete`

- GET でなく POST にしている理由: ブラウザの先読み・誤クリックによる意図しない削除を防ぐため
- テンプレート側で `confirm()` による二重確認を実施

```
delete_event(row) → worksheet.delete_rows(row_index) + cache.clear_prefix("events:")
```

**フォームの `brand_options` 定数**:

```python
BRAND_OPTIONS = ["ei8ht plants", "Habitat Oides", "HUE by ei8ht plants"]
```

スプレッドシートの「販売ブランド」列の値と完全一致させること（フィルタリングに使用）。

### 7.3 WS 予約一覧

**ルート**: `GET /admin/reservations?event=イベント名`  
**関数**: `admin_reservations(request, event: str = "")`  
**テンプレート**: `templates/admin/reservations.html`

#### データフロー

```
get_all_ws_reservations()
  → WS予約シートの全行（タイムスタンプ降順）

event_names = 重複除去・順序保持したイベント名一覧（絞り込みセレクトボックス用）

filtered = event クエリが指定されていれば同名のみ絞り込み

totals = イベント名ごとの参加人数合計
  {イベント名: 合計人数}
```

#### テンプレート変数

| 変数 | 型 | 説明 |
|---|---|---|
| `reservations` | list[dict] | 絞り込み済みの予約一覧 |
| `event_names` | list[str] | 絞り込みセレクトの選択肢 |
| `selected_event` | str | 現在の絞り込み値 |
| `totals` | dict[str, int] | `{イベント名: 合計参加人数}` |

---

## 8. フロントエンド共通設計

### 8.1 CSS カスタムプロパティ（`templates/base.html`）

| 変数 | 値 | 用途 |
|---|---|---|
| `--max-width` | `1000px` | コンテンツ最大幅 |
| `--fs-body` | `16px` | 本文 |
| `--fs-micro` | `11px` | バッジ・装飾テキスト |
| `--font-section` | `20px` | セクションタイトル |
| `--font-title-md` | `24px` | 中見出し |
| `--font-info` | `16px` | イベント詳細テキスト |
| `--font-nav` | `16px` | ナビ・ボタン |
| `--font-tag` | `12px` | タグ・ラベル |
| `--font-small` | `13px` | 補足テキスト |
| `--color-bg` | ライトモード対応 | ページ背景 |
| `--color-card-bg` | ライトモード対応 | カード背景 |
| `--color-border` | ライトモード対応 | ボーダー色 |
| `--color-text-main` | ライトモード対応 | メインテキスト |
| `--color-text-sub` | ライトモード対応 | サブテキスト |
| `--color-text-muted` | ライトモード対応 | ミュートテキスト |
| `--color-ws-text` | `#795548`（茶） | WS 関連ボタン・アクセント |
| `--radius-card` | `4px` | カードの角丸 |

### 8.2 共通 HTML 構造（`base.html`）

```
<header>  ← sticky, z-index: 100
  <nav>   ← ハンバーガーメニュー付き（JS でトグル）
    Home / Events / Brands▼ / Concept / Contact / Online Store
                     └─ ei8ht plants
                        Habitat Oides
                        HUE by ei8ht plants
</header>

<main>
  {% block content %}{% endblock %}
</main>

<footer>
  ブランド名 / SNS リンク
</footer>
```

### 8.3 サーバーデータの JS 渡し方（`<script type="application/json">` パターン）

```html
<!-- テンプレート側 -->
<script type="application/json" id="time-map-data">{{ time_map_json | safe }}</script>

<!-- JS 側 -->
<script>
  const TIME_MAP = JSON.parse(document.getElementById('time-map-data').textContent);
</script>
```

VS Code の JS 言語サーバーが `{{ }}` を構文エラーとして警告するのを防ぐため、Jinja2 の出力を `<script>` タグの外側に分離する。

### 8.4 スクロール・サブナビ

ブランドページなど複数セクションを持つページでは:
- `position: sticky; top: 60px; z-index: 90` のサブナビ
- `IntersectionObserver` で各 `section[id]` の可視状態を監視してアクティブクラスを付与
  - `rootMargin: '-55% 0px -45% 0px'`（画面中央付近のセクションを判定）
- `scroll-margin-top: 116px` をセクションに設定してアンカーリンクのオフセットを確保

---

## 9. デプロイ・環境変数

### 9.1 環境変数

| 変数名 | 必須 | 説明 |
|---|---|---|
| `SECRET_KEY` | ◎ | セッション Cookie 署名キー。長いランダム文字列を設定 |
| `ADMIN_USER` | ◎ | 管理画面ログイン ID |
| `ADMIN_PASS` | ◎ | 管理画面ログインパスワード（空文字は不可） |
| `GOOGLE_CREDENTIALS` | ◎ | `secret_key.json` の内容を JSON 文字列としてそのまま設定（1行JSON推奨） |
| `GMAIL_SENDER` | △ | WS予約確認メールの送信元アドレス（例: `habitatoides@gmail.com`） |
| `GMAIL_APP_PASSWORD` | △ | `GMAIL_SENDER` アカウントのGoogleアプリパスワード（16桁） |
| `GMAIL_SENDER_NAME` | — | WS予約確認メールの送信者表示名（デフォルト: `Habitat Oides`） |
| `CONTACT_GMAIL_APP_PASSWORD` | △ | `ei8htplants@gmail.com` のGoogleアプリパスワード（お問い合わせメール用） |

△: 未設定時はメール送信をスキップ（他の機能は正常動作）

`SECRET_KEY` の生成:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 9.2 ローカル開発

```bash
# .env ファイルを作成
ADMIN_USER=admin
ADMIN_PASS=yourpassword
SECRET_KEY=xxxxxxxxxxxxxxxx
# GOOGLE_CREDENTIALS は未設定でも secret_key.json があれば動作する
```

`python-dotenv` が `.env` を自動読み込みする（`config.py` で `load_dotenv()` 実行）。

### 9.3 Render デプロイ

**Start Command**:
```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

- Render 無料プランはスリープあり（初回アクセスが数秒遅延する場合がある）
- ファイルシステムはデプロイのたびにリセットされるため `secret_key.json` をファイルで置かず、`GOOGLE_CREDENTIALS` 環境変数で渡すこと

### 9.4 セキュリティチェックリスト

- [ ] `secret_key.json` が `.gitignore` に追加されていることを確認
- [ ] `ADMIN_PASS` が空文字でないことを確認
- [ ] `SECRET_KEY` が推測困難な長いランダム文字列であることを確認
- [ ] `GOOGLE_CREDENTIALS` が Render の Environment Variables に設定されていることを確認
- [ ] `.env` ファイルが `.gitignore` に追加されていることを確認

---

*© 2026 ei8ht plants. Internal use only.*
