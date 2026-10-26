# PG-08 — ei8ht plants

## 概要

ei8ht plants ブランドページ。アガベ専門ラインのコンセプトとオンラインストアへの導線を提供する。

## URL / ルート

- `/` — ブランドトップ（ei8htplants.com）
- `/about` — Our Story
- `/plants` — 植物のライン
- `/ei8htplants` — `/` へ転送

## 実装ファイル

`frontend/src/pages/brands/Ei8htPlants.tsx`（トップ）、`Ei8htPlantsAbout.tsx`、`Ei8htPlantsPlants.tsx`

## 使用機能（FT紐付け）

| 機能ID | 機能名 | 用途 |
|---|---|---|
| [FT-27](../../features/16_ブランド別ドメインとサイト表示.md) | ブランド別ドメインとサイト表示 | `/` をブランドトップ、公式サイトを `/official` 配下に分離 |

## ページ構成

| パス | ページ | 主な内容 |
|---|---|---|
| `/` | ブランドトップ | ブランドの世界観・代表ビジュアル・ブランド内外への導線 |
| `/about` | Our Story | ブランド紹介、考え方、育てる・選ぶ・暮らすのアプローチ |
| `/plants` | Plants | アガベ、塊根植物、灌木・樹木、多肉植物のライン紹介 |

## 画面レイアウト

```
┌─────────────────────────────────┐
│ ブランド専用ヘッダー             │
│  Home / Our Story / Plants       │
│  Habitat Oides / HUE / Shop      │
│  Official Site / 言語切替        │
├─────────────────────────────────┤
│ Ei8htPlants ブランドトップ       │
├─────────────────────────────────┤
│ /about — ストーリーと考え方      │
├─────────────────────────────────┤
│ /plants — 植物ライン             │
└─────────────────────────────────┘
```

## CSS クラス

- ブランド用スタイル：`frontend/src/index.css` の `.ep-*` 系クラス

## 画面遷移

| 操作 | 遷移先 |
|---|---|
| Home / ロゴ | `/` |
| Our Story | `/about` |
| Plants | `/plants` |
| Shop | `/official/shop` |
| Official Site | `/official` |
| 他ブランド | 各ブランドの専用ドメイン（新しいタブ） |

*最終更新: 2026-10-27（ブランドトップを `/` に移し、複数ページと公式サイト `/official` を反映）*
