# PG-A10 — 記事管理（admin/Articles）

**URL**: `/admin/articles`  
**レイアウト**: `AdminLayout`（要認証）  
**機能**: FT-14

---

## 画面概要

ジャーナル記事のCRUD管理ページ。一覧と編集モーダルで構成。

---

## 一覧

- タイトル・公開日・タグ・公開状態を一覧表示
- 編集 / 削除ボタン

---

## 編集モーダル

| フィールド | 型 | 備考 |
|---|---|---|
| タイトル | テキスト | 必須 |
| 本文 | BlockEditor | heading/text/image ブロック |
| タグ | テキスト + Enter追加 | フィルタリング用 |
| 公開日時 | datetime-local | 設定しない場合は非公開 |
| 関連商品 | 商品IDチェックボックス | 記事末尾に商品リンクとして表示 |

---

## 特記事項

- `content` は BlockEditor JSON 文字列
- `image_urls` は BlockEditor の image ブロック URL を自動抽出
- 関連商品は `article_product_links` 中間テーブルで管理
- `product_ids` として記事APIレスポンスに含まれ、JournalArticle 公開ページで商品カードを末尾に表示
