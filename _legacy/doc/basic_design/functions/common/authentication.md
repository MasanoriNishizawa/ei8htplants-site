# 機能設計：認証（共通）

## 概要

管理画面のセッションベース認証。`app/auth.py` に実装。

---

## セッション管理

Starlette の `SessionMiddleware` を使用。  
セッションデータは `SECRET_KEY` で署名された Cookie に保存される。

```python
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)
```

---

## 認証フロー

```
1. POST /admin/login
   → login(request, username, password)
     ・username == ADMIN_USER
     ・password == ADMIN_PASS（かつ空文字でない）
     → 成功: session["admin_authenticated"] = True
     → 失敗: エラーメッセージ表示

2. 各エンドポイント先頭で _check_auth(request)
   → is_authenticated(request)
     = session.get("admin_authenticated") is True
   → False の場合: 302 Redirect /admin/login

3. GET /admin/logout
   → session.clear()
   → 302 Redirect /admin/login
```

---

## セキュリティ上の注意点

| 項目 | 内容 |
|---|---|
| パスワード空文字ガード | `ADMIN_PASS` 未設定時は `"" and ""` → False でログイン不可 |
| セッション偽造防止 | SECRET_KEY による Cookie 署名（知らない第三者は偽造不可） |
| 全エンドポイントの保護 | admin ルーターの全関数先頭で `_check_auth()` を必ず呼ぶ |

---

## 実装

```python
def is_authenticated(request: Request) -> bool:
    return request.session.get("admin_authenticated") is True

def _check_auth(request: Request):
    if not is_authenticated(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    return None
```
