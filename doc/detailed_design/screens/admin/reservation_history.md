# 参加履歴画面 詳細設計

- パス: `/admin/reservations/history`
- テンプレート: `templates/admin/admin_reservation_history.html`
- ルーター: `app/routes/admin.py`
- 認証: 必須（`_check_auth()` で確認）

---

## 1. 画面概要

特定のメールアドレスに紐づく全予約（キャンセル済み含む）を時系列で表示する画面。
WS予約管理画面でお名前をクリックすることで遷移する（email クエリパラメータ渡し）。
顧客の予約履歴・リピート状況を確認するための画面。

---

## 2. エンドポイント仕様

### GET /admin/reservations/history

**シグネチャ:**
```python
async def admin_reservation_history(
    request: Request,
    email: str = ""
) -> HTMLResponse | RedirectResponse
```

**クエリパラメータ:**
| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| email | str | "" | 検索対象のメールアドレス |

**処理フロー:**
1. `_check_auth(request)` で認証確認
2. `get_all_ws_reservations_for_admin()` で全予約取得（タイムスタンプ降順）
3. メールアドレスで絞り込み:
   ```python
   history = [r for r in all_reservations if r.get("メール") == email]
   ```
   - 完全一致フィルター
   - `email=""` の場合は空リストになる
4. `admin_reservation_history.html` をレンダリング

**テンプレート変数:**
| 変数名 | 型 | 説明 |
|--------|-----|------|
| request | Request | Jinja2 リクエストオブジェクト |
| email | str | 表示中のメールアドレス（ヘッダー部に表示） |
| history | list[dict] | 絞り込み済み予約リスト（タイムスタンプ降順） |

**戻り値:**
- `HTMLResponse` (200): 参加履歴ページ
- `RedirectResponse` (302): 未認証時は `/admin/login`

---

## 3. テンプレート仕様

**ファイル:** `templates/admin/admin_reservation_history.html`

### レイアウト構造:
```
header.topbar
├── nav: Events / WS予約(active) / お問い合わせ / Logout

main.main (max-width: 800px)
├── .page-head
│   ├── a.btn-back href="/admin/reservations" "← 一覧に戻る"
│   └── .head-text
│       ├── p.page-title "参加履歴"
│       └── p.page-email {{ email }}
│
└── .history-list（{% if history %}）
    └── {% for r in history %}
        └── .history-item[class="cancelled" if cancelled]
            ├── .history-dot（キャンセル済: #ccc / 有効: #4caf50）
            ├── .history-body
            │   ├── p.history-event: {{ r.get('イベント名', '') }}
            │   ├── .history-meta:
            │   │   ├── {{ r.get('お名前', '') }} 様
            │   │   ├── {{ r.get('希望日', '') }}
            │   │   ├── {{ r.get('希望時間帯', '') }}
            │   │   └── {{ r.get('参加人数', '') }} 名
            │   └── .history-memo（{% if r.get('メモ') %}のみ表示）
            │       └── {{ r.get('メモ', '') }}（pre-wrap、左ボーダー付き）
            └── .cancelled-badge "キャンセル済"（cancelled の場合のみ）
```

### キャンセル状態によるスタイル変化:
```css
/* 通常行 */
.history-item { opacity: 1; }
.history-dot { background: #4caf50; }  /* 緑 */

/* キャンセル行 */
.history-item.cancelled { opacity: 0.45; }
.history-dot { background: #ccc; }    /* グレー */
```

```jinja2
{% set cancelled = r.get('キャンセル済み') == 'TRUE' %}
<div class="history-item {{ 'cancelled' if cancelled else '' }}">
    <div class="history-dot"></div>
    ...
    {% if cancelled %}
    <span class="cancelled-badge">キャンセル済</span>
    {% endif %}
</div>
```

### メモ表示:
```css
.history-memo {
    font-size: 12px;
    color: #888;
    margin-top: 6px;
    padding: 6px 10px;
    background: #f9f9f9;
    border-left: 2px solid #e0e0e0;
    white-space: pre-wrap;     /* 改行を保持 */
    line-height: 1.6;
}
```
`white-space: pre-wrap` により管理者が入力した改行が保持される。

---

## 4. 遷移元との連携

### WS予約管理画面からの遷移:
```html
<!-- admin_reservations.html の名前列 -->
<a href="/admin/reservations/history?email={{ r.get('メール', '') | urlencode }}"
   style="color:inherit; text-decoration:none; border-bottom:1px solid #ddd;">
    {{ r.get('お名前', '') }}
</a>
```
- Jinja2 の `urlencode` フィルターでメールアドレスをパーセントエンコード
- 例: `test@example.com` → `test%40example.com`

---

## 5. シーケンス図

### 正常系: 参加履歴表示

```
ブラウザ             FastAPI                  Google Sheets
  |                     |                           |
  |  (予約管理画面でお名前クリック)                 |
  |--GET /admin/reservations/history?email=xxx@yyy-->
  |                     |--_check_auth()            |
  |                     |--get_all_ws_reservations_for_admin()-->
  |                     |                           |--ws("WS予約").get_all_values()
  |                     |<--全予約データ（タイムスタンプ降順）--|
  |                     |  r.get("メール") == "xxx@yyy" でフィルター
  |<--200 HTML---------|
  |  参加履歴リスト
```

---

## 6. パターン一覧

| パターン | 条件 | 表示内容 |
|----------|------|---------|
| 正常: 履歴あり（有効のみ） | history に未キャンセル予約のみ | 全行が緑ドット、opacity:1 |
| 正常: 履歴あり（混在） | キャンセル済みと有効が混在 | キャンセル済みは opacity:0.45 + 灰ドット + バッジ |
| 正常: 履歴なし | history が空 | "履歴はありません" 表示 |
| 正常: email="" | クエリパラメータなし | 空リスト→ "履歴はありません" |
| 正常: メモあり | r.get('メモ') が truthy | メモエリアを予約カード内に表示 |
| 正常: メモなし | r.get('メモ') が falsy | メモエリアを非表示 |
| 異常: 未認証 | セッションなし | 302 /admin/login |
