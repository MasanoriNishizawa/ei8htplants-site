# ログイン画面 詳細設計

- パス: `/admin/login`
- テンプレート: `templates/admin/admin_login.html`
- ルーター: `app/routes/admin.py`
- 認証: 不要（未認証ユーザーがアクセスする画面）

---

## 1. 画面概要

管理画面への入口となるログインフォーム。サイトナビには表示されない隠しページ。
URL を直接入力することでのみアクセス可能。

---

## 2. エンドポイント仕様

### 2-1. GET /admin/login

**目的:** ログインフォームを表示する。

**シグネチャ:**
```python
async def admin_login_get(request: Request) -> HTMLResponse | RedirectResponse
```

**引数:**
| 引数 | 型 | 必須 | 説明 |
|------|-----|------|------|
| request | Request | yes | FastAPI リクエストオブジェクト |

**処理フロー:**
1. `is_authenticated(request)` を呼び出してセッション状態を確認
2. 認証済みの場合 → `/admin/events` へ 302 リダイレクト
3. 未認証の場合 → `admin_login.html` を `error=None` でレンダリング

**テンプレート変数:**
| 変数名 | 型 | 説明 |
|--------|-----|------|
| request | Request | Jinja2 が必要とするリクエストオブジェクト |
| error | None | エラーメッセージ（GET 時は常に None） |

**戻り値:**
- `HTMLResponse` (200): ログインページ HTML
- `RedirectResponse` (302): 認証済み時は `/admin/events`

### 2-2. POST /admin/login

**目的:** 送信された資格情報を検証し、認証済みセッションを確立する。

**シグネチャ:**
```python
async def admin_login_post(request: Request) -> RedirectResponse | HTMLResponse
```

**引数:**
| 引数 | 型 | 必須 | 説明 |
|------|-----|------|------|
| request | Request | yes | FastAPI リクエストオブジェクト |

**フォームデータ（application/x-www-form-urlencoded）:**
| フィールド名 | 型 | 必須 | 説明 |
|--------------|-----|------|------|
| username | str | yes | 管理者ユーザー名 |
| password | str | yes | 管理者パスワード |

**処理フロー:**
1. `form = await request.form()` でフォームデータを取得
2. `form.get("username", "")` および `form.get("password", "")` を str に変換
3. `login(request, username, password)` を呼び出し
   - `login()` 内部: `username == settings.admin_user and password == settings.admin_pass and password` を評価
   - 成功時: `request.session["admin_authenticated"] = True` を設定し True を返す
   - 失敗時: セッション変更なし、False を返す
4. True の場合 → `/admin/events` へ 302 リダイレクト
5. False の場合 → `admin_login.html` を `error="IDまたはパスワードが違います"` でレンダリング

**戻り値:**
- `RedirectResponse` (302): 認証成功時は `/admin/events`
- `HTMLResponse` (200): 認証失敗時はエラー表示付きログインページ

---

## 3. 認証ロジック詳細（app/auth.py）

### login() 関数

```python
def login(request: Request, username: str, password: str) -> bool
```

**バリデーションルール:**
1. `username == settings.admin_user` — 環境変数 `ADMIN_USER` と完全一致
2. `password == settings.admin_pass` — 環境変数 `ADMIN_PASS` と完全一致
3. `password` が truthy（空文字 `""` は False） — `ADMIN_PASS` 未設定時の全許可を防ぐ安全策

3条件すべてが True の場合のみ認証成功。

**セッション書き込み:**
```
request.session["admin_authenticated"] = True
```

### is_authenticated() 関数

```python
def is_authenticated(request: Request) -> bool
```

`request.session.get("admin_authenticated") is True` を返す。
`None`、`False`、その他の値は認証済みと見なさない。

### セッション実装:
- Starlette の `SessionMiddleware` が署名付き Cookie として保存
- 署名に使用するキーは環境変数 `SECRET_KEY`
- `SECRET_KEY` を知らない第三者はセッションを偽造できない

---

## 4. テンプレート仕様

**ファイル:** `templates/admin/admin_login.html`

### レイアウト構造:
```
body (flex, 中央配置)
└── .card (360px 固定幅)
    ├── .title "ei8ht plants — Admin"
    ├── .error（{% if error %} のみ表示）
    └── form[method="post" action="/admin/login"]
        ├── .field > label + input[name="username" required autocomplete="username"]
        ├── .field > label + input[name="password" type="password" required autocomplete="current-password"]
        └── button.btn[type="submit"] "Login"
```

### エラー表示条件:
```jinja2
{% if error %}
<p class="error">{{ error }}</p>
{% endif %}
```
- GET 時: `error=None` → 表示なし
- POST 失敗時: `error="IDまたはパスワードが違います"` → 赤系スタイルで表示

### スタイル仕様:
- `.card`: 白背景 `#fff`、border `1px solid #e0e0e0`、padding `50px 40px`
- `.error`: 文字色 `#c0392b`、背景 `#fdf2f2`、border `1px solid #fcc`
- input[type="password"]: `required` + `autocomplete="current-password"` でブラウザ補完対応
- ナビゲーションバーなし（スタンドアロン認証フォーム）

---

## 5. ログアウトエンドポイント

### GET /admin/logout

**シグネチャ:**
```python
async def admin_logout(request: Request) -> RedirectResponse
```

**処理:**
1. `logout(request)` を呼び出し
   - 内部: `request.session.clear()` — `admin_authenticated` を含むすべてのセッションデータを削除
2. `/admin/login` へ 302 リダイレクト

**備考:** `session.clear()` は `admin_authenticated` だけでなく `flash` など他のセッションデータも全削除する。

---

## 6. シーケンス図

### 正常系: ログイン成功

```
ブラウザ                    FastAPI                     SessionMiddleware
  |                           |                               |
  |--GET /admin/login-------->|                               |
  |                           |--is_authenticated()---------->|
  |                           |<--False (セッション未設定)--|
  |<--200 ログインフォーム----|                               |
  |                           |                               |
  |--POST /admin/login------->|                               |
  |  (username, password)     |--login(request, u, p)-------->|
  |                           |  (検証OK)                     |
  |                           |--session["admin_authenticated"]=True->|
  |                           |<--True------------------------|
  |<--302 /admin/events-------|                               |
```

### 準正常系: ログイン失敗

```
ブラウザ                    FastAPI
  |                           |
  |--POST /admin/login------->|
  |  (username=wrong)         |--login() → False
  |<--200 エラー表示-----------|
  |  error="IDまたはパスワードが違います"
```

### 正常系: ログアウト

```
ブラウザ                    FastAPI                     SessionMiddleware
  |                           |                               |
  |--GET /admin/logout------->|                               |
  |                           |--logout(request)------------->|
  |                           |  session.clear()              |
  |<--302 /admin/login--------|                               |
```

---

## 7. パターン一覧

| パターン | リクエスト | 条件 | レスポンス |
|----------|-----------|------|-----------|
| 正常: 初回アクセス | GET /admin/login | 未認証 | 200 ログインフォーム (error=None) |
| 正常: 認証済みアクセス | GET /admin/login | 認証済み | 302 /admin/events |
| 正常: ログイン成功 | POST /admin/login | 正しい資格情報 | 302 /admin/events |
| 準正常: パスワード誤り | POST /admin/login | password 不一致 | 200 エラーメッセージ表示 |
| 準正常: ユーザー名誤り | POST /admin/login | username 不一致 | 200 エラーメッセージ表示 |
| 準正常: 空パスワード | POST /admin/login | password="" | 200 エラーメッセージ表示（`and password` チェックで弾く） |
| 正常: ログアウト | GET /admin/logout | 認証済み/未認証問わず | 302 /admin/login |

---

## 8. セキュリティ考慮事項

- HTTPS 必須（平文での資格情報送信を防ぐため）
- `ADMIN_PASS` が空文字の場合、`and password` チェックによりログインを拒否
- セッション Cookie は `SessionMiddleware` が HMAC-SHA256 で署名
- 連続失敗に対するロックアウト機能は未実装（TODO）
- CSRF 保護は未実装（TODO）
