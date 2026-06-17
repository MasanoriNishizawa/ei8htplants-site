# WS予約管理画面 詳細設計

- パス: `/admin/reservations`
- テンプレート: `templates/admin/admin_reservations.html`
- ルーター: `app/routes/admin.py`
- 認証: 必須（`_check_auth()` で確認）

---

## 1. 画面概要

ワークショップ予約（WS予約シート）の全予約を一覧表示する管理画面。
以下の機能を持つ:
- イベント別参加人数のサマリーカード表示（現在・今後のWS）
- 過去イベントのトグル表示
- イベント名・キャンセル済み除外フィルター（サーバーサイド絞り込み）
- 管理者メモのインライン編集（Ajax POST）
- 管理者によるキャンセル処理（フォーム POST）
- 名前クリックで参加履歴画面へ遷移
- サマリーカードクリックで予約表画面へ遷移

---

## 2. エンドポイント仕様

### 2-1. GET /admin/reservations

**シグネチャ:**
```python
async def admin_reservations(
    request: Request,
    event: str = "",
    exclude_cancelled: str = ""
) -> HTMLResponse | RedirectResponse
```

**クエリパラメータ:**
| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| event | str | "" | フィルター対象イベント名（空文字 = 全件） |
| exclude_cancelled | str | "" | "1" のときキャンセル済みを除外 |

**処理フロー:**
1. `_check_auth(request)` で認証確認
2. `get_all_ws_reservations_for_admin()` で全予約取得（タイムスタンプ降順）
3. イベント名の選択肢生成: 重複除去・順序保持で `event_names` リストを構築
   ```python
   event_names = list(dict.fromkeys(
       r.get("イベント名", "") for r in reservations if r.get("イベント名")
   ))
   ```
4. フィルタリング:
   - `event` が指定されていれば `r.get("イベント名") == event` で絞り込み
   - `exclude_cancelled == "1"` であれば `r.get("キャンセル済み") != "TRUE"` で絞り込み
5. イベント別合計参加人数集計（キャンセル済み除外）:
   ```python
   totals: dict[str, int] = {}
   for r in reservations:  # フィルター前の全件
       if r.get("キャンセル済み") == "TRUE": continue
       name = r.get("イベント名", "")
       totals[name] = totals.get(name, 0) + int(r.get("参加人数", 0))
   ```
6. `get_all_events_for_admin()` でイベントの終了日マップを構築
7. 現在・将来イベント（`active_totals`）と過去イベント（`past_ws_events`）に分類:
   - `end >= today` → `active_totals`: 終了日昇順（近い順）にソート
   - `end < today` → `past_ws_events`: 終了日降順（新しい順）にソート
8. `admin_reservations.html` をレンダリング

**テンプレート変数:**
| 変数名 | 型 | 説明 |
|--------|-----|------|
| request | Request | Jinja2 リクエストオブジェクト |
| reservations | list[dict] | フィルター済み予約リスト |
| event_names | list[str] | イベント名セレクトボックス用リスト |
| selected_event | str | 現在選択中のイベント名 |
| exclude_cancelled | bool | キャンセル除外チェックボックスの状態 |
| active_totals | dict[str, dict] | `{イベント名: {total: int, end: date}}` |
| past_ws_events | list[dict] | `[{name: str, end: date, total: int}]` |

**戻り値:**
- `HTMLResponse` (200): 予約一覧ページ
- `RedirectResponse` (302): 未認証時は `/admin/login`
- `HTMLResponse` (500): 例外発生時 `"Error: {str(e)}"`

---

## 3. テンプレート仕様

**ファイル:** `templates/admin/admin_reservations.html`

### レイアウト構造:
```
header.topbar
├── nav: Events / WS予約(active) / お問い合わせ / Logout

main.main
├── .page-head "Habitat Style Workshop — 予約一覧"
├── .summary (active_totals がある場合)
│   └── 各イベントの .summary-card
│       ├── .summary-label: イベント名
│       ├── .summary-value: 参加人数（名）
│       └── .summary-sub: "予約合計（有効）"
│       ※ 全体が /admin/reservations/schedule?event=... へのリンク
├── 過去のイベントセクション (past_ws_events がある場合)
│   ├── button.btn-past[onclick="togglePast(this)"]
│   └── .past-list#past-list（初期非表示）
│       └── 各過去イベント: a.past-item href="/admin/reservations/schedule?event=..."
├── .filter-bar
│   ├── select#filter-event（変更で applyFilters() 発火）
│   ├── label.filter-check > input#filter-exclude-cancelled（変更で applyFilters() 発火）
│   └── .filter-count: {{ reservations | length }} 件
└── table.table-wrap（reservations がある場合）
    ├── thead: 受付日時/イベント名/お名前/連絡先/希望日/時間帯/人数/お持ち込み/備考/メモ/(操作)
    └── tbody: {% for r in reservations %}
        └── tr[class="cancelled-row" if cancelled]
            ├── タイムスタンプ（10文字 = YYYY-MM-DD）
            ├── イベント名
            ├── お名前（/admin/reservations/history?email=... へのリンク）
            ├── メール
            ├── 希望日
            ├── 希望時間帯
            ├── 参加人数
            ├── お持ち込み（badge表示）
            ├── 備考
            ├── .memo-cell（textarea + 保存ボタン）
            └── キャンセル列
                ├── キャンセル済み → .cancelled-badge "キャンセル済"
                └── 未キャンセル → フォーム[POST /admin/reservations/cancel] + 確認ダイアログ
```

---

## 4. フロントエンド JavaScript 仕様

### 4-1. togglePast(btn)

**目的:** 過去イベントリストの表示/非表示を切り替える。

**処理:**
```javascript
function togglePast(btn) {
    const list = document.getElementById('past-list');
    const arrow = btn.querySelector('.past-arrow');
    list.classList.toggle('open');  // .open が付くと display: block
    arrow.textContent = list.classList.contains('open') ? '▴' : '▾';
}
```

**状態遷移:**
- 初期状態: `.past-list` に `.open` なし → `display: none`
- ボタンクリック: `.open` を toggle → `display: block`
- 矢印テキスト: `▾`（閉じた状態）↔ `▴`（開いた状態）

### 4-2. applyFilters()

**目的:** フィルター変更時にクエリパラメータを組み立ててページ遷移する。

**処理:**
```javascript
function applyFilters() {
    const event = document.getElementById('filter-event').value;
    const excludeCancelled = document.getElementById('filter-exclude-cancelled').checked;
    const params = new URLSearchParams();
    if (event) params.set('event', event);
    if (excludeCancelled) params.set('exclude_cancelled', '1');
    const qs = params.toString();
    location.href = '/admin/reservations' + (qs ? '?' + qs : '');
}
```

**イベントリスナー:**
```javascript
document.getElementById('filter-event').addEventListener('change', applyFilters);
document.getElementById('filter-exclude-cancelled').addEventListener('change', applyFilters);
```

**URLパラメータ生成パターン:**
| event値 | excludeCancelled | 遷移先URL |
|---------|-----------------|-----------|
| "" | false | /admin/reservations |
| "イベントA" | false | /admin/reservations?event=イベントA |
| "" | true | /admin/reservations?exclude_cancelled=1 |
| "イベントA" | true | /admin/reservations?event=イベントA&exclude_cancelled=1 |

**備考:** セレクト変更またはチェックボックス変更で即座にページ遷移する（Submit ボタンなし）。

### 4-3. saveMemo(btn)

**目的:** 管理者メモを Ajax で保存する（ページ遷移なし）。

**処理フロー:**
```javascript
function saveMemo(btn) {
    const textarea = btn.closest('.memo-wrap').querySelector('.memo-input');
    const row = textarea.dataset.row;    // data-row="{{ r.get('_row', '') }}"
    const memo = textarea.value;
    const body = new URLSearchParams({ row, memo });
    
    btn.textContent = '...';       // 送信中表示
    btn.disabled = true;           // 二重送信防止
    
    fetch('/admin/reservations/memo', { method: 'POST', body })
        .then(r => r.json())
        .then(() => {
            btn.textContent = '保存済';
            btn.classList.add('saved');    // 緑色スタイル
            setTimeout(() => {
                btn.textContent = '保存';
                btn.classList.remove('saved');
                btn.disabled = false;
            }, 2000);                      // 2秒後に元に戻す
        })
        .catch(() => {
            btn.textContent = '保存';     // エラー時はシンプルに元に戻す
            btn.disabled = false;
        });
}
```

**ボタン状態遷移:**
```
初期: "保存" (color:#999)
  ↓ クリック
送信中: "..." (disabled=true)
  ↓ 成功レスポンス
保存済: "保存済" (color:#4caf50, class="saved")
  ↓ 2秒後
初期: "保存" (color:#999, disabled=false)

  ↓ エラー（fetch 失敗 / ネットワーク断）
初期: "保存" (disabled=false)
```

**DOM 構造（メモセル）:**
```html
<td class="memo-cell">
    <div class="memo-wrap">
        <textarea class="memo-input" rows="1"
            data-row="{{ r.get('_row', '') }}">{{ r.get('メモ', '') }}</textarea>
        <button type="button" class="btn-memo-save"
            onclick="saveMemo(this)">保存</button>
    </div>
</td>
```

### 4-4. キャンセル確認ダイアログ

```html
<button type="button" class="btn-cancel-row"
    onclick="if(confirm('{{ r.get('お名前','') }} 様の予約をキャンセルしますか？')) this.form.submit()">
    キャンセル
</button>
```

- `confirm()` が OK → `this.form.submit()` でフォームを送信
- `confirm()` がキャンセル → 何もしない（`if` が false）

---

## 5. シーケンス図

### 正常系: ページ初期表示

```
ブラウザ          FastAPI                  Google Sheets
  |                 |                           |
  |--GET /admin/reservations-->                  |
  |                 |--_check_auth()            |
  |                 |--get_all_ws_reservations_for_admin()-->
  |                 |                           |--worksheet("WS予約").get_all_values()
  |                 |<--全予約データ（タイムスタンプ降順）--|
  |                 |--get_all_events_for_admin()-->
  |                 |                           |--get_worksheet(0).get_all_values()
  |                 |<--(headers, all_events)---|
  |                 |  active_totals / past_ws_events 分類・ソート
  |<--200 HTML------|
```

### 正常系: メモ保存（Ajax）

```
ブラウザ          FastAPI                  Google Sheets
  |                 |                           |
  |--POST /admin/reservations/memo (fetch API)->|
  |  body: row=5&memo=メモテキスト             |
  |                 |--_check_auth()            |
  |                 |--asyncio.to_thread(update_reservation_memo, 5, "メモテキスト")-->
  |                 |                           |--ws.update_cell(5, memo_col, "メモテキスト")
  |                 |<--完了--------------------|
  |<--200 {"ok": true}--|                       |
  |  ボタン: "保存済"（2秒後→"保存"）          |
```

### 正常系: 管理者キャンセル

```
ブラウザ          FastAPI                  Google Sheets / Gmail API
  |                 |                           |
  |--POST /admin/reservations/cancel-->          |
  |  body: token=<uuid>                         |
  |                 |--_check_auth()            |
  |                 |--asyncio.to_thread(get_reservation_by_token, token)-->
  |                 |<--reservation dict--------|
  |                 |--asyncio.to_thread(cancel_reservation, token, "管理者によるキャンセル処理")-->
  |                 |                           |--キャンセル済み="TRUE"
  |                 |                           |--キャンセル理由="管理者によるキャンセル処理"
  |                 |                           |--キャンセル日時=JST現在時刻
  |                 |  _fire(send_cancellation_confirmation) ←非同期・fire-and-forget
  |                 |  _fire(send_cancellation_notification) ←非同期・fire-and-forget
  |<--302 /admin/reservations--|                |
```

---

## 6. パターン一覧

| パターン | 条件 | 表示/動作 |
|----------|------|-----------|
| 正常: 予約あり | reservations.length > 0 | テーブル表示 |
| 正常: 予約なし | reservations.length == 0 | "予約はまだありません" 表示 |
| 正常: フィルターあり | event != "" or exclude_cancelled == "1" | フィルター済みリスト表示 |
| 正常: アクティブWS複数 | active_totals.length > 0 | サマリーカード表示 |
| 正常: 過去WS複数 | past_ws_events.length > 0 | "過去のイベント" トグルボタン表示 |
| 正常: メモ保存成功 | fetch POST 200 ok:true | ボタン"保存済"→2秒後"保存" |
| 準正常: メモ保存失敗 | fetch エラー | ボタン"保存"に戻す |
| 正常: キャンセル処理 | confirm OK + POST | Sheets 更新 + メール2通 + 302リダイレクト |
| 準正常: キャンセルキャンセル | confirm キャンセル | フォーム未送信、何もしない |
| 準正常: token 未発見 | get_reservation_by_token → None | cancel_reservation は実行されるが reservation がないのでメール未送信 |
| 異常: Sheets API エラー | 例外発生 | 500 "Error: {str(e)}" |
| 異常: 未認証 | セッションなし | 302 /admin/login |
