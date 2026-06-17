# 詳細設計書：Gmail API メール送信（共通）

**モジュール**: `app/email.py`  
**依存モジュール**: `app/config.py`（`settings`）  
**外部ライブラリ**: `google-auth`、`google-api-python-client`、`email`（標準ライブラリ）、`base64`（標準ライブラリ）

---

## 1. 概要

SMTP の代わりに Gmail API（HTTPS）を使用してメールを送信するモジュール。  
クラウド環境（Render 等）ではポート 587/465 がブロックされる場合があるため、  
Gmail API を使用することでポート制限を回避している。

メール送信は 2 つの Gmail アカウントから行われる。

| アカウント | 用途 |
|---|---|
| `habitatoides@gmail.com` | WS予約確認メール・管理者通知メール |
| `ei8htplants@gmail.com` | お問い合わせ確認メール・管理者通知メール |

---

## 2. Gmail API 認証フロー（OAuth2）

```
アプリ起動後の初回メール送信時
  └─ _get_gmail_service(refresh_token)
       ├─ 1. Credentials オブジェクトを構築
       │    - token=None（アクセストークン未取得の状態）
       │    - refresh_token: 環境変数から取得した永続的なリフレッシュトークン
       │    - client_id / client_secret: OAuth2 クライアント情報
       │    - token_uri: "https://oauth2.googleapis.com/token"
       │
       ├─ 2. creds.refresh(Request())
       │    → Google の OAuth2 トークンエンドポイントに POST リクエスト
       │    → レスポンスからアクセストークン（有効期間 1 時間）を取得
       │    → creds.token にセット
       │
       └─ 3. build("gmail", "v1", credentials=creds, cache_discovery=False)
            → Gmail API クライアントを構築
            → cache_discovery=False: Discovery ドキュメントをキャッシュしない
              （Render の tmp ファイルシステムが安定しないため）
```

**リフレッシュトークンの永続性**:  
リフレッシュトークンは `GMAIL_REFRESH_TOKEN` / `CONTACT_GMAIL_REFRESH_TOKEN` として  
環境変数に保存されており、アクセストークンが期限切れになるたびに再取得される。  
リフレッシュトークン自体は期限なし（手動失効または再認可まで有効）。

**`_get_gmail_service` はインスタンスをキャッシュしない**:  
メール送信のたびに新しいサービスインスタンスを生成する。  
頻度が低いため（予約・問い合わせ時のみ）、キャッシュのコストメリットが小さいと判断。

---

## 3. 定数・モジュールレベル変数

```python
SITE_URL = "https://ei8htplants.onrender.com"
_CONTACT_SENDER = "ei8htplants@gmail.com"
```

---

## 4. 内部関数

### 4.1 `_get_gmail_service`

```python
def _get_gmail_service(refresh_token: str)
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `refresh_token` | `str` | OAuth2 リフレッシュトークン（アカウント固有） |

#### 戻り値

`googleapiclient.discovery.Resource` — Gmail API サービスオブジェクト

#### 例外

| 例外 | 条件 |
|---|---|
| `google.auth.exceptions.RefreshError` | リフレッシュトークンが無効・失効している場合 |
| `google.auth.exceptions.TransportError` | ネットワーク障害時 |

これらは呼び出し元の `_send_via_api` を通じて公開関数の `except Exception` で捕捉される。

---

### 4.2 `_send_via_api`

```python
def _send_via_api(
    refresh_token: str,
    sender_email: str,
    sender_name: str,
    to: str,
    subject: str,
    body: str
) -> None
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `refresh_token` | `str` | 送信者アカウントの OAuth2 リフレッシュトークン |
| `sender_email` | `str` | 送信元メールアドレス |
| `sender_name` | `str` | 送信元表示名（例: `"Habitat Oides"`） |
| `to` | `str` | 宛先メールアドレス |
| `subject` | `str` | 件名 |
| `body` | `str` | 本文（プレーンテキスト） |

#### 内部ロジック

```python
service = _get_gmail_service(refresh_token)

# MIMEText でメッセージ構築
msg = MIMEText(body, "plain", "utf-8")
msg["To"] = to
msg["From"] = formataddr((sender_name, sender_email))
    # → "Habitat Oides <habitatoides@gmail.com>" 形式にエンコード
msg["Subject"] = subject

# base64 URL-safe エンコードして Gmail API に送信
raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
service.users().messages().send(userId="me", body={"raw": raw}).execute()
```

**`userId="me"` の意味**: 認証済みユーザー（= リフレッシュトークンのオーナー）として送信。

#### 戻り値

`None`

#### 例外

`googleapiclient.errors.HttpError`（Gmail API からの HTTP エラーレスポンス）等が呼び出し元に伝播。

---

### 4.3 `_build_reservation_body`

```python
def _build_reservation_body(data: dict) -> str
```

WS予約確認メールの本文テキストを構築するヘルパー関数。

#### 引数

`data` 辞書の使用キー:

| キー | 変換 | 使用箇所 |
|---|---|---|
| `イベント名` | そのまま | ご予約内容 |
| `お名前` | そのまま | 宛名 + ご予約内容 |
| `希望日` | `replace("-", "/")` | ご予約内容 |
| `希望時間帯` | そのまま | ご予約内容 |
| `参加人数` | そのまま | ご予約内容 |
| `お持ち込み` | 空の場合は `"なし"` | ご予約内容 |
| `備考` | 存在する場合のみ追記 | ご予約内容 |
| `キャンセルトークン` | `{SITE_URL}/cancel?token={token}` | キャンセルリンク |

#### 本文テンプレート

```
この度は Habitat Style Workshop へのお申し込みありがとうございます。
以下の内容でご予約を承りました。

━━━━━━━━━━━━━━━━━━
【ご予約内容】
イベント　：{イベント名}
お名前　　：{お名前} 様
ご希望日　：{希望日（YYYY/MM/DD）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
お持ち込み：{お持ち込み（空の場合は"なし"）}
備考　　　：{備考}（備考がある場合のみ）
━━━━━━━━━━━━━━━━━━

当日スタッフがご案内いたします。
ご不明な点がございましたら公式ホームページ内「CONTACT」よりお問い合わせください。
{SITE_URL}/contact

──────────────────（キャンセルトークンがある場合）
▼ キャンセルはこちら
{SITE_URL}/cancel?token={キャンセルトークン}
※ キャンセルの場合は上記リンクから手続きをお願いします。

ei8ht plants / Habitat Oides
{SITE_URL}/events
```

---

## 5. 公開関数

### 5.1 `send_reservation_confirmation`

```python
def send_reservation_confirmation(data: dict) -> None
```

WS予約完了後に**予約者**へ送信する確認メール。

#### 送信アカウント

`habitatoides@gmail.com`（`settings.gmail_refresh_token` / `settings.gmail_sender`）

#### 引数

`data` 辞書（`create_ws_reservation` 呼び出し後に `"キャンセルトークン"` が追加済みのもの）

#### 件名テンプレート

```
【ワークショップご予約確認】{イベント名} — ei8ht plants
```

#### 本文

`_build_reservation_body(data)` の返り値（詳細は 4.3 参照）。

#### スキップ条件

| 条件 | ログ出力 |
|---|---|
| `settings.gmail_refresh_token` が空 | `[email] SKIP: GMAIL_REFRESH_TOKEN or GMAIL_CLIENT_ID not set` |
| `settings.gmail_client_id` が空 | 同上 |
| `data["メール"]` が空 | `[email] SKIP: recipient address is empty` |

#### エラーハンドリング

```python
except Exception as e:
    print(f"[email] ERROR sending reservation confirmation: {e}")
```

例外を `print` で記録し、呼び出し元には伝播しない（メール送信失敗でも予約自体は完了させる）。

#### 副作用

Gmail API を呼び出す（`_send_via_api` 経由）。

---

### 5.2 `send_reservation_notification`

```python
def send_reservation_notification(data: dict) -> None
```

WS予約完了後に**管理者**（`habitatoides@gmail.com` 自身）へ送信する通知メール。

#### 送信アカウント・宛先

両方とも `habitatoides@gmail.com`（自分自身に送信）。

#### 件名テンプレート

```
【新規予約】{イベント名} — {お名前} 様
```

#### 本文テンプレート

```
新しいワークショップ予約が入りました。

━━━━━━━━━━━━━━━━━━
イベント　：{イベント名}
お名前　　：{お名前} 様
メール　　：{メール}
ご希望日　：{希望日（YYYY/MM/DD）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
お持ち込み：{お持ち込み（空の場合は"なし"）}
備考　　　：{備考}（備考がある場合のみ）
━━━━━━━━━━━━━━━━━━
```

#### スキップ条件

`send_reservation_confirmation` と同じ（`GMAIL_REFRESH_TOKEN` / `GMAIL_CLIENT_ID` チェック）。  
宛先が空の場合のチェックはない（`to=sender` で常に宛先が設定される）。

---

### 5.3 `send_contact_confirmation`

```python
def send_contact_confirmation(data: dict) -> None
```

お問い合わせフォーム送信後に**問い合わせ者**へ送信する受付確認メール。

#### 送信アカウント

`ei8htplants@gmail.com`（`settings.contact_gmail_refresh_token`）

#### 引数

`data` 辞書（`create_contact` に渡すのと同じ形式）

| キー | 説明 |
|---|---|
| `name` | 送信者名 |
| `email` | 宛先メールアドレス |
| `subject` | 件名 |
| `message` | 問い合わせ内容 |

#### 件名テンプレート

```
【お問い合わせ受付】{subject} — ei8ht plants
```

#### 本文テンプレート

```
{name} 様

この度は ei8ht plants へのお問い合わせありがとうございます。
以下の内容でお問い合わせを受け付けました。
内容を確認次第、ご連絡いたします。

━━━━━━━━━━━━━━━━━━
件名：{subject}

【内容】
{message}
━━━━━━━━━━━━━━━━━━

ei8ht plants
@ei8ht.plants  |  @habitatoides
{SITE_URL}/contact
```

#### スキップ条件

| 条件 | ログ出力 |
|---|---|
| `settings.contact_gmail_refresh_token` が空 | `[email] SKIP: CONTACT_GMAIL_REFRESH_TOKEN or GMAIL_CLIENT_ID not set` |
| `settings.gmail_client_id` が空 | 同上 |
| `data["email"]` が空 | `[email] SKIP: contact recipient address is empty` |

---

### 5.4 `send_contact_notification`

```python
def send_contact_notification(data: dict) -> None
```

お問い合わせフォーム送信後に**管理者**（`ei8htplants@gmail.com` 自身）へ送信する通知メール。

#### 送信アカウント・宛先

両方とも `ei8htplants@gmail.com`（自分自身に送信）。

#### 件名テンプレート

```
【お問い合わせ】{subject} — {name}
```

#### 本文テンプレート

```
新しいお問い合わせが届きました。

━━━━━━━━━━━━━━━━━━
お名前：{name}
メール：{email}
件名　：{subject}

【内容】
{message}
━━━━━━━━━━━━━━━━━━

※このメールは ei8ht plants サイトから自動送信されています。
```

---

### 5.5 `send_cancellation_confirmation`

```python
def send_cancellation_confirmation(data: dict, reason: str = "") -> None
```

予約キャンセル完了後に**予約者**へ送信するキャンセル完了メール。

#### 送信アカウント

`habitatoides@gmail.com`（`settings.gmail_refresh_token` / `settings.gmail_sender`）

#### 引数

| 引数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `data` | `dict` | 必須 | 予約レコード（`get_reservation_by_token()` の返り値）。`"お名前"`, `"メール"`, `"イベント名"`, `"希望日"`, `"希望時間帯"`, `"参加人数"` を使用 |
| `reason` | `str` | `""` | キャンセル理由（現在の実装では本文に含めていない） |

#### 件名テンプレート

```
【予約キャンセル完了】{イベント名} — ei8ht plants
```

#### 本文テンプレート

```
{お名前} 様

以下のご予約のキャンセルを承りました。

━━━━━━━━━━━━━━━━━━
イベント　：{イベント名}
ご希望日　：{希望日（YYYY/MM/DD）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
━━━━━━━━━━━━━━━━━━

またのご参加をお待ちしております。
ご不明な点がございましたら公式ホームページ内「CONTACT」よりお問い合わせください。
{SITE_URL}/contact

ei8ht plants / Habitat Oides
{SITE_URL}/events
```

#### スキップ条件

`send_reservation_confirmation` と同じ加えて、`data["メール"]` が空の場合もスキップ。

---

### 5.6 `send_cancellation_notification`

```python
def send_cancellation_notification(data: dict, reason: str = "") -> None
```

予約キャンセル完了後に**管理者**（`habitatoides@gmail.com` 自身）へ送信する通知メール。

#### 引数

| 引数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `data` | `dict` | 必須 | 予約レコード |
| `reason` | `str` | `""` | キャンセル理由（非空の場合のみ本文に追記） |

#### 件名テンプレート

```
【キャンセル通知】{イベント名} — {お名前} 様
```

#### 本文テンプレート

```
ワークショップ予約がキャンセルされました。

━━━━━━━━━━━━━━━━━━
【キャンセル対象予約】
イベント　：{イベント名}
お名前　　：{お名前} 様
ご希望日　：{希望日（YYYY/MM/DD）}
時間帯　　：{希望時間帯}
参加人数　：{参加人数} 名
キャンセル理由：{reason}（reason が非空の場合のみ）
━━━━━━━━━━━━━━━━━━
```

---

## 6. 全関数の呼び出しシーケンス

### 予約フロー

```
POST /reserve（フォーム送信）
  └─ create_ws_reservation(data)        # Sheets 書き込み + トークン生成
       ↓（data["キャンセルトークン"] が追加される）
  ├─ send_reservation_confirmation(data) # 予約者への確認メール
  └─ send_reservation_notification(data) # 管理者への通知メール
```

### キャンセルフロー

```
GET /cancel?token={token}
  └─ get_reservation_by_token(token)    # Sheets から予約データ取得
       ↓
  ├─ cancel_reservation(token, reason)  # Sheets にキャンセル情報を書き込む
       ↓（戻り値が True の場合のみ）
  ├─ send_cancellation_confirmation(data) # 予約者へキャンセル完了メール
  └─ send_cancellation_notification(data) # 管理者へキャンセル通知メール
```

### お問い合わせフロー

```
POST /contact（フォーム送信）
  └─ create_contact(data)              # Sheets 書き込み
  ├─ send_contact_confirmation(data)   # 問い合わせ者への受付確認メール
  └─ send_contact_notification(data)   # 管理者への通知メール
```

---

## 7. エラーハンドリング方針

| 対処方針 | 理由 |
|---|---|
| 全公開関数は `except Exception as e: print(...)` でエラーを補足 | メール送信失敗でも Sheets への書き込みは完了しているため、ユーザーへのエラー表示は不要 |
| スキップ条件（環境変数未設定）は `print` 出力のみ | 開発環境でメール設定なしで動作させるため |
| `reason` 引数は `send_cancellation_confirmation` の本文に含めない | 現在の実装では `reason` は `send_cancellation_notification`（管理者通知）のみに反映 |

---

## 8. 環境変数一覧

| 環境変数 | `settings` プロパティ | 対応アカウント | 用途 |
|---|---|---|---|
| `GMAIL_CLIENT_ID` | `settings.gmail_client_id` | 共通 | OAuth2 クライアント ID |
| `GMAIL_CLIENT_SECRET` | `settings.gmail_client_secret` | 共通 | OAuth2 クライアントシークレット |
| `GMAIL_REFRESH_TOKEN` | `settings.gmail_refresh_token` | `habitatoides@gmail.com` | WS予約関連メールの送信トークン |
| `GMAIL_SENDER` | `settings.gmail_sender` | `habitatoides@gmail.com` | 送信元メールアドレス |
| `GMAIL_SENDER_NAME` | `settings.gmail_sender_name` | - | 送信元表示名（デフォルト: `"Habitat Oides"`） |
| `CONTACT_GMAIL_REFRESH_TOKEN` | `settings.contact_gmail_refresh_token` | `ei8htplants@gmail.com` | お問い合わせ関連メールの送信トークン |

---

## 9. セキュリティ上の考慮点

| 項目 | 内容 |
|---|---|
| リフレッシュトークンの保護 | 環境変数として保存。ソースコードや Git リポジトリには含めない |
| キャンセルトークンの推測耐性 | `uuid.uuid4()` による 122 ビットのランダム性。総当たり攻撃は現実的でない |
| キャンセルリンクの有効期限 | 現在の実装では有効期限なし。将来的にタイムスタンプ比較の追加を検討 |
| 宛先アドレスの検証 | 基本的な空文字チェックのみ。悪意ある入力への対処は FastAPI のフォームバリデーション側に委ねる |
| HTML インジェクション | 本文はプレーンテキスト（`MIMEText(..., "plain", "utf-8")`）のため HTML インジェクションは不可 |
