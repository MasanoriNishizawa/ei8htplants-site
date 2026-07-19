# イベント一覧画面 詳細設計書

## 1. 画面概要

| 項目 | 内容 |
|------|------|
| 画面名 | イベント一覧 |
| URL | `/events`（開催予定）/ `/events?page=past`（過去） |
| テンプレート | `templates/events.html` |
| HTTPメソッド | GET |
| 担当ルート | `app/routes/public.py` → `read_events()` |
| 説明 | 開催予定イベントと過去イベントを切り替えて一覧表示する。開催予定では直近イベントをピン留め大表示し、それ以降をグリッドで表示する。 |

---

## 2. エンドポイントシグネチャ

```python
@router.get("/events", response_class=HTMLResponse)
async def read_events(request: Request, page: str = None) -> HTMLResponse
```

### 引数

| 引数 | 型 | 必須 | 説明 |
|------|----|------|------|
| `request` | `Request` | ◯ | FastAPI リクエストオブジェクト |
| `page` | `str \| None` | ✗ | `"past"` で過去イベント表示。それ以外（省略含む）は開催予定を表示 |

### 戻り値

| 条件 | 戻り値 | ステータスコード |
|------|--------|----------------|
| 正常 | `TemplateResponse("events.html", context)` | 200 |
| 例外発生 | `HTMLResponse(f"Events Error: {str(e)}")` | 500 |

---

## 3. テンプレートコンテキスト

| 変数名 | 型 | 説明 |
|--------|-----|------|
| `pinned_event` | `dict \| None` | 開催予定モードでのみ設定。イベントリスト先頭（最も近い日付）。過去モードでは None |
| `scheduled_events` | `list[dict]` | 開催予定モード: pinned_event 以外のイベント（2番目以降）。過去モード: 全件（新しい順） |
| `is_past` | `bool` | True: 過去イベント表示、False: 開催予定表示 |

### データ選別ロジック

```python
is_past = page == "past"
events_list = get_events_data(is_past=is_past)

# 開催予定: 先頭をピン留め、残りをグリッド
# 過去:     全件グリッド（ピン留めなし）
pinned_event = events_list[0] if not is_past and events_list else None
scheduled_events = (
    events_list[1:] if not is_past and len(events_list) > 1
    else events_list
)
```

---

## 4. 画面レイアウト

### 開催予定（`is_past=False`）

```
[.page-header]
  <h1>Events</h1>

[.container]
  {% if pinned_event %}
    <h2>Next Event</h2>
    create_event_card(pinned_event, is_next=True)  ← 大きいカード

    {% if scheduled_events %}
      <h2>Events Schedule</h2>
      [.events-grid]
        {% for item in scheduled_events %}
          create_event_card(item)  ← 通常グリッドカード
        {% endfor %}
    {% endif %}

  {% else %}
    <p>予定されているイベントはありません。</p>
  {% endif %}

  [.admin-link-container]
    <a href="/events?page=past">過去のイベントを見る</a>
```

### 過去イベント（`is_past=True`）

```
[.page-header]
  <h1>Past Events</h1>

[.container]
  {% if scheduled_events %}
    [.events-grid]
      {% for item in scheduled_events %}
        create_event_card(item)
      {% endfor %}
  {% else %}
    <p>過去のイベントはありません。</p>
  {% endif %}

  [.admin-link-container]
    <a href="/events">現在のイベントを見る</a>
```

### イベントカード（_macros.html の create_event_card）

イベントカードは `_macros.html` の `create_event_card(item, is_next=False, is_home=False)` マクロが担当する。カードに含まれる主な情報:
- イベント画像（`image_urls[0]`）
- イベント名（`イベント名`）
- 表示日付（`display_date`）
- 場所（`場所`）
- ブース番号（`ブース番号`）
- WSフラグが TRUE の場合: 「予約する」ボタン（`/reserve?row={_row}`）

---

## 5. データ取得詳細

### `get_events_data(is_past: bool)` の動作

```
キャッシュキー:
  is_past=False → "events:current"
  is_past=True  → "events:past"

キャッシュヒット: キャッシュから即返す
キャッシュミス:
  1. Sheets API: get_worksheet(0).get_all_values() で全行取得
  2. ヘッダー行（row=1）でカラム名を確定
  3. データ行（row=2〜）を1行ずつ処理:
     a. 開始日をパース → 失敗した行はスキップ
     b. 終了日をパース（失敗時は開始日と同じ）
     c. is_past=False: 終了日 >= today の行のみ採用
        is_past=True:  終了日 <  today の行のみ採用
     d. _enrich_event(item) で display_date, map_url, image_urls を付加
  4. ソート:
     is_past=False → start_obj 昇順（直近が先頭）
     is_past=True  → start_obj 降順（新しいものが先頭）
  5. キャッシュに保存して返す
```

### イベントデータの主要フィールド

スプレッドシートのカラム（シート0）:

| カラム名 | 説明 |
|---------|------|
| 開始日 | YYYY-MM-DD または YYYY/MM/DD |
| 終了日 | 同上（空の場合は開始日と同じ扱い） |
| イベント名 | イベントの表示名 |
| 販売ブランド | カンマ区切りのブランド名 |
| 開催時間 | "10:00〜17:00" など（時間スロット生成に使用） |
| 場所 | 会場名 |
| ブース番号 | ブース番号（任意） |
| 住所 | Google マップリンク生成に使用 |
| 公式サイトURL | 任意 |
| WSフラグ | "TRUE" のとき予約ボタンを表示 |
| WS予約URL | 外部予約URL（使用していない場合あり） |
| 画像 | カンマ区切りの Drive URL |

### _enrich_event が付加するフィールド

| フィールド | 内容 |
|----------|------|
| `display_date` | 単日: "2026年6月15日"、複数日: "2026年6月14日 〜 15日" |
| `map_url` | `https://www.google.com/maps/search/?api=1&query=住所` |
| `start_obj` | `datetime.date` オブジェクト（ソート用） |
| `is_past` | `end_date < datetime.today().date()` |
| `image_urls` | `[get_display_url(u) for u in 画像.split(",")]` |
| `_row` | スプレッドシートの行番号（予約URL生成用） |

---

## 6. 正常系・準正常系・異常系パターン

### 正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| N1 | `/events` にアクセス | 開催予定イベント一覧（直近ピン留め + グリッド） |
| N2 | `/events?page=past` にアクセス | 過去イベント一覧（全件グリッド、新しい順） |
| N3 | 「過去のイベントを見る」リンクをクリック | `?page=past` に切り替わる |
| N4 | 「現在のイベントを見る」リンクをクリック | `?page=past` なしの `/events` に戻る |
| N5 | WSフラグ=TRUE のイベントの「予約する」ボタンをクリック | `/reserve?row=N` に遷移 |

### 準正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| Q1 | 開催予定イベントが 0 件 | "予定されているイベントはありません。" テキストを表示 |
| Q2 | 開催予定イベントが 1 件のみ | pinned_event のみ表示（scheduled_events は空リスト） |
| Q3 | 過去イベントが 0 件 | "過去のイベントはありません。" テキストを表示 |
| Q4 | `?page=other` など past 以外の値 | is_past=False として開催予定表示 |

### 異常系

| # | 操作 | 期待結果 |
|---|------|---------|
| E1 | Google Sheets API が失敗 | `HTMLResponse("Events Error: ...", 500)` |

---

## 7. シーケンス図

```
ブラウザ                    FastAPI                    Google Sheets API / Cache
  |                           |                              |
  |--- GET /events ----------->|                              |
  |                           |-- cache.get("events:current")|
  |                           |<-- キャッシュヒット時: list --|
  |                           |   (Sheets API 呼び出しなし)  |
  |                           |                              |
  |                           | [キャッシュミス時]           |
  |                           |-- get_worksheet(0).get_all_values() -->|
  |                           |<-- 2D配列 -------------------|
  |                           | フィルタ・ソート・_enrich_event処理 |
  |                           |-- cache.set("events:current", result) |
  |                           |                              |
  |<-- 200 HTML (events.html) |                              |
```

---

## 8. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `get_events_data()` 内 Sheets API 呼び出し | `gspread.exceptions.APIError` など | `except Exception` でキャッチ → `HTMLResponse("Events Error: ...", 500)` |
| `parse_date()` が失敗 | — | None を返す → 該当行をスキップ（エラーにしない） |

---

## 9. キャッシュ戦略

- キャッシュキー: `"events:current"`, `"events:past"`
- キャッシュの無効化タイミング:
  - 管理画面でイベントを追加・更新・削除したとき
  - `cache.clear_prefix("events:")` を呼び出すことで両方を一括無効化
- キャッシュ有効期間: アプリケーション設定に依存（TTL は `cache.py` の実装による）
