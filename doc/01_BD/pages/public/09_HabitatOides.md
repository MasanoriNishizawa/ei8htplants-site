# PG-09 — Habitat Oides

## 概要

Habitat Oides 専用ドメインの独立ホームページ。ei8ht plants の共通テーマは使わず、風景・素材・植物をテーマにした独自の文章、写真、配色、レイアウトでブランドを紹介する。

## URL / ルート

`https://habitatoides.com/`（以前の `https://ei8htplants.com/habitatoides` は301転送）

## 実装ファイル

`frontend/src/pages/brands/HabitatOides.tsx`

## 使用機能（FT紐付け）

| 機能ID | 機能名 | 用途 |
|---|---|---|
| [FT-27](../../features/16_ブランド別ドメインとサイト表示.md) | ブランド別ドメインとサイト表示 | 独立ホーム、専用ヘッダー・フッター、ブランド切替 |

専用ヘッダーはロゴ、Concept / Workshop / Collaboration のリンク、他ブランドへの切替リンク、言語切替を表示する。フッターにもブランド切替リンクがあり、他ブランドへは新しいタブで移動する。

| ヘッダー項目 | 実際のリンク先 | 動作 |
|---|---|---|
| Concept | `/#world` | トップページの `id="world"`（Our Point of View）へ移動 |
| Workshop | `/#workshop` | トップページの Workshop セクションへ移動 |
| Collaboration | `/collaborations` | Habitat Oides のコラボレーション一覧へ移動 |

## セクション構成

| セクションID | ラベル | 内容 |
|---|---|---|
| `world` | Our Point of View | ハビタットスタイルの考え方・写真 |
| （IDなし） | The Elements | 植物・石と砂・鉢を紹介する3つのカード |
| `workshop` | Make Your Own Landscape | 制作写真とワークショップ詳細ページへのリンク |
| `collaboration` | Collaborations | コラボレーションの紹介文・動画・一覧リンク |
| （IDなし） | Follow the Landscape | Instagram へのリンク |

## 画面レイアウト

```
┌─────────────────────────────────────┐
│ 専用ヘッダー（濃紺、ロゴ・サイト内リンク・ブランド切替）│
│ ヒーロー（風景写真、コピー、Workshop CTA）            │
├─────────────────────────────────────┤
│ Our Point of View（説明・写真）     │
├─────────────────────────────────────┤
│ The Elements（植物・石と砂・鉢）   │
├─────────────────────────────────────┤
│ Workshop CTA（写真・説明・詳細リンク）│
├─────────────────────────────────────┤
│ Collaborations（紹介・動画・一覧リンク）│
├─────────────────────────────────────┤
│ Follow the Landscape（Instagram）   │
├─────────────────────────────────────┤
│ 専用フッター（ブランド切替は新しいタブ）│
└─────────────────────────────────────┘
```

このホームのスタイルは `frontend/src/index.css` の `.habitat-home` 系クラスで定義する。旧版にあった音量スライダー付きの縦動画ページとは構成が異なる。

## 画面遷移

| 操作 | 遷移先 |
|---|---|
| 「Workshop について →」 | `/workshop`（habitatoides.com 内） |
| 「View all collaborations →」 | `/collaborations`（habitatoides.com 内） |
| 「@habitatoides →」 | Instagram（外部リンク） |

*最終更新: 2026-10-26（独立ホームの内容・ビジュアル、専用ヘッダー／フッターを反映）／2026-10-26（Habitat Oides 独立ドメインのURLとページ内リンクを反映）／2026-10-23（画面図の罫線をそろえた）*
