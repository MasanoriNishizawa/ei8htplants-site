# ei8ht plants — Official Website

植物ブランド **ei8ht plants** の公式サイトです。

**サイト URL**: https://ei8htplants.com/

---

## Brand Lines

| ブランド | テーマ |
|---|---|
| **ei8ht plants** | アガベ専門ライン |
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
| Email | Resend SDK |
| Styling | Tailwind CSS v3 + index.css |
| Routing | react-router-dom v7 |

---

## Directory Structure

```
ei8htplants-site/
├── frontend/              # React SPA
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts       # API クライアント（request / authRequest / api.upload）
│   │   │   └── supabase.ts  # 共有 Supabase クライアント
│   │   ├── pages/
│   │   │   ├── admin/       # 管理画面（認証必須）
│   │   │   ├── brands/      # ブランドページ
│   │   │   └── *.tsx        # 公開ページ
│   │   └── components/
│   │       ├── EventCard.tsx  # イベントカード（あとN日バッジ付き）
│   │       ├── PageMeta.tsx   # OGP / SEO メタタグ（全ページ共通）
│   │       └── Layout.tsx     # グローバルレイアウト・ナビゲーション
│   └── .env               # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
│
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI アプリ・CORS・SPA フォールバック
│   │   ├── auth.py          # Admin API 認証（Supabase JWT 検証）
│   │   ├── config.py        # 環境変数
│   │   ├── db.py            # Supabase クライアント（anon / service_role）
│   │   └── routes/          # events / gallery / stockists / contact / reserve / collaborations / upload
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
```

`frontend/.env`（フロントエンド用、anon キーのみ）:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
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

---

## Admin Panel

管理画面は `/admin` から Supabase Auth でログイン後アクセス可能です。

| URL | 機能 |
|---|---|
| `/admin` | ダッシュボード（未読お問い合わせ・未確認予約・公開中イベント数の統計カード） |
| `/admin/events` | イベント CRUD・複製・画像ファイルアップロード（プレビュー付き） |
| `/admin/gallery` | ギャラリー画像追加・削除・表示順変更（上下ボタン）・ファイルアップロード |
| `/admin/stockists` | 取扱店管理 |
| `/admin/reservations` | WS 予約一覧・ステータス管理・CSV エクスポート |
| `/admin/collaborations` | コラボレーション管理・画像ファイルアップロード |
| `/admin/contacts` | お問い合わせ一覧・既読管理・返信モーダル（Resend 直送） |

管理画面から発行する API リクエストには Supabase セッショントークン（Bearer）が自動付与され、バックエンドで検証されます。  
画像ファイルは `POST /api/upload` 経由で Supabase Storage（`images` バケット）にアップロードされます。

---

## Database Migrations

`backend/migrations/` に番号順で SQL ファイルがあります。Supabase SQL エディターで順番に実行してください。

| ファイル | 内容 |
|---|---|
| `001_*.sql` | 初版スキーマ |
| `002_admin_features.sql` | collaborations / contacts テーブル追加、brands・status カラム追加 |
| `003_fix_rls.sql` | contacts の不要な anon INSERT ポリシーを削除 |
| `004_site_assets.sql` | site_assets テーブル追加（将来の静的アセット管理用） |

---

## Security Notes

- `.env` および `secret_key.json` は `.gitignore` で管理し、絶対にコミットしないこと
- `SUPABASE_SERVICE_ROLE_KEY` はバックエンドのみで使用し、フロントエンドには公開しないこと
- Admin API は Supabase JWT で認証済みのリクエストのみ受け付ける

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

© 2026 ei8ht plants. All rights reserved.
