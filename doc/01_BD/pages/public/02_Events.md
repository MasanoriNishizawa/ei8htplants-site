# PG-02 — Events

## 概要

開催予定イベントの一覧ページ。全イベントをグリッドレイアウトで表示し、各カードでイベント詳細・予約導線を提供する。ブランド・月・Workshop有無でのフィルタリングに対応。

## URL / ルート

`/events` — 開催予定  
`/events?page=past` — 過去のイベント

## 実装ファイル

`frontend/src/pages/Events.tsx`

## 使用機能（FT紐付け）

| 機能ID | 機能名 | 用途 |
|---|---|---|
| [FT-02](../../features/02_APIクライアント.md) | APIクライアント | `api.events.list(false/true)` 呼び出し |
| [FT-03](../../features/03_イベント表示.md) | イベント表示 | `EventPreview` で各イベントを表示 |

## 画面レイアウト

```
┌─────────────────────────────────┐
│ ページヘッダー                  │
│  ・"EVENTS" または "Past Events"│
├─────────────────────────────────┤
│ フィルターバー（イベントあり時）│
│                                 │
│  [PC版 .filter-pc]              │
│  ・Brand: ボタン行              │
│  ・Month: ボタン行（複数月時）  │
│  ・WS: "Workshop 開催" ボタン   │
│  ・"フィルターをリセット ×"     │
│                                 │
│  [モバイル版 .filter-mobile]    │
│  ・Brand: <select> プルダウン   │
│  ・Month: <select> プルダウン   │
│  ・WS: チェックボックス         │
│  ・"フィルターをリセット ×"     │
├─────────────────────────────────┤
│ イベントグリッド（.events-grid）│
│  ┌──────┐ ┌──────┐ ┌──────┐   │
│  │ Card │ │ Card │ │ Card │   │
│  └──────┘ └──────┘ └──────┘   │
│  ・ローディング中は「読み込み中」│
│  ・0件の場合は「予定はありません」│
│  ・フィルタ後0件:「条件に一致するイベントはありません」│
├─────────────────────────────────┤
│ [過去のイベントを見る] / [現在のイベントを見る] ボタン│
└─────────────────────────────────┘
```

## データ取得

| データ | API |
|---|---|
| イベント一覧 | `api.events.list(isPast)` |

- マウント時 + `isPast` 変化時に取得
- `setLoading(true/false)` でローディング制御
- フィルタ変更時はリフェッチしない（クライアントサイドフィルタ）

## 状態管理

| state | 型 | 初期値 | 説明 |
|---|---|---|---|
| `events` | `Event[]` | `[]` | 取得したイベント一覧 |
| `loading` | `boolean` | `true` | ローディング中フラグ |
| `brandFilter` | `string \| null` | `null` | 選択中ブランド（null=全件） |
| `monthFilter` | `string \| null` | `null` | 選択中の月ラベル（null=全件） |
| `workshopFilter` | `boolean \| null` | `null` | Workshop フィルタ（null=全件、true=WS開催のみ） |

## 派生値（useMemo）

| 変数 | 説明 |
|---|---|
| `sorted` | 開催予定は日付昇順（今日に近い順）、過去は日付降順 |
| `months` | `sorted` から一意な月ラベル（"YYYY年M月"）を抽出した配列 |
| `filtered` | `sorted` にブランド・月・WS フィルタを適用した配列 |
| `hasFilter` | いずれかのフィルタが null 以外なら `true` |

## フィルター実装

PC (`display: flex`) / モバイル (`display: none`) を CSS クラスで切り替える。

```css
/* index.css */
.filter-pc     { display: flex; flex-direction: column; gap: 10px; }
.filter-mobile { display: none; }

@media (max-width: 719px) {
  .filter-pc     { display: none; }
  .filter-mobile { display: flex; flex-direction: column; gap: 12px; }
}
```

## CSS

- グリッドレイアウト：`.events-grid`（`index.css` に定義）
- レスポンシブ：モバイルで1カラム、デスクトップで複数カラム

## 画面遷移

| 操作 | 遷移先 |
|---|---|
| 予約ボタンクリック（EventCard内） | `/reserve?event_id={id}` |
| 公式URLクリック | 外部サイト（新しいタブ） |
| 「過去のイベントを見る」 | `/events?page=past` |
| 「現在のイベントを見る」 | `/events` |
