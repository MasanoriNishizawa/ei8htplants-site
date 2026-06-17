# 機能設計：メール送信（共通）

## 概要

`app/email.py` に実装。Gmail API（OAuth2）でメールを送信する。  
SMTP は Render の無料プランでブロックされるため Gmail API を使用。

---

## 認証情報（環境変数）

| 変数名 | 用途 |
|---|---|
| `GMAIL_CLIENT_ID` | OAuth2 クライアント ID |
| `GMAIL_CLIENT_SECRET` | OAuth2 クライアントシークレット |
| `GMAIL_REFRESH_TOKEN` | アクセストークン取得用リフレッシュトークン |
| `GMAIL_SENDER` | 送信元アドレス（例: habitatoides@gmail.com） |
| `SITE_URL` | メール本文内リンク生成用（例: https://ei8htplants.com） |

---

## メール送信関数

| 関数 | 宛先 | トリガー |
|---|---|---|
| `send_reservation_confirmation(data)` | 予約者 | WS予約完了時 |
| `send_reservation_notification(data)` | habitatoides@gmail.com | WS予約完了時 |
| `send_cancellation_confirmation(data, reason)` | 予約者 | キャンセル完了時 |
| `send_cancellation_notification(data, reason)` | habitatoides@gmail.com | キャンセル完了時 |
| `send_contact_notification(data)` | habitatoides@gmail.com | お問い合わせ受付時 |

---

## 送信フロー

```
1. credentials = Credentials(
       token=None,
       refresh_token=GMAIL_REFRESH_TOKEN,
       client_id=GMAIL_CLIENT_ID,
       client_secret=GMAIL_CLIENT_SECRET,
       token_uri="https://oauth2.googleapis.com/token"
   )
2. service = build("gmail", "v1", credentials=credentials)
3. メール本文（UTF-8）→ base64url エンコード
4. service.users().messages().send(userId="me", body={...}).execute()
```

---

## 非同期実行（fire-and-forget）

メール送信は失敗してもユーザー体験に影響を与えないように  
fire-and-forget パターンで実行する。

```python
_task_refs: set = set()

def _fire(coro):
    task = asyncio.ensure_future(coro)
    _task_refs.add(task)
    task.add_done_callback(_task_refs.discard)

# 呼び出し例
_fire(asyncio.to_thread(send_reservation_confirmation, data))
_fire(asyncio.to_thread(send_reservation_notification, data))
```

> `_task_refs` に保持しないと GC により実行中タスクが破棄されることがある。

---

## メール本文のポリシー

- お問い合わせ先として Instagram DM は記載しない
- 問い合わせ先: `{SITE_URL}/contact`（CONTACT ページへの URL）
- キャンセルトークン URL: `{SITE_URL}/cancel?token=<UUID>`（予約確認メールのみ）
