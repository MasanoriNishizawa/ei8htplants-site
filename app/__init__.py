"""
app/__init__.py
===============
FastAPI アプリケーションのファクトリモジュール。
`create_app()` を呼び出すことでアプリインスタンスを生成する。
main.py はこの関数だけをインポートするため、テストや将来的な複数環境への対応が容易になる。
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
# templates を import することで Jinja2 カスタムフィルター（urlize）が登録される。
# 戻り値は使わないが、副作用のために必要なインポート。
from .templates import templates  # noqa: F401
from .routes.public import router as public_router
from .routes.admin import router as admin_router


def create_app() -> FastAPI:
    """
    アプリケーションインスタンスを生成して返す。

    - docs_url / redoc_url を None にして自動生成の API ドキュメントを無効化
      （公開サイトに /docs が露出しないようにするため）
    - SessionMiddleware: 管理画面のログインセッションに使用
    - /static: collab.mp4 など静的ファイルの配信
    """
    app = FastAPI(title="ei8ht plants", docs_url=None, redoc_url=None)

    # SESSION_KEY で署名された Cookie にセッションデータを保存する。
    # SECRET_KEY が未設定のままデプロイするとセッションが安全でないため、
    # 必ず本番環境では環境変数 SECRET_KEY を設定すること。
    app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

    # /static → static/ ディレクトリをそのまま配信
    app.mount("/static", StaticFiles(directory="static"), name="static")

    # 公開ルート（/, /events, /gallery など）
    app.include_router(public_router)

    # 管理画面ルート（/admin/login, /admin/events など）
    # prefix="/admin" を付けることで admin.py 側のパスをシンプルに保てる
    app.include_router(admin_router, prefix="/admin")

    return app
