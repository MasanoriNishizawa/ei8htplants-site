# ei8ht plants — Official Website

植物ブランド **ei8ht plants** の公式サイトです。

**サイト URL**: https://ei8htplants.com/

---

## Brand Lines

| ブランド | テーマ |
|---|---|
| **ei8ht plants** | アガベ・塊根植物・灌木などビザールプランツ専門ライン |
| **Habitat Oides** | 自生地の風景を再現するハビタットスタイルライン |
| **HUE by ei8ht plants** | フィロデンドロン・カラテア・ビカクシダなどオーナメントプランツライン |

---

## Tech Stack

| 区分 | 技術 |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Backend | Python 3.12 / FastAPI / uvicorn |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (管理画面ログイン) |
| Payment | Square Web Payments SDK + Square API |
| Email | Resend SDK |
| Styling | インラインスタイル（React CSSProperties）+ index.css |
| Routing | react-router-dom v7 |

---

## Directory Structure

```
ei8htplants-site/
├── frontend/              # React SPA
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts                   # API クライアント（request / authRequest / api.*）
│   │   │   ├── cart.tsx                 # カートコンテキスト（CartProvider / useCart）
│   │   │   ├── reservationConstants.ts  # STATUS_LABELS / STATUS_COLORS（管理画面共有）
│   │   │   └── supabase.ts              # 共有 Supabase クライアント
│   │   ├── pages/
│   │   │   ├── admin/              # 管理画面（認証必須）
│   │   │   ├── brands/             # ブランドページ
│   │   │   ├── Reserve.tsx         # WS予約フォーム
│   │   │   ├── CancelReservation.tsx # 予約キャンセルページ（/cancel?id=）
│   │   │   ├── Shop.tsx / ShopProduct.tsx  # ショップ
│   │   │   ├── Checkout.tsx / OrderComplete.tsx  # 決済フロー
│   │   │   ├── Journal.tsx / JournalArticle.tsx  # ジャーナル
│   │   │   ├── LegalPage.tsx       # 特定商取引法に基づく表示
│   │   │   └── *.tsx               # その他公開ページ
│   │   └── components/
│   │       ├── EventPreview.tsx  # イベントカード（Events・Homeで使用）
│   │       ├── BlockEditor.tsx   # ブロックエディタ（商品説明・記事本文）
│   │       ├── PageMeta.tsx      # OGP / SEO メタタグ（全ページ共通）
│   │       └── Header.tsx / Footer.tsx / AdminLayout.tsx
│   └── .env               # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_SQUARE_*
│
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI アプリ・CORS・SPA フォールバック
│   │   ├── auth.py          # Admin API 認証（Supabase JWT 検証）
│   │   ├── config.py        # 環境変数
│   │   ├── db.py            # Supabase クライアント（anon / service_role）
│   │   └── routes/
│   │       ├── events.py / gallery.py / stockists.py
│   │       ├── contact.py / reserve.py / collaborations.py
│   │       ├── products.py  # 商品CRUD・在庫管理（decrement_stock / increment_stock RPC）
│   │       ├── orders.py    # 注文作成・Square決済・発送通知メール
│   │       ├── shipping.py  # 都道府県別送料テーブル
│   │       ├── articles.py  # ジャーナル記事CRUD
│   │       └── upload.py
│   ├── migrations/          # Supabase SQL マイグレーション
│   └── requirements.txt
│
├── .env                   # バックエンド用（SUPABASE_SERVICE_ROLE_KEY 等）
└── doc/                   # 設計書（RD / BD / DD / PM / TEST / OP）
```

---

## Local Development

### 前提

- Node.js 20+
- Python 3.12+

### 1. 環境変数の設定

`.env`（プロジェクトルート、バックエンド用）:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
CONTACT_TO_EMAIL=...
CONTACT_FROM_EMAIL=noreply@ei8htplants.com
SQUARE_ACCESS_TOKEN=...
SQUARE_LOCATION_ID=...
SQUARE_ENVIRONMENT=sandbox
```

`frontend/.env`（フロントエンド用）:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_SQUARE_APP_ID=...
VITE_SQUARE_LOCATION_ID=...
VITE_SQUARE_ENVIRONMENT=sandbox
```

### 2. バックエンド起動

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3. フロントエンド起動

```bash
cd frontend
npm install
npm run dev
```

フロントエンド（`localhost:5173`）は `/api` を `localhost:8000` へプロキシします。

> Note: Square 決済は localhost では動作しません。本番サイト（ei8htplants.com）で確認してください。

---

## Admin Panel

管理画面は `/admin` から Supabase Auth でログイン後アクセス可能です。
モバイルではハンバーガーメニューからサイドバーを開きます。

| URL | 機能 |
|---|---|
| `/admin` | ダッシュボード（未読お問い合わせ・未確認予約・未発送注文・公開中イベント数） |
| `/admin/events` | イベントCRUD・複製・今後/過去分割表示 |
| `/admin/events/:id/reservations` | イベント別WS予約一覧・ステータス管理・CSV |
| `/admin/events/:id/finances` | イベント収支登録・精算計算 |
| `/admin/events/:id/site` | イベント専用サイトのコンテンツ編集 |
| `/admin/gallery` | ギャラリー画像追加・削除・表示順変更 |
| `/admin/stockists` | 取扱店管理 |
| `/admin/reservations` | 全イベント横断WS予約一覧・CSV エクスポート |
| `/admin/collaborations` | コラボレーション管理 |
| `/admin/contacts` | お問い合わせ一覧・既読管理・返信モーダル |
| `/admin/products` | 商品CRUD・在庫管理・BlockEditorで説明文編集 |
| `/admin/orders` | 注文一覧・ステータス管理・発送情報入力（配送会社・お問い合わせ番号）・発送通知メール |
| `/admin/articles` | ジャーナル記事CRUD・商品リンク設定 |

---

## Database Migrations

`backend/migrations/` に番号順で SQL ファイルがあります。Supabase SQL エディターで順番に実行してください。

| ファイル | 内容 |
|---|---|
| `001_*.sql` | 初版スキーマ（events / event_images / gallery_images / stockists / workshop_reservations） |
| `002_admin_features.sql` | collaborations / contacts テーブル追加 |
| `003_fix_rls.sql` | contacts の不要な anon INSERT ポリシーを削除 |
| `004_site_assets.sql` | site_assets テーブル追加 |
| `005_event_finances.sql` | event_finances テーブル追加 |
| `006_ws_sessions.sql` | ws_sessions テーブル追加、workshop_reservations に session_id 等追加 |
| `007_reservation_datetime.sql` | workshop_reservations に preferred_date / preferred_time 追加 |
| `008_event_page_content.sql` | events に page_content (JSONB) 追加 |
| `009_event_daily_times.sql` | events に daily_times (JSONB) 追加 |
| `010_shop.sql` | products / orders / order_items テーブル・decrement_stock RPC |
| `011_articles_and_tags.sql` | articles テーブル追加 |
| `012_article_product_links.sql` | articles に product_ids (uuid[]) 追加 |
| `013_increment_stock.sql` | increment_stock RPC（在庫ロールバック用） |
| `014_order_shipping_info.sql` | orders に carrier / tracking_number カラム追加 |

手動適用が必要な追加変更:

```sql
-- ws_sessions: デノーマライズ済み予約数カラム
ALTER TABLE ws_sessions ADD COLUMN IF NOT EXISTS reserved_count integer NOT NULL DEFAULT 0;

-- workshop_reservations: キャンセルトークン
ALTER TABLE workshop_reservations ADD COLUMN IF NOT EXISTS cancel_token text;
CREATE INDEX IF NOT EXISTS idx_reservations_cancel_token ON workshop_reservations (cancel_token);
```

---

## Security Notes

- `.env` および `secret_key.json` は `.gitignore` で管理し、絶対にコミットしないこと
- `SUPABASE_SERVICE_ROLE_KEY` はバックエンドのみで使用し、フロントエンドには公開しないこと
- Admin API は Supabase JWT で認証済みのリクエストのみ受け付ける
- Square の本番キー（`SQUARE_ACCESS_TOKEN`）は絶対にフロントエンドに含めないこと

---

## Documentation

詳細設計は `doc/` ディレクトリに格納されています。

| ディレクトリ | 内容 |
|---|---|
| `doc/00_RD/` | 要件定義書 |
| `doc/01_BD/` | 基本設計書（画面遷移・データモデル・API） |
| `doc/02_DD/` | 詳細設計書（モジュール・型・ロジック） |
| `doc/03_PM/` | プロジェクト管理（スケジュール・課題管理） |
| `doc/04_TEST/` | テスト仕様書 |
| `doc/05_OP/` | 運用・移行マニュアル |

---

## License

© ei8ht plants. All rights reserved.
