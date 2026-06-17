# 機能設計

## 1. モジュール構成と責務

| モジュール | 責務 |
|---|---|
| `app/config.py` | 環境変数の一元管理、Google 認証情報の生成 |
| `app/auth.py` | 管理画面のセッション認証 |
| `app/cache.py` | インメモリ TTL キャッシュ |
| `app/google_client.py` | gspread クライアントのシングルトン |
| `app/sheets.py` | Google Sheets の全 CRUD 操作 |
| `app/drive.py` | Google Drive からの画像一覧取得 |
| `app/email.py` | Gmail API によるメール送信 |
| `app/templates.py` | Jinja2 テンプレートエンジン設定 |
| `app/routes/public.py` | 公開ページのルーター・ビュー関数 |
| `app/routes/admin.py` | 管理画面のルーター・ビュー関数 |

---

## 2. sheets.py 関数一覧

### イベント関連

| 関数 | 説明 |
|---|---|
| `get_events_data(is_past)` | 公開向けイベント一覧（キャッシュあり）。`is_past=True` で過去イベント |
| `get_event_row(row)` | 指定行番号のイベントデータを返す（編集フォーム用） |
| `get_all_events_for_admin()` | 管理画面向け全イベント（キャッシュなし）。`(headers, events)` を返す |
| `create_event(data)` | 新規イベントを末尾に追記。キャッシュ無効化あり |
| `update_event(row, data)` | 指定行のイベントを更新。キャッシュ無効化あり |
| `delete_event(row)` | 指定行を削除。キャッシュ無効化あり |

### WS予約関連

| 関数 | 説明 |
|---|---|
| `create_ws_reservation(data)` | 予約を1行追記。UUID トークン生成、`data["キャンセルトークン"]` に書き戻す |
| `get_all_ws_reservations_for_admin()` | 全予約をタイムスタンプ降順で返す。各行に `_row`（シート行番号）付き |
| `get_ws_reservation_count(event_name, date, time_slot)` | 指定条件の有効予約人数合計を返す。キャンセル済みは除外 |
| `get_reservation_by_token(token)` | トークンで1件の予約を検索して返す |
| `cancel_reservation(token, reason)` | 予約をキャンセル済みにマーク（キャンセル済み/理由/日時を書き込む） |
| `update_reservation_memo(row_num, memo)` | 指定行のメモ列を更新 |

### お問い合わせ関連

| 関数 | 説明 |
|---|---|
| `create_contact(data)` | お問い合わせを追記 |
| `get_all_contacts_for_admin()` | 全お問い合わせを返す |

### ユーティリティ

| 関数 | 説明 |
|---|---|
| `parse_date(date_val)` | "YYYY-MM-DD" または "YYYY/MM/DD" → `date` オブジェクト |
| `get_display_url(drive_url_or_id)` | Drive URL/ID → サムネイル URL |
| `_enrich_event(item)` | 生データに表示用フィールドを付与（`display_date`, `image_urls` 等） |
| `_ensure_cancel_columns(ws)` | キャンセル・メモ列が存在しなければ追加（シートをリサイズしてから） |

---

## 3. email.py 関数一覧

| 関数 | 送信先 | 送信元アカウント |
|---|---|---|
| `send_reservation_confirmation(data)` | 予約者のメール | habitatoides@gmail.com |
| `send_reservation_notification(data)` | habitatoides@gmail.com | habitatoides@gmail.com |
| `send_cancellation_confirmation(data, reason)` | 予約者のメール | habitatoides@gmail.com |
| `send_cancellation_notification(data, reason)` | habitatoides@gmail.com | habitatoides@gmail.com |
| `send_contact_confirmation(data)` | 問い合わせ者のメール | ei8htplants@gmail.com |
| `send_contact_notification(data)` | ei8htplants@gmail.com | ei8htplants@gmail.com |

**Gmail API 認証フロー**:
```python
Credentials(token=None, refresh_token=REFRESH_TOKEN,
            client_id=CLIENT_ID, client_secret=CLIENT_SECRET)
→ creds.refresh(Request())  # アクセストークンを自動取得
→ build("gmail", "v1", credentials=creds)
→ service.users().messages().send(userId="me", body={"raw": base64_encoded_mime})
```

---

## 4. public.py ルーター

### 非同期タスク管理

```python
_task_refs: set = set()

def _fire(coro) -> None:
    task = asyncio.create_task(coro)
    _task_refs.add(task)               # GC 防止
    task.add_done_callback(_task_refs.discard)
```

### エンドポイント一覧

| メソッド | パス | 処理概要 |
|---|---|---|
| GET | `/` | ホーム（直近イベント + ギャラリー） |
| GET | `/events` | イベント一覧 |
| GET | `/reserve` | WS予約フォーム表示（`?row=N` 必須） |
| POST | `/reserve` | 予約送信 → Sheets 書き込み → メール送信（bg） |
| GET | `/api/reserve/availability` | 残席確認 API（JSON） |
| GET | `/cancel` | キャンセルページ表示 |
| POST | `/cancel` | キャンセル実行 → メール送信（bg） |
| GET | `/contact` | お問い合わせフォーム |
| POST | `/contact` | 問い合わせ送信 → Sheets 書き込み → メール（bg） |
| GET | `/concept` | コンセプトページ |
| GET | `/gallery` | ギャラリー（`?brand=` で切り替え） |
| GET | `/specimen` | 植物標本一覧 |
| GET | `/ei8htplants` | ei8ht plants ブランドページ |
| GET | `/habitatoides` | Habitat Oides ブランドページ |
| GET | `/habitatoides/workshop` | Habitat Oides WS一覧 |
| GET | `/hue` | HUE ブランドページ |
| GET | `/collaborations` | コラボレーション一覧 |

---

## 5. admin.py ルーター

すべてのエンドポイントで先頭に `_check_auth(request)` を呼び、  
未認証なら `/admin/login` へリダイレクトする。

| メソッド | パス | 処理概要 |
|---|---|---|
| GET | `/admin/login` | ログインページ |
| POST | `/admin/login` | 認証処理（成功 → events へ） |
| GET | `/admin/logout` | セッションクリア → login へ |
| GET | `/admin/` | `/admin/events` へリダイレクト |
| GET | `/admin/events` | イベント一覧（flash メッセージあり） |
| GET | `/admin/events/new` | 新規作成フォーム |
| POST | `/admin/events/new` | イベント作成 → flash → events へ |
| GET | `/admin/events/{row}` | 編集フォーム |
| POST | `/admin/events/{row}` | イベント更新 → flash → events へ |
| POST | `/admin/events/{row}/delete` | イベント削除 → flash → events へ |
| GET | `/admin/reservations` | 予約一覧（フィルタあり） |
| GET | `/admin/reservations/schedule` | イベント別予約表 |
| GET | `/admin/reservations/history` | メールアドレス別参加履歴 |
| POST | `/admin/reservations/memo` | メモ保存（JSON 返却、Ajax用） |
| POST | `/admin/reservations/cancel` | 管理者キャンセル処理 |
| GET | `/admin/contacts` | お問い合わせ一覧 |

---

## 6. WS予約の残席ロジック

```
WS_MAX_PARTICIPANTS = 4

残席 = 4 - sum(参加人数) for 有効予約
         ↑ キャンセル済み(キャンセル済み == "TRUE")は除外

GET /api/reserve/availability
  → get_ws_reservation_count(event_name, date, time_slot)
    → ws.get_all_values() から headers を読み
    → "キャンセル済み" 列インデックスを特定
    → マッチする行の参加人数を合計（キャンセル行はスキップ）
  → {"available": N, "max": 4}
```

---

## 7. キャンセルトークンの仕組み

```
予約作成時:
  token = str(uuid.uuid4())          # 例: "a1b2-c3d4-..."
  data["キャンセルトークン"] = token   # メール送信側が参照
  Sheets に token 列として書き込み

メール本文:
  https://ei8htplants.onrender.com/cancel?token=<token>

キャンセル実行時:
  GET /cancel?token=xxx → get_reservation_by_token() で予約を取得・表示
  POST /cancel → cancel_reservation(token, reason)
    → ws.col_values(token列) で行を特定
    → キャンセル済み="TRUE", キャンセル理由=reason, キャンセル日時=JST now
```

---

## 8. イベントフォームの特殊処理

```python
# 販売ブランド（複数チェックボックス）
brands = form.getlist("販売ブランド")   # ["ei8ht plants", "Habitat Oides"]
data["販売ブランド"] = ", ".join(brands)

# WSフラグ（未チェック時は POST データに含まれない）
data["WSフラグ"] = "TRUE" if form.get("WSフラグ") else "FALSE"
```
