# 機能設計：残席確認 API

## 概要

WS予約フォームが日付・時間帯の変更ごとに呼び出す残席確認 API。  
最大定員 `WS_MAX_PARTICIPANTS = 4` に対し、現在の有効予約人数合計を引いて残席を返す。

---

## 処理フロー

```
GET /api/reserve/availability?event_name=X&date=Y&time=Z

get_ws_reservation_count(event_name, date, time_slot)
  → ws.get_all_values()           ← ヘッダー含む全行
  → headers[0] から "キャンセル済み" 列インデックスを特定
  → 各データ行を走査:
      ・B列（イベント名）== event_name
      ・E列（希望日）== date（/とーのどちらでも正規化）
      ・F列（希望時間帯）== time_slot
      ・K列（キャンセル済み）!= "TRUE"
      → G列（参加人数）を加算
  → sum を返す

available = max(0, 4 - sum)
return {"available": available, "max": 4}
```

---

## フロントエンド側の使い方

```javascript
// 日付 or 時間帯が変わるたびに呼び出す
async function updateAvailability() {
  const params = new URLSearchParams({
    event_name, date, time
  });
  const res = await fetch(`/api/reserve/availability?${params}`);
  const { available } = await res.json();

  // 参加人数セレクトを 1〜available で再生成
  select.innerHTML = '';
  for (let i = 1; i <= available; i++) {
    select.appendChild(new Option(`${i}名`, i));
  }
  // available === 0 のとき「満席」表示
}
```

---

## エラー時の動作

Sheets API エラー発生時:
```json
{ "available": 4, "max": 4, "error": "..." }
```
安全側に最大人数を返す（ユーザーが予約できなくなるのを避ける）。
