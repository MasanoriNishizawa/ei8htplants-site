"""ブランド専用ドメインの旧 PWA ファイル応答を確認するテスト。"""

from fastapi.responses import Response

from app.spa_pwa import create_brand_pwa_response


class TestCreateBrandPwaResponse:
    """旧 PWA スクリプトの対象判定と JavaScript 応答を確認する。"""

    def test_ブランドhostのsw_jsには解除用ServiceWorkerを返す(self):
        """ブランドドメインの sw.js に解除処理と no-cache 応答を返す。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 1. 対象ブランドと、その旧 Service Worker のパスを指定する。
        # 変数の内容: brand_domains: helper がブランド host と判定する設定。
        brand_domains = {'habitatoides.com': ('Habitat Oides', 'https://habitatoides.com')}
        # 変数の内容: response: ブランド用 sw.js に対する解除スクリプト応答。
        response = create_brand_pwa_response('habitatoides.com', 'sw.js', brand_domains)

        # 2. JavaScript 応答の状態・ヘッダー・Service Worker 解除処理を確認する。
        assert isinstance(response, Response)
        assert response.status_code == 200
        assert response.media_type == 'application/javascript'
        assert response.headers['content-type'] == 'application/javascript'
        assert response.headers['cache-control'] == 'no-store, no-cache, must-revalidate'
        # 変数の内容: response_body: 解除用 Service Worker JavaScript の文字列。
        response_body = response.body.decode('utf-8')
        assert "self.addEventListener('install'" in response_body
        assert 'caches.delete(key)' in response_body
        assert 'self.registration.unregister()' in response_body
        assert 'client.navigate(client.url)' in response_body

    def test_ブランドhostのregisterSW_jsには解除用登録scriptを返す(self):
        """ブランドドメインの registerSW.js に旧 SW を解除する登録本文を返す。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 1. 対象ブランドと、旧 Service Worker 登録スクリプトのパスを指定する。
        # 変数の内容: brand_domains: helper がブランド host と判定する設定。
        brand_domains = {'huebyei8htplants.com': ('HUE by ei8ht plants', 'https://huebyei8htplants.com')}
        # 変数の内容: response: ブランド用 registerSW.js に対する解除用登録応答。
        response = create_brand_pwa_response('huebyei8htplants.com', 'registerSW.js', brand_domains)

        # 2. JavaScript 応答の状態・ヘッダー・旧 SW 登録処理を確認する。
        assert isinstance(response, Response)
        assert response.status_code == 200
        assert response.media_type == 'application/javascript'
        assert response.headers['content-type'] == 'application/javascript'
        assert response.headers['cache-control'] == 'no-store, no-cache, must-revalidate'
        # 変数の内容: response_body: 旧 Service Worker の解除用登録 JavaScript の文字列。
        response_body = response.body.decode('utf-8')
        assert "'serviceWorker' in navigator" in response_body
        assert "navigator.serviceWorker.register('/sw.js'" in response_body
        assert "{ scope: '/' }" in response_body

    def test_非ブランドhostの対象pathはNoneを返す(self):
        """ブランド設定に含まれない host には PWA 応答を作らない。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 1. ブランド host 一覧と、それに含まれない本体サイトの host を指定する。
        # 変数の内容: brand_domains: PWA 解除応答を許可するブランド host の設定。
        brand_domains = {'habitatoides.com': ('Habitat Oides', 'https://habitatoides.com')}
        # 変数の内容: response: 非ブランド host に対する PWA helper の結果。
        response = create_brand_pwa_response('ei8htplants.com', 'sw.js', brand_domains)

        # 2. 対象 path であっても非ブランド host には応答しないことを確認する。
        assert response is None

    def test_ブランドhostの未対応pathはNoneを返す(self):
        """ブランド host でも対応していないパスには応答を作らない。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 1. ブランド host と、PWA 解除対象ではない JavaScript パスを指定する。
        # 変数の内容: brand_domains: PWA 解除応答を許可するブランド host の設定。
        brand_domains = {'habitatoides.com': ('Habitat Oides', 'https://habitatoides.com')}
        # 変数の内容: response: ブランド host の未対応 path に対する helper の結果。
        response = create_brand_pwa_response('habitatoides.com', 'assets/app.js', brand_domains)

        # 2. 未対応 path は通常の SPA 静的ファイル処理へ委ねるため None を返すことを確認する。
        assert response is None
