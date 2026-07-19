# イベント管理CRUD機能 詳細設計

- モジュール: `app/routes/admin.py`, `app/sheets.py`
- 認証: 全エンドポイントで `_check_auth()` 必須

---

## 1. 機能概要

管理者がイベント情報を新規作成・編集・削除する CRUD 機能。
スプレッドシートのシート0（イベントシート）を直接操作する。
書き込み後は公開ページ向けキャッシュ（`cache.clear_prefix("events:")`）を無効化し、即時反映を保証する。

---

## 2. ルーティング一覧

| メソッド | パス | 機能 |
|---------|------|------|
| GET | /admin/events | イベント一覧表示 |
| GET | /admin/events/new | 新規作成フォーム表示 |
| POST | /admin/events/new | 新規イベント保存 |
| GET | /admin/events/{row} | 編集フォーム表示 |
| POST | /admin/events/{row} | イベント更新 |
| POST | /admin/events/{row}/delete | イベント削除 |

---

## 3. フォームデータ解析（_parse_event_form）

### シグネチャ:
```python
async def _parse_event_form(request: Request) -> dict
```

### 処理の詳細:
```python
form = await request.form()

# 1. チェックボックス複数選択（販売ブランド）を取得
brands = form.getlist("販売ブランド")

# 2. 特殊処理フィールドを除外して通常フィールドを辞書化
#    dict.fromkeys() で重複キーを排除（同名フィールドの最後の値が選ばれる動作を防ぐ）
skip = {"販売ブランド", "WSフラグ"}
data = {k: form[k] for k in dict.fromkeys(form.keys()) if k not in skip}

# 3. ブランドをカンマ区切りに結合
data["販売ブランド"] = ", ".join(brands)

# 4. WSフラグ（チェックボックス）: 未チェック時は POST データに含まれないため明示設定
data["WSフラグ"] = "TRUE" if form.get("WSフラグ") else "FALSE"

return data
```

**「WSフラグ」チェックボックスの挙動:**
- チェックあり: `form.get("WSフラグ")` が truthy → `"TRUE"`
- チェックなし: HTML の仕様上フォームデータに含まれない → `form.get("WSフラグ")` が `None` → `"FALSE"`

**「販売ブランド」チェックボックス複数選択:**
- `form.getlist("販売ブランド")` で同名フィールドの全値を取得
- 選択なし: `[]` → `""`
- 1つ選択: `["ei8ht plants"]` → `"ei8ht plants"`
- 複数選択: `["ei8ht plants", "Habitat Oides"]` → `"ei8ht plants, Habitat Oides"`

**定義済みブランド選択肢:**
```python
BRAND_OPTIONS = ["ei8ht plants", "Habitat Oides", "HUE by ei8ht plants"]
```

---

## 4. 新規イベント作成

### 4-1. GET /admin/events/new

**シグネチャ:**
```python
async def admin_events_new(request: Request) -> HTMLResponse | RedirectResponse
```

**処理:**
1. `_check_auth(request)` で認証確認
2. `admin_event_form.html` に以下を渡してレンダリング:
   - `event={}` — 空辞書で全フィールドを空表示
   - `row=None` — フォームの POST 先が `/admin/events/new` になる
   - `title="新規イベント追加"`
   - `brand_options=BRAND_OPTIONS`

### 4-2. POST /admin/events/new

**シグネチャ:**
```python
async def admin_events_create(request: Request) -> RedirectResponse
```

**処理フロー:**
1. `_check_auth(request)` で認証確認
2. `await _parse_event_form(request)` でフォームデータ解析
3. `create_event(data)` を呼び出し
   - 成功: `session["flash"] = "イベントを作成しました"`
   - 例外: `session["flash"] = f"エラー: {e}"`
4. 302 リダイレクト `/admin/events`

---

## 5. イベント編集

### 5-1. GET /admin/events/{row}

**シグネチャ:**
```python
async def admin_events_edit(request: Request, row: int) -> HTMLResponse | RedirectResponse
```

**引数:**
| 引数 | 型 | 説明 |
|------|-----|------|
| row | int | スプレッドシートの行番号（1-indexed、データ開始 = 2） |

**パスパラメータと型変換:**
FastAPI はパスパラメータを `int` に変換しようとする。`/events/new` にアクセスした場合、`"new"` → `int` 変換が失敗するため、このルートはスキップされ先に定義された `GET /events/new` がマッチする。

**処理フロー:**
1. `_check_auth(request)` で認証確認
2. `get_event_row(row)` を呼び出し `(headers, event)` を取得
   - 内部: `worksheet.row_values(row_index)` で指定行を取得
3. `admin_event_form.html` に以下を渡してレンダリング:
   - `event=event` — 取得したイベントデータ
   - `row=row` — フォームの POST 先が `/admin/events/{row}` になる
   - `title="イベント編集"`
   - `brand_options=BRAND_OPTIONS`

**エラーハンドリング:**
- 例外発生時: 500 `"Error: {str(e)}"`

### 5-2. POST /admin/events/{row}

**シグネチャ:**
```python
async def admin_events_update(request: Request, row: int) -> RedirectResponse
```

**処理フロー:**
1. `_check_auth(request)` で認証確認
2. `await _parse_event_form(request)` でフォームデータ解析
3. `update_event(row, data)` を呼び出し
   - 成功: `session["flash"] = "イベントを更新しました"`
   - 例外: `session["flash"] = f"エラー: {e}"`
4. 302 リダイレクト `/admin/events`

---

## 6. イベント削除

### POST /admin/events/{row}/delete

**シグネチャ:**
```python
async def admin_events_delete(request: Request, row: int) -> RedirectResponse
```

**処理フロー:**
1. `_check_auth(request)` で認証確認
2. `delete_event(row)` を呼び出し
   - 成功: `session["flash"] = "イベントを削除しました"`
   - 例外: `session["flash"] = f"エラー: {e}"`
3. 302 リダイレクト `/admin/events`

**GET ではなく POST を使う理由:**
- GET リクエストはブラウザの先読み（prefetch）や誤クリックで意図せず実行される可能性がある
- データ変更操作は POST にするのが Web の慣習（[RFC 7231](https://tools.ietf.org/html/rfc7231)）

---

## 7. Sheets 書き込み関数仕様

### 7-1. create_event(data: dict) -> None

```python
def create_event(data: dict) -> None
```

**処理:**
1. `get_gc().open_by_key(SPREADSHEET_ID)` でスプレッドシートを開く
2. `sh.get_worksheet(0)` でイベントシートを取得
3. `worksheet.row_values(1)` でヘッダー行を取得
4. ヘッダー順に値を並べる:
   ```python
   row = [str(data.get(h, "")) for h in headers]
   ```
5. `worksheet.append_row(row, value_input_option="RAW")` で末尾に追加
6. `cache.clear_prefix("events:")` でキャッシュ無効化

**`value_input_option="RAW"` の意味:**
Sheets が日付文字列を自動フォーマット変換しないよう RAW 書き込みを指定する。`USER_ENTERED` の場合、"2026-06-15" が Sheets 側でシリアル値に変換されることがある。

### 7-2. update_event(row_index: int, data: dict) -> None

```python
def update_event(row_index: int, data: dict) -> None
```

**処理:**
1. ヘッダー行を取得し、ヘッダー順に値を並べる
2. 行全体を一括更新:
   ```python
   end_col = _col_letter(len(headers))  # 例: 12列→"L"
   worksheet.update(
       values=[row],
       range_name=f"A{row_index}:{end_col}{row_index}",  # 例: "A5:L5"
       value_input_option="RAW",
   )
   ```
3. `cache.clear_prefix("events:")` でキャッシュ無効化

**一括更新を使う理由:** 列ごとに `update_cell()` を呼ぶより 1 API リクエストで完結するため効率的。

### 7-3. delete_event(row_index: int) -> None

```python
def delete_event(row_index: int) -> None
```

**処理:**
1. `worksheet.delete_rows(row_index)` で指定行を削除
   - `delete_rows()` は指定行を削除し後続行を上に詰める
2. `cache.clear_prefix("events:")` でキャッシュ無効化

**注意点:** 削除後は後続行のシート行番号が 1 ずつ減る。管理画面は常に最新データを取得するためリロード後に正しい行番号が表示される。

### 7-4. get_event_row(row_index: int) -> tuple[list[str], dict]

```python
def get_event_row(row_index: int) -> tuple[list[str], dict]
```

**処理:**
1. `worksheet.row_values(1)` でヘッダー行を取得
2. `worksheet.row_values(row_index)` で指定行の値を取得
3. 行末の空セルは `row_values()` に含まれないためヘッダー長にパディング:
   ```python
   row_values = row_values + [""] * (len(headers) - len(row_values))
   ```
4. `dict(zip(headers, row_values))` で辞書化して返す

---

## 8. _col_letter ヘルパー

```python
def _col_letter(n: int) -> str:
```

1-based の列番号を Excel スタイルの列文字に変換する。

| 入力 | 出力 |
|------|------|
| 1 | "A" |
| 12 | "L" |
| 26 | "Z" |
| 27 | "AA" |

---

## 9. シーケンス図

### 新規作成

```
ブラウザ          FastAPI                  Google Sheets          キャッシュ
  |                 |                           |                     |
  |--GET /admin/events/new-->                    |                     |
  |<--200 空フォーム--|                           |                     |
  |                 |                           |                     |
  |--POST /admin/events/new-->                   |                     |
  |  (フォームデータ)  |--_parse_event_form()   |                     |
  |                 |--create_event(data)------>|                     |
  |                 |                           |--append_row()       |
  |                 |                           |<--OK----------------|
  |                 |                           |   cache.clear_prefix("events:")-->
  |                 |--session["flash"]="作成しました"               |
  |<--302 /admin/events--|                       |                     |
```

### 更新

```
ブラウザ          FastAPI                  Google Sheets          キャッシュ
  |                 |                           |                     |
  |--GET /admin/events/5-->                      |                     |
  |                 |--get_event_row(5)-------->|                     |
  |                 |                           |--row_values(5)      |
  |<--200 編集フォーム--|                         |                     |
  |                 |                           |                     |
  |--POST /admin/events/5-->                     |                     |
  |                 |--update_event(5, data)--->|                     |
  |                 |                           |--update("A5:L5")    |
  |                 |                           |   cache.clear_prefix("events:")-->
  |<--302 /admin/events--|                       |                     |
```

### 削除

```
ブラウザ          FastAPI                  Google Sheets          キャッシュ
  |                 |                           |                     |
  |--POST /admin/events/5/delete-->              |                     |
  |  (confirm OK済み)  |--delete_event(5)------->|                     |
  |                 |                           |--delete_rows(5)     |
  |                 |                           |   cache.clear_prefix("events:")-->
  |<--302 /admin/events--|                       |                     |
```

---

## 10. パターン一覧

### 正常系・準正常系・異常系

| 操作 | パターン | 条件 | flash メッセージ |
|------|----------|------|----------------|
| 新規作成 | 正常: 作成成功 | append_row 成功 | "イベントを作成しました" |
| 新規作成 | 異常: API エラー | Sheets API 例外 | "エラー: {str(e)}" |
| 編集フォーム | 正常: 行取得成功 | row_values 成功 | なし（フォーム表示） |
| 編集フォーム | 異常: 行取得失敗 | 例外発生 | 500 "Error: {str(e)}" |
| 更新 | 正常: 更新成功 | update 成功 | "イベントを更新しました" |
| 更新 | 異常: API エラー | Sheets API 例外 | "エラー: {str(e)}" |
| 削除 | 正常: 削除成功 | delete_rows 成功 | "イベントを削除しました" |
| 削除 | 準正常: 削除確認キャンセル | JS confirm() が false | フォーム未送信（サーバー到達なし） |
| 削除 | 異常: API エラー | Sheets API 例外 | "エラー: {str(e)}" |
| 全操作 | 未認証 | セッションなし | 302 /admin/login（flash なし） |
