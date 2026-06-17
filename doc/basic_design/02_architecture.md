# アーキテクチャ設計

## 1. 技術スタック

| レイヤー | 技術 | バージョン |
|---|---|---|
| Web フレームワーク | FastAPI | 0.128.x |
| テンプレートエンジン | Jinja2 | 3.1.x |
| ASGI サーバー | Uvicorn | 0.39.x |
| データストア | Google Sheets (gspread) | 6.2.x |
| ファイルストレージ | Google Drive API | v3 |
| メール送信 | Gmail API (OAuth2) | v1 |
| 認証 | Starlette SessionMiddleware（署名付き Cookie） | - |
| ホスティング | Render | - |
| 言語 | Python | 3.x |

---

## 2. システム構成図

```
ブラウザ
  │
  │ HTTPS
  ▼
Render（単一プロセス）
  ┌─────────────────────────────────────┐
  │  Uvicorn（ASGI サーバー）            │
  │    │                                │
  │  FastAPI アプリ (main:app)           │
  │    ├── SessionMiddleware            │
  │    ├── StaticFiles (/static)        │
  │    ├── public_router（公開ページ）   │
  │    └── admin_router（/admin/*）      │
  │                                     │
  │  インメモリ TTL キャッシュ            │
  └─────────────────────────────────────┘
        │                    │
        │ gspread             │ Gmail API
        ▼                    ▼
  Google Sheets        Gmail (OAuth2)
  Google Drive         habitatoides@
  (画像ストレージ)      ei8htplants@
```

---

## 3. ディレクトリ構成

```
ei8htplants-site/
├── main.py                   # エントリーポイント（uvicorn main:app）
├── requirements.txt
├── secret_key.json           # Google サービスアカウントキー（Git 管理外）
├── get_gmail_token.py        # OAuth2 トークン取得スクリプト（Git 管理外）
│
├── app/
│   ├── __init__.py           # create_app() ファクトリ
│   ├── config.py             # 環境変数・認証情報の集約
│   ├── auth.py               # セッション認証（login/logout/is_authenticated）
│   ├── cache.py              # インメモリ TTL キャッシュ
│   ├── google_client.py      # gspread クライアントのシングルトン生成
│   ├── sheets.py             # Google Sheets 読み書きロジック
│   ├── drive.py              # Google Drive 画像一覧取得
│   ├── email.py              # Gmail API メール送信
│   ├── templates.py          # Jinja2 テンプレート設定・カスタムフィルター
│   └── routes/
│       ├── public.py         # 公開ページのルーター
│       └── admin.py          # 管理画面のルーター
│
├── templates/
│   ├── base.html             # 共通レイアウト（ナビ・フッター）
│   ├── _macros.html          # 再利用 Jinja2 マクロ
│   ├── home.html
│   ├── events.html
│   ├── reserve.html
│   ├── cancel.html           # 予約キャンセルページ
│   ├── contact.html
│   ├── concept.html
│   ├── gallery.html
│   ├── specimen.html
│   ├── ei8htplants.html
│   ├── habitatoides.html
│   ├── habitatoides_workshop.html
│   ├── hue.html
│   ├── collaborations.html
│   └── admin/
│       ├── admin_login.html
│       ├── admin_events.html
│       ├── admin_event_form.html
│       ├── admin_reservations.html
│       ├── admin_reservation_history.html
│       ├── admin_reservation_schedule.html
│       └── admin_contacts.html
│
├── static/
│   └── collab.mp4            # コラボページ動画
│
├── gas/
│   └── workshop_reservation.gs  # (旧) GAS スクリプト（現在未使用）
│
└── doc/                      # 設計ドキュメント（このディレクトリ）
```

---

## 4. データフロー

### 4.1 公開ページ（イベント表示）

```
ブラウザ GET /events
  → public_router
    → cache.get("events:current")
      [HIT]  → Jinja2 レンダリング → レスポンス
      [MISS] → Sheets API → _enrich_event() → cache.set() → レンダリング
```

### 4.2 WS予約送信

```
ブラウザ POST /reserve
  → reserve_submit()
    → asyncio.to_thread(create_ws_reservation)   ← ここで待つ（ブロッキング）
      → UUIDトークン生成
      → Sheets.append_row()
    → _fire(send_reservation_confirmation)        ← バックグラウンド送信
    → _fire(send_reservation_notification)        ← バックグラウンド送信
    → 303 Redirect /reserve?row=N
      → reserve_flash モーダル表示
```

### 4.3 メール送信（バックグラウンド）

```
_fire(coro)
  → asyncio.create_task(coro)
    → _task_refs.add(task)       ← GC 防止のための強参照保持
    → task.add_done_callback(_task_refs.discard)
  → Gmail API（HTTPS）→ メール送信
```

---

## 5. キャッシュ戦略

| キャッシュキー | TTL | 無効化タイミング |
|---|---|---|
| `events:current` | 5 分 | イベント作成・更新・削除時 |
| `events:past` | 5 分 | 同上 |
| `gallery:<brand>` | 10 分 | 手動操作なし（TTL 切れ待ち） |
| `home_gallery` | 10 分 | 同上 |

---

## 6. 非同期処理の設計

FastAPI は非同期フレームワークだが、gspread と Gmail API は同期ライブラリ。  
イベントループをブロックしないよう `asyncio.to_thread()` でスレッドプールに委譲する。

```python
# 必ず待つ処理（ユーザーレスポンスに必要）
await asyncio.to_thread(create_ws_reservation, data)

# バックグラウンドでよい処理（メール送信）
_fire(asyncio.to_thread(send_reservation_confirmation, data))
```

`_fire()` は `asyncio.create_task()` のラッパー。  
タスクをモジュールレベルの `_task_refs: set` に保持して GC から保護し、  
完了時に `done_callback` で `_task_refs.discard()` して解放する。

---

## 7. セキュリティ設計

| 項目 | 実装 |
|---|---|
| 管理画面認証 | `_check_auth()` を各エンドポイント先頭で必ず呼ぶ |
| セッション改ざん防止 | `SECRET_KEY` で署名された Cookie（Starlette SessionMiddleware） |
| パスワード空文字対策 | `ADMIN_PASS` が空のときログイン不可（auth.py 内で明示チェック） |
| API ドキュメント非公開 | `docs_url=None, redoc_url=None` |
| キャンセルトークン | UUID v4 を予約時に生成。知っている人だけキャンセル可能 |
