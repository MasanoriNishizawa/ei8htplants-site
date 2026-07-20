# PG-09 — Habitat Oides

## 概要

Habitat Oides ブランドページ。ハビタットスタイルのコンセプト、ワークショップ案内、コラボレーション動画を提供する。

## URL / ルート

`/habitatoides`

## 実装ファイル

`frontend/src/pages/brands/HabitatOides.tsx`

## 使用機能（FT紐付け）

| 機能ID | 機能名 | 用途 |
|---|---|---|
| [FT-07](../../features/07_ブランドサブナビゲーション.md) | ブランドサブナビゲーション | concept / workshop / collaboration セクション連動ナビ |

## セクション構成

| セクションID | ラベル | 内容 |
|---|---|---|
| `concept` | Concept | ハビタットスタイルの説明文・ロゴ画像 |
| `workshop` | Workshop | ワークショップ紹介カード・詳細ページリンク |
| `collaboration` | Collaboration | コラボ動画・音量スライダー・全件表示リンク |

## 画面レイアウト

```
┌─────────────────────────────────┐
│ ヒーロー（.ho-hero、ダークブルー）│
│  ・サブナビ（concept/workshop/  │
│    collaboration）              │
│  ・スクロールヒントライン       │
├─────────────────────────────────┤
│ Concept セクション              │
│  ┌──────────┬─────────────────┐ │
│  │ロゴ画像  │ "Habitat Style  │ │
│  │          │  Materials &    │ │
│  │          │  Plants"        │ │
│  └──────────┴─────────────────┘ │
├─────────────────────────────────┤
│ Workshop セクション             │
│  ┌──────────────────────────────┐│
│  │ ダークブルー装飾エリア       ││
│  │ + テキスト + リンクボタン    ││
│  └──────────────────────────────┘│
├─────────────────────────────────┤
│ Collaboration セクション（紺）  │
│  ・縦動画（9:16）               │
│  ・音量スライダー（0〜100%）    │
│  ・「View all collaborations →」│
├─────────────────────────────────┤
│ Follow Us セクション（紺）      │
│  ・@habitatoides Instagram リンク│
└─────────────────────────────────┘
```

## 状態管理

| state | 型 | 説明 |
|---|---|---|
| `active` | string | アクティブセクションID（サブナビ用） |
| `volume` | number | 動画音量（0-100） |

## 動画音量スライダー

```
<input type="range" min=0 max=100>
    → videoRef.current.volume = val / 100
    → videoRef.current.muted = val === 0
```

- 初期状態はミュート（volume=0）
- スライダーを動かすと音量変更

## 画面遷移

| 操作 | 遷移先 |
|---|---|
| 「Workshop について →」 | `/habitatoides/workshop` |
| 「View all collaborations →」 | `/collaborations` |
| 「@habitatoides →」 | Instagram（外部リンク） |
