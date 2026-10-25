# PG-04 — Concept

## 概要

ショップのフィロソフィーと3つのSpecialized Linesを紹介する静的ページ。外部APIへのアクセスはなく、各ブランドページへの導線を提供する。

## URL / ルート

`/concept`

## 実装ファイル

`frontend/src/pages/Concept.tsx`

## 使用機能（FT紐付け）

なし（静的コンテンツ）

## 画面レイアウト

```
┌────────────────────────────────────┐
│ ページヘッダー（"CONCEPT"）        │
├────────────────────────────────────┤
│ Philosophy セクション              │
│  ・フィロソフィーテキスト          │
│   「植物は、育てるものであり、     │
│    飾るもの。...」                 │
├────────────────────────────────────┤
│ Specialized Lines セクション       │
│  ┌────────┐┌────────┐┌────────┐    │
│  │ei8ht   ││Habitat ││HUE     │    │
│  │plants  ││ Oides  ││        │    │
│  └────────┘└────────┘└────────┘    │
│  各カードは対応ブランドページへ    │
│  のリンク（hover: 上に移動）       │
└────────────────────────────────────┘
```

## Specialized Lines カード

| ブランド | リンク先 | サブタイトル |
|---|---|---|
| ei8ht plants | `https://ei8htplants.com/ei8htplants` | Agave Specialist |
| Habitat Oides | `https://habitatoides.com/` | Habitat Style Materials & Plants |
| HUE by ei8ht plants | `https://huebyei8htplants.com/` | Color Plants Selection |

- カードはリンクで囲み、各ブランドのドメインへ移動する（ei8ht plants のカードは既存ドメイン内）
- hover時に `translateY(-5px)` で浮き上がるアニメーション
- 「詳しく見る →」テキスト表示

## CSS クラス

- `.brand-line-grid`：3カラムグリッド（`index.css`）

*最終更新: 2026-10-26（ブランドカードのドメイン別リンク先を反映）／2026-10-23（画面図の罫線をそろえた）*
