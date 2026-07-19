# 詳細設計書：セッション認証（共通）

**モジュール**: `app/auth.py`  
**依存モジュール**: `app/config.py`（`settings`）、`fastapi`（`Request`）、Starlette `SessionMiddleware`

---

## 1. 概要

管理画面（`/admin/*`）へのアクセスを保護するセッションベース認証モジュール。  
セッションデータは Starlette `SessionMiddleware` が発行する署名付き Cookie に保存される。  
JWT や DB セッションテーブルは使用しない。

---

## 2. ミドルウェア設定

`app/main.py` にて以下のように登録される。

```python
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)
```

| パラメータ | 値 | 説明 |
|---|---|---|
| `secret_key` | `settings.secret_key`（環境変数 `SECRET_KEY`） | Cookie の HMAC-SHA256 署名に使用 |
| `session_cookie` | `session`（デフォルト） | Cookie 名 |
| `max_age` | `14 * 24 * 3600`（デフォルト） | セッション有効期間（秒） |
| `https_only` | `False`（デフォルト） | ローカル開発のため False |
| `same_site` | `"lax"`（デフォルト） | CSRF 対策の SameSite 属性 |

**セキュリティ上の注意**: `SECRET_KEY` 未設定時はデフォルト値 `"dev-secret-change-in-production"` が使用され、署名が既知になるためセッション偽造が可能になる。本番環境では必ず設定すること。

---

## 3. 関数仕様

### 3.1 `is_authenticated`

```python
def is_authenticated(request: Request) -> bool
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `request` | `fastapi.Request` | 現在処理中のリクエストオブジェクト |

#### 戻り値

| 値 | 条件 |
|---|---|
| `True` | `request.session["admin_authenticated"]` が `True`（厳密な同一性チェック） |
| `False` | キーが存在しない / 値が `True` でない（`1`、`"true"` 等も `False` になる） |

#### 内部ロジック

```python
return request.session.get("admin_authenticated") is True
```

- `dict.get()` を使うため `KeyError` は発生しない。
- `is True` による厳密な同一性チェックで、`1` や `"true"` などの truthy 値を弾く。
- セッション Cookie が改ざんされていた場合、`SessionMiddleware` がデコード時に検証エラーを検出し、空のセッションとして扱うため、`is_authenticated` は `False` を返す。

#### 例外

| 例外 | 条件 | 対処 |
|---|---|---|
| なし | `session.get()` は例外を投げない | - |

#### 副作用

なし（読み取り専用）。

---

### 3.2 `login`

```python
def login(request: Request, username: str, password: str) -> bool
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `request` | `fastapi.Request` | セッションを書き込む対象のリクエスト |
| `username` | `str` | フォームから送信されたユーザー名 |
| `password` | `str` | フォームから送信されたパスワード（平文） |

#### 戻り値

| 値 | 条件 |
|---|---|
| `True` | 認証成功（セッションに `admin_authenticated = True` を書き込み済み） |
| `False` | 認証失敗（セッションは変更されない） |

#### 内部ロジック

```python
if username == settings.admin_user and password == settings.admin_pass and password:
    request.session["admin_authenticated"] = True
    return True
return False
```

#### 条件分岐

| パターン | `username` | `password` | `settings.admin_pass` | 結果 |
|---|---|---|---|---|
| 正常系：認証成功 | 一致 | 一致（非空） | 設定済み | `True`、セッション書き込み |
| 準正常系：パスワード不一致 | 一致 | 不一致 | 設定済み | `False` |
| 準正常系：ユーザー名不一致 | 不一致 | 任意 | 設定済み | `False` |
| 異常系：`ADMIN_PASS` 未設定（空文字） | 一致 | `""` | `""` | `False`（`and password` ガードが機能） |
| 異常系：`ADMIN_PASS` 未設定（空文字） | 一致 | 非空文字 | `""` | `False`（`password == settings.admin_pass` が不一致） |

**空文字ガードの詳細**:  
`settings.admin_pass` はデフォルト `""` であるため、`password == settings.admin_pass` は `"" == ""` → `True` になってしまう。  
末尾の `and password` が `password` が空文字のとき `False` を返すことで、環境変数未設定時に空パスワードでログインできる脆弱性を防いでいる。

#### セッション書き込みの詳細

- キー: `"admin_authenticated"`
- 値: `True`（Python の `bool` 型）
- `SessionMiddleware` が次のレスポンス時に値を JSON シリアライズして署名付き Cookie として Set-Cookie ヘッダーに書き込む。

#### 例外

| 例外 | 条件 | 対処 |
|---|---|---|
| なし（通常） | 比較演算のみ | - |
| `SessionMiddleware` 内部エラー | Cookie エンコードに失敗（通常は発生しない） | フレームワーク側でハンドリング |

#### 副作用

認証成功時のみ `request.session["admin_authenticated"] = True` を書き込む。

---

### 3.3 `logout`

```python
def logout(request: Request) -> None
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `request` | `fastapi.Request` | セッションをクリアする対象のリクエスト |

#### 戻り値

`None`

#### 内部ロジック

```python
request.session.clear()
```

#### 条件分岐

| パターン | 状態 | 結果 |
|---|---|---|
| 正常系 | セッションが存在する | セッション全キーを削除 |
| 準正常系 | セッションが空 | `dict.clear()` は空辞書に対しても安全に動作。副作用なし |

**`session.clear()` を使う理由**:  
`del request.session["admin_authenticated"]` ではなく `clear()` を使うことで、将来 `flash` メッセージ等の他のセッションキーが追加された場合も一括で消去できる。

#### 例外

なし。

#### 副作用

セッション内のすべてのキーが削除される（`admin_authenticated` 以外のキーも対象）。  
`SessionMiddleware` が空のセッションを Cookie の Max-Age=0 で上書き送信し、ブラウザ側のセッション Cookie を削除する。

---

## 4. 呼び出しパターン（routes からの利用）

### ログインエンドポイント（`routes/admin.py` 内）

```python
# POST /admin/login
result = login(request, username=form_data["username"], password=form_data["password"])
if result:
    return RedirectResponse(url="/admin/events", status_code=302)
else:
    return templates.TemplateResponse("admin/login.html", {"error": "ユーザー名またはパスワードが違います"})
```

### 認証チェック（各管理エンドポイントの先頭）

```python
def _check_auth(request: Request):
    if not is_authenticated(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    return None
```

### ログアウトエンドポイント

```python
# GET /admin/logout
logout(request)
return RedirectResponse(url="/admin/login", status_code=302)
```

---

## 5. セキュリティ上の考慮点

| 項目 | 実装 | リスクと対策 |
|---|---|---|
| セッション偽造防止 | HMAC-SHA256 署名付き Cookie | `SECRET_KEY` が漏洩すると偽造可能。強いランダム値を設定する |
| パスワード空文字攻撃 | `and password` ガード | `ADMIN_PASS` 未設定時でも空パスワードでのログインを阻止 |
| ブルートフォース | 現在レートリミットなし | Render のエッジレート制限に依存。将来的に `slowapi` 等の導入を検討 |
| パスワード平文比較 | `==` による直接比較 | 定数時間比較ではない（`hmac.compare_digest` 推奨）。サイドチャネル攻撃リスクは低いが注意 |
| HTTPS 強制 | 現在 `https_only=False` | Render は HTTPS 終端するため実質 HTTPS。将来 `https_only=True` を検討 |
| CSRF 対策 | `SameSite=lax`（デフォルト） | ログインフォームに CSRF トークンは未実装。SameSite lax で軽減 |

---

## 6. スレッドセーフ性と非同期との兼ね合い

- `auth.py` の関数はすべてステートレス（グローバル変数を持たない）。
- セッションの読み書きは `Request` オブジェクト経由で行われ、各リクエストは独自の `Request` インスタンスを持つ。
- `async def` ルートからも `def` ルートからも安全に呼び出せる。
- `SessionMiddleware` 自体は Starlette が非同期に対応した実装を提供している。

---

## 7. 設定値（`app/config.py`）

| 環境変数 | `Settings` プロパティ | デフォルト値 | 説明 |
|---|---|---|---|
| `SECRET_KEY` | `settings.secret_key` | `"dev-secret-change-in-production"` | Cookie 署名鍵 |
| `ADMIN_USER` | `settings.admin_user` | `"admin"` | 管理者ユーザー名 |
| `ADMIN_PASS` | `settings.admin_pass` | `""` | 管理者パスワード（空文字はログイン不可） |
