# PM-02 — スケジュール・WBS (Work Breakdown Structure)

## 1. WBS — 作業分解

### Phase 1: 公開サイト基盤（完了）

| ID | 作業 | 状態 |
|---|---|---|
| 1.1 | プロジェクト構成（React + Vite + FastAPI + Supabase） | 完了 |
| 1.2 | ルーティング設計・実装（react-router-dom） | 完了 |
| 1.3 | Header / Footer / Layout コンポーネント | 完了 |
| 1.4 | Home ページ | 完了 |
| 1.5 | Events ページ + EventCard コンポーネント | 完了 |
| 1.6 | Gallery ページ（ライトボックス） | 完了 |
| 1.7 | Concept ページ | 完了 |
| 1.8 | Contact ページ（フォーム + Resend連携） | 完了 |
| 1.9 | Stockists ページ | 完了 |
| 1.10 | ブランドページ（ei8ht plants / HabitatOides / HabitatOidesWorkshop / HUE） | 完了 |
| 1.11 | Reserve ページ（URLパラメータ連携） | 完了 |
| 1.12 | Supabase DBスキーマ初版設計・実装 | 完了 |
| 1.13 | FastAPI バックエンド初版実装 | 完了 |

### Phase 2: Admin基盤（完了）

| ID | 作業 | 状態 |
|---|---|---|
| 2.1 | AdminLayout（Supabase Auth認証ガード） | 完了 |
| 2.2 | Admin Dashboard | 完了 |
| 2.3 | Admin Events（イベントCRUD・画像管理） | 完了 |
| 2.4 | Admin Gallery（画像追加・削除） | 完了 |
| 2.5 | Admin Stockists（取扱店追加・削除） | 完了 |
| 2.6 | バックエンド events/gallery/stockists API | 完了 |

### Phase 3: 追加Admin機能（完了）

| ID | 作業 | 状態 |
|---|---|---|
| 3.1 | Collaborations テーブル + API + 公開ページ + Admin画面 | 完了 |
| 3.2 | Contacts テーブル + API + Admin画面（既読管理） | 完了 |
| 3.3 | Gallery ブランドフィルタリング（APIクエリ + フロント） | 完了 |
| 3.4 | Stockists 編集モーダル + PATCH API | 完了 |
| 3.5 | Reservations ステータス管理 + PATCH API | 完了 |
| 3.6 | DBマイグレーション（002_admin_features.sql） | 完了 |

### Phase 4: ドキュメント整備（完了）

| ID | 作業 | 状態 |
|---|---|---|
| 4.1 | RD（要件定義書）作成 | 完了 |
| 4.2 | BD（基本設計書）作成 | 完了 |
| 4.3 | DD（詳細設計書）作成 | 完了 |
| 4.4 | PM（プロジェクト管理資料）作成 | 完了 |
| 4.5 | TEST（テスト仕様書）作成 | 完了 |
| 4.6 | OP（移行・運用マニュアル）作成 | 完了 |

### Phase 5: 本番デプロイ（未着手）

| ID | 作業 | 状態 |
|---|---|---|
| 5.1 | サーバー選定・環境構築 | 未着手 |
| 5.2 | 本番 `.env` 設定 | 未着手 |
| 5.3 | DBマイグレーション実行（本番Supabase） | 未着手 |
| 5.4 | フロントエンドビルド + 動作確認 | 未着手 |
| 5.5 | ドメイン設定・HTTPS設定 | 未着手 |
| 5.6 | Admin管理者アカウント作成 | 未着手 |
| 5.7 | UAT（ユーザー受入テスト） | 未着手 |
| 5.8 | 本番公開 | 未着手 |

---

## 2. マイルストーン

| マイルストーン | 内容 | 状態 |
|---|---|---|
| MS-1 | 公開サイト初版完成 | 完了 |
| MS-2 | Admin全機能完成 | 完了 |
| MS-3 | ドキュメント整備完了 | 完了 |
| MS-4 | 本番公開 | 未着手 |
