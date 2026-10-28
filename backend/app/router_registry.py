"""FastAPI の API ルーター登録を集約する。

各 router object と登録順は既存の API 仕様を維持し、アプリ入口から登録処理を分離する。
"""

from .routes import (
    articles,
    chat,
    chat_logs,
    chat_qa,
    collaborations,
    contact,
    docs,
    events,
    gallery,
    media_appearances,
    orders,
    pot_artists,
    price_calc_entries,
    products,
    reserve,
    seo,
    site_assets,
    shipping,
    stockists,
    upload,
)


# 定数の内容: API_PREFIX_ROUTER_CALLS: `/api` prefix で登録する router object と現在の登録順。
API_PREFIX_ROUTER_CALLS = (
    events.router,
    gallery.router,
    stockists.router,
    contact.router,
    reserve.router,
    collaborations.router,
    site_assets.router,
    upload.router,
    products.router,
    shipping.router,
    orders.router,
    articles.router,
    pot_artists.router,
    price_calc_entries.router,
    media_appearances.router,
    docs.router,
    chat.router,
    chat_qa.router,
    chat_logs.router,
)


def register_routers(app) -> None:
    """FastAPI アプリに API ルーターを既存の順序と prefix で登録する。

    Args:
        app: `include_router` を持つ FastAPI アプリケーション。

    Returns:
        なし。受け取ったアプリへルーターを登録する。
    """
    # 1. 既存の19個の API router を、順番を保って `/api` prefix 付きで登録する。
    # 変数の内容: router: 登録順に取り出した API router object。
    for router in API_PREFIX_ROUTER_CALLS:
        app.include_router(router, prefix='/api')

    # 2. robots.txt / sitemap.xml 用の SEO router を prefix なしで最後に登録する。
    app.include_router(seo.router)
