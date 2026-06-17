# メール設計

## 1. 使用アカウントと用途

| アカウント | 用途 | 環境変数 |
|---|---|---|
| habitatoides@gmail.com | WS予約関連メールの送受信 | `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` |
| ei8htplants@gmail.com | お問い合わせ関連メールの送受信 | `CONTACT_GMAIL_REFRESH_TOKEN` |

---

## 2. メール送信一覧

### 2.1 WS予約完了（予約者宛）

- **件名**: `【ワークショップご予約確認】{イベント名} — ei8ht plants`
- **送信元**: `Habitat Oides <habitatoides@gmail.com>`
- **送信先**: 予約フォームで入力したメールアドレス
- **本文**:
  ```
  この度は Habitat Style Workshop へのお申し込みありがとうございます。
  以下の内容でご予約を承りました。

  ━━━━━━━━━━━━━━━━━━
  【ご予約内容】
  イベント　：{イベント名}
  お名前　　：{お名前} 様
  ご希望日　：{希望日}
  時間帯　　：{希望時間帯}
  参加人数　：{参加人数} 名
  お持ち込み：{お持ち込み}
  備考　　　：{備考}（あれば）
  ━━━━━━━━━━━━━━━━━━

  当日スタッフがご案内いたします。
  ご不明な点がございましたら公式ホームページ内「CONTACT」よりお問い合わせください。
  https://ei8htplants.onrender.com/contact

  ──────────────────
  ▼ キャンセルはこちら
  https://ei8htplants.onrender.com/cancel?token={キャンセルトークン}
  ※ キャンセルの場合は上記リンクから手続きをお願いします。

  ei8ht plants / Habitat Oides
  https://ei8htplants.onrender.com/events
  ```

### 2.2 WS新規予約通知（habitatoides宛）

- **件名**: `【新規予約】{イベント名} — {お名前} 様`
- **本文**: イベント名、お名前、メール、希望日、時間帯、参加人数、お持ち込み、備考

### 2.3 WS予約キャンセル完了（予約者宛）

- **件名**: `【予約キャンセル完了】{イベント名} — ei8ht plants`
- **本文**: キャンセルしたご予約内容、またのご参加をお待ちしています

### 2.4 WS予約キャンセル通知（habitatoides宛）

- **件名**: `【キャンセル通知】{イベント名} — {お名前} 様`
- **本文**: キャンセルされた予約情報、キャンセル理由

### 2.5 お問い合わせ受付完了（問い合わせ者宛）

- **件名**: `【お問い合わせ受付】{件名} — ei8ht plants`
- **送信元**: `ei8ht plants <ei8htplants@gmail.com>`
- **本文**: 問い合わせ内容の控え

### 2.6 お問い合わせ通知（ei8htplants宛）

- **件名**: `【お問い合わせ】{件名} — {お名前}`
- **本文**: お名前、メール、件名、本文

---

## 3. 送信タイミングと処理方式

```
同期（ユーザーレスポンスを待つ）:
  なし（メール送信はすべてバックグラウンド）

バックグラウンド（_fire で非同期実行）:
  - send_reservation_confirmation    （予約者宛確認）
  - send_reservation_notification    （habitatoides宛通知）
  - send_cancellation_confirmation   （予約者宛キャンセル確認）
  - send_cancellation_notification   （habitatoides宛キャンセル通知）
  - send_contact_confirmation        （問い合わせ者宛確認）
  - send_contact_notification        （ei8htplants宛通知）
```

メール送信が失敗しても予約/問い合わせのデータは Sheets に保存済み。  
エラーは `print()` で Render のログに出力される（ログ確認: Render ダッシュボード → Logs）。

---

## 4. Gmail API 送信の実装

```python
def _send_via_api(refresh_token, sender_email, sender_name, to, subject, body):
    service = _get_gmail_service(refresh_token)
    msg = MIMEText(body, "plain", "utf-8")
    msg["To"] = to
    msg["From"] = formataddr((sender_name, sender_email))
    msg["Subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
```

- 文字コード: UTF-8 プレーンテキスト
- アクセストークンはリクエストごとに `creds.refresh(Request())` で自動更新
