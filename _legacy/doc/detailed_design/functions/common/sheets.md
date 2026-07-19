# 詳細設計書：Google Sheets API ラッパー（共通）

**モジュール**: `app/sheets.py`  
**依存モジュール**: `app/cache.py`、`app/config.py`（`SPREADSHEET_ID`）、`app/google_client.py`（`get_gc`）  
**外部ライブラリ**: `gspread`、`google-auth`

---

## 1. 概要

Google Sheets をデータストアとして使用するための読み書きラッパー。  
公開ページ向けの読み取り関数はキャッシュを経由し、  
管理画面向け関数はキャッシュをバイパスして常に最新データを返す。  
書き込み後はキャッシュを無効化して表示に即反映させる。

---

## 2. スプレッドシート構成

**スプレッドシート ID**: `1_18mozgallwxSZ_u9d5iCdP9CftT7nZ9lgo-v3jbzwU`

| シート | インデックス / 名前 | 主な用途 |
|---|---|---|
| イベント情報 | `get_worksheet(0)` | イベント一覧・管理 |
| WS予約 | `WS_SHEET_NAME = "WS予約"` | ワークショップ予約管理 |
| お問い合わせ | `CONTACT_SHEET_NAME = "お問い合わせ"` | 問い合わせ管理 |

### イベントシート列定義

| 列名 | 内容 |
|---|---|
| 開始日 | `YYYY-MM-DD` または `YYYY/MM/DD` 形式 |
| 終了日 | 同上（単日イベントは空欄も可） |
| イベント名 | イベントの名称 |
| 販売ブランド | `ei8ht plants` 等 |
| 開催時間 | テキスト（例: `10:00〜17:00`） |
| 場所 | 会場名 |
| ブース番号 | テキスト |
| 住所 | 郵便番号・住所（Google マップ検索に使用） |
| 公式サイトURL | イベント公式 URL |
| WSフラグ | ワークショップあり: `TRUE`、なし: 空または `FALSE` |
| WS予約URL | 外部予約 URL（内部予約使用時は空） |
| 画像 | カンマ区切りの Google Drive URL または ファイル ID |

### WS予約シート列定義

| 列番号（0始まり） | 列名 | 内容 |
|---|---|---|
| 0 | タイムスタンプ | `YYYY-MM-DD HH:MM:SS`（JST） |
| 1 | イベント名 | - |
| 2 | お名前 | - |
| 3 | メール | 予約者メールアドレス |
| 4 | 希望日 | `YYYY-MM-DD` |
| 5 | 希望時間帯 | テキスト |
| 6 | 参加人数 | 数値文字列 |
| 7 | お持ち込み | テキスト |
| 8 | 備考 | テキスト |
| 9 | キャンセルトークン | UUID v4 文字列 |
| 10 | キャンセル済み | `TRUE` または空 |
| 11 | キャンセル理由 | テキスト |
| 12 | キャンセル日時 | `YYYY-MM-DD HH:MM:SS`（JST） |
| 13 | メモ | 管理者メモ |

---

## 3. Google API 認証フロー

sheets.py は `get_gc()` を経由して gspread クライアントを取得する。

```
アプリ起動
  └─ get_gc() 初回呼び出し
       └─ gspread.authorize(settings.google_credentials)
            └─ settings.google_credentials（cached_property）
                 ├─ 環境変数 GOOGLE_CREDENTIALS が設定されている場合
                 │    └─ Credentials.from_service_account_info(json.loads(env_val), scopes=SCOPES)
                 └─ 設定されていない場合
                      └─ Credentials.from_service_account_file("secret_key.json", scopes=SCOPES)

API 呼び出し時
  └─ gspread が内部でアクセストークンの有効期限（1時間）をチェック
       ├─ 有効: そのまま使用
       └─ 期限切れ: google-auth が自動でリフレッシュ（Credentials.refresh()）
```

**スコープ**:
- `https://www.googleapis.com/auth/spreadsheets`（Sheets 読み書き）
- `https://www.googleapis.com/auth/drive`（Drive 読み取り）

---

## 4. 定数・モジュールレベル変数

```python
_JST = timezone(timedelta(hours=9))     # タイムゾーン（JST: UTC+9）
WS_SHEET_NAME = "WS予約"                 # WS予約シート名
WS_MAX_PARTICIPANTS = 4                  # 1スロットの最大参加人数
CONTACT_SHEET_NAME = "お問い合わせ"     # お問い合わせシート名
_WS_CANCEL_COLS = [                      # WS予約シートに必要なキャンセル関連列
    "キャンセルトークン", "キャンセル済み",
    "キャンセル理由", "キャンセル日時", "メモ"
]
```

---

## 5. ユーティリティ関数

### 5.1 `get_display_url`

```python
def get_display_url(drive_url_or_id: str) -> str
```

Google Drive のさまざまな URL 形式・ファイル ID からサムネイル表示用 URL を生成する。

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `drive_url_or_id` | `str` | Drive 共有 URL またはファイル ID（空文字も可） |

#### 戻り値

| 値 | 条件 |
|---|---|
| `""` | 引数が空文字または `None` |
| `https://drive.google.com/thumbnail?id={file_id}&sz=w1000` | ファイル ID の抽出に成功した場合 |

#### 内部ロジック（URL 形式の優先順位）

| 優先順位 | 条件 | ファイル ID の抽出方法 |
|---|---|---|
| 1 | `"id="` を含む | `s.split("id=")[1].split("&")[0]` |
| 2 | `"/d/"` を含む | `s.split("/d/")[1].split("/")[0]` |
| 3 | `"open?id="` を含む | `s.split("id=")[1]`（末尾まで） |
| 4 | いずれにも該当しない | そのままファイル ID として使用 |

**thumbnail API（`sz=w1000`）を使う理由**:  
`uc?export=view` と比較してリダイレクトなしで画像を返すため高速。  
ただし、Drive ファイルの共有設定が「リンクを知っている全員」以上でないと表示されない。

#### 副作用

なし（純粋関数）。

---

### 5.2 `parse_date`

```python
def parse_date(date_val) -> datetime.date | None
```

スプレッドシートの日付セル値を Python の `date` オブジェクトに変換する。

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `date_val` | 任意（`str` / `datetime` / `None` 等） | スプレッドシートから取得した日付値 |

#### 戻り値

| 値 | 条件 |
|---|---|
| `datetime.date` オブジェクト | パース成功 |
| `None` | 引数が空 / `None` / パース失敗 |

#### 内部ロジック

```python
date_str = str(date_val).strip().replace("/", "-")
return datetime.strptime(date_str.split(" ")[0], "%Y-%m-%d").date()
```

1. `str()` で文字列化（`datetime` 型等も対応）
2. `strip()` で前後の空白除去
3. `replace("/", "-")` でスラッシュ区切りをハイフンに統一
4. `split(" ")[0]` で `"2026-06-15 00:00:00"` 形式の場合に日付部分のみ取得
5. `strptime("%Y-%m-%d")` でパース

#### 例外

`strptime` が `ValueError` を投げても `except Exception` で補足し `None` を返す。  
呼び出し元でログを出さずにスキップする設計。

#### 副作用

なし（純粋関数）。

---

### 5.3 `_col_letter`（内部ヘルパー）

```python
def _col_letter(n: int) -> str
```

1-based の列番号を Excel スタイルの列文字に変換する。

#### 引数・戻り値

| 入力 | 出力 |
|---|---|
| `1` | `"A"` |
| `26` | `"Z"` |
| `27` | `"AA"` |
| `52` | `"AZ"` |

`update_event` が A1 記法の範囲文字列（例: `A5:L5`）を構築するために使用する。

---

## 6. イベントデータ処理（内部ヘルパー）

### 6.1 `_enrich_event`

```python
def _enrich_event(item: dict) -> dict
```

スプレッドシートの生データにテンプレート表示用の計算済みフィールドを追加する。

#### 引数・戻り値

同じ `dict` を変更して返す（in-place）。

#### 追加フィールド

| フィールド名 | 型 | 内容 | 計算ロジック |
|---|---|---|---|
| `display_date` | `str` | 表示用日付文字列 | 単日: `"2026年6月15日"` / 複数日: `"6月14日 〜 15日"` |
| `map_url` | `str` | Google マップ検索 URL | `住所` → フォールバック `場所` → `urllib.parse.quote` でエンコード |
| `start_obj` | `datetime.date` | ソート用 date オブジェクト | `parse_date(item["開始日"])` |
| `is_past` | `bool` | 過去イベント判定 | `end_date < datetime.today().date()` |
| `image_urls` | `list[str]` | Drive サムネイル URL リスト | `画像` 列をカンマ分割 → 各 URL に `get_display_url()` を適用 |

---

## 7. 公開ページ向け読み取り関数（キャッシュあり）

### 7.1 `get_events_data`

```python
def get_events_data(is_past: bool = False) -> list[dict]
```

#### 引数

| 引数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `is_past` | `bool` | `False` | `True`: 過去イベント / `False`: 現在・将来イベント |

#### 戻り値

`list[dict]` — `_enrich_event` 済みのイベント辞書のリスト  
各辞書には `_row`（シート行番号）が含まれる。

| 引数 `is_past` | キャッシュキー | ソート順 |
|---|---|---|
| `False` | `"events:current"` | `start_obj` 昇順（直近が先頭） |
| `True` | `"events:past"` | `start_obj` 降順（新しい順） |

#### 内部フロー

```
1. cache.get(cache_key) → None でなければキャッシュ値を返してリターン
2. Sheets API: get_gc().open_by_key(SPREADSHEET_ID).get_worksheet(0).get_all_values()
3. ヘッダー行（row=0）を分離
4. データ行（row=2 から）を順番に処理:
   a. 列数不足行は空文字でパディング
   b. dict(zip(headers, padded)) でフィールドマップ化
   c. item["_row"] = i（1-indexed シート行番号）を設定
   d. parse_date("開始日") → None なら skip
   e. is_past フラグに応じてフィルタリング
   f. _enrich_event(item) で表示用フィールドを追加
5. ソート（reverse=is_past）
6. cache.set(cache_key, result) でキャッシュに保存
7. result を返す
```

#### 例外

| 例外 | 条件 | 対処 |
|---|---|---|
| `gspread.exceptions.APIError` | Sheets API のレートリミット超過・認証エラー等 | 呼び出し元（ルートハンドラ）に伝播。キャッシュが空のためユーザーにはエラーページが表示される |

#### 副作用

- キャッシュミス時に `cache.set()` でキャッシュを更新する。
- Google Sheets API を 1 回呼び出す（`get_all_values()`）。

---

## 8. 管理画面向け読み取り関数（キャッシュなし）

### 8.1 `get_all_events_for_admin`

```python
def get_all_events_for_admin() -> tuple[list[str], list[dict]]
```

#### 戻り値

`(headers, events)` のタプル。

| 要素 | 型 | 内容 |
|---|---|---|
| `headers` | `list[str]` | ヘッダー行の列名リスト |
| `events` | `list[dict]` | `_row` フィールド付きのイベント辞書リスト（`_enrich_event` 未適用） |

- ソート: `str(x.get("開始日", ""))` の降順（新しいものが上）
- キャッシュ: 使用しない（常に最新データ）

#### 副作用

Google Sheets API を 1 回呼び出す（`get_all_values()`）。

---

### 8.2 `get_event_row`

```python
def get_event_row(row_index: int) -> tuple[list[str], dict]
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `row_index` | `int` | スプレッドシートの行番号（1-indexed。ヘッダー = 1、最初のデータ = 2） |

#### 戻り値

`(headers, event_dict)` のタプル。

| 要素 | 型 | 内容 |
|---|---|---|
| `headers` | `list[str]` | ヘッダー行の列名リスト |
| `event_dict` | `dict` | 指定行のセル値辞書（`_enrich_event` 未適用、ヘッダー長に合わせてパディング済み） |

#### 副作用

Google Sheets API を 2 回呼び出す（`row_values(1)` + `row_values(row_index)`）。

---

## 9. 管理画面向け書き込み関数（キャッシュ無効化あり）

### 9.1 `create_event`

```python
def create_event(data: dict) -> None
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `data` | `dict` | フィールド名 → 値の辞書（フォームデータ等） |

#### 内部ロジック

```
1. worksheet.row_values(1) でヘッダー取得
2. headers の順に [str(data.get(h, "")) for h in headers] で行データを構築
3. worksheet.append_row(row, value_input_option="RAW") で末尾に追記
4. cache.clear_prefix("events:") でキャッシュ無効化
```

**`value_input_option="RAW"` を使う理由**:  
`USER_ENTERED` では Sheets が日付文字列を自動変換して書式が変わる可能性がある。  
`RAW` を指定することで入力値をそのまま保存する。

#### 戻り値

`None`

#### 例外

| 例外 | 条件 |
|---|---|
| `gspread.exceptions.APIError` | API エラー（認証切れ・レートリミット等）。呼び出し元に伝播 |

#### 副作用

- Sheets API を 2 回呼び出す（`row_values(1)` + `append_row()`）。
- `cache.clear_prefix("events:")` で `"events:current"` と `"events:past"` を削除。

---

### 9.2 `update_event`

```python
def update_event(row_index: int, data: dict) -> None
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `row_index` | `int` | スプレッドシートの行番号（1-indexed） |
| `data` | `dict` | フィールド名 → 値の辞書 |

#### 内部ロジック

```
1. worksheet.row_values(1) でヘッダー取得
2. headers の順に行データを構築
3. _col_letter(len(headers)) で終端列文字を計算（例: ヘッダー12列 → "L"）
4. worksheet.update(
       values=[row],
       range_name=f"A{row_index}:{end_col}{row_index}",
       value_input_option="RAW"
   )
5. cache.clear_prefix("events:")
```

**行全体を一括更新する理由**:  
列ごとに `update_cell` を呼ぶと API 呼び出し回数が列数分（最大12回）になるが、  
`worksheet.update()` なら 1 回で完結する。

#### 副作用

- Sheets API を 2 回呼び出す（`row_values(1)` + `update()`）。
- キャッシュ無効化。

---

### 9.3 `delete_event`

```python
def delete_event(row_index: int) -> None
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `row_index` | `int` | スプレッドシートの行番号（1-indexed） |

#### 内部ロジック

```
1. worksheet.delete_rows(row_index) で指定行を削除（後続行は上に詰まる）
2. cache.clear_prefix("events:")
```

**注意**: `delete_rows()` は行を削除するため、後続行の `_row` 番号がすべて 1 ずつ減る。  
この操作の後にキャッシュが無効化されるため、次のアクセス時に正しい行番号が再取得される。

#### 副作用

- Sheets API を 1 回呼び出す（`delete_rows()`）。
- キャッシュ無効化。

---

## 10. ワークショップ予約関数

### 10.1 `get_all_ws_reservations_for_admin`

```python
def get_all_ws_reservations_for_admin() -> list[dict]
```

#### 戻り値

`list[dict]` — `_row` フィールド付きの予約辞書リスト（タイムスタンプ降順）。  
シートが存在しない、またはデータ行がない場合は空リスト。

---

### 10.2 `_ensure_cancel_columns`（内部ヘルパー）

```python
def _ensure_cancel_columns(ws) -> None
```

`WS予約` シートに `_WS_CANCEL_COLS` の列が存在しない場合に追加するマイグレーション関数。  
既に全列が存在する場合は何もしない。

**マイグレーションロジック**:
1. `ws.row_values(1)` でヘッダーを取得
2. `_WS_CANCEL_COLS` の中でヘッダーに存在しない列を `missing` に収集
3. `ws.resize()` でシートの列数を拡張（必要な場合のみ）
4. `ws.update_cell(1, start + i, name)` で各ヘッダーセルを書き込む

---

### 10.3 `create_ws_reservation`

```python
def create_ws_reservation(data: dict) -> None
```

#### 引数

| キー | 型 | 説明 |
|---|---|---|
| `イベント名` | `str` | - |
| `お名前` | `str` | - |
| `メール` | `str` | - |
| `希望日` | `str` | `YYYY-MM-DD` 形式 |
| `希望時間帯` | `str` | - |
| `参加人数` | `str` | 数値文字列 |
| `お持ち込み` | `str` | - |
| `備考` | `str` | - |

#### 内部フロー

```
1. sh.worksheet("WS予約") でシートを取得
   → 存在しない場合: add_worksheet(rows=1000, cols=14) でシートを新規作成し、
     ヘッダー行を append_row
2. _ensure_cancel_columns(ws) でキャンセル列の存在を保証
3. token = str(uuid.uuid4()) でキャンセルトークン生成
4. data["キャンセルトークン"] = token  （メール送信側が参照）
5. timestamp = datetime.now(_JST).strftime("%Y-%m-%d %H:%M:%S")
6. ws.append_row([timestamp, ...14列..., token, "", "", "", ""])
```

#### 副作用

- `data` 辞書に `"キャンセルトークン"` キーを追加する（in-place）。
- Sheets API を 複数回呼び出す（シート取得 + 場合によっては作成 + append）。
- キャッシュは無効化しない（予約データはキャッシュされていない）。

---

### 10.4 `get_ws_reservation_count`

```python
def get_ws_reservation_count(event_name: str, date: str, time_slot: str) -> int
```

指定イベント × 日付 × 時間帯の予約済み参加人数合計を返す（空き枠確認 API で使用）。

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `event_name` | `str` | イベント名（完全一致） |
| `date` | `str` | 日付（`/` 区切りでも `-` 区切りでも可） |
| `time_slot` | `str` | 時間帯（完全一致） |

#### 戻り値

| 値 | 条件 |
|---|---|
| `0` | シートが存在しない / データ行がない / 該当予約なし |
| 正の整数 | 該当予約の `参加人数` 列の合計 |

#### 内部ロジック

```
1. sh.worksheet("WS予約") → 存在しない場合は 0 を返す
2. ws.get_all_values() で全行取得
3. ヘッダーから "キャンセル済み" 列番号を特定（なければ None）
4. 日付を YYYY-MM-DD に正規化（replace("/", "-").split(" ")[0]）
5. 各データ行をスキャン:
   a. 列数が 7 未満の行はスキップ
   b. "キャンセル済み" が "TRUE" の行はスキップ
   c. row[1]==event_name AND 正規化日付一致 AND row[5]==time_slot の行を集計
   d. int(row[6]) を count に加算（変換失敗は pass）
6. count を返す
```

#### 副作用

Sheets API を 1 回呼び出す（`get_all_values()`）。キャッシュは使用しない。

---

### 10.5 `get_reservation_by_token`

```python
def get_reservation_by_token(token: str) -> dict | None
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `token` | `str` | キャンセルトークン（UUID v4 文字列） |

#### 戻り値

| 値 | 条件 |
|---|---|
| `dict` | トークンが一致する最初の予約レコード（`get_all_records()` の返却形式） |
| `None` | シートが存在しない / 一致するトークンがない |

**注意**: `get_all_records()` を使用するため、シート行番号（`_row`）は含まれない。  
`cancel_reservation()` は `get_all_records()` ではなく `col_values()` で行番号を特定している。

---

### 10.6 `update_reservation_memo`

```python
def update_reservation_memo(row_num: int, memo: str) -> None
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `row_num` | `int` | シート行番号（1-indexed） |
| `memo` | `str` | 書き込むメモ内容 |

#### 内部ロジック

1. `ws.row_values(1)` でヘッダー取得
2. `"メモ"` 列が存在しない場合は `_ensure_cancel_columns()` を呼んでから再取得
3. `memo_col = headers.index("メモ") + 1`（1-indexed 列番号）
4. `ws.update_cell(row_num, memo_col, memo)`

---

### 10.7 `cancel_reservation`

```python
def cancel_reservation(token: str, reason: str = "") -> bool
```

#### 引数

| 引数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `token` | `str` | 必須 | キャンセルトークン（UUID v4 文字列） |
| `reason` | `str` | `""` | キャンセル理由（任意） |

#### 戻り値

| 値 | 条件 |
|---|---|
| `True` | トークンが見つかり、キャンセル処理が完了した |
| `False` | シートが存在しない / 列が見つからない / トークンが一致しない |

#### 内部フロー

```
1. sh.worksheet("WS予約") → 存在しない場合 False
2. ws.row_values(1) でヘッダー取得
3. headers.index() で各キャンセル列番号を取得（ValueError → False）
4. ws.col_values(token_col) でキャンセルトークン列を全取得
5. トークンが一致する行を特定（col_vals[1:] でヘッダー行をスキップ）
6. 一致した場合:
   ws.update_cell(i, done_col,   "TRUE")
   ws.update_cell(i, reason_col, reason)
   ws.update_cell(i, dt_col,     datetime.now(_JST).strftime("%Y-%m-%d %H:%M:%S"))
   → True を返す
7. 一致なし → False
```

**注意**: `update_cell` を 3 回呼び出す（バッチ更新未使用）。将来的に `batch_update` に最適化可能。

---

## 11. お問い合わせ関数

### 11.1 `create_contact`

```python
def create_contact(data: dict) -> None
```

#### 引数

| キー | 型 | 説明 |
|---|---|---|
| `name` | `str` | 送信者名 |
| `email` | `str` | 送信者メールアドレス |
| `subject` | `str` | 件名 |
| `message` | `str` | 本文 |

#### 内部フロー

```
1. sh.worksheet("お問い合わせ") → 存在しない場合:
   add_worksheet(rows=1000, cols=5) でシート新規作成
   ヘッダー行 ["タイムスタンプ", "お名前", "メール", "件名", "内容"] を追記
2. timestamp = datetime.now(_JST).strftime("%Y-%m-%d %H:%M:%S")
3. ws.append_row([timestamp, name, email, subject, message], value_input_option="RAW")
```

---

### 11.2 `get_all_contacts_for_admin`

```python
def get_all_contacts_for_admin() -> list[dict]
```

#### 戻り値

`list[dict]` — 問い合わせレコードのリスト（新しい順）。  
シートが存在しない場合は空リスト。

**実装**: `ws.get_all_records()` の結果を `reversed()` で反転（新着が先頭）。

---

## 12. エラーハンドリング方針

| エラー種別 | 発生箇所 | 対処 |
|---|---|---|
| `gspread.exceptions.SpreadsheetNotFound` | `open_by_key()` | 呼び出し元ルートハンドラに伝播。500 エラーページ表示 |
| `gspread.exceptions.APIError` (429) | 各 API 呼び出し | 同上。キャッシュが機能していれば通常は発生しない |
| `gspread.exceptions.WorksheetNotFound` | `worksheet()` | `get_all_ws_reservations_for_admin` 等では `except Exception: return []` で吸収 |
| `ValueError` | `headers.index()` | `cancel_reservation` では `except ValueError: return False` で吸収 |
| 日付パースエラー | `parse_date()` | `except Exception: return None` で吸収。呼び出し元でスキップ |
| `int()` 変換エラー | `get_ws_reservation_count()` | `except (ValueError, TypeError): pass` で行をスキップ |

---

## 13. キャッシュ無効化マトリクス

| 関数 | 無効化するキャッシュ |
|---|---|
| `create_event` | `cache.clear_prefix("events:")` |
| `update_event` | `cache.clear_prefix("events:")` |
| `delete_event` | `cache.clear_prefix("events:")` |
| `create_ws_reservation` | なし |
| `cancel_reservation` | なし |
| `create_contact` | なし |
