"""FastAPI のルーター登録順と prefix を確認するテスト。"""

from app import router_registry
from app.routes import (
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
    shipping,
    site_assets,
    stockists,
    upload,
)


# 定数の内容: API_PREFIX_ROUTER_CALLS: `/api` prefix で登録する19個の実 router object と登録順。
API_PREFIX_ROUTER_CALLS = (
    (events.router, '/api'),
    (gallery.router, '/api'),
    (stockists.router, '/api'),
    (contact.router, '/api'),
    (reserve.router, '/api'),
    (collaborations.router, '/api'),
    (site_assets.router, '/api'),
    (upload.router, '/api'),
    (products.router, '/api'),
    (shipping.router, '/api'),
    (orders.router, '/api'),
    (articles.router, '/api'),
    (pot_artists.router, '/api'),
    (price_calc_entries.router, '/api'),
    (media_appearances.router, '/api'),
    (docs.router, '/api'),
    (chat.router, '/api'),
    (chat_qa.router, '/api'),
    (chat_logs.router, '/api'),
)


class RecordingRouterApp:
    """include_router の引数を記録し、登録内容をテスト可能にする仮アプリ。"""

    def __init__(self):
        """登録呼び出しの記録先を初期化する。

        Args:
            self: テスト用アプリのインスタンス。

        Returns:
            なし。
        """
        # 1. 登録呼び出しの記録先を初期化する。
        # 変数の内容: calls: 登録された router object と prefix を順番に保持する一覧。
        self.calls = []

    def include_router(self, router, prefix=None):
        """ルーターと prefix を呼び出し順のまま記録する。

        Args:
            self: テスト用アプリのインスタンス。
            router: 登録対象の実 FastAPI router object。
            prefix: 登録時に指定された URL prefix。指定がなければ None。

        Returns:
            なし。
        """
        # 1. 呼び出し順と指定 prefix を保つため、組として記録する。
        self.calls.append((router, prefix))


class TestRouterRegistry:
    """router_registry が既存の登録順と prefix を保つことを確認する。"""

    def test_apiルーターを指定順にapi_prefixで登録する(self):
        """19個の実 router object が現在の順序で `/api` 登録されることを確認する。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: app: 登録された router object と prefix を記録する仮アプリ。
        app = RecordingRouterApp()

        # 1. router_registry に登録を依頼する。
        router_registry.register_routers(app)

        # 2. 先行する19個の API router の object identity と prefix を順番ごと確認する。
        assert app.calls[:len(API_PREFIX_ROUTER_CALLS)] == list(API_PREFIX_ROUTER_CALLS)

    def test_seo_routerを最後にprefixなしで登録する(self):
        """20個目の SEO router が実 object のまま prefix なしで最後に登録されることを確認する。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: app: 登録された router object と prefix を記録する仮アプリ。
        app = RecordingRouterApp()

        # 1. router_registry に登録を依頼する。
        router_registry.register_routers(app)

        # 2. 登録数と、SEO router が prefix なしの最後であることを確認する。
        assert len(app.calls) == 20
        assert app.calls[-1] == (seo.router, None)
