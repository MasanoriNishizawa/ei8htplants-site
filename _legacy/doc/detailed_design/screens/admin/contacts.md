# お問い合わせ一覧画面 詳細設計

- パス: `/admin/contacts`
- テンプレート: `templates/admin/admin_contacts.html`
- ルーター: `app/routes/admin.py`
- 認証: 必須（`_check_auth()` で確認）

---

## 1. 画面概要

「お問い合わせ」シートに蓄積されたすべてのお問い合わせを、新しい順に一覧表示する管理画面。
読み取り専用（編集・削除機能なし）。
メールアドレスは `mailto:` リンクとして表示し、クリックでメーラーを起動できる。

---

## 2. エンドポイント仕様

### GET /admin/contacts

**シグネチャ:**
```python
async def admin_contacts(request: Request) -> HTMLResponse | RedirectResponse
```

**引数:**
| 引数 | 型 | 必須 | 説明 |
|------|-----|------|------|
| request | Request | yes | FastAPI リクエストオブジェクト |

**処理フロー:**
1. `_check_auth(request)` で認証確認
2. `get_all_contacts_for_admin()` を呼び出して全お問い合わせを取得
   - 内部: `ws.get_all_records()` で取得後 `list(reversed(rows))` で新しい順に並び替え
3. `admin_contacts.html` をレンダリング

**テンプレート呼び出し:**
```python
return templates.TemplateResponse(
    request,                       # ← 他の管理画面と異なる引数順（positional第1引数がrequest）
    "admin/admin_contacts.html",
    {"contacts": contacts},
)
```

注意: 他のエンドポイントが `templates.TemplateResponse("template.html", {"request": request, ...})` の形式を使っているのに対して、このエンドポイントのみ Starlette の新しい API 形式 `templates.TemplateResponse(request, "template.html", {...})` を使っている。

**テンプレート変数:**
| 変数名 | 型 | 説明 |
|--------|-----|------|
| contacts | list[dict] | お問い合わせ辞書のリスト（新しい順） |

**戻り値:**
- `HTMLResponse` (200): お問い合わせ一覧ページ
- `RedirectResponse` (302): 未認証時は `/admin/login`

---

## 3. データソース仕様

### get_all_contacts_for_admin():

```python
def get_all_contacts_for_admin() -> list[dict]
```

**処理:**
1. `sh.worksheet(CONTACT_SHEET_NAME)` でシート取得
2. シートが存在しない場合: 空リストを返す
3. `ws.get_all_records()` でヘッダーをキーとした辞書のリストを取得
4. `list(reversed(rows))` で新しい順（タイムスタンプ降順）に変換して返す

**シート列構成（お問い合わせシート）:**
| 列名 | 型 | 説明 |
|------|-----|------|
| タイムスタンプ | str | "YYYY-MM-DD HH:MM:SS" 形式（JST） |
| お名前 | str | 送信者名 |
| メール | str | 送信者メールアドレス |
| 件名 | str | お問い合わせ件名 |
| 内容 | str | お問い合わせ本文（改行含む可能性あり） |

---

## 4. テンプレート仕様

**ファイル:** `templates/admin/admin_contacts.html`

### レイアウト構造:
```
header.topbar
├── nav: Events / WS予約 / お問い合わせ(active) / Logout

main.main (max-width: 1200px)
├── .page-head
│   ├── h1.page-title "お問い合わせ一覧"
│   └── span.count-badge "{{ contacts | length }} 件"
│
└── .table-wrap（{% if contacts %}）
    └── table
        ├── thead: 受付日時 / お名前 / メール / 件名 / 内容
        └── tbody: {% for c in contacts %}
            └── tr
                ├── td.td-ts: {{ c.get('タイムスタンプ', '') }}
                ├── td.td-name: {{ c.get('お名前', '') }}
                ├── td.td-email:
                │   └── a[href="mailto:{{ c.get('メール', '') }}"]: {{ c.get('メール', '') }}
                ├── td.td-subject: {{ c.get('件名', '') }}
                └── td.td-message: {{ c.get('内容', '') }}
                    （max-width: 480px, white-space: pre-wrap, word-break: break-word）
```

### メールリンク:
```html
<a href="mailto:{{ c.get('メール', '') }}" style="color:#666; text-decoration:none;">
    {{ c.get('メール', '') }}
</a>
```
クリックするとデフォルトメーラーが起動し、宛先に送信者アドレスが設定される。

### 内容列のスタイル:
```css
.td-message {
    color: #555;
    font-size: 13px;
    line-height: 1.7;
    max-width: 480px;
    white-space: pre-wrap;   /* 改行を保持 */
    word-break: break-word;  /* 長いURLなどを折り返す */
}
```

---

## 5. シーケンス図

### 正常系: お問い合わせ一覧表示

```
ブラウザ          FastAPI                  Google Sheets
  |                 |                           |
  |--GET /admin/contacts-->                      |
  |                 |--_check_auth()            |
  |                 |--get_all_contacts_for_admin()-->
  |                 |                           |--worksheet("お問い合わせ")
  |                 |                           |--get_all_records()
  |                 |<--reversed(rows)----------|
  |<--200 HTML------|
  |  お問い合わせ一覧
```

### 準正常系: シート未存在

```
ブラウザ          FastAPI                  Google Sheets
  |                 |                           |
  |--GET /admin/contacts-->                      |
  |                 |--get_all_contacts_for_admin()-->
  |                 |                           |--worksheet("お問い合わせ")
  |                 |                           |  → gspread.WorksheetNotFound
  |                 |<--[] (空リスト)-----------|
  |<--200 HTML------|
  |  "お問い合わせはまだありません"
```

---

## 6. パターン一覧

| パターン | 条件 | 表示内容 |
|----------|------|---------|
| 正常: お問い合わせあり | contacts.length > 0 | テーブル表示（件数バッジ付き） |
| 正常: お問い合わせなし | contacts.length == 0 | "お問い合わせはまだありません" 表示 |
| 準正常: シート未存在 | gspread 例外 → 空リスト | "お問い合わせはまだありません" 表示 |
| 異常: 未認証 | セッションなし | 302 /admin/login |
