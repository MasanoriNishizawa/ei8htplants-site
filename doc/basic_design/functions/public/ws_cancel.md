# 機能設計：予約キャンセル

## 概要

メール内のキャンセルリンクからアクセスし、予約をキャンセルする機能。  
顧客自身と管理者の両方からキャンセル可能。

---

## キャンセルトークンの仕組み

```
予約作成時:
  token = str(uuid.uuid4())
  WS予約シートの J 列に書き込み
  確認メールに埋め込み:
    https://ei8htplants.onrender.com/cancel?token=<token>

キャンセル時:
  token で J 列を線形検索 → 行番号特定
  K列（キャンセル済み）= "TRUE"
  L列（キャンセル理由）= reason
  M列（キャンセル日時）= JST now
```

---

## 処理フロー（顧客からのキャンセル）

```
GET /cancel?token=xxx
  → get_reservation_by_token(token)
  → 表示状態を決定（4パターン）

POST /cancel
  → reservation = await get_reservation_by_token(token)  ← キャンセル前に取得
  → await cancel_reservation(token, reason)
  → _fire(send_cancellation_confirmation(reservation, reason))
  → _fire(send_cancellation_notification(reservation, reason))
  → 303 Redirect /cancel?token=xxx&done=1
```

---

## 処理フロー（管理者からのキャンセル）

```
POST /admin/reservations/cancel
  → reservation = await get_reservation_by_token(token)
  → await cancel_reservation(token, "管理者によるキャンセル処理")
  → _fire(send_cancellation_confirmation(reservation, reason))
  → _fire(send_cancellation_notification(reservation, reason))
  → 302 Redirect /admin/reservations
```

---

## `cancel_reservation()` の実装

```python
col_vals = ws.col_values(token_col)   # J列の全値を取得
for i, val in enumerate(col_vals[1:], start=2):
    if val == token:
        ws.update_cell(i, done_col, "TRUE")
        ws.update_cell(i, reason_col, reason)
        ws.update_cell(i, dt_col, JST_now)
        return True
return False
```

---

## キャンセル後の影響

| 影響先 | 変化 |
|---|---|
| 残席計算 | キャンセル済み行は `get_ws_reservation_count()` で除外される |
| 管理画面サマリー | キャンセル済み人数はカウントされない |
| 管理画面一覧 | `キャンセル済み = TRUE` の行は薄く表示、バッジが表示される |
