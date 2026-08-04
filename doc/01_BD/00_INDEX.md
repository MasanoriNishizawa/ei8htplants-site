# 基本設計書（BD） — インデックス

## 設計書

| ファイル | 内容 |
|---|---|
| [01_システム構成.md](01_システム構成.md) | アーキテクチャ・技術スタック・環境変数・デプロイ |
| [02_画面遷移図.md](02_画面遷移図.md) | 画面遷移・ルーティング・レイアウト構造 |
| [03_論理データモデル.md](03_論理データモデル.md) | 概念ER図・エンティティ定義・関係性 |
| [04_インターフェース設計.md](04_インターフェース設計.md) | 外部システム連携（Supabase/Resend/Square/Instagram） |
| [05_バッチ処理一覧.md](05_バッチ処理一覧.md) | バッチ処理なし・手動運用作業の記録 |

---

# 機能設計書 — インデックス

## ページ設計書

### 公開ページ

| ID | ファイル | URL | 使用機能 |
|---|---|---|---|
| PG-01 | [Home](pages/public/01_Home.md) | `/` | FT-03, FT-04 |
| PG-02 | [Events](pages/public/02_Events.md) | `/events` | FT-03 |
| PG-03 | [Gallery](pages/public/03_Gallery.md) | `/gallery` | FT-04 |
| PG-04 | [Concept](pages/public/04_Concept.md) | `/concept` | — |
| PG-05 | [Contact](pages/public/05_Contact.md) | `/contact` | FT-05 |
| PG-06 | [Stockists](pages/public/06_Stockists.md) | `/stockists` | FT-10 (read) |
| PG-07 | [Collaborations](pages/public/07_Collaborations.md) | `/collaborations` | FT-08 (read) |
| PG-08 | [ei8ht plants](pages/public/08_Ei8htPlants.md) | `/ei8htplants` | FT-07 |
| PG-09 | [Habitat Oides](pages/public/09_HabitatOides.md) | `/habitatoides` | FT-07 |
| PG-10 | [HabitatOides Workshop](pages/public/10_HabitatOidesWorkshop.md) | `/habitatoides/workshop` | FT-07 |
| PG-11 | [HUE](pages/public/11_Hue.md) | `/hue` | FT-07 |
| PG-12 | [Reserve](pages/public/12_Reserve.md) | `/reserve` | FT-06 |
| PG-13 | [予約キャンセル](pages/public/13_CancelReservation.md) | `/cancel` | FT-06 |
| PG-14 | [Shop](pages/public/14_Shop.md) | `/shop` | FT-13 |
| PG-15 | [ShopProduct](pages/public/15_ShopProduct.md) | `/shop/:id` | FT-13 |
| PG-16 | [Checkout](pages/public/16_Checkout.md) | `/checkout` | FT-13 |
| PG-17 | [OrderComplete](pages/public/17_OrderComplete.md) | `/order/complete` | FT-13 |
| PG-18 | [Journal](pages/public/18_Journal.md) | `/journal` | FT-14 |
| PG-19 | [JournalArticle](pages/public/19_JournalArticle.md) | `/journal/:id` | FT-14 |
| PG-20 | [EventSite](pages/public/20_EventSite.md) | `/events/:id` | FT-03 |
| PG-21 | [LegalPage](pages/public/21_LegalPage.md) | `/legal` | — |

### 管理ページ（要認証）

| ID | ファイル | URL | 使用機能 |
|---|---|---|---|
| PG-A01 | [Dashboard](pages/admin/01_Dashboard.md) | `/admin` | FT-01 |
| PG-A02 | [イベント管理](pages/admin/02_Events.md) | `/admin/events` | FT-01, FT-12 |
| PG-A03 | [ギャラリー管理](pages/admin/03_Gallery.md) | `/admin/gallery` | FT-01, FT-04 |
| PG-A04 | [取扱店管理](pages/admin/04_Stockists.md) | `/admin/stockists` | FT-01, FT-10 |
| PG-A05 | [WS予約管理](pages/admin/05_Reservations.md) | `/admin/reservations` | FT-01, FT-11 |
| PG-A06 | [コラボレーション管理](pages/admin/06_Collaborations.md) | `/admin/collaborations` | FT-01, FT-08 |
| PG-A07 | [お問い合わせ管理](pages/admin/07_Contacts.md) | `/admin/contacts` | FT-01, FT-09 |
| PG-A08 | [商品管理](pages/admin/08_Products.md) | `/admin/products` | FT-01, FT-13 |
| PG-A09 | [注文管理](pages/admin/09_Orders.md) | `/admin/orders` | FT-01, FT-13 |
| PG-A10 | [記事管理](pages/admin/10_Articles.md) | `/admin/articles` | FT-01, FT-14 |
| PG-A11 | イベント収支管理 | `/admin/events/:id/finances` | FT-01, FT-12 |
| PG-A12 | イベント予約一覧 | `/admin/events/:id/reservations` | FT-01, FT-11 |
| PG-A13 | イベントサイト編集 | `/admin/events/:id/site` | FT-01, FT-12 |

---

## 機能設計書

| ID | ファイル | 機能名 | 使用ページ |
|---|---|---|---|
| FT-01 | [認証](features/01_認証.md) | Supabase Auth ログイン・セッション管理 | PG-A01〜PG-A13（AdminLayout共通） |
| FT-02 | [APIクライアント](features/02_APIクライアント.md) | `lib/api.ts` リクエスト処理・型定義 | 全ページ |
| FT-03 | [イベント表示](features/03_イベント表示.md) | EventPreview レンダリング・画像スライドショー・EventSite | PG-01, PG-02, PG-20 |
| FT-04 | [ギャラリー](features/04_ギャラリー.md) | ブランドフィルタータブ・グリッド・ライトボックス | PG-01, PG-03, PG-A03 |
| FT-05 | [お問い合わせフォーム](features/05_お問い合わせフォーム.md) | フォーム送信・メール通知・DB保存 | PG-05 |
| FT-06 | [予約フォーム](features/06_予約フォーム.md) | ワークショップ予約・URLパラメータ連携・キャンセル | PG-12, PG-13 |
| FT-07 | [ブランドサブナビゲーション](features/07_ブランドサブナビゲーション.md) | IntersectionObserver スクロール連動ナビ | PG-08, PG-09, PG-10, PG-11 |
| FT-08 | [コラボレーションCRUD](features/08_コラボレーションCRUD.md) | コラボ記事の一覧・追加・削除・動画ファイルアップロード | PG-07, PG-A06 |
| FT-09 | [お問い合わせ管理](features/09_お問い合わせ管理.md) | 一覧・既読管理・アコーディオン展開 | PG-A07 |
| FT-10 | [取扱店管理](features/10_取扱店管理.md) | 一覧・追加・編集モーダル・削除・ブランドチップ | PG-06, PG-A04 |
| FT-11 | [予約ステータス管理](features/11_予約ステータス管理.md) | ステータスバッジ・インライン更新 | PG-A05, PG-A12 |
| FT-12 | [イベント管理](features/12_イベント管理.md) | イベントCRUD・画像管理・ブランド選択・収支・サイト編集 | PG-A02, PG-A11〜PG-A13 |
| FT-13 | ショップ／EC | カート・決済(Square)・注文・商品カテゴリーフィルター | PG-14〜PG-17, PG-A08, PG-A09 |
| FT-14 | ジャーナル | 記事一覧・タグフィルター・ブロックエディタ・関連商品リンク | PG-18, PG-19, PG-A10 |
| FT-15 | ファイルアップロード | 画像(images bucket)・動画(videos bucket) Supabase Storage 保存 | 管理画面全般 |
