ei8ht plants - Official Website

植物ブランド ei8ht plants の公式サイトです。
Google スプレッドシートをデータベースとして活用し、最新のイベント情報やワークショップ案内を動的に表示する軽量な Web アプリケーションです。

🌿 Project Overview

「Bizarre Plants & Habitat Style」をテーマに、アガベ、コーデックス、フィロデンドロンなどの珍奇植物や、ハビタットスタイル（現地の風景を再現した植栽）の魅力を発信します。

Brand Lines

ei8ht plants: メインブランド。アガベやコーデックスを中心とした珍奇植物。

Habitat Oides: 現地の自生地を切り取ったようなハビタットスタイルの提案。

HUE: カラテアやフィロデンドロンなど、室内観葉植物を中心としたライン。

🚀 Tech Stack

Backend: Python / FastAPI

Frontend: Jinja2 Template Engine / CSS3 (CSS Variables, Flexbox, Grid)

Database: Google Sheets API (via gspread)

Infrastructure: Render / GitHub (CI/CD)

Image Hosting: Google Drive API

🛠 Features

Dynamic Event Management: Google スプレッドシートを更新するだけで、サイト上の「NEXT EVENT」やイベント一覧が自動更新されます。

Automatic Image Processing: Google ドライブの共有リンクからファイルIDを自動抽出し、Web表示用に最適化してレンダリングします。

Responsive Design: モバイルファーストで設計されており、スマートフォンとPCの両方で最適なレイアウトを提供します。

Brand Visuals: CSSアニメーション（@keyframes）による、ブランドロゴのシームレスなクロスフェード・スライドショーを搭載。

Past Events Tracking: 終了したイベントを「過去のイベント」として自動的にアーカイブします。

📋 Setup & Installation

1. リポジトリのクローン

git clone [https://github.com/YourUsername/ei8ht-plants.git](https://github.com/YourUsername/ei8ht-plants.git)
cd ei8ht-plants


2. 依存関係のインストール

pip install -r requirements.txt


3. 環境変数の設定

Google Sheets APIを使用するための認証情報が必要です。

ローカル環境: secret_key.json をプロジェクトルートに配置してください。

本番環境 (Render等): 環境変数 GOOGLE_CREDENTIALS に JSON の中身をテキストとして設定してください。

4. アプリケーションの起動

python main.py


起動後、 http://127.0.0.1:8000 にアクセスしてください。

📂 Directory Structure

.
├── main.py              # FastAPI メインアプリケーション（データ取得・ロジック）
├── requirements.txt     # 依存ライブラリ一覧
├── secret_key.json      # Google API 認証キー（Git管理対象外）
├── templates/           # Jinja2 HTML テンプレート
│   ├── base.html        # 全ページ共通レイアウト（ヘッダー・フッター）
│   ├── home.html        # トップページ（スライドショー・Instagramリンク）
│   ├── events.html      # イベントスケジュール一覧（現在・過去）
│   └── _macros.html     # コンポーネント用マクロ（イベントカード等）
└── README.md            # このドキュメント


📝 License

© 2026 ei8ht plants. All rights reserved.
