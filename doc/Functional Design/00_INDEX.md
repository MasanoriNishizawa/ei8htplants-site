# 機能設計書 — インデックス

## ページ設計書

### 公開ページ

| ID | ファイル | URL | 使用機能 |
|---|---|---|---|
| PG-01 | [Home](pages/public/PG-01_Home.md) | `/` | FT-03, FT-04 |
| PG-02 | [Events](pages/public/PG-02_Events.md) | `/events` | FT-03 |
| PG-03 | [Gallery](pages/public/PG-03_Gallery.md) | `/gallery` | FT-04 |
| PG-04 | [Concept](pages/public/PG-04_Concept.md) | `/concept` | — |
| PG-05 | [Contact](pages/public/PG-05_Contact.md) | `/contact` | FT-05 |
| PG-06 | [Stockists](pages/public/PG-06_Stockists.md) | `/stockists` | FT-10 (read) |
| PG-07 | [Collaborations](pages/public/PG-07_Collaborations.md) | `/collaborations` | FT-08 (read) |
| PG-08 | [ei8ht plants](pages/public/PG-08_Ei8htPlants.md) | `/ei8htplants` | FT-07 |
| PG-09 | [Habitat Oides](pages/public/PG-09_HabitatOides.md) | `/habitatoides` | FT-07 |
| PG-10 | [HabitatOides Workshop](pages/public/PG-10_HabitatOidesWorkshop.md) | `/habitatoides/workshop` | FT-07 |
| PG-11 | [HUE](pages/public/PG-11_Hue.md) | `/hue` | FT-07 |
| PG-12 | [Reserve](pages/public/PG-12_Reserve.md) | `/reserve` | FT-06 |

### 管理ページ（要認証）

| ID | ファイル | URL | 使用機能 |
|---|---|---|---|
| PG-A01 | [Dashboard](pages/admin/PG-A01_Dashboard.md) | `/admin` | FT-01 |
| PG-A02 | [イベント管理](pages/admin/PG-A02_Events.md) | `/admin/events` | FT-01, FT-12 |
| PG-A03 | [ギャラリー管理](pages/admin/PG-A03_Gallery.md) | `/admin/gallery` | FT-01, FT-04 |
| PG-A04 | [取扱店管理](pages/admin/PG-A04_Stockists.md) | `/admin/stockists` | FT-01, FT-10 |
| PG-A05 | [WS予約管理](pages/admin/PG-A05_Reservations.md) | `/admin/reservations` | FT-01, FT-11 |
| PG-A06 | [コラボレーション管理](pages/admin/PG-A06_Collaborations.md) | `/admin/collaborations` | FT-01, FT-08 |
| PG-A07 | [お問い合わせ管理](pages/admin/PG-A07_Contacts.md) | `/admin/contacts` | FT-01, FT-09 |

---

## 機能設計書

| ID | ファイル | 機能名 | 使用ページ |
|---|---|---|---|
| FT-01 | [認証](features/FT-01_認証.md) | Supabase Auth ログイン・セッション管理 | PG-A01〜PG-A07（AdminLayout共通） |
| FT-02 | [APIクライアント](features/FT-02_APIクライアント.md) | `lib/api.ts` リクエスト処理・型定義 | 全ページ |
| FT-03 | [イベント表示](features/FT-03_イベント表示.md) | EventCard レンダリング・バッジ・スライドショー | PG-01, PG-02 |
| FT-04 | [ギャラリー](features/FT-04_ギャラリー.md) | ブランドフィルタータブ・グリッド・ライトボックス | PG-01, PG-03, PG-A03 |
| FT-05 | [お問い合わせフォーム](features/FT-05_お問い合わせフォーム.md) | フォーム送信・メール通知・DB保存 | PG-05 |
| FT-06 | [予約フォーム](features/FT-06_予約フォーム.md) | ワークショップ予約・URLパラメータ連携 | PG-12 |
| FT-07 | [ブランドサブナビゲーション](features/FT-07_ブランドサブナビゲーション.md) | IntersectionObserver スクロール連動ナビ | PG-08, PG-09, PG-10, PG-11 |
| FT-08 | [コラボレーションCRUD](features/FT-08_コラボレーションCRUD.md) | コラボ記事の一覧・追加・削除 | PG-07, PG-A06 |
| FT-09 | [お問い合わせ管理](features/FT-09_お問い合わせ管理.md) | 一覧・既読管理・アコーディオン展開 | PG-A07 |
| FT-10 | [取扱店管理](features/FT-10_取扱店管理.md) | 一覧・追加・編集モーダル・削除・ブランドチップ | PG-06, PG-A04 |
| FT-11 | [予約ステータス管理](features/FT-11_予約ステータス管理.md) | ステータスバッジ・インライン更新 | PG-A05 |
| FT-12 | [イベント管理](features/FT-12_イベント管理.md) | イベントCRUD・画像URL管理・ブランド選択 | PG-A02 |
