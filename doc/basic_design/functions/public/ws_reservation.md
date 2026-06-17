# 機能設計：WS予約送信

## 概要

予約フォームの送信処理。Sheets への書き込みとメール送信を担う。

---

## 処理フロー

```
POST /reserve
  ↓
フォームデータを reservation_data 辞書に整形
  ↓
await asyncio.to_thread(create_ws_reservation, reservation_data)
  ├── _ensure_cancel_columns(ws)        ← メモ・キャンセル列の自動追加
  ├── token = str(uuid.uuid4())
  ├── data["キャンセルトークン"] = token  ← メール送信時に参照
  └── ws.append_row([...14列...])
  ↓
_fire(asyncio.to_thread(send_reservation_confirmation, reservation_data))
  └── 予約者宛 確認メール + キャンセルリンク（バックグラウンド）
  ↓
_fire(asyncio.to_thread(send_reservation_notification, reservation_data))
  └── habitatoides@gmail.com 宛 通知メール（バックグラウンド）
  ↓
session["reserve_flash"] = "ご予約を受け付けました..."
  ↓
303 Redirect GET /reserve?row=N
  ↓
セッションから reserve_flash を読み、予約完了モーダルを表示
```

---

## 入力データ

| キー | 値の出所 | 説明 |
|---|---|---|
| `イベント名` | `form["event_name"]` | |
| `お名前` | `form["name"]` | |
| `メール` | `form["email"]` | |
| `希望日` | `form["date"]` | YYYY-MM-DD |
| `希望時間帯` | `form["time"]` | HH:MM-HH:MM |
| `参加人数` | `form["participants"]` | |
| `お持ち込み` | `form["bring-pot"]`, `form["bring-plant"]` | チェックされたものをカンマ結合 |
| `備考` | `form["message"]` | |
| `キャンセルトークン` | `create_ws_reservation()` 内で生成 | UUID v4 |

---

## 二重送信防止

フロントエンド（JS）:
```javascript
form.addEventListener('submit', () => {
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
});
```

バックエンド:
- 二重送信しても Sheets に複数行追記されるだけで、データとして残る
- フロント防止が主な対策
