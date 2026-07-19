"""
app/config.py
=============
アプリ全体で共有する設定値と、Google API 認証情報の管理モジュール。

環境変数の読み取りをここに集約することで、他モジュールが os.environ を
直接参照しなくて済む構成にしている。
"""

import os
import json
from functools import cached_property
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv

load_dotenv()  # プロジェクトルートの .env を自動読み込み（本番環境では環境変数が優先される）

# ================================================================
# Google Spreadsheet / Drive の固定 ID
# ================================================================

# データソースとなる Google スプレッドシートの ID
# URL の /spreadsheets/d/<ID>/edit の部分
SPREADSHEET_ID = "1_18mozgallwxSZ_u9d5iCdP9CftT7nZ9lgo-v3jbzwU"

# Google API へのアクセス権限スコープ
# - spreadsheets: イベント・Specimen・PROJECTS シートの読み書き
# - drive: ギャラリー用フォルダ内の画像一覧取得
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


# ギャラリー画像が格納された Google Drive フォルダの ID（ブランド別）
# URL の /drive/folders/<ID> の部分
FOLDERS = {
    "ei8ht_plants":   "10Weyg4NpTuj6PEMLHtWteFXNg9awj-WE",
    "habitat_oides":  "1XqKysJZ8A4NTRzj_YG2TyeZnSvPiW8cW",
    "hue":            "128gck2ApACIFuEdGEExnDR48-3Roy-Mb",
}


# ================================================================
# 設定クラス
# ================================================================

class Settings:
    """
    環境変数から設定値を取得するクラス。
    モジュールレベルの `settings` シングルトンとして使用する。
    """

    @property
    def secret_key(self) -> str:
        """
        SessionMiddleware が Cookie 署名に使う秘密鍵。
        本番環境では必ず環境変数 SECRET_KEY に長いランダム文字列を設定すること。
        未設定時はデフォルト値を使うが、セッションのセキュリティが低下する。
        生成例: python -c "import secrets; print(secrets.token_hex(32))"
        """
        return os.environ.get("SECRET_KEY", "dev-secret-change-in-production")

    @property
    def gmail_sender(self) -> str:
        """
        メール送信元の Gmail アドレス。
        未設定の場合はメール送信をスキップする。
        例: yourname@gmail.com
        """
        return os.environ.get("GMAIL_SENDER", "")

    @property
    def gmail_sender_name(self) -> str:
        """
        メール送信元の表示名。
        受信者のメーラーに「Habitat Oides <habitatoides@gmail.com>」と表示される。
        未設定時は "Habitat Oides" をデフォルトとして使用する。
        """
        return os.environ.get("GMAIL_SENDER_NAME", "Habitat Oides")

    @property
    def gmail_app_password(self) -> str:
        """
        Gmail のアプリパスワード（16 桁）。
        Google アカウント → セキュリティ → 2 段階認証を有効にした後、
        「アプリパスワード」から生成する。通常のパスワードではないことに注意。
        """
        return os.environ.get("GMAIL_APP_PASSWORD", "")

    @property
    def contact_gmail_app_password(self) -> str:
        """
        ei8htplants@gmail.com のアプリパスワード（現在は OAuth2 方式に移行済みのため未使用）。
        過去の SMTP 方式の名残として環境変数定義だけ残している。
        """
        return os.environ.get("CONTACT_GMAIL_APP_PASSWORD", "")

    @property
    def gmail_client_id(self) -> str:
        """
        Gmail API 用 OAuth2 クライアント ID。
        Google Cloud Console の「認証情報」から取得する。
        habitatoides@gmail.com / ei8htplants@gmail.com の両アカウントで共有している。
        """
        return os.environ.get("GMAIL_CLIENT_ID", "")

    @property
    def gmail_client_secret(self) -> str:
        """
        Gmail API 用 OAuth2 クライアントシークレット。
        CLIENT_ID と対になる秘密情報。絶対に Git にコミットしないこと。
        """
        return os.environ.get("GMAIL_CLIENT_SECRET", "")

    @property
    def gmail_refresh_token(self) -> str:
        """habitatoides@gmail.com の OAuth2 リフレッシュトークン"""
        return os.environ.get("GMAIL_REFRESH_TOKEN", "")

    @property
    def contact_gmail_refresh_token(self) -> str:
        """ei8htplants@gmail.com の OAuth2 リフレッシュトークン"""
        return os.environ.get("CONTACT_GMAIL_REFRESH_TOKEN", "")

    @property
    def admin_user(self) -> str:
        """管理画面のログインユーザー名。未設定時は "admin"。"""
        return os.environ.get("ADMIN_USER", "admin")

    @property
    def admin_pass(self) -> str:
        """
        管理画面のログインパスワード。
        空文字のままだと auth.py 側で弾かれてログイン不可になるため、
        本番環境では必ず環境変数 ADMIN_PASS を設定すること。
        """
        return os.environ.get("ADMIN_PASS", "")

    @cached_property
    def google_credentials(self) -> Credentials:
        """
        Google API 認証情報オブジェクト。
        `cached_property` により、初回アクセス時に生成してインスタンスにキャッシュする。
        毎リクエストで JSON パースやファイル読み込みが走らないようにするため。

        - 本番環境 (Render 等): 環境変数 GOOGLE_CREDENTIALS に JSON 文字列を設定
        - ローカル環境: プロジェクトルートの secret_key.json を読み込む
        """
        env_val = os.environ.get("GOOGLE_CREDENTIALS")
        if env_val:
            # Render の環境変数には secret_key.json の中身をそのままコピーして設定する
            return Credentials.from_service_account_info(
                json.loads(env_val), scopes=SCOPES
            )
        # ローカル開発用: secret_key.json を直接読み込む（Git 管理外にすること）
        return Credentials.from_service_account_file("secret_key.json", scopes=SCOPES)


# モジュール読み込み時にシングルトンを生成する
settings = Settings()
