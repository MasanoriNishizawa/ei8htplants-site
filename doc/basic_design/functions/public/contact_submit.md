# 機能設計：お問い合わせ送信

## 概要

お問い合わせフォームの送信処理。Sheets への記録とメール送信。

---

## 処理フロー

```
POST /contact
  ↓
フォームデータを整形
  { name, email, subject, message }
  ↓
await asyncio.to_thread(create_contact, data)
  └── お問い合わせシートに追記
  ↓
_fire(asyncio.to_thread(send_contact_notification, data))
  └── ei8htplants@gmail.com 宛 内容通知（バックグラウンド）
  ↓
_fire(asyncio.to_thread(send_contact_confirmation, data))
  └── 問い合わせ者宛 受付確認（バックグラウンド）
  ↓
303 Redirect /contact?sent=1
```

---

## Sheets への書き込み

| 列 | 内容 |
|---|---|
| タイムスタンプ | JST の現在日時 |
| お名前 | `data["name"]` |
| メール | `data["email"]` |
| 件名 | `data["subject"]` |
| メッセージ | `data["message"]` |
