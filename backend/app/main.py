"""FastAPI アプリの入口。

ミドルウェア（例外のまとめ・CORS・本番ドメインへの転送・セキュリティヘッダー・キャッシュ）と
API のルーターを登録し、本番ではビルド済みの SPA（frontend/dist）を配信する。
"""
import logging
import os
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import SITE_ORIGIN
from .router_registry import register_routers
from .spa_files import resolve_dist_file_path
from .spa_redirects import resolve_spa_redirect
from .spa_normalization import normalize_spa_host, normalize_spa_path
from .utils.errors import error_summary
from .routes import seo

# 変数の内容: app: FastAPI アプリケーション、logger: モジュール名を使って記録するロガー。
logger = logging.getLogger(__name__)

app = FastAPI(title='ei8ht plants API')

# 予期しない例外のときに利用者へ返す文言（内部の例外の文字列は返さない）
INTERNAL_ERROR_MESSAGE = 'サーバーでエラーが発生しました。時間をおいて再度お試しください。'

# キャッシュさせない公開 GET（予約枠と、管理画面からの変更をすぐ反映するサイト画像）
_NO_STORE_PATH_RE = re.compile(r'^/api/(?:events/[^/]+/sessions|site-assets/[^/]+)$')

# 公開の GET API の Cache-Control（Cloudflare 5 分・ブラウザ 60 秒。管理画面は fetch 側で no-store にしている）
_PUBLIC_API_CACHE = 'public, s-maxage=300, max-age=60'
# 静的ファイル（assets・img・favicon）の Cache-Control（Cloudflare 1 年・ブラウザ 1 日。ファイル名にハッシュが付くもの以外は Cloudflare の削除で更新する）
_STATIC_CACHE = 'public, s-maxage=31536000, max-age=86400, immutable'
# HTML の Cache-Control（Cloudflare は 60 秒、ブラウザは毎回確認する）
_HTML_CACHE = 'public, s-maxage=60, max-age=0, must-revalidate'
# HSTS の有効期間（秒）。1 年
_HSTS_MAX_AGE = 31536000


# 一番内側のミドルウェア。ルートで捕まえていない例外を 500 にまとめる。
# CORS・セキュリティヘッダー・キャッシュのミドルウェアより内側に置き、500 の応答にもそれらのヘッダーが付くようにする
# （Starlette はあとから登録したミドルウェアほど外側になるため、最初に登録する）
@app.middleware('http')
async def catch_unhandled_errors(request: Request, call_next) -> Response:
    """ルートの中で起きた予期しない例外をログに残し、一般的な文言の 500 を返す。

    HTTPException（4xx・意図した 5xx）や入力チェックの 422 は FastAPI が先に応答にするので、
    ここには来ない（既存の 4xx の応答は変わらない）。

    Args:
        request: リクエスト
        call_next: 次の処理（ルート）を呼ぶ関数

    Returns:
        ルートの応答、または 500 の JSON 応答（{"detail": INTERNAL_ERROR_MESSAGE}）
    """
    try:
        return await call_next(request)
    except Exception:
        # 例外の型と場所はログで追えるようにする（利用者には内部の情報を返さない）
        logger.exception('未処理の例外（%s %s）', request.method, request.url.path)
        return JSONResponse(status_code=500, content={'detail': INTERNAL_ERROR_MESSAGE})


# 開発環境（Vite dev server）からのリクエストを許可するCORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.middleware('http')
async def redirect_render_domain(request: Request, call_next) -> Response:
    """Render の既定のドメイン（*.onrender.com）へのリクエストを本番ドメインへ 301 で転送する。

    Args:
        request: リクエスト
        call_next: 次の処理を呼ぶ関数

    Returns:
        転送の応答、または次の処理の応答
    """
    # 変数の内容: host: リクエスト元のホスト名。
    host = request.headers.get('host', '')
    if 'onrender.com' in host:
        # 変数の内容: url: 公開または転送に使う URL。
        url = str(request.url).replace(f'https://{host}', SITE_ORIGIN, 1)
        return RedirectResponse(url=url, status_code=301)
    return await call_next(request)


@app.middleware('http')
async def security_headers(request: Request, call_next) -> Response:
    """全ての応答にセキュリティ関連のヘッダーを付ける。

    X-XSS-Protection は今のブラウザでは使われず、古いブラウザでは逆に悪用されることがあるため付けない。
    CSP（Content-Security-Policy）は読み込み元の洗い出しが必要なので、まだ付けていない。

    Args:
        request: リクエスト
        call_next: 次の処理を呼ぶ関数

    Returns:
        ヘッダーを付けた応答
    """
    # 変数の内容: response: 下流へ返す HTTP 応答。
    response = await call_next(request)
    # 1. HTTPS を強制し、2. MIME の誤認識を防ぎ、3. iframe 埋め込みと参照元情報を制御する。
    # HTTPS を強制する（1 年）
    response.headers['Strict-Transport-Security'] = f'max-age={_HSTS_MAX_AGE}'
    # 宣言と違う種類のファイルとして解釈させない（MIME スニッフィング防止）
    response.headers['X-Content-Type-Options'] = 'nosniff'
    # 他のサイトの iframe に入れさせない（クリックジャッキング防止）
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    # 他のサイトへのリンクでは参照元としてドメインだけを送る（予約キャンセルの URL のクエリなどを外に送らない）
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


@app.middleware('http')
async def cache_control(request: Request, call_next) -> Response:
    """応答の種類に応じた Cache-Control ヘッダーを付ける。

    1. API: ログインなしの GET で成功したものだけ公開キャッシュ。空き状況・エラー・書き込み・管理者の GET は no-store
    2. 静的ファイル（/assets・/img・/favicon）: 長期キャッシュ
    3. それ以外（HTML）: 毎回確認

    Args:
        request: リクエスト
        call_next: 次の処理を呼ぶ関数

    Returns:
        ヘッダーを付けた応答
    """
    # 変数の内容: path: 処理対象の URL パス、response: 下流へ返す HTTP 応答。
    response = await call_next(request)
    path = request.url.path
    # ルート側が明示した no-store は、汎用のHTML/静的キャッシュ設定で上書きしない。
    # ブランド専用HTMLとService Workerの旧キャッシュ解除応答で必要。
    if 'no-store' in response.headers.get('Cache-Control', '').lower():
        return response
    if path.startswith('/api/'):
        # 1. API
        is_public_get = (
            request.method == 'GET'
            and not request.headers.get('authorization')
        )
        if is_public_get and response.status_code < 400 and not _NO_STORE_PATH_RE.match(path):
            response.headers['Cache-Control'] = _PUBLIC_API_CACHE
        elif is_public_get:
            # エラーの応答と空き状況はキャッシュしない
            response.headers['Cache-Control'] = 'no-store'
            response.headers['CDN-Cache-Control'] = 'no-store'
        else:
            response.headers['Cache-Control'] = 'no-store'
            response.headers['CDN-Cache-Control'] = 'no-store'
    elif path.startswith(('/assets/', '/img/', '/favicon/')):
        # 2. 静的ファイル
        response.headers['Cache-Control'] = _STATIC_CACHE
    else:
        # 3. HTML
        response.headers['Cache-Control'] = _HTML_CACHE
    return response


# 1. API router は従来どおりミドルウェアの後、静的配信と SPA fallback の前に登録する。
# serve_spa が SEO 設定と HTML 生成に使うため、seo モジュール参照はこの入口に残す。
register_routers(app)

# 本番: Viteビルド済みSPAを配信
DIST = os.path.join(os.path.dirname(__file__), '../../frontend/dist')
if os.path.isdir(DIST):
    # ビルド結果の中で、そのまま静的ファイルとして配信するフォルダ
    for _subdir in ['assets', 'img', 'favicon']:
        # 変数の内容: _path: 確認対象の内部パス。
        _path = os.path.join(DIST, _subdir)
        if os.path.isdir(_path):
            app.mount(f'/{_subdir}', StaticFiles(directory=_path), name=_subdir)

    # SPA の index.html（全ページ共通の入口）
    INDEX_HTML = os.path.join(DIST, 'index.html')

    # SPA ルーティング: 静的ファイルが存在しない場合は index.html を返す
    @app.get('/{full_path:path}')
    def serve_spa(full_path: str, request: Request) -> Response:
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
        # 変数の内容: host: ブランド判定用に正規化したホスト名、path: 前後のスラッシュを除いたリクエストパス。
        host = normalize_spa_host(request.headers.get('host', ''))
        path = normalize_spa_path(full_path)

        # 1. ブランド管理画面を先に判定し、その後に旧ブランド URL を判定する。
        #    モバイル Safari でも JavaScript の起動に依存せず正規 URL へ転送できる。
        # 変数の内容: destination: 転送対象ならその URL、対象外なら None。
        destination = resolve_spa_redirect(
            host, path, request.url.query, SITE_ORIGIN, seo.BRAND_DOMAINS
        )
        if destination:
            return RedirectResponse(
                url=destination,
                status_code=301,
                headers={'Cache-Control': 'no-store, no-cache, must-revalidate'},
            )

        # 独立ブランドドメインに残っている旧PWAのService Workerとキャッシュを一度だけ解除する。
        if host in seo.BRAND_DOMAINS and path == 'sw.js':
            # 変数の内容: cleanup_worker: 一時ファイルを削除するバックグラウンド処理。
            cleanup_worker = """self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all((await caches.keys()).map(key => caches.delete(key)));
  await self.registration.unregister();
  await self.clients.claim();
  await Promise.all(windows.map(client => client.navigate(client.url).catch(() => undefined)));
})()));"""
            return Response(
                content=cleanup_worker,
                media_type='application/javascript',
                headers={'Cache-Control': 'no-store, no-cache, must-revalidate'},
            )
        if host in seo.BRAND_DOMAINS and path == 'registerSW.js':
            # 変数の内容: register_cleanup_worker: バックグラウンド処理を登録する関数。
            register_cleanup_worker = "if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})); }"
            return Response(
                content=register_cleanup_worker,
                media_type='application/javascript',
                headers={'Cache-Control': 'no-store, no-cache, must-revalidate'},
            )

        # 2. 静的ファイル（dist 直下の manifest・sw.js など）があればそのまま返す。
        #    「..%2F」や「%2Fetc%2F…」のようなパスで dist の外（.env やソースなど）を読まれないよう、
        #    実際の場所に直してから dist の中にあるときだけ返す（外を指すときは SPA の index.html を返す）
        # 変数の内容: file_path: dist 内に解決できた場合の静的ファイル実パス。
        file_path = resolve_dist_file_path(DIST, full_path)
        if file_path is not None and os.path.isfile(file_path):
            return FileResponse(file_path)
        # 3. パスに応じたメタ情報を index.html に入れて返す
        try:
            if host in seo.BRAND_DOMAINS:
                # 変数の内容: page_html: メタ情報を埋め込む HTML ページ。
                page_html = seo.render_spa_index(INDEX_HTML, full_path, dict(request.query_params), host)
            else:
                # 変数の内容: page_html: メタ情報を埋め込む HTML ページ。
                page_html = seo.render_spa_index(INDEX_HTML, full_path, dict(request.query_params))
            # 変数の内容: headers: HTTP 応答に付けるヘッダー。
            headers = {'Cache-Control': 'no-store, no-cache, must-revalidate'} if host in seo.BRAND_DOMAINS else None
            return HTMLResponse(page_html, headers=headers)
        # 変数の内容: e: except で捕捉した処理例外。
        except Exception as e:
            # 4. 失敗しても SPA は表示できるよう、元の index.html を返す
            # 例外の文字列には利用者の入力（パス）が入りうるので、型名とコードだけを出す
            logger.error('serve_spa メタ情報の埋め込みエラー（%r）: %s', full_path, error_summary(e))
            return FileResponse(INDEX_HTML)
