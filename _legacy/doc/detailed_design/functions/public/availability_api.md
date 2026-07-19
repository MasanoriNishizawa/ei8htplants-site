# 残席確認API 詳細設計書

## 1. 機能概要

| 項目 | 内容 |
|------|------|
| 機能名 | ワークショップ残席確認 API |
| エンドポイント | `GET /api/reserve/availability` |
| 担当モジュール | `app/routes/public.py` → `ws_availability()` |
| 読み取り関数 | `app/sheets.py` → `get_ws_reservation_count()` |
| 説明 | 指定されたイベント・日付・時間帯の残席数を JSON で返す。予約フォームの参加人数セレクトボックスをリアルタイムで更新するために JS から呼び出される。 |

---

## 2. エンドポイントシグネチャ

```python
@router.get("/api/reserve/availability")
async def ws_availability(
    event_name: str = "",
    date: str = "",
    time: str = ""
) -> JSONResponse
```

### クエリパラメータ

| パラメータ | 型 | 必須 | 説明 | 例 |
|-----------|-----|------|------|-----|
| `event_name` | `str` | △ | イベント名（スプレッドシートの「イベント名」列と完全一致） | `"Habitat%20Style%20WS%202026"` |
| `date` | `str` | △ | 希望日（YYYY-MM-DD 形式） | `"2026-06-14"` |
| `time` | `str` | △ | 希望時間帯（シートの「希望時間帯」列と完全一致） | `"13:00-14:00"` |

※ 全て省略可能（省略時は空文字として扱われる）。実際の使用では全て指定される。

### レスポンス

#### 正常時

```json
{
  "available": 3,
  "max": 4
}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `available` | `int` | 残席数（0以上）。`max(0, WS_MAX_PARTICIPANTS - 予約済み合計)` |
| `max` | `int` | 最大参加人数（`WS_MAX_PARTICIPANTS = 4`、定数） |

#### エラー時（例外発生）

```json
{
  "available": 4,
  "error": "エラーメッセージ",
  "max": 4
}
```

エラー時は `available = WS_MAX_PARTICIPANTS`（最大値）を返す（フォールバック）。

---

## 3. 処理フロー詳細

```python
@router.get("/api/reserve/availability")
async def ws_availability(event_name: str = "", date: str = "", time: str = ""):
    try:
        # 1. 予約済み人数を取得
        current = get_ws_reservation_count(event_name, date, time)

        # 2. 残席数を計算（負にならないよう max(0, ...) でクランプ）
        available = max(0, WS_MAX_PARTICIPANTS - current)

        return JSONResponse({"available": available, "max": WS_MAX_PARTICIPANTS})
    except Exception as e:
        # エラー時はフォールバック（最大席数を返す）
        return JSONResponse({
            "available": WS_MAX_PARTICIPANTS,
            "max": WS_MAX_PARTICIPANTS,
            "error": str(e)
        })
```

---

## 4. `get_ws_reservation_count()` 詳細

```python
def get_ws_reservation_count(event_name: str, date: str, time_slot: str) -> int
```

### 引数

| 引数 | 型 | 説明 |
|------|----|------|
| `event_name` | `str` | イベント名（シートの列 B と比較） |
| `date` | `str` | 希望日（YYYY-MM-DD）。シートの列 E と比較 |
| `time_slot` | `str` | 希望時間帯（例: "13:00-14:00"）。シートの列 F と比較 |

### 処理フロー

```
1. get_gc().open_by_key(SPREADSHEET_ID) でスプレッドシートを開く
2. ws.worksheet("WS予約") でシートを取得
   存在しない場合（まだ誰も予約していない）: 0 を返す
3. rows = ws.get_all_values() で全行を取得
   rows.length < 2 の場合（ヘッダーのみ）: 0 を返す
4. headers = rows[0] でヘッダー行を取得
5. キャンセル済み列のインデックスを特定:
   cancel_col = headers.index("キャンセル済み") if "キャンセル済み" in headers else None
6. date を正規化: norm_date = date.replace("/", "-").split(" ")[0]
7. ヘッダー行をスキップして各データ行を処理:
   a. len(row) < 7 の行はスキップ（不完全な行）
   b. キャンセル済み = "TRUE" の行はスキップ
   c. 行の日付を正規化: row_date = row[4].replace("/", "-").split(" ")[0]
   d. 以下の3条件が全て一致する場合に count に参加人数を加算:
      - row[1] == event_name   (B列: イベント名)
      - row_date == norm_date  (E列: 希望日 ← 正規化後)
      - row[5] == time_slot    (F列: 希望時間帯)
   e. row[6] を int() に変換して count に加算（失敗は無視）
8. count を返す
```

### 列インデックス（0-indexed）

| インデックス | カラム名 | 比較対象 |
|------------|---------|---------|
| 0 | タイムスタンプ | — |
| 1 | イベント名 | `event_name` と完全一致 |
| 2 | お名前 | — |
| 3 | メール | — |
| 4 | 希望日 | `norm_date` と比較（日付正規化後） |
| 5 | 希望時間帯 | `time_slot` と完全一致 |
| 6 | 参加人数 | int 変換して加算 |

---

## 5. 日付の正規化ロジック

Google Sheets はリージョン設定によって日付を "/" 区切りに自動フォーマットすることがある。

```python
# リクエスト側の正規化
norm_date = str(date).replace("/", "-").split(" ")[0]
# 例: "2026/06/14"        → "2026-06-14"
# 例: "2026-06-14 00:00:00" → "2026-06-14"

# シート側の正規化（同じロジック）
row_date = str(row[4]).replace("/", "-").split(" ")[0]
```

---

## 6. WS_MAX_PARTICIPANTS 定数

```python
# app/sheets.py
WS_MAX_PARTICIPANTS = 4  # GAS の doPost の MAX_PARTICIPANTS と合わせる
```

- 上限参加人数: 4名
- この値を超えた予約をシートに書き込むことはフロントエンドで防いでいる（残席 0 時に送信ボタンを disabled）
- バックエンドでの上限チェックは未実装

---

## 7. クライアント側（JS）の呼び出し方法

`reserve.html` の `onDateTimeChange()` 関数から呼び出される:

```javascript
async function onDateTimeChange() {
    const date      = document.getElementById('date').value;
    const time      = document.getElementById('time').value;
    const eventName = document.getElementById('event_name').value;

    // date または time が空の場合は呼び出さない
    if (!date || !time) { resetParticipants(); return; }

    const url = '/api/reserve/availability'
        + '?event_name=' + encodeURIComponent(eventName)
        + '&date='       + encodeURIComponent(date)
        + '&time='       + encodeURIComponent(time);

    const data = await (await fetch(url)).json();

    if (data.available <= 0) {
        // 満席: 参加人数 SELECT を無効化
        p.innerHTML = '<option value="" disabled selected>満席です</option>';
        h.style.color = '#c0392b';
        h.textContent = 'この時間帯は満席です。他の時間帯をお選びください。';
    } else {
        // 空き有り: 1〜available の選択肢を動的生成
        for (let i = 1; i <= data.available; i++) {
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = i + '名';
            if (i === 1) opt.selected = true;
            p.appendChild(opt);
        }
        p.disabled = false;
        h.textContent = '残り ' + data.available + ' 席';
        btn.disabled = false;
    }
}
```

---

## 8. シーケンス図

```
ブラウザ(JS)                FastAPI                    Google Sheets API
  |                           |                              |
  |-- fetch('/api/reserve/availability?...') -->             |
  |                           |-- get_ws_reservation_count() -->
  |                           |   1. worksheet("WS予約") 取得|
  |                           |   2. get_all_values()       ->|
  |                           |   3. 各行をスキャン:          |
  |                           |      - キャンセル済み行スキップ|
  |                           |      - イベント名・日付・時間帯でフィルタ
  |                           |      - 参加人数を合計         |
  |                           |<-- count (int) --------------|
  |                           |                              |
  |                           | available = max(0, 4 - count)|
  |<-- JSON {"available": N, "max": 4} ---|                  |
  |                           |                              |
  | JSが available に基づいて  |                              |
  | SELECT を動的生成           |                             |
```

---

## 9. パフォーマンス上の注意

- このエンドポイントはキャッシュを使用しない（常に最新の予約状況を Sheets API から取得）
- `get_all_values()` でシート全行を取得する（大量の予約がある場合に遅延の可能性）
- 日付・時間帯を変更するたびに呼び出されるため、ユーザー操作頻度によってはAPI呼び出し回数が増える
- Sheets API の無料枠（1分あたりのリクエスト数）に注意が必要

---

## 10. 正常系・準正常系・異常系パターン

### 正常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| N1 | 予約が 0 件の時間帯を問い合わせ | `{"available": 4, "max": 4}` |
| N2 | 予約が 2 件（合計人数 3名）の時間帯 | `{"available": 1, "max": 4}` |
| N3 | 予約が満員（合計人数 4名）の時間帯 | `{"available": 0, "max": 4}` |
| N4 | キャンセル済み予約を除外した残席確認 | キャンセル行は count に含まれない |

### 準正常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| Q1 | `WS予約` シートが存在しない（初回） | `get_ws_reservation_count` が 0 を返す → `{"available": 4, "max": 4}` |
| Q2 | 参加人数が int 変換できない値（例: "二名"） | `except (ValueError, TypeError): pass` でスキップ → その行の参加人数は 0 として扱う |
| Q3 | `event_name` が空文字で呼び出し | `row[1] == ""` に一致する行のみカウント → 通常は 0 |
| Q4 | `cancel_col` が存在しない古いシート形式 | `cancel_col = None` → キャンセル済みチェックをスキップして全予約を合計 |

### 異常系

| # | シナリオ | 期待結果 |
|---|---------|---------|
| E1 | Sheets API エラー（認証切れなど） | `{"available": 4, "max": 4, "error": "エラーメッセージ"}` |
| E2 | JS 側の fetch エラー（ネットワーク障害） | JS の `catch` ブロックでフォールバック（1〜4名の選択肢を表示） |

---

## 11. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `get_ws_reservation_count()` Sheets API 失敗 | `gspread.exceptions.APIError` | `except Exception` → `{"available": WS_MAX_PARTICIPANTS, "max": WS_MAX_PARTICIPANTS, "error": str(e)}` |
| `int(row[6])` 変換失敗 | `ValueError`, `TypeError` | `except: pass` でスキップ（その行の人数は 0 扱い） |
| JS `fetch()` ネットワーク失敗 | — | JS の `catch(_)` で 1〜4 名のフォールバック選択肢を表示 |
