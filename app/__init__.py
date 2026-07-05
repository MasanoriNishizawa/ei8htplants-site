"""
app/__init__.py
===============
FastAPI アプリケーションのファクトリモジュール。
`create_app()` を呼び出すことでアプリインスタンスを生成する。
main.py はこの関数だけをインポートするため、テストや将来的な複数環境への対応が容易になる。
"""

from fastapi import FastAPI, Request
from fastapi.responses import Response, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
# templates を import することで Jinja2 カスタムフィルター（urlize）が登録される。
# 戻り値は使わないが、副作用のために必要なインポート。
from .templates import templates  # noqa: F401
from .routes.public import router as public_router
from .routes.admin import router as admin_router

CUSTOM_DOMAIN = "ei8htplants.com"

# キャッシュしない（フォーム・管理画面・API）パスのプレフィックス
_NO_CACHE_PREFIXES = ("/admin", "/reserve", "/contact", "/api/")


class RedirectToCustomDomainMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        host = request.headers.get("host", "")
        if "onrender.com" in host:
            path = request.url.path
            query = ("?" + str(request.url.query)) if request.url.query else ""
            return RedirectResponse(
                url=f"https://{CUSTOM_DOMAIN}{path}{query}",
                status_code=301
            )
        return await call_next(request)


class CacheControlMiddleware(BaseHTTPMiddleware):
    """
    GET レスポンスに Cache-Control ヘッダーを付与する。

    - /static/*       : 30日キャッシュ（Cloudflare CDN エッジ + ブラウザ）
    - 公開 HTML ページ : 5分キャッシュ（アプリ内 TTL と合わせて Google API 節約）
    - 管理・フォーム系 : no-store（機密データ保護）
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.method != "GET":
            return response
        path = request.url.path
        if path.startswith("/static/"):
            # ファイルハッシュなし静的ファイルなので immutable は付けない
            response.headers["Cache-Control"] = "public, max-age=2592000"  # 30日
        elif any(path.startswith(p) for p in _NO_CACHE_PREFIXES):
            response.headers["Cache-Control"] = "no-store"
        else:
            # 公開ページ: Cloudflare が s-maxage=300 でエッジキャッシュ
            response.headers["Cache-Control"] = "public, max-age=60, s-maxage=300"
        return response


def create_app() -> FastAPI:
    """
    アプリケーションインスタンスを生成して返す。

    - docs_url / redoc_url を None にして自動生成の API ドキュメントを無効化
      （公開サイトに /docs が露出しないようにするため）
    - SessionMiddleware: 管理画面のログインセッションに使用
    - CacheControlMiddleware: Cloudflare エッジキャッシュ用 Cache-Control ヘッダー付与
    - /static: collab.mp4 など静的ファイルの配信
    """
    app = FastAPI(title="ei8ht plants", docs_url=None, redoc_url=None)

    # SESSION_KEY で署名された Cookie にセッションデータを保存する。
    # SECRET_KEY が未設定のままデプロイするとセッションが安全でないため、
    # 必ず本番環境では環境変数 SECRET_KEY を設定すること。
    app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)
    app.add_middleware(CacheControlMiddleware)
    app.add_middleware(RedirectToCustomDomainMiddleware)

    # /static → static/ ディレクトリをそのまま配信
    app.mount("/static", StaticFiles(directory="static"), name="static")

    # 公開ルート（/, /events, /gallery など）
    app.include_router(public_router)

    # 管理画面ルート（/admin/login, /admin/events など）
    # prefix="/admin" を付けることで admin.py 側のパスをシンプルに保てる
    app.include_router(admin_router, prefix="/admin")

    return app
