# PG-02 — Events

## 概要

開催予定イベントの一覧ページ。全イベントをグリッドレイアウトで表示し、各カードでイベント詳細・予約導線を提供する。ブランド・月・Workshop有無でのフィルタリングに対応。

## URL / ルート

`/official/events` — 開催予定
`/official/events?page=past` — 過去のイベント

## 実装ファイル

`frontend/src/pages/Events.tsx`

## 使用機能（FT紐付け）

| 機能ID | 機能名 | 用途 |
|---|---|---|
| [FT-02](../../features/02_APIクライアント.md) | APIクライアント | `api.events.list(false/true)` 呼び出し |
| [FT-03](../../features/03_イベント表示.md) | イベント表示 | `EventPreview` で各イベントを表示 |

## 画面レイアウト

```
┌──────────────────────────────────────────────────┐
│ ページヘッダー                                   │
│  ・"Events" または "Past Events"                 │
├──────────────────────────────────────────────────┤
│ フィルターバー（イベントあり時）                 │
│                                                  │
│  [PC版 .filter-pc]                               │
│  ・Brand: ボタン行                               │
│  ・Month: ボタン行（複数月時）                   │
│  ・WS: "Workshop 開催" ボタン                    │
│  ・"フィルターをリセット ×"                      │
│                                                  │
│  [モバイル版 .filter-mobile]                     │
│  ・Brand: <select> プルダウン                    │
│  ・Month: <select> プルダウン                    │
│  ・WS: チェックボックス                          │
│  ・"フィルターをリセット ×"                      │
├──────────────────────────────────────────────────┤
│ イベントグリッド（.events-grid）                 │
│  ┌──────┐ ┌──────┐ ┌──────┐                      │
│  │ Card │ │ Card │ │ Card │                      │
│  └──────┘ └──────┘ └──────┘                      │
│  ・読み込み中は「読み込み中...」                 │
│  ・失敗したら「読み込めませんでした」と再読み込み│
│  ・0件: 「予定されているイベントはありません。」 │
│    （過去は「過去のイベントはありません。」）    │
│  ・絞り込み後0件:                                │
│    「条件に一致するイベントはありません。」      │
├──────────────────────────────────────────────────┤
│ [過去のイベントを見る] / [現在のイベントを見る]  │
└──────────────────────────────────────────────────┘
```

## データ取得

| データ | API |
|---|---|
| イベント一覧 | `api.events.list(isPast)` |

- マウント時 + `isPast` 変化時に取得（共通のフック `useApi`。切り替える前の古い応答が後から届いても捨てる。2026-10-22 変更）
- 読み込み中は「読み込み中...」（英語表示では「Loading...」）。失敗したときは「読み込めませんでした」の案内と再読み込みのボタン（`LoadError`）を出し、「予定されているイベントはありません。」（過去のイベントでは「過去のイベントはありません。」）とは出さない。絞り込みの結果が0件のときは「条件に一致するイベントはありません。」
- フィルタ変更時はリフェッチしない（クライアントサイドフィルタ）

## 状態管理

| state | 型 | 初期値 | 説明 |
|---|---|---|---|
| `data`・`loading`・`error` | `useApi` の戻り値 | — | 取得したイベント一覧・読み込み中か・失敗の内容（2026-10-22 に `useApi` にまとめた） |
| `brandFilter` | `string \| null` | `null` | 選択中ブランド（null=全件） |
| `monthFilter` | `string \| null` | `null` | 選択中の月（`YYYY-MM` の形。null=全件）。2026-10-22 変更。それまでは表示中の言語の月の文字（「2026年5月」など）で持っていたため、月を選んだあとに言語を切り替えると一致しなくなっていた |
| `workshopFilter` | `boolean \| null` | `null` | Workshop フィルタ（null=全件、true=WS開催のみ） |

## 派生値（useMemo）

| 変数 | 説明 |
|---|---|
| `sorted` | 開催予定は日付昇順（今日に近い順）、過去は日付降順 |
| `months` | `sorted` から一意な月（`YYYY-MM`。`lib/localDate.ts` の `monthKey`）を抽出した配列。ボタン・選択肢には `formatMonthKey` で日本語は「2026年5月」、英語は「May 2026」と出す |
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
| 「詳細を見る」ボタンクリック（EventPreview内） | `/official/events/{slug}` または `/official/events/{id}` |
| 予約ボタンクリック（EventPreview内） | `/official/reserve?event_id={id}` |
| 公式URLクリック | 外部サイト（新しいタブ） |
| 住所クリック | Google Maps（新しいタブ） |
| 「過去のイベントを見る」 | `/official/events?page=past` |
| 「現在のイベントを見る」 | `/official/events` |

*最終更新: 2026-10-23（画面図の罫線をそろえ、0件・絞り込み後0件の文言を実際の文言にした）／2026-10-22（読み込み・失敗の表示と useApi、月の絞り込みの持ち方を今のコードに合わせた）*
