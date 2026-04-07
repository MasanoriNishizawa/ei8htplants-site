# ei8ht plants - Official Website
植物ブランド ei8ht plants の公式サイトです。
Google スプレッドシートをデータベースとして活用し、最新のイベント情報やワークショップ案内を動的に表示する軽量な Web アプリケーションです。

## Project Overview
「Bizarre Plants & Habitat Style」をテーマに、アガベ、コーデックス、フィロデンドロンなどの珍奇植物や、ハビタットスタイル（現地の風景を再現した植栽）の魅力を発信します。
[https://ei8htplants.onrender.com/]
## Brand Lines
- **ei8ht plants** : メインブランド。アガベやコーデックスを中心とした珍奇植物。

- **Habitat Oides**: 現地の自生地を切り取ったようなハビタットスタイルの提案。

- **HUE by ei8ht plants**: カラテアやフィロデンドロンなど、室内観葉植物を中心としたライン。

## Tech Stack
- Backend: Python / FastAPI

- Frontend: Jinja2 Template Engine / CSS3 (CSS Variables, Flexbox, Grid)

- Database: Google Sheets API (via gspread)

- Infrastructure: Render / GitHub (CI/CD)

- Image Hosting: Google Drive API

## Features
- **Dynamic Event Management**: Google スプレッドシートを更新するだけで、サイト上の「NEXT EVENT」やイベント一覧が自動更新されます。

- **Automatic Image Processing**: Google ドライブの共有リンクからファイルIDを自動抽出し、Web表示用に最適化してレンダリングします。

- **Responsive Design**: モバイルファーストで設計されており、スマートフォンとPCの両方で最適なレイアウトを提供します。

- **Brand Visuals**: CSSアニメーションによる、ブランドロゴのシームレスなクロスフェード・スライドショーを搭載。

- **Past Events Tracking**: 終了したイベントを「過去のイベント」として自動的にアーカイブします。

## Setup & Installation
1.リポジトリのクローン
```Bash
git clone https://github.com/YourUsername/ei8htplants-site.git
cd ei8htplants-site
```
2. 依存関係のインストール
```
Bash
pip install -r requirements.txt
```
4. 環境変数の設定
  Google Sheets APIを使用するための認証情報が必要です。

  ローカル環境: `secret_key.json`をプロジェクトルートに配置してください。

  本番環境 (Render等): 環境変数`GOOGLE_CREDENTIALS`に`secret_key.json`の中身をテキストとして設定してください。

4. アプリケーションの起動
```
Bash
python main.py
```
起動後、`http://127.0.0.1:8000`にアクセスしてください。

## Directory Structure
```text
ei8htplants/
├── main.py            # FastAPI メイン（データ取得・ロジック）
├── requirements.txt    # 依存ライブラリ一覧
├── secret_key.json     # Google API 認証キー（公開厳禁！）
├── README.md           # このプロジェクトの説明書
└── templates/          # HTMLデザインファイル
    ├── base.html       # 全ページ共通（ヘッダー・フッター）
    ├── home.html       # トップページ
    ├── events.html     # イベント一覧
    └── _macros.html    # パーツ部品（イベントカード等）
```

## License
© 2026 ei8ht plants. All rights reserved.
