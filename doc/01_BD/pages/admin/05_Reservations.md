# PG-A05 — WS予約管理（Admin）

## 概要

ワークショップ予約の一覧と、ステータスのインライン変更を行う管理画面。イベント単位でのフィルタリングとPDF印刷に対応。

## URL / ルート

`/admin/reservations`

## 実装ファイル

`frontend/src/pages/admin/Reservations.tsx`

## 使用機能（FT紐付け）

| 機能ID | 機能名 | 用途 |
|---|---|---|
| [FT-01](../../features/01_認証.md) | 認証 | AdminLayout による認証ガード |
| [FT-02](../../features/02_APIクライアント.md) | APIクライアント | `api.reserve.list()` / `api.reserve.updateStatus()` / `api.events.list()` / `api.events.getSessions()` |
| [FT-11](../../features/11_予約ステータス管理.md) | 予約ステータス管理 | ステータスバッジ・インライン更新 |

## 画面レイアウト

```
┌──────────────────────────────────────────────────────────────┐
│ WS予約一覧                                                    │
│                                                              │
│ イベント: [すべて           ▼]   [PDF で印刷]（フィルタ時のみ）│
│ N 件 / 合計 N 名                                              │
├──────┬──────┬──────────┬──────┬───────┬──────┬────────────┤
│受付日│お名前│メール     │電話  │WSセッション│人数│備考│ステータス│
├──────┼──────┼──────────┼──────┼───────┼──────┼────────────┤
│ 日付 │ 名前 │ mail@...  │ -    │10:00〜│ 2 │ - │[未確認▼]  │
│ 日付 │ 名前 │ mail@...  │ 電話 │12:00〜│ 1 │備考│[確認済▼]  │
└──────┴──────┴──────────┴──────┴───────┴──────┴────────────┘
```

- `eventFilter === 'all'` の場合、先頭に「イベント」列を追加表示
- 予約は `preferred_date` → `preferred_time` の順でソート（日時昇順）

## 状態管理

| state | 型 | 初期値 | 説明 |
|---|---|---|---|
| `reservations` | `Reservation[]` | `[]` | 全予約一覧（`created_at` 降順で取得） |
| `updating` | `string \| null` | `null` | 更新中の予約ID（重複更新防止） |
| `eventsMap` | `Map<string, string>` | `new Map()` | event_id → イベント名 |
| `eventsDataMap` | `Map<string, Event>` | `new Map()` | event_id → Event オブジェクト |
| `sessionsData` | `Map<string, WsSession>` | `new Map()` | session_id → WsSession |
| `eventFilter` | `string` | `'all'` | フィルター対象 event_id（'all' で全件） |

## 初期データ取得フロー

```
マウント時:
    1. api.events.list(false) + api.events.list(true) を並列取得
       → eventsMap + eventsDataMap を構築
    2. 各イベントの getSessions() を並列で実行
       → sessionsData (session_id → WsSession) を構築
    3. api.reserve.list() で全予約を取得
```

## PDF 印刷フロー

「PDF で印刷」ボタンは `eventFilter !== 'all'` かつ `filtered.length > 0` の場合のみ表示。

```
printReservations(filtered, eventName, sessionsData, eventObj):
    新規ウィンドウで HTML を生成
    onload 時に window.print() を呼び出し

    セッションありイベント:
        getDateRange(start_date, end_date) で全日付を生成
        日付 × セッション でループ
        ・予約行（confirmed / pending / その他 で色付き）
        ・空枠行（破線、max_participants - reservedCount 行）
        reservedCount = sessionRows.reduce((s, r) => s + r.participants, 0)
        最初の日付ヘッダーは break-before: auto
        2日目以降は break-before: page（@media print）

    セッションなしイベント:
        予約行をそのまま列挙
```

## 詳細は [FT-11 予約ステータス管理](../../features/11_予約ステータス管理.md) を参照
