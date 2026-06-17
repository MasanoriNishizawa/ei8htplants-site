# 機能設計：予約管理（一覧・メモ・キャンセル・履歴・予約表）

## 概要

管理画面からのWS予約データの参照・操作機能全般。

---

## 予約一覧取得

```
GET /admin/reservations?event=xxx&exclude_cancelled=1

get_all_ws_reservations_for_admin()
  → ws.get_all_values()
  → 各行に _row（シート行番号）を付与
  → タイムスタンプ降順でソート

フィルタリング:
  1. event が指定されていれば イベント名 == event の行のみ
  2. exclude_cancelled=1 なら キャンセル済み != "TRUE" の行のみ

サマリーカード用の分類:
  get_all_events_for_admin() で終了日マップを作成
  終了日 >= today → active_totals（終了日昇順）
  終了日 < today  → past_ws_events（終了日降順）
```

---

## メモ保存（AJAX）

```
POST /admin/reservations/memo
  Content-Type: application/x-www-form-urlencoded
  row=N&memo=テキスト

update_reservation_memo(row_num, memo)
  → headers = ws.row_values(1)
  → "メモ" 列のインデックスを特定
  → ws.update_cell(row_num, memo_col, memo)

レスポンス: {"ok": true}
```

フロントエンド:
```javascript
fetch('/admin/reservations/memo', { method: 'POST', body: params })
  .then(() => { btn.textContent = '保存済'; /* 2秒後に戻す */ });
```

---

## キャンセル処理

```
POST /admin/reservations/cancel
  token=<UUID>

1. reservation = await get_reservation_by_token(token)
2. await cancel_reservation(token, "管理者によるキャンセル処理")
3. _fire(send_cancellation_confirmation(reservation, reason))  ← 予約者宛
4. _fire(send_cancellation_notification(reservation, reason))  ← habitatoides宛
5. 302 Redirect /admin/reservations
```

---

## 参加履歴表示

```
GET /admin/reservations/history?email=xxx

get_all_ws_reservations_for_admin()
  → メールアドレスでフィルタ
  → テンプレートにそのまま渡す（ソート順はタイムスタンプ降順のまま）
```

---

## 予約表表示

```
GET /admin/reservations/schedule?event=xxx

get_all_ws_reservations_for_admin()
  → イベント名 == event かつ キャンセル済み != "TRUE" でフィルタ
  → defaultdict で 希望時間帯 ごとにグループ化
  → sorted(groups.items()) で昇順ソート
  → テンプレートに渡す
```
