# イベント管理画面 詳細設計

- パス: `/admin/events`
- テンプレート: `templates/admin/admin_events.html`
- ルーター: `app/routes/admin.py`
- 認証: 必須（`_check_auth()` で確認）

---

## 1. 画面概要

全イベントを開始日の降順で一覧表示する管理画面。
新規追加・編集・削除の CRUD 操作への入口となる。
書き込み操作後にリダイレクトされてくるとき、フラッシュメッセージを1度だけ表示する。

---

## 2. エンドポイント仕様

### 2-1. GET /admin/events

**シグネチャ:**
```python
async def admin_events_list(request: Request) -> HTMLResponse | RedirectResponse
```

**引数:**
| 引数 | 型 | 必須 | 説明 |
|------|-----|------|------|
| request | Request | yes | FastAPI リクエストオブジェクト |

**処理フロー:**
1. `_check_auth(request)` を呼び出し
   - 未認証: `/admin/login` へ 302 リダイレクトを即返す
2. `flash = request.session.pop("flash", None)` — フラッシュメッセージを取得と同時に削除
3. `get_all_events_for_admin()` を呼び出し `(headers, events)` を取得
   - 常に Sheets API から直接取得（キャッシュなし）
   - 開始日の降順にソート済み
4. `admin_events.html` をレンダリング

**テンプレート変数:**
| 変数名 | 型 | 説明 |
|--------|-----|------|
| request | Request | Jinja2 が必要とするリクエストオブジェクト |
| events | list[dict] | `_row` フィールド付きイベント辞書リスト（開始日降順） |
| flash | str \| None | フラッシュメッセージ。存在する場合1度だけ表示 |

**戻り値:**
- `HTMLResponse` (200): イベント一覧ページ
- `RedirectResponse` (302): 未認証時は `/admin/login`
- `HTMLResponse` (500): Sheets API エラー時 `"Error: {str(e)}"`

---

## 3. フラッシュメッセージ仕様

### 書き込みタイミング（POST ハンドラー）:
```python
request.session["flash"] = "イベントを作成しました"   # 新規作成成功
request.session["flash"] = "イベントを更新しました"   # 更新成功
request.session["flash"] = "イベントを削除しました"   # 削除成功
request.session["flash"] = f"エラー: {e}"            # 操作失敗時
```

### 読み取りタイミング（GET /admin/events ハンドラー）:
```python
flash = request.session.pop("flash", None)
```
- `pop()` を使うことで取得と削除を原子的に実行
- リロードしても再表示されない（1度きりの表示）

### フラッシュメッセージフロー:
```
POST /admin/events/new
  → create_event() 成功
  → session["flash"] = "イベントを作成しました"
  → 302 リダイレクト /admin/events

GET /admin/events
  → flash = session.pop("flash", None)  # "イベントを作成しました"
  → テンプレートに flash を渡す
  → {% if flash %} <div class="flash">{{ flash }}</div> {% endif %}
  → セッションから flash は削除済み

GET /admin/events (再度リロード)
  → flash = session.pop("flash", None)  # None
  → フラッシュ表示なし
```

---

## 4. テンプレート仕様

**ファイル:** `templates/admin/admin_events.html`

### Jinja2 変数:
```
events  : list[dict] - _row フィールド付きのイベント辞書リスト
flash   : str | None - 1 度だけ表示する成功・エラーメッセージ
```

### レイアウト構造:
```
header.topbar (sticky, z-index:100)
├── .topbar-brand "ei8ht plants — Admin"
├── nav.topbar-nav
│   ├── a.nav-link.active href="/admin/events" "Events"
│   ├── a.nav-link href="/admin/reservations" "WS予約"
│   └── a.nav-link href="/admin/contacts" "お問い合わせ"
└── a.topbar-logout href="/admin/logout" "Logout"

main.main (max-width: 1100px)
├── .page-head
│   ├── h1.page-title "Events"
│   └── a.btn-add href="/admin/events/new" "＋ 新規追加"
├── .flash（{% if flash %}のみ表示）
│   └── {{ flash }}
└── .table-wrap（{% if events %}）
    └── table
        ├── thead: 開始日 / 終了日 / イベント名 / ブランド / 場所 / (操作)
        └── tbody: {% for ev in events %}
            └── tr
                ├── td.td-date {{ ev.get('開始日', '') }}
                ├── td.td-date {{ ev.get('終了日', '') }}
                ├── td.td-name {{ ev.get('イベント名', '') }}
                ├── td.td-brand {{ ev.get('販売ブランド', '') }}
                ├── td.td-brand {{ ev.get('場所', '') }}
                └── td.td-actions
                    ├── a.btn-edit href="/admin/events/{{ ev._row }}" "編集"
                    └── form[POST /admin/events/{{ ev._row }}/delete]
                        └── button.btn-delete[onclick="confirm(...)"] "削除"
```

### 削除確認 JavaScript:
```html
<button type="submit" class="btn-delete"
    onclick="return confirm('「{{ ev.get("イベント名", "このイベント") }}」を削除しますか？')">
    削除
</button>
```
- `confirm()` がキャンセルされると `return false` となりフォーム送信をキャンセル
- `confirm()` が OK されると `return true` となりフォームを送信

### フラッシュメッセージスタイル:
```css
.flash {
    padding: 12px 16px;
    margin-bottom: 20px;
    font-size: 13px;
    background: #f0faf4;
    border: 1px solid #b2dfdb;
    color: #2e7d32;
}
```
エラーメッセージ（`f"エラー: {e}"`）も同じスタイル。成功・失敗の色分けは未実装。

---

## 5. データソース仕様

### get_all_events_for_admin() の返却形式:
```python
def get_all_events_for_admin() -> tuple[list[str], list[dict]]
```

**返却データ（events リスト各要素）のフィールド:**
| フィールド名 | 型 | 説明 |
|--------------|-----|------|
| 開始日 | str | "YYYY-MM-DD" 形式 |
| 終了日 | str | "YYYY-MM-DD" 形式 |
| イベント名 | str | イベントの表示名 |
| 販売ブランド | str | カンマ区切り複数ブランド |
| 開催時間 | str | |
| 場所 | str | 会場名 |
| ブース番号 | str | |
| 住所 | str | |
| 公式サイトURL | str | |
| WSフラグ | str | "TRUE" または "FALSE" |
| WS予約URL | str | |
| 画像 | str | Drive URL（カンマ区切り） |
| _row | int | シート行番号（1-indexed） |

---

## 6. シーケンス図

### 正常系: イベント一覧表示

```
ブラウザ          FastAPI                  Google Sheets
  |                 |                           |
  |--GET /admin/events-->                        |
  |                 |--_check_auth()            |
  |                 |  (認証済み → None)        |
  |                 |--session.pop("flash")     |
  |                 |  → None or flash文字列    |
  |                 |--get_all_events_for_admin()-->
  |                 |                           |--open_by_key(SPREADSHEET_ID)
  |                 |                           |--get_worksheet(0)
  |                 |                           |--get_all_values()
  |                 |<--(headers, events)-------|
  |                 |  開始日降順ソート済み     |
  |<--200 HTML------|                           |
```

### 正常系: 削除後のフラッシュ表示

```
ブラウザ          FastAPI
  |                 |
  |--POST /admin/events/{row}/delete-->
  |                 |--delete_event(row)
  |                 |--session["flash"] = "イベントを削除しました"
  |<--302 /admin/events--|
  |                 |
  |--GET /admin/events-->
  |                 |--flash = session.pop("flash") → "イベントを削除しました"
  |<--200 HTML（flash表示）--|
  |                 |
  |--GET /admin/events (リロード)-->
  |                 |--flash = session.pop("flash") → None
  |<--200 HTML（flash非表示）--|
```

---

## 7. パターン一覧

| パターン | 条件 | 表示内容 |
|----------|------|---------|
| 正常: イベントあり | events.length > 0 | テーブル表示 |
| 正常: イベントなし | events.length == 0 | `<div class="empty">イベントがありません</div>` |
| 正常: フラッシュあり | session に flash キーあり | 緑系バナー1度表示後に消去 |
| 準正常: Sheets API エラー | get_all_events_for_admin() 例外 | 500 "Error: {str(e)}" |
| 準正常: 未認証アクセス | セッションなし/期限切れ | 302 /admin/login |
