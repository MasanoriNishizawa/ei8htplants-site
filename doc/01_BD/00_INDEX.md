# 基本設計書（BD） — インデックス

## 設計書

| ファイル | 内容 |
|---|---|
| [01_システム構成.md](01_システム構成.md) | アーキテクチャ・技術スタック・環境変数・デプロイ |
| [02_画面遷移図.md](02_画面遷移図.md) | 画面遷移・ルーティング・レイアウト構造 |
| [03_論理データモデル.md](03_論理データモデル.md) | 概念ER図・エンティティ定義・関係性 |
| [04_インターフェース設計.md](04_インターフェース設計.md) | 外部システム連携（Supabase・Resend・Square・Gemini・GA4・Render・Streamlit Community Cloud・Cloudflare Email Routing・Instagram）と送信メールの一覧 |
| [05_バッチ処理一覧.md](05_バッチ処理一覧.md) | 決まった時刻に動く処理はないこと・管理者が手で行う作業の記録 |

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
| PG-19 | [JournalArticle](pages/public/19_JournalArticle.md) | `/journal/:id` | FT-14, FT-13 |
| PG-20 | [EventSite](pages/public/20_EventSite.md) | `/events/:id` | FT-03 |
| PG-21 | [LegalPage](pages/public/21_LegalPage.md) | `/legal` | — |
| PG-22 | [Chat（AI コンシェルジュ）](pages/public/22_Chat.md) | `/chat` | FT-24 |
| PG-23 | [Media（出演情報）](pages/public/23_Media.md) | `/media` | — |
| PG-24 | [PrivacyPolicy（プライバシーポリシー）](pages/public/24_PrivacyPolicy.md) | `/privacy` | — |

PG-01〜PG-13・PG-20〜PG-24 はヘッダーとフッターの付いた共通の枠（`Layout`）の中に、PG-14〜PG-19 はストア用の枠（`StoreLayout`）の中に表示する。予約（PG-12）と予約キャンセル（PG-13）は `Layout` の中にある。

どのページにも当たらない URL を開いたときは、`Layout` の中に「ページが見つかりません」のページ（`pages/NotFound.tsx`。ID は付けていない。2026-10-22 追加）を出す。内容は [画面遷移図](02_画面遷移図.md) の「ルーティング定義」を参照。

### 管理ページ（要認証）

| ID | ファイル | URL | 使用機能 |
|---|---|---|---|
| PG-A01 | [Dashboard](pages/admin/01_Dashboard.md) | `/admin` | FT-01, FT-12（出店料の支払い・今後の搬入予定。2026-10-21 追加） |
| PG-A02 | [イベント管理](pages/admin/02_Events.md) | `/admin/events` | FT-01, FT-12 |
| PG-A03 | [ギャラリー管理](pages/admin/03_Gallery.md) | `/admin/gallery` | FT-01, FT-04 |
| PG-A04 | [取扱店管理](pages/admin/04_Stockists.md) | `/admin/stockists` | FT-01, FT-10 |
| PG-A05 | [WS予約管理](pages/admin/05_Reservations.md) | `/admin/reservations` | FT-01, FT-11 |
| PG-A06 | [コラボレーション管理](pages/admin/06_Collaborations.md) | `/admin/collaborations` | FT-01, FT-08 |
| PG-A07 | [お問い合わせ管理](pages/admin/07_Contacts.md) | `/admin/contacts` | FT-01, FT-09 |
| PG-A08 | [商品管理](pages/admin/08_Products.md) | `/admin/products` | FT-01, FT-13 |
| PG-A09 | [注文管理](pages/admin/09_Orders.md) | `/admin/orders` | FT-01, FT-13 |
| PG-A10 | [記事管理](pages/admin/10_Articles.md) | `/admin/articles` | FT-01, FT-14 |
| PG-A11 | イベント収支管理（ページ設計書は未作成） | `/admin/events/:id/finances` | FT-01, FT-12, FT-23 |
| PG-A12 | イベント予約一覧（ページ設計書は未作成。内容は [FT-11](features/11_予約ステータス管理.md) を参照） | `/admin/events/:id/reservations` | FT-01, FT-11 |
| PG-A13 | イベントサイト編集（ページ設計書は未作成） | `/admin/events/:id/site` | FT-01, FT-12 |
| PG-A14 | [全体の収支](pages/admin/11_Finances.md) | `/admin/finances` | FT-01, FT-23 |
| PG-A15 | [支払い集計](pages/admin/15_HelperPayment.md) | `/admin/helper-payment` | FT-01, FT-23 |
| PG-A16 | [ワークショップ集計](pages/admin/16_WsSummary.md) | `/admin/ws-summary` | FT-01, FT-23 |
| PG-A17 | [販売価格計算](pages/admin/17_PriceCalc.md) | `/admin/price-calc` | FT-01 |
| PG-A18 | [鉢作家管理](pages/admin/18_PotArtists.md) | `/admin/pot-artists` | FT-01 |
| PG-A19 | [メディア管理](pages/admin/19_Media.md) | `/admin/media` | FT-01 |
| PG-A20 | [設計書](pages/admin/20_Docs.md) | `/admin/docs` | FT-01 |
| PG-A21 | [チャットQ&A](pages/admin/21_ChatQA.md) | `/admin/chat-qa` | FT-01, FT-24 |
| PG-A22 | [チャット履歴](pages/admin/22_ChatLogs.md) | `/admin/chat-logs` | FT-01, FT-24 |

管理ページの設計書のファイル名の番号は、PG-A01〜PG-A10 は ID の番号と同じ、PG-A14 は `11_Finances.md`、PG-A15 以降は ID の番号と同じ（`15_`〜`22_`）。

このほか、イベント管理の中に次の画面がある（ID は付けず、[PG-A02 イベント管理](pages/admin/02_Events.md) に書いている）: イベントの新規作成・編集（`/admin/events/new`・`/admin/events/:id/edit`）、管理情報の確認・編集（`/admin/events/:id/admin-info`・`/admin/events/:id/admin-info/edit`）、画像ダウンロード（`/admin/events/:id/images`）。

管理画面の中で、どの画面にも当たらない URL（`/admin/〜`）を開いたときは、サイドメニューを残したまま「ページが見つかりません」とダッシュボードへのボタンを出す（`pages/admin/AdminNotFound.tsx`。ID は付けていない。2026-10-22 追加）。

---

## 機能設計書

| ID | ファイル | 機能名 | 使用ページ |
|---|---|---|---|
| FT-01 | [認証](features/01_認証.md) | Supabase Auth ログイン・セッション管理 | PG-A01〜PG-A22（AdminLayout共通） |
| FT-02 | [APIクライアント](features/02_APIクライアント.md) | `lib/api.ts` リクエスト処理・型定義 | 全ページ |
| FT-03 | [イベント表示](features/03_イベント表示.md) | EventPreview レンダリング・画像スライドショー・EventSite | PG-01, PG-02, PG-20 |
| FT-04 | [ギャラリー](features/04_ギャラリー.md) | ブランドフィルタータブ・グリッド・ライトボックス・管理画面での追加・削除・並べ替え | PG-01, PG-03, PG-A03 |
| FT-05 | [お問い合わせフォーム](features/05_お問い合わせフォーム.md) | フォーム送信・メール通知・DB保存 | PG-05 |
| FT-06 | [予約フォーム](features/06_予約フォーム.md) | ワークショップ予約・URLパラメータ連携・キャンセル | PG-12, PG-13 |
| FT-07 | [ブランドサブナビゲーション](features/07_ブランドサブナビゲーション.md) | IntersectionObserver スクロール連動ナビ | PG-08, PG-09, PG-10, PG-11 |
| FT-08 | [コラボレーションCRUD](features/08_コラボレーションCRUD.md) | コラボ記事の一覧・追加・削除・動画と画像のファイルアップロード | PG-07, PG-A06 |
| FT-09 | [お問い合わせ管理](features/09_お問い合わせ管理.md) | 一覧・既読管理・アコーディオン展開・管理画面からのメール返信 | PG-A07 |
| FT-10 | [取扱店管理](features/10_取扱店管理.md) | 一覧・追加・編集モーダル・削除・ブランドチップ | PG-06, PG-A04 |
| FT-11 | [予約ステータス管理](features/11_予約ステータス管理.md) | ステータスバッジ・インライン更新・当日参加の登録・印刷 | PG-A05, PG-A12 |
| FT-12 | [イベント管理](features/12_イベント管理.md) | イベントCRUD・画像管理・ブランド選択・収支・サイト編集・管理情報（出店要項を含む。2026-10-16 に確認画面を追加）・画像ダウンロード（2026-10-16 追加） | PG-A02, PG-A11〜PG-A13 |
| FT-13 | ショップ／EC（機能設計書は未作成） | カート・決済(Square)・注文・商品カテゴリーフィルター | PG-14〜PG-17, PG-19, PG-A08, PG-A09 |
| FT-14 | ジャーナル（機能設計書は未作成） | 記事一覧・タグフィルター・ブロックエディタ・関連商品リンク | PG-18, PG-19, PG-A10 |
| FT-15 | ファイルアップロード（機能設計書は未作成） | 画像(images bucket)・動画(videos bucket) Supabase Storage 保存 | 管理画面全般 |
| FT-23 | 収支（機能設計書は未作成） | イベントごとの収支の入力・全体の収支・手伝いの支払い集計・ワークショップ集計 | PG-A11, PG-A14〜PG-A16 |
| FT-24 | [AIチャット](features/13_AIチャット.md) | Gemini による植物相談・ワークショップ案内のチャット。管理画面での Q&A 登録・会話履歴の確認 | PG-22, PG-A21, PG-A22 |
| FT-25 | [分析ダッシュボード](features/14_分析ダッシュボード.md) | 収支・予約・注文・問い合わせ・アクセス数のグラフ（Streamlit Community Cloud で公開。管理画面と同じアカウントでログイン。2026-10-17 追加） | PG-A01（サイドメニュー「分析 ↗」から新しいタブで開く） |
| FT-26 | [検索エンジン・SNS 向けの情報](features/15_検索エンジン・SNS向け情報.md) | ページを返すときにタイトル・説明・SNS のプレビュー用の情報（OGP）・正式な URL・構造化データを入れる。`robots.txt`・`sitemap.xml`（2026-10-21 追加） | 公開ページ全部（管理画面などには noindex） |

FT-16〜FT-22 は使っていない（欠番）。

### 機能設計書のファイル名と機能 ID

`features/` のファイル名の番号は、FT-01〜FT-12 は機能 ID と同じだが、13 以降は違う。ファイル名は変えず、次の表で紐づける。

| ファイル | 機能 ID |
|---|---|
| `features/13_AIチャット.md` | FT-24 |
| `features/14_分析ダッシュボード.md` | FT-25 |
| `features/15_検索エンジン・SNS向け情報.md` | FT-26 |

---

## 機能 ID・画面 ID の対照表（旧 要件定義の ID → 今の ID）

要件定義書（`doc/00_RD`）の古い版で使っていた ID と、この索引の ID の対応。古い資料を読むときに使う（2026-10-22 追加）。

### 機能 ID

| 旧 要件定義の ID | 今の ID |
|---|---|
| FT-13（OGP） | FT-26 |
| FT-14 | FT-15 |
| FT-15・FT-16 | FT-03 の一部 |
| FT-17 | FT-01・FT-12 の一部 |
| FT-18 | FT-04 |
| FT-19 | FT-23 |
| FT-20〜FT-22 | FT-11・FT-12 の一部 |

### 画面 ID

| 旧 要件定義の ID | 今の ID |
|---|---|
| PG-A08 | PG-A11 |
| PG-A09 | PG-A12 |
| PG-13（`/chat`） | PG-22 |

*最終更新: 2026-10-22（存在しない URL のページ（公開サイト・管理画面）を追記）／2026-10-22（PG-15〜PG-17・PG-19〜PG-24、PG-A15〜PG-A22 のページ設計書を追加。FT-23・FT-24 を索引に追加。旧 ID の対照表を追加）*
