from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
import logging
import os

from .routes import seo
from .routes import events, gallery, stockists, contact, reserve, collaborations, upload, products, shipping, orders, articles, pot_artists, price_calc_entries, media_appearances, docs, chat, chat_qa, chat_logs

logger = logging.getLogger(__name__)

app = FastAPI(title='ei8ht plants API')

# 開発環境（Vite dev server）からのリクエストを許可するCORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


# Render.com の独自ドメインへのリクエストを本番ドメインへ301リダイレクト
@app.middleware('http')
async def redirect_render_domain(request: Request, call_next):
    host = request.headers.get('host', '')
    if 'onrender.com' in host:
        url = str(request.url).replace(f'https://{host}', 'https://ei8htplants.com', 1)
        return RedirectResponse(url=url, status_code=301)
    return await call_next(request)


# セキュリティヘッダーを全レスポンスに付与するミドルウェア
@app.middleware('http')
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    # HTTPS を強制（max-age=1年）
    response.headers['Strict-Transport-Security'] = 'max-age=31536000'
    # MIMEスニッフィング防止
    response.headers['X-Content-Type-Options'] = 'nosniff'
    # クリックジャッキング防止
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    # XSS フィルター（レガシーブラウザ向け）
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response


# レスポンスごとに適切なCache-Controlヘッダーを付与するミドルウェア
@app.middleware('http')
async def cache_control(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith('/api/'):
        is_public_get = (
            request.method == 'GET'
            and not request.headers.get('authorization')
        )
        if is_public_get and response.status_code < 400:
            # Cloudflare: 5 min / browser: 60 sec (admin bypasses via cache: no-store on the client)
            response.headers['Cache-Control'] = 'public, s-maxage=300, max-age=60'
        elif is_public_get:
            # エラーレスポンスはキャッシュしない
            response.headers['Cache-Control'] = 'no-store'
        else:
            response.headers['Cache-Control'] = 'no-store'
            response.headers['CDN-Cache-Control'] = 'no-store'
    elif path.startswith(('/assets/', '/img/', '/favicon/')):
        # Cloudflare: 1 year / browser: 1 day — purge Cloudflare to force refresh within 1 day
        response.headers['Cache-Control'] = 'public, s-maxage=31536000, max-age=86400, immutable'
    else:
        # HTML: Cloudflare revalidates, browser always checks
        response.headers['Cache-Control'] = 'public, s-maxage=60, max-age=0, must-revalidate'
    return response

app.include_router(events.router, prefix='/api')
app.include_router(gallery.router, prefix='/api')
app.include_router(stockists.router, prefix='/api')
app.include_router(contact.router, prefix='/api')
app.include_router(reserve.router, prefix='/api')
app.include_router(collaborations.router, prefix='/api')
app.include_router(upload.router, prefix='/api')
app.include_router(products.router, prefix='/api')
app.include_router(shipping.router, prefix='/api')
app.include_router(orders.router, prefix='/api')
app.include_router(articles.router, prefix='/api')
app.include_router(pot_artists.router, prefix='/api')
app.include_router(price_calc_entries.router, prefix='/api')
app.include_router(media_appearances.router, prefix='/api')
app.include_router(docs.router, prefix='/api')
app.include_router(chat.router, prefix='/api')
app.include_router(chat_qa.router, prefix='/api')
app.include_router(chat_logs.router, prefix='/api')
# robots.txt / sitemap.xml。SPA のフォールバック（下の serve_spa）より前に登録して index.html が返らないようにする
app.include_router(seo.router)

# 本番: Viteビルド済みSPAを配信
DIST = os.path.join(os.path.dirname(__file__), '../../frontend/dist')
if os.path.isdir(DIST):
    for _subdir in ['assets', 'img', 'favicon']:
        _path = os.path.join(DIST, _subdir)
        if os.path.isdir(_path):
            app.mount(f'/{_subdir}', StaticFiles(directory=_path), name=_subdir)

    # SPA の index.html（全ページ共通の入口）
    INDEX_HTML = os.path.join(DIST, 'index.html')

    # SPA ルーティング: 静的ファイルが存在しない場合は index.html を返す
    @app.get('/{full_path:path}')
    def serve_spa(full_path: str, request: Request):
        """静的ファイルがあればそれを、無ければ SPA の index.html を返す。

        index.html には、SNS のクローラー（JavaScript を実行しない）向けに、パスに応じた
        タイトル・説明・OGP・構造化データを入れて返す（routes/seo.py）。メタ情報の作成に
        失敗したときは、これまでどおり index.html をそのまま返す。

        Args:
            full_path: リクエストのパス（先頭のスラッシュなし）
            request: クエリ文字列を読むためのリクエスト

        Returns:
            静的ファイル、またはメタ情報入りの index.html
        """
        # 1. 静的ファイル（dist 直下の manifest・sw.js など）があればそのまま返す。
        #    「..%2F」や「%2Fetc%2F…」のようなパスで dist の外（.env やソースなど）を読まれないよう、
        #    実際の場所に直してから dist の中にあるときだけ返す（外を指すときは SPA の index.html を返す）
        dist_real = os.path.realpath(DIST)
        file_path = os.path.realpath(os.path.join(dist_real, full_path))
        if file_path.startswith(dist_real + os.sep) and os.path.isfile(file_path):
            return FileResponse(file_path)
        # 2. パスに応じたメタ情報を index.html に入れて返す
        try:
            return HTMLResponse(seo.render_spa_index(INDEX_HTML, full_path, dict(request.query_params)))
        except Exception as e:
            # 3. 失敗しても SPA は表示できるよう、元の index.html を返す
            logger.error('serve_spa メタ情報の埋め込みエラー（%s）: %s', full_path, e)
            return FileResponse(INDEX_HTML)
