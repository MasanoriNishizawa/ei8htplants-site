"""SPA と API の応答に適用するキャッシュヘッダー規則。"""
import re
from typing import Optional

# 変数の内容: キャッシュを避ける予約枠と管理画面編集画像の API パス。
# - /api/events/{id}/sessions: 予約枠（残数が変わりやすい）
# - /api/site-assets/{key}: サイト画像の1件取得
# - /api/site-assets: サイト画像の一括取得（?prefix=... はクエリ文字列なので path には含まれない）
_NO_STORE_PATH_RE = re.compile(r'^/api/(?:events/[^/]+/sessions|site-assets(?:/[^/]+)?)$')

# 変数の内容: 認証なしで取得できる API に設定する CDN・ブラウザー向けのキャッシュ時間。
_PUBLIC_API_CACHE = 'public, s-maxage=300, max-age=60'
# 変数の内容: ハッシュ付き配信ファイルや画像などに設定する長期キャッシュ。
_STATIC_CACHE = 'public, s-maxage=31536000, max-age=86400, immutable'
# 変数の内容: SPA の HTML に設定する再検証付きキャッシュ。
_HTML_CACHE = 'public, s-maxage=60, max-age=0, must-revalidate'


def resolve_cache_control_headers(
    method: str,
    path: str,
    has_authorization: bool,
    status_code: int,
    existing_cache_control: str,
) -> Optional[dict[str, str]]:
    """リクエストと応答に応じて設定するキャッシュヘッダーを選ぶ。

    Args:
        method: HTTP メソッド。
        path: リクエストの URL パス。
        has_authorization: Authorization ヘッダーが存在するか。
        status_code: 下流の応答ステータス。
        existing_cache_control: 下流の応答にすでに設定された Cache-Control 値。

    Returns:
        設定するヘッダー名と値の辞書。既存の no-store を維持する場合は None。
    """
    # 1. ルートが明示した no-store は大文字小文字を問わず尊重し、既存ヘッダーを保つ。
    if 'no-store' in existing_cache_control.lower():
        return None

    # 2. API は認証なしの成功した GET のうち、変化の速い対象以外だけ公開キャッシュする。
    if path.startswith('/api/'):
        # 変数の内容: is_public_get: 認証情報を伴わない GET リクエストかどうか。
        is_public_get = method == 'GET' and not has_authorization
        if (
            is_public_get
            and status_code < 400
            and not _NO_STORE_PATH_RE.match(path)
        ):
            return {'Cache-Control': _PUBLIC_API_CACHE}
        return {
            'Cache-Control': 'no-store',
            'CDN-Cache-Control': 'no-store',
        }

    # 3. 配信アセットと画像は、見つかった応答だけ長期キャッシュする。
    #    置いていないファイルの 404 まで長期キャッシュすると、あとでファイルを置いても
    #    （例: Habitat Oides のサイン sign.svg）ブラウザや CDN で「無い」状態が続くため、保存させない。
    if path.startswith(('/assets/', '/img/', '/favicon/')):
        if status_code >= 400:
            return {
                'Cache-Control': 'no-store',
                'CDN-Cache-Control': 'no-store',
            }
        return {'Cache-Control': _STATIC_CACHE}
    return {'Cache-Control': _HTML_CACHE}
