# PG-01 — Home

## 概要

サイトのトップページ。ブランドロゴのスライドショー、直近イベントカード、ギャラリーマーキー、Instagram導線で構成される。

## URL / ルート

`/`

## 実装ファイル

`frontend/src/pages/Home.tsx`

## 使用機能（FT紐付け）

| 機能ID | 機能名 | 用途 |
|---|---|---|
| [FT-02](../../features/02_APIクライアント.md) | APIクライアント | events.list / gallery.list 呼び出し |
| [FT-03](../../features/03_イベント表示.md) | イベント表示 | `EventCard` で直近イベント1件を表示（isHome / isNext） |
| [FT-04](../../features/04_ギャラリー.md) | ギャラリー | マーキー用ギャラリー画像の取得・横スクロールアニメーション |

## 画面レイアウト

```
┌─────────────────────────────────┐
│ ヘッダー（固定）                │
├─────────────────────────────────┤
│ ヒーロー                        │
│  ・ブランドロゴスライドショー   │
│    （4秒ごと自動切替、フェード）│
│  ・Agave / Habitat Style /      │
│    Color Plants テキスト        │
├─────────────────────────────────┤
│ NEXT EVENT（イベントある場合）  │
│  ・EventCard（isHome）          │
│  ・VIEW ALL EVENTS ボタン       │
├─────────────────────────────────┤
│ GALLERY（画像ある場合）         │
│  ・マーキー横スクロール         │
│  ・VIEW ALL GALLERY ボタン      │
├─────────────────────────────────┤
│ Instagram                       │
│  ・3ブランドのInstagramリンク   │
└─────────────────────────────────┘
```

## データ取得

| データ | API | 条件 |
|---|---|---|
| 直近イベント | `api.events.list(false)` | 開催予定のみ取得後、start_date 昇順ソートで先頭1件 |
| ギャラリー画像 | `api.gallery.list()` | ブランド指定なし（全件） |

- 両方を `useEffect` マウント時に取得
- エラー時は `.catch(() => {})` で無視（表示しないだけ）

## 状態管理

| state | 型 | 説明 |
|---|---|---|
| `nextEvent` | `Event \| null` | 直近イベント（nullの場合セクション非表示） |
| `gallery` | `GalleryImage[]` | マーキー用画像（空の場合セクション非表示） |
| `slideIdx` | number | ヒーローのスライドショー現在インデックス（0-2） |

## ブランドロゴスライドショー

- `SLIDES` 配列（ei8htplants / habitatoides / hue）を4秒ごとにループ
- `setInterval` → `setSlideIdx((i) => (i + 1) % 3)`
- アクティブ以外は `opacity: 0`、アクティブは `opacity: 1`（transition: 1s）

## 画面遷移

| 操作 | 遷移先 |
|---|---|
| VIEW ALL EVENTS クリック | `/events` |
| VIEW ALL GALLERY クリック | `/gallery` |
| Instagram ロゴクリック | 各ブランドのInstagram（外部リンク） |
| EventCard の予約ボタン | `/reserve?event_id={id}` |
