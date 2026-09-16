# PG-A14 — 収支一覧（Admin）

## 概要

全イベントの収支を一覧表示する管理画面。合計サマリーと各イベントの売上・支出・収支を表示し、イベント別収支編集へのリンクを提供する。

## URL / ルート

`/admin/finances`

## 実装ファイル

`frontend/src/pages/admin/Finances.tsx`

## 使用機能（FT紐付け）

| 機能ID | 機能名 | 用途 |
|---|---|---|
| [FT-01](../../features/01_認証.md) | 認証 | AdminLayout による認証ガード |
| [FT-02](../../features/02_APIクライアント.md) | APIクライアント | events 系・finances 系API呼び出し |
| [FT-23](../../features/23_収支一覧.md) | 収支一覧 | 全イベント収支表示・合計計算 |

## 画面レイアウト

```
┌─────────────────────────────────────────────────────┐
│ 収支一覧                                             │
├─────────────────────────────────────────────────────┤
│ ┌─ サマリーカード ──────────────────────────────┐   │
│ │  売上合計: ¥xxx,xxx                           │   │
│ │  支出合計: ¥xxx,xxx                           │   │
│ │  収支合計: ¥xxx,xxx                           │   │
│ └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  イベント名  │  開催日  │  売上   │  支出   │  収支   │  編集 │
│─────────────────────────────────────────────────────│
│  イベントA  │ 2024-05 │ ¥50,000 │ ¥20,000 │ ¥30,000 │  [編集] │
│  イベントB  │ 2024-04 │  -     │  -     │  -     │  [編集] │
└─────────────────────────────────────────────────────┘
```

## データ取得フロー

```
マウント時:
    1. api.events.list(false) + api.events.list(true) を並列取得
    2. 各イベントの api.finance.get(id) を並列取得
       → 収支未入力のイベントは null
    3. computeFinances(fin, hasWorkshop) で各イベントの収支を計算
    4. 全イベントの合計を算出しサマリーに表示
```

## computeFinances の仕様

`frontend/src/lib/api.ts` の `computeFinances` 関数で計算。

| フィールド | 計算式 |
|---|---|
| transport（移動費） | `round((distance × 2 / 10) × gas_price)` |
| totalExpense（支出合計） | `booth_fee + transport + expressway_toll + accommodation + other_expenses` |
| wsSales（WS売上） | `has_workshop ? ws_participants × 1000 : 0` |
| salesShare | `round(max(0, sales - wsSales - totalExpense) × 0.2)`（payment_flag 時のみ） |
| wsShare | `round(wsSales × 0.7)`（payment_flag 時のみ） |
| paymentAmount（手伝い支払い金額） | `salesShare + wsShare`（payment_flag 時のみ） |
| net（収支） | `sales - totalExpense - paymentAmount` |

## 各行の表示

- 収支データあり: 売上・支出合計・収支を金額表示
- 収支データなし: 各列をグレー「-」で表示
- 「編集」ボタン: `/admin/events/{id}/finances` へ遷移

## 詳細は [FT-12 イベント管理](../../features/12_イベント管理.md) / [PG-A08 イベント収支管理](08_EventFinance.md) を参照
