# 予約管理機能 詳細設計

- モジュール: `app/routes/admin.py`, `app/sheets.py`, `app/email.py`
- 関連画面: 予約一覧・予約表・参加履歴
- 認証: 全エンドポイントで `_check_auth()` 必須

---

## 1. 機能概要

WS予約シートに対する以下の操作機能:
1. 予約一覧の読み取り・フィルタリング
2. 管理者メモの更新（Ajax）
3. 管理者によるキャンセル処理（メール通知付き）
4. 予約表（時間帯別一覧）表示
5. 参加履歴（お名前別）表示

---

## 2. シートデータ構造（WS予約シート）

### シート名: `WS予約`

| 列インデックス | 列名 | 型 | 説明 |
|------------|------|-----|------|
| 0 | タイムスタンプ | str | "YYYY-MM-DD HH:MM:SS" (JST) |
| 1 | イベント名 | str | |
| 2 | お名前 | str | |
| 3 | メール | str | |
| 4 | 希望日 | str | "YYYY-MM-DD" |
| 5 | 希望時間帯 | str | |
| 6 | 参加人数 | str | 数値の文字列表現 |
| 7 | お持ち込み | str | |
| 8 | 備考 | str | |
| 9 | キャンセルトークン | str | UUID v4 |
| 10 | キャンセル済み | str | "" or "TRUE" |
| 11 | キャンセル理由 | str | |
| 12 | キャンセル日時 | str | "YYYY-MM-DD HH:MM:SS" (JST) |
| 13 | メモ | str | 管理者が入力するメモ |

シートが存在しない場合（予約ゼロ状態）は上記ヘッダーで自動作成される。

---

## 3. 予約データ取得関数

### get_all_ws_reservations_for_admin()

```python
def get_all_ws_reservations_for_admin() -> list[dict]
```

**処理:**
1. `sh.worksheet(WS_SHEET_NAME)` でシート取得（存在しない場合は `[]` を返す）
2. `ws.get_all_values()` でヘッダー含む全データを 2D リスト取得
3. ヘッダー行をキーとして各データ行を辞書化
4. `d["_row"] = sheet_row` でシート行番号（1-indexed、データ開始=2）を埋め込む
5. `タイムスタンプ` 降順でソート（新しい予約が先頭）
6. 辞書のリストを返す

**キャッシュ:** なし（管理画面用のため常に最新データ）

---

## 4. メモ更新機能

### 4-1. POST /admin/reservations/memo エンドポイント

**シグネチャ:**
```python
async def admin_reservations_memo(request: Request) -> JSONResponse | RedirectResponse
```

**フォームデータ（URLSearchParams 形式）:**
| フィールド名 | 型 | 説明 |
|------------|-----|------|
| row | str | シート行番号（数値文字列） |
| memo | str | 保存するメモテキスト |

**処理フロー:**
1. `_check_auth(request)` で認証確認（未認証は 302 リダイレクト）
2. `row_num = int(form.get("row", 0))` で行番号を int に変換
3. `memo = str(form.get("memo", "")).strip()` でメモを取得（前後の空白除去）
4. `row_num` が 0 でない（`if row_num:`）場合のみ更新実行:
   ```python
   await asyncio.to_thread(update_reservation_memo, row_num, memo)
   ```
5. 例外が発生しても `pass` で無視（サイレント失敗）
6. `JSONResponse({"ok": True})` を返す

**レスポンス:**
- `JSONResponse` (200): `{"ok": true}` — 成功・失敗問わず常に ok:true を返す
- `RedirectResponse` (302): 未認証時は `/admin/login`

**注意:** エラー時も `{"ok": true}` を返す。フロントエンドはエラー判定を行わず 2xx なら成功扱い。

### 4-2. update_reservation_memo(row_num, memo) Sheets 関数

```python
def update_reservation_memo(row_num: int, memo: str) -> None
```

**処理:**
1. `sh.worksheet(WS_SHEET_NAME)` でシート取得
2. ヘッダー行で「メモ」列のインデックスを確認
3. 「メモ」列が存在しない場合は `_ensure_cancel_columns(ws)` で列を追加してから再取得
4. `ws.update_cell(row_num, memo_col, memo)` で指定行のメモ列を更新

### 4-3. _ensure_cancel_columns(ws) ヘルパー

```python
_WS_CANCEL_COLS = ["キャンセルトークン", "キャンセル済み", "キャンセル理由", "キャンセル日時", "メモ"]

def _ensure_cancel_columns(ws) -> None
```

シートに不足している列があれば末尾に追加する。
シートの列数が不足する場合は `ws.resize()` で拡張してから追加する。

---

## 5. キャンセル処理機能

### 5-1. POST /admin/reservations/cancel エンドポイント

**シグネチャ:**
```python
async def admin_reservations_cancel(request: Request) -> RedirectResponse
```

**フォームデータ:**
| フィールド名 | 型 | 説明 |
|------------|-----|------|
| token | str | キャンセルトークン（UUID v4） |

**処理フロー:**
```
1. _check_auth(request) で認証確認
2. token = str(form.get("token", "")).strip()
3. token が空でない場合（if token:）:
   a. reservation = await asyncio.to_thread(get_reservation_by_token, token)
   b. await asyncio.to_thread(cancel_reservation, token, "管理者によるキャンセル処理")
   c. if reservation:
      i.  _fire(asyncio.to_thread(send_cancellation_confirmation, reservation, "管理者によるキャンセル処理"))
      ii. _fire(asyncio.to_thread(send_cancellation_notification, reservation, "管理者によるキャンセル処理"))
4. 302 リダイレクト /admin/reservations
```

**非同期実行パターン (`_fire`):**
```python
def _fire(coro) -> None:
    task = asyncio.create_task(coro)
    _task_refs.add(task)
    task.add_done_callback(_task_refs.discard)
```
- メール送信を Fire-and-forget で実行する
- `_task_refs` に参照を保持し GC による早期回収を防ぐ
- タスク完了後は `discard` コールバックで参照を解放

### 5-2. get_reservation_by_token(token) Sheets 関数

```python
def get_reservation_by_token(token: str) -> dict | None
```

**処理:**
1. シートの全レコードを `ws.get_all_records()` で取得
2. `r.get("キャンセルトークン") == token` で対象行を探す
3. 見つかれば dict を返す（ヘッダーキー付き）
4. 見つからなければ `None` を返す

### 5-3. cancel_reservation(token, reason) Sheets 関数

```python
def cancel_reservation(token: str, reason: str = "") -> bool
```

**処理:**
1. ヘッダー行から各列インデックスを取得:
   - `キャンセルトークン`, `キャンセル済み`, `キャンセル理由`, `キャンセル日時`
2. `ws.col_values(token_col)` でトークン列の全値を取得
3. マッチする行を探してキャンセル情報を書き込む:
   ```python
   ws.update_cell(i, done_col, "TRUE")
   ws.update_cell(i, reason_col, reason)
   ws.update_cell(i, dt_col, datetime.now(_JST).strftime("%Y-%m-%d %H:%M:%S"))
   ```
4. 更新成功: `True`、見つからない: `False`

**注意:** 3つの `update_cell()` を個別に呼ぶため 3 回の API リクエストが発生する。

---

## 6. メール送信仕様（キャンセル時）

### send_cancellation_confirmation（ユーザー向け確認メール）

**送信元:** `habitatoides@gmail.com`（settings.gmail_sender）
**宛先:** `data.get("メール")` — 予約者のメールアドレス
**件名:** `【予約キャンセル完了】{イベント名} — ei8ht plants`
**本文:**
```
{お名前} 様

以下のご予約のキャンセルを承りました。

━━━━━━━━━━━━━━━━━━
イベント　：{イベント名}
ご希望日　：{希望日（"/" 区切り）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
━━━━━━━━━━━━━━━━━━

またのご参加をお待ちしております。
ご不明な点がございましたら公式ホームページ内「CONTACT」よりお問い合わせください。
{SITE_URL}/contact

ei8ht plants / Habitat Oides
{SITE_URL}/events
```

**スキップ条件:**
- `GMAIL_REFRESH_TOKEN` または `GMAIL_CLIENT_ID` が未設定
- `data.get("メール")` が空文字

### send_cancellation_notification（管理者向け通知メール）

**送信元:** `habitatoides@gmail.com`
**宛先:** `habitatoides@gmail.com`（管理者自身）
**件名:** `【キャンセル通知】{イベント名} — {お名前} 様`
**本文:**
```
ワークショップ予約がキャンセルされました。

━━━━━━━━━━━━━━━━━━
【キャンセル対象予約】
イベント　：{イベント名}
お名前　　：{お名前} 様
ご希望日　：{希望日（"/" 区切り）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
キャンセル理由：{reason}（reason が空でない場合のみ）
━━━━━━━━━━━━━━━━━━
```

---

## 7. 予約表（時間帯別）機能

### GET /admin/reservations/schedule

詳細は `doc/detailed_design/screens/admin/reservation_schedule.md` を参照。

**キーロジック（グルーピング）:**
```python
from collections import defaultdict
groups: dict[str, list] = defaultdict(list)
for r in active:
    groups[r.get("希望時間帯", "未定")].append(r)
sorted_groups = dict(sorted(groups.items()))  # 文字列昇順
```

**フィルタリング:**
- `r.get("イベント名") == event` — イベント名の完全一致
- `r.get("キャンセル済み") != "TRUE"` — キャンセル済みを除外

---

## 8. 参加履歴機能

### GET /admin/reservations/history

詳細は `doc/detailed_design/screens/admin/reservation_history.md` を参照。

**キーロジック（お名前フィルタリング）:**
```python
history = [r for r in all_reservations if r.get("お名前") == name]
```
完全一致フィルター。予約送信時にスペースを除去しているため、表記ゆれが抑えられ名前での突合精度が高い。

---

## 9. シーケンス図（キャンセル処理の詳細）

```
ブラウザ          FastAPI              Google Sheets         Gmail API
  |                 |                       |                    |
  |--POST /admin/reservations/cancel-->      |                    |
  |  token=<uuid>   |                       |                    |
  |                 |--asyncio.to_thread(get_reservation_by_token)-->
  |                 |                       |--col_values(token_col)
  |                 |                       |--get_all_records()
  |                 |<--reservation dict----|                    |
  |                 |--asyncio.to_thread(cancel_reservation)---->|
  |                 |                       |--update_cell(done_col, "TRUE")
  |                 |                       |--update_cell(reason_col, "管理者...")
  |                 |                       |--update_cell(dt_col, now_jst)
  |                 |<--True----------------|                    |
  |                 |                       |                    |
  |<--302 /admin/reservations--|            |                    |
  |                 |                       |                    |
  |  （非同期 fire-and-forget）             |                    |
  |                 |--_fire(send_cancellation_confirmation)---->|
  |                 |                       |  OAuth2 トークン取得 |
  |                 |                       |  MIMEText 構築      |
  |                 |                       |  Gmail API 送信     |
  |                 |--_fire(send_cancellation_notification)---->|
  |                 |                       |  Gmail API 送信     |
```

---

## 10. パターン一覧

### メモ保存

| パターン | 条件 | 結果 |
|----------|------|------|
| 正常: 保存成功 | row_num > 0, Sheets 更新成功 | {"ok": true} |
| 準正常: row=0 | row_num == 0 | update_reservation_memo 呼ばれず {"ok": true} |
| 準正常: Sheets エラー | update_cell 例外 | except pass → {"ok": true}（サイレント失敗） |
| 異常: 未認証 | セッションなし | 302 /admin/login |

### キャンセル処理

| パターン | 条件 | 結果 |
|----------|------|------|
| 正常: 完全成功 | トークン発見 + Sheets 更新成功 + メール2通送信 | 302 /admin/reservations |
| 準正常: token 空 | token="" | cancel 処理スキップ、302 /admin/reservations |
| 準正常: token 未発見（get_reservation_by_token → None） | reservation=None | cancel_reservation 実行（シートに書き込み）、メール未送信 |
| 準正常: メール設定未完了 | GMAIL_REFRESH_TOKEN 未設定 | Sheets 更新のみ、メールスキップ（print でログ出力） |
| 準正常: メールアドレス空 | reservation.get("メール")="" | send_cancellation_confirmation がスキップ |
| 異常: 未認証 | セッションなし | 302 /admin/login |
