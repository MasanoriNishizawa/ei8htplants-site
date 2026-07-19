# 予約表画面 詳細設計

- パス: `/admin/reservations/schedule`
- テンプレート: `templates/admin/admin_reservation_schedule.html`
- ルーター: `app/routes/admin.py`
- 認証: 必須（`_check_auth()` で確認）

---

## 1. 画面概要

特定イベントの有効予約を時間帯別に整理したオペレーション用一覧表。
当日スタッフが参照するための印刷 / PDF ダウンロード機能を持つ。
イベント名を URL クエリパラメータで受け取り、そのイベントの有効予約だけを表示する。

---

## 2. エンドポイント仕様

### GET /admin/reservations/schedule

**シグネチャ:**
```python
async def admin_reservations_schedule(
    request: Request,
    event: str = ""
) -> HTMLResponse | RedirectResponse
```

**クエリパラメータ:**
| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| event | str | "" | 表示するイベント名（空文字の場合は空グループを表示） |

**処理フロー:**
1. `_check_auth(request)` で認証確認
2. `get_all_ws_reservations_for_admin()` で全予約取得（タイムスタンプ降順）
3. `event` に一致し、かつキャンセル済みでない予約を抽出:
   ```python
   active = [
       r for r in all_reservations
       if r.get("イベント名") == event and r.get("キャンセル済み") != "TRUE"
   ]
   ```
4. 希望時間帯でグループ化:
   ```python
   from collections import defaultdict
   groups: dict[str, list] = defaultdict(list)
   for r in active:
       groups[r.get("希望時間帯", "未定")].append(r)
   sorted_groups = dict(sorted(groups.items()))  # 時間帯文字列の昇順
   ```
5. `admin_reservation_schedule.html` をレンダリング

**テンプレート変数:**
| 変数名 | 型 | 説明 |
|--------|-----|------|
| request | Request | Jinja2 リクエストオブジェクト |
| event | str | イベント名（ページタイトルとして表示） |
| groups | dict[str, list[dict]] | 時間帯 → 予約リスト（時間帯昇順） |

**戻り値:**
- `HTMLResponse` (200): 予約表ページ
- `RedirectResponse` (302): 未認証時は `/admin/login`

---

## 3. テンプレート仕様

**ファイル:** `templates/admin/admin_reservation_schedule.html`

### レイアウト構造:
```
header.topbar（@media print: display:none）
├── nav: Events / WS予約(active) / お問い合わせ / Logout

main.main (max-width: 900px)
├── .page-head
│   ├── .head-left
│   │   ├── a.btn-back href="/admin/reservations" "← 一覧に戻る"（印刷時非表示）
│   │   └── .head-text
│   │       ├── p.page-title "WS 予約表"
│   │       └── p.page-event {{ event }}
│   └── button.btn-pdf[onclick="window.print()"] "PDF ダウンロード"（印刷時非表示）
│
└── 各時間帯ブロック: {% for time_slot, rows in groups.items() %}
    └── .time-block
        ├── .time-header
        │   ├── .time-label: {{ time_slot }}
        │   └── .time-total: 計 {{ slot_total.n }} 名
        └── table
            ├── thead: # / お名前 / 人数 / お持ち込み / 備考
            └── tbody
                ├── {% for r in rows %} → 各予約行
                │   ├── td.td-no: {{ loop.index }}
                │   ├── td.td-name: {{ r.get('お名前', '') }} 様
                │   ├── td.td-num: {{ r.get('参加人数', '') }}
                │   ├── td.td-bring: {{ r.get('お持ち込み', '') or '—' }}
                │   └── td.td-note: {{ r.get('備考', '') }}
                └── summary-row: 小計 / {{ slot_total.n }}
```

### 時間帯別合計計算（Jinja2 namespace）:
```jinja2
{% set slot_total = namespace(n=0) %}
{% for r in rows %}
    {% set slot_total.n = slot_total.n + (r.get('参加人数', '0') | int) %}
{% endfor %}
```

`namespace` を使う理由: Jinja2 のスコープルールにより、ループ内でループ外変数を更新できないため `namespace` オブジェクトで回避している。

### 印刷スタイル（@media print）:
```css
@media print {
    body { background: #fff; font-size: 12px; }
    .topbar, .btn-back, .btn-pdf { display: none !important; }
    .main { max-width: 100%; margin: 0; padding: 16px; }
    .page-head { margin-bottom: 20px; }
    .page-event { font-size: 16px; }
    .time-block { margin-bottom: 20px; page-break-inside: avoid; }
    table { font-size: 11px; }
    th { font-size: 9px; padding: 7px 10px; }
    td { padding: 7px 10px; }
    .td-note { max-width: none; }
}
```

`page-break-inside: avoid` で各時間帯ブロックをページをまたいで分断しない。

---

## 4. データの並び順

### 時間帯の並び順:
`sorted(groups.items())` を使っているため、時間帯の文字列昇順でソートされる。

| 時間帯文字列 | 昇順 |
|------------|------|
| "10:00〜12:00" | 1番目 |
| "13:00〜15:00" | 2番目 |
| "15:00〜17:00" | 3番目 |
| "未定" | 最後（"み" の文字コード順） |

### 各時間帯内の予約順:
`get_all_ws_reservations_for_admin()` のタイムスタンプ降順をそのまま使用する（フィルター後に再ソートしない）。

---

## 5. シーケンス図

### 正常系: 予約表表示

```
ブラウザ             FastAPI                  Google Sheets
  |                     |                           |
  |--GET /admin/reservations/schedule?event=イベントA-->
  |                     |--_check_auth()            |
  |                     |--get_all_ws_reservations_for_admin()-->
  |                     |                           |--ws("WS予約").get_all_values()
  |                     |<--全予約データ（タイムスタンプ降順）--|
  |                     |  イベントA かつキャンセル未のみ抽出
  |                     |  希望時間帯でグループ化・昇順ソート
  |<--200 HTML---------|                            |
  |  時間帯別予約表                                 |
```

### PDF ダウンロード（フロントエンドのみ）:
```
ブラウザ
  |
  |--クリック "PDF ダウンロード"
  |  onclick="window.print()"
  |  → ブラウザ印刷ダイアログ表示
  |  → "PDFとして保存" を選択
  |  → @media print スタイル適用（ナビ/ボタン非表示）
  |  → ページを PDF として保存
```

---

## 6. パターン一覧

| パターン | 条件 | 表示内容 |
|----------|------|---------|
| 正常: 有効予約あり | groups.length > 0 | 時間帯別テーブル表示 |
| 正常: 有効予約なし | groups.length == 0 | `<div class="empty">有効な予約がありません</div>` |
| 正常: event 空文字 | event="" | 空のテーブル（groups も空） |
| 正常: 複数時間帯 | 複数キーが groups に存在 | 時間帯ごとにブロック + 小計行 |
| 正常: 時間帯未定 | 希望時間帯="" の予約あり | "未定" グループとして表示 |
| 異常: 未認証 | セッションなし | 302 /admin/login |
