# ei8ht plants — Official Website

植物ブランド **ei8ht plants** の公式サイトです。  
Google スプレッドシートをデータベースとして活用し、最新のイベント情報やギャラリーを動的に表示する軽量な Web アプリケーションです。

**サイト URL**: https://ei8htplants.onrender.com/

---

## Brand Lines

| ブランド | テーマ |
|---|---|
| **ei8ht plants** | アガベ・コーデックスを中心とした珍奇植物 |
| **Habitat Oides** | 自生地の風景を再現するハビタットスタイル |
| **HUE by ei8ht plants** | カラテア・フィロデンドロンなど室内観葉植物 |

---

## Tech Stack

| 区分 | 技術 |
|---|---|
| Backend | Python 3.9 / FastAPI / uvicorn |
| Frontend | Jinja2 テンプレート / CSS3 (Variables, Flexbox, Grid) |
| Database | Google Sheets API (gspread) |
| Image Hosting | Google Drive API |
| Infrastructure | Render (Free Plan) / GitHub (CI/CD) |

---

## Features

- **イベント自動更新**: Google スプレッドシートを更新するだけで NEXT EVENT・イベント一覧が即時反映
- **TTL キャッシュ**: Google API のレスポンスを 5〜10 分キャッシュして表示を高速化し API レート制限を回避
- **管理画面**: `/admin` からイベントの追加・編集・削除・WS 予約一覧の確認が可能（サイトのナビには表示されない隠しページ）
- **ワークショップ予約フォーム**: `WSフラグ=TRUE` のイベントに予約フォーム（`/reserve?row=N`）を自動生成。FastAPI が直接「WS予約」シートに書き込み、申込者へ Gmail で確認メールを自動送信
- **お問い合わせフォーム**: `/contact` からフォーム送信 → スプレッドシート記録 + ei8htplants@gmail.com に通知 + 送信者に受付確認メールを自動返信
- **ギャラリーマーキー**: トップページに全ブランドの画像をランダム順で流れるアニメーション表示
- **レスポンシブ対応**: スマートフォン・PC 両対応（ハンバーガーメニュー付き）
- **過去イベント自動アーカイブ**: 終了日を過ぎたイベントを自動的に「過去のイベント」へ振り分け

---

## Directory Structure

```
ei8htplants-site/
├── main.py                  # エントリーポイント（uvicorn で起動、create_app() を呼ぶだけ）
├── requirements.txt         # 依存ライブラリ一覧
├── secret_key.json          # Google API 認証キー（公開厳禁・Git 管理外）
│
├── app/                     # アプリケーションパッケージ
│   ├── __init__.py          # FastAPI アプリファクトリ（SessionMiddleware・ルーター登録）
│   ├── config.py            # 設定値・環境変数・Google 認証情報
│   ├── cache.py             # TTL インメモリキャッシュ
│   ├── google_client.py     # gspread / Drive API クライアント（シングルトン）
│   ├── sheets.py            # Google Sheets 読み書きロジック（イベント・予約）
│   ├── drive.py             # Google Drive 画像取得ロジック
│   ├── auth.py              # 管理画面セッション認証
│   ├── templates.py         # Jinja2 テンプレート設定・カスタムフィルター
│   └── routes/
│       ├── public.py        # 公開ページルート（/, /events, /reserve, /ei8htplants, /habitatoides, /hue, /specimen など）
│       └── admin.py         # 管理画面ルート（/admin/...）
│
├── gas/
│   └── workshop_reservation.gs  # 旧 GAS スクリプト（現在は使用していない・参考用として保持）
│
├── static/
│   └── collab.mp4           # コラボ動画
│
└── templates/
    ├── base.html                  # 全ページ共通ヘッダー・フッター・CSS 変数
    ├── _macros.html               # 再利用パーツ（イベントカードマクロ）
    ├── home.html                  # トップページ（マーキーギャラリー・最新イベント）
    ├── events.html                # イベント一覧・過去イベント
    ├── reserve.html               # ワークショップ予約フォーム
    ├── gallery.html               # ギャラリー（ブランド別タブ）
    ├── collaborations.html        # コラボレーション一覧
    ├── specimen.html              # 植物標本（スライダー付きカード）
    ├── concept.html               # コンセプト・ブランドライン説明
    ├── ei8htplants.html           # ei8ht plants ブランドページ
    ├── habitatoides.html          # Habitat Oides ブランドページ
    ├── habitatoides_workshop.html # Habitat Oides ワークショップ紹介ページ
    ├── hue.html                   # HUE by ei8ht plants ブランドページ
    ├── contact.html               # お問い合わせフォーム
    └── admin/
        ├── login.html             # 管理画面ログイン
        ├── events.html            # 管理画面イベント一覧
        ├── event_form.html        # 管理画面イベント作成・編集フォーム
        └── reservations.html      # 管理画面 WS 予約一覧
```

---

## Google Sheets 構成

スプレッドシート ID: `1_18mozgallwxSZ_u9d5iCdP9CftT7nZ9lgo-v3jbzwU`

| シート名 | 用途 | 主な列 |
|---|---|---|
| シート1（index=0） | イベント情報 | 開始日, 終了日, イベント名, 販売ブランド, 場所, 住所, 画像, WSフラグ, 開催時間 など |
| Specimen | 植物標本 | 品種名, 画像1, 画像2, 画像3 |
| PROJECTS | コラボ案件 | タイトル, 日付, コラボ先, コラボ内容, 画像 |
| WS予約 | ワークショップ予約データ | タイムスタンプ, イベント名, お名前, メール, 電話番号, 希望日, 希望時間帯, 参加人数, お持ち込み, 備考 |
| お問い合わせ | お問い合わせフォーム送信データ | タイムスタンプ, お名前, メール, 件名, 内容 |

---

## Setup & Installation

### 1. リポジトリのクローン

```bash
git clone https://github.com/YourUsername/ei8htplants-site.git
cd ei8htplants-site
```

### 2. 仮想環境の作成と依存関係のインストール

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Google API 認証情報の配置

Google Cloud Console でサービスアカウントを作成し、秘密鍵の JSON ファイルを `secret_key.json` としてプロジェクトルートに配置してください。

> ⚠️ `secret_key.json` は絶対に Git コミットしないこと（`.gitignore` に追加済み）

### 4. 環境変数の設定（ローカル開発）

`.env` ファイルを作成するか、ターミナルで直接設定します。

```bash
export ADMIN_USER=admin
export ADMIN_PASS=your-password-here
export SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
```

### 5. アプリケーションの起動

```bash
python main.py
# または
uvicorn main:app --reload
```

起動後、http://127.0.0.1:8000 にアクセスしてください。

---

## Admin Panel

管理画面はサイトのナビには表示されません。直接 URL にアクセスしてください。

| URL | 機能 |
|---|---|
| `/admin/login` | ログイン |
| `/admin/events` | イベント一覧（追加・編集・削除） |
| `/admin/events/new` | 新規イベント作成 |
| `/admin/reservations` | WS 予約一覧（イベント別絞り込み・参加人数集計） |

### ログイン情報

環境変数 `ADMIN_USER` と `ADMIN_PASS` で設定したものを使用します。

---

## Deploy to Render

### 環境変数の設定

Render ダッシュボードの「Environment」に以下を追加してください。

| 変数名 | 値 | 説明 |
|---|---|---|
| `GOOGLE_CREDENTIALS` | `secret_key.json` の中身をそのままコピー（1行JSON推奨） | Google API 認証情報 |
| `ADMIN_USER` | 任意のユーザー名 | 管理画面ログイン ID |
| `ADMIN_PASS` | 任意のパスワード | 管理画面ログインパスワード |
| `SECRET_KEY` | ランダムな長い文字列 | セッション Cookie 署名キー |
| `GMAIL_SENDER` | `habitatoides@gmail.com` | WS予約確認メールの送信元アドレス |
| `GMAIL_APP_PASSWORD` | Gmailアプリパスワード（16桁） | `GMAIL_SENDER` アカウントのアプリパスワード |
| `GMAIL_SENDER_NAME` | `Habitat Oides`（デフォルト） | WS予約確認メールの送信者表示名 |
| `CONTACT_GMAIL_APP_PASSWORD` | Gmailアプリパスワード（16桁） | `ei8htplants@gmail.com` のアプリパスワード（お問い合わせメール用） |

`SECRET_KEY` の生成:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Start Command

```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

---

## Workshop Reservation

`WSフラグ = TRUE` のイベントカードに「ワークショップを予約する」ボタンが表示されます。ボタンは `/reserve?row=N` に遷移し、予約フォームを表示します。

### 予約フォームの仕組み

1. ユーザーが `/reserve?row=N` にアクセス（`N` はスプレッドシートの行番号）
2. FastAPI が `sheets.get_event_row(N)` でイベントデータを取得し、日付・時間スロットを生成してフォームを表示
3. 日付・時間帯を選択すると `/api/reserve/availability` を呼び出して残席数をリアルタイム確認
4. フォーム送信（POST `/reserve`）→ FastAPI が `sheets.create_ws_reservation()` を呼び出して「WS予約」シートに書き込む
5. 予約完了後、スタッフがシートを確認してユーザーに連絡する（確認メールの自動送信は行っていない）

### 仕様

| 項目 | 内容 |
|---|---|
| 満席チェック | `/api/reserve/availability` で同一イベント×日付×時間帯の参加人数合計を確認。残席 0 の場合は参加人数選択を無効化 |
| 時間スロット | 「開催時間」列（例: `10:00〜17:00`）から 1 時間単位で自動生成 |
| 複数日イベント | 開始日〜終了日の全日を日付セレクトボックスで選択可能 |
| 確認メール | `GMAIL_SENDER` / `GMAIL_APP_PASSWORD` が設定されていれば申込者へ自動送信（送信者名: `GMAIL_SENDER_NAME`） |
| 予約データ管理 | `/admin/reservations` でイベント別絞り込み・参加人数集計が可能 |

---

## Notes

- **キャッシュについて**: イベントデータは 5 分、ギャラリー画像は 10 分キャッシュされます。管理画面から更新した場合は即時キャッシュが無効化されますが、他の変更は最大 5 分後に反映されます。
- **Render 無料プランの制約**: SQLite はデプロイのたびにリセットされるため使用していません。データ永続化には Google Sheets を使用しています。
- **Python バージョン**: Python 3.9 (Render 無料プランの制約)。3.10 以上へのアップグレードを推奨。
- **GAS スクリプトについて**: `gas/workshop_reservation.gs` は旧 GAS ベースの予約処理スクリプトです。現在は FastAPI が直接 Sheets に書き込む方式に移行しており、このファイルは使用していません。

---

## License

© 2026 ei8ht plants. All rights reserved.
