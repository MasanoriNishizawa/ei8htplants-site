# WS予約フォーム画面 詳細設計書

## 1. 画面概要

| 項目 | 内容 |
|------|------|
| 画面名 | ワークショップ予約フォーム |
| URL | `/reserve?row={row}` |
| テンプレート | `templates/reserve.html` |
| HTTPメソッド | GET |
| 担当ルート | `app/routes/public.py` → `reserve_form()` |
| 説明 | Habitat Style Workshop の参加予約を受け付けるフォーム画面。日付・時間帯を選択すると残席を API で確認し、参加人数の選択肢を動的に生成する。 |

---

## 2. GETエンドポイントシグネチャ

```python
@router.get("/reserve", response_class=HTMLResponse)
async def reserve_form(request: Request, row: int = None) -> HTMLResponse
```

### 引数

| 引数 | 型 | 必須 | 説明 |
|------|----|------|------|
| `request` | `Request` | ◯ | FastAPI リクエストオブジェクト |
| `row` | `int \| None` | ✗ | スプレッドシートの行番号（1-indexed）。省略時は `/events` にリダイレクト |

### 戻り値

| 条件 | 戻り値 | ステータスコード |
|------|--------|----------------|
| `row` が None | `RedirectResponse(url="/events")` | 307 |
| WSフラグが TRUE でない | `RedirectResponse(url="/events")` | 307 |
| 正常 | `TemplateResponse("reserve.html", context)` | 200 |
| 例外発生 | `HTMLResponse(f"Reserve Error: {str(e)}")` | 500 |

---

## 3. テンプレートコンテキスト

| 変数名 | 型 | 説明 |
|--------|-----|------|
| `event` | `dict` | `_enrich_event()` 済みのイベントデータ（`display_date`, `map_url`, `image_urls` 等を含む） |
| `row` | `int` | スプレッドシート行番号（隠しフィールドとしてフォームに埋め込む） |
| `date_options` | `list[dict]` | 開始日〜終了日の各日。`{"value": "YYYY-MM-DD", "label": "YYYY年M月D日（曜）"}` 形式 |
| `time_map_json` | `str` | JSON 文字列。`{"YYYY-MM-DD": ["HH:00-HH:00", ...], ...}` 形式。`<script type="application/json">` 経由でJSに渡す |
| `has_time_slots` | `bool` | 開催時間列がパース可能なら True。False のときは時間帯フィールドをテキスト入力に切替 |
| `flash` | `str \| None` | POST 成功後に session から pop したフラッシュメッセージ。存在する場合はモーダルを表示 |

---

## 4. 画面レイアウト

```
[reserve-container]
  [reserve-header]
    - "Habitat Style Workshop — 予約申し込み" (ラベル)
    - イベント名 (h1)
    - 表示用日付 (display_date)

  [form.form-card  POST /reserve]
    [hidden] row = {row}
    [hidden] event_name = {イベント名}

    --- セクション: 参加日時 ---
    [.row-2]
      [select#date  name="date"  required]
        onchange → onDateChange()
        <option value="" disabled selected>選択してください</option>
        {% for opt in date_options %}
          <option value="YYYY-MM-DD">YYYY年M月D日（曜）</option>
        {% endfor %}

      [select#time  name="time"  required  disabled  (has_time_slots=True)]
        onchange → onDateTimeChange()
        or
      [input[type="text"]#time  name="time"  required  (has_time_slots=False)]
        oninput → onDateTimeChange()

    [select#participants  name="participants"  required  disabled]
      ← JS により動的生成

    --- セクション: お申し込み者情報 ---
    [input[type="text"]#name        name="name"        required]
    [input[type="email"]#email      name="email"       required]

    --- セクション: 参加内容 ---
    [checkbox  name="bring-pot"    value="yes"]  植木鉢
    [checkbox  name="bring-plant"  value="yes"]  植物
    [textarea#message  name="message"]  備考（任意）

    [button#btn-submit  type="submit"  disabled]  予約を申し込む

  [p.notice]  確認メールの注意書き

[script#time-map-data  type="application/json"]  {{ time_map_json }}

{% if flash %}
  [.reserve-modal-overlay.is-open]
    [.reserve-modal]  予約完了モーダル
{% endif %}
```

---

## 5. フロントエンド JS 詳細

### 5-1. TIME_MAP の初期化

```javascript
const TIME_MAP = JSON.parse(document.getElementById('time-map-data').textContent);
// 例: {"2026-06-14": ["11:00-12:00","12:00-13:00"], "2026-06-15": ["11:00-12:00"]}
```

### 5-2. onDateChange() — 日付変更ハンドラ

トリガー: `#date` の `onchange`

```
1. date = #date.value を取得
2. timeSel = #time 要素を取得
3. timeSel.tagName === 'SELECT' の場合:
   a. slots = TIME_MAP[date] || []
   b. slots.length === 0:
      - placeholder "時間帯情報がありません" (disabled) を追加
      - timeSel.disabled = true
   c. slots.length > 0:
      - placeholder "選択してください" (disabled, selected) を追加
      - 各 slot に <option value=slot> を追加
      - timeSel.disabled = false
4. resetParticipants() を呼び出す
```

### 5-3. resetParticipants()

```
1. #participants を disabled にし、placeholder を "日付・時間帯を先に選択してください" に戻す
2. #availability-hint のテキストをクリア
3. #btn-submit を disabled にする
```

### 5-4. onDateTimeChange() — 時間帯変更・残席確認ハンドラ

トリガー: `#time` の `onchange`（SELECT）または `oninput`（INPUT）

```
1. date = #date.value, time = #time.value を取得
2. date または time が空の場合 → resetParticipants() して終了
3. #participants を disabled、"空き確認中..." に設定
4. #btn-submit を disabled に設定
5. fetch('/api/reserve/availability?event_name=...&date=...&time=...')
   成功時:
     a. data.available <= 0:
        - "満席です" (disabled) を表示
        - #availability-hint を赤色で "この時間帯は満席です" と表示
        - #btn-submit は disabled のまま
     b. data.available > 0:
        - 1〜data.available の <option> を生成（1名をデフォルト選択）
        - #participants.disabled = false
        - #availability-hint に "残り N 席" を表示
        - #btn-submit.disabled = false
   失敗時（catch）:
     - 1〜4 のフォールバック選択肢を表示
     - #participants.disabled = false
     - #btn-submit.disabled = false
     - #availability-hint をクリア
```

### 5-5. 二重送信防止

```
form.addEventListener('submit', function(e) {
  if (btn.disabled) → e.preventDefault() して終了
  btn.disabled = true
  btn.classList.add('loading')  // スピナー表示（CSS ::after）
  form.classList.add('form-submitting')  // フォーム全体を pointer-events: none
})
```

---

## 6. 正常系・準正常系・異常系パターン

### 正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| N1 | `?row=5` で GET アクセス、WSフラグ=TRUE | 予約フォームが表示される |
| N2 | 日付を選択 | その日の時間帯スロットが時間帯 SELECT に表示される |
| N3 | 時間帯を選択 | 残席 API が呼ばれ、参加人数 SELECT に残席分の選択肢が表示される |
| N4 | 全必須フィールドを入力して「予約を申し込む」 | POST /reserve に送信、完了後 GET /reserve?row=N にリダイレクト、モーダル表示 |

### 準正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| Q1 | 時間帯を選択したが残席=0 | 参加人数 SELECT に "満席です"、送信ボタンは disabled のまま |
| Q2 | `has_time_slots=False`（開催時間が未設定または parse 失敗） | 時間帯フィールドがテキスト入力になる |
| Q3 | API 呼び出し中にネットワークエラー | フォールバックで 1〜4 名の選択肢を表示し、送信可能にする |
| Q4 | 単日イベント（開始日=終了日） | date_options が 1 件のみの SELECT が表示される |
| Q5 | `flash` セッションがある状態でリダイレクト後 GET | 予約完了モーダルが自動表示される |

### 異常系

| # | 操作 | 期待結果 |
|---|------|---------|
| E1 | `?row` パラメータなしでアクセス | `/events` にリダイレクト（307） |
| E2 | 存在しない `row` 番号でアクセス | Sheets API エラー → `HTMLResponse "Reserve Error: ..."` (500) |
| E3 | WSフラグが TRUE でない行にアクセス | `/events` にリダイレクト（307） |
| E4 | Google Sheets API が失敗 | `HTMLResponse "Reserve Error: ..."` (500) |

---

## 7. シーケンス図（GETリクエスト）

```
ブラウザ                    FastAPI                    Google Sheets API
  |                           |                              |
  |--- GET /reserve?row=5 --->|                              |
  |                           |-- get_event_row(5) --------->|
  |                           |<-- (headers, event_dict) ----|
  |                           |                              |
  |                           | _enrich_event(event)         |
  |                           | _generate_date_options(...)  |
  |                           | _generate_time_map(...)      |
  |                           | json.dumps(time_map)         |
  |                           | session.pop("reserve_flash") |
  |                           |                              |
  |<-- 200 HTML (reserve.html)|                              |
  |                           |                              |
```

---

## 8. シーケンス図（POSTリクエスト → リダイレクト → モーダル表示）

```
ブラウザ              FastAPI              Google Sheets      Gmail API
  |                     |                       |                |
  |--- POST /reserve --->|                       |                |
  |   (フォームデータ)    |                       |                |
  |                     |-- create_ws_reservation() ------------>|
  |                     |   (WS予約シートに1行追加・トークン生成)   |
  |                     |<-- (完了) -----------------------------|
  |                     |                                        |
  |                     |-- _fire(send_reservation_confirmation) --> (非同期)
  |                     |-- _fire(send_reservation_notification) --> (非同期)
  |                     |                                        |
  |                     | session["reserve_flash"] = "受付完了メッセージ"
  |                     |                                        |
  |<-- 303 Redirect /reserve?row=5                               |
  |                     |                                        |
  |--- GET /reserve?row=5 -->|                                   |
  |                     | session.pop("reserve_flash") → flash   |
  |<-- 200 HTML (flash あり → modal.is-open)                     |
  |                     |                                        |
  |                (非同期) send_reservation_confirmation ------->|
  |                           ユーザーに確認メール送信             |
  |                (非同期) send_reservation_notification ------->|
  |                           運営に通知メール送信                 |
```

---

## 9. バリデーションルール

### フロントエンド（HTML5 + JS）

| フィールド | バリデーション |
|-----------|--------------|
| 希望日 | `required`、セレクトボックスなので空値選択不可 |
| 希望時間帯 | `required`、残席確認後でないと disabled（SELECT の場合） |
| 参加人数 | 残席>0 でないと disabled |
| 送信ボタン | 参加人数が選択されるまで disabled（二重送信防止あり） |
| お名前 | `required` |
| メールアドレス | `required`、`type="email"`（ブラウザのメール形式バリデーション） |
| 備考 | 任意 |
| お持ち込み | 任意（チェックボックス） |

### バックエンド（Python）

| フィールド | 処理 |
|-----------|------|
| row | `int(form.get("row", 0))` — 変換失敗で ValueError → 500 |
| event_name | `str(form.get("event_name", ""))` — 空文字許容 |
| name | `str(form.get("name", ""))` — バリデーションなし（フロントに委任） |
| email | `str(form.get("email", ""))` — 空文字の場合、確認メール送信をスキップ |
| date | `str(form.get("date", ""))` — バリデーションなし |
| time | `str(form.get("time", ""))` — バリデーションなし |
| participants | `str(form.get("participants", ""))` — バリデーションなし |
| bring-pot / bring-plant | フォームチェック有無でそれぞれ "植木鉢" / "植物" を `", ".join()` でまとめる |
| message | `str(form.get("message", ""))` — バリデーションなし |

---

## 10. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `get_event_row(row)` が失敗 | `gspread.exceptions.APIError` など | `except Exception` でキャッチ → `HTMLResponse("Reserve Error: ...", 500)` |
| WSフラグ確認 | — | `str(event.get("WSフラグ", "")).upper() != "TRUE"` → `RedirectResponse("/events")` |
| `create_ws_reservation()` が失敗 | — | `except Exception` → `HTMLResponse("Reserve Error: ...", 500)` ※予約がシートに書き込まれない |
| `send_reservation_confirmation()` が失敗 | — | `email.py` 内で `except Exception: print(...)` でログに出力して握りつぶし |
| `send_reservation_notification()` が失敗 | — | 同上 |

---

## 11. 状態遷移

```
[状態0] URL直打ち row なし
  └─ → /events にリダイレクト

[状態1] フォーム初期表示
  - 参加日時セクション:
    - #date: 「選択してください」（未選択）
    - #time: disabled「日付を先に選択してください」（SELECT）
              or テキスト入力（has_time_slots=False）
    - #participants: disabled「日付・時間帯を先に選択してください」
  - #btn-submit: disabled

  ↓ 日付選択
[状態2] 日付選択済み
  - #time: enabled、その日のスロット一覧が表示（SELECT）
  - #participants: disabled（リセット済み）
  - #btn-submit: disabled

  ↓ 時間帯選択 → API 呼び出し開始
[状態3] 残席確認中
  - #participants: disabled「空き確認中...」
  - #btn-submit: disabled

  ↓ 残席 > 0
[状態4-A] 残席あり
  - #participants: enabled、1〜N名の選択肢
  - hint: "残り N 席"
  - #btn-submit: enabled

  ↓ 残席 = 0
[状態4-B] 満席
  - #participants: disabled「満席です」
  - hint: "この時間帯は満席です"（赤）
  - #btn-submit: disabled

  ↓ フォーム送信（状態4-Aから）
[状態5] 送信中
  - btn.disabled = true
  - btn にスピナー表示（.loading クラス）
  - フォーム全体: pointer-events: none

  ↓ POST成功 → 303リダイレクト → GETリクエスト（flash あり）
[状態6] 完了モーダル表示
  - .reserve-modal-overlay.is-open
  - 「閉じる」ボタンで /events に遷移
```
