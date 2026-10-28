"""SPA の旧ブランド URL と管理画面転送先を解決する純関数のテスト。"""

import pytest

from app.spa_redirects import resolve_spa_redirect


BRAND_DOMAINS = {
    'habitatoides.com': ('Habitat Oides', 'https://habitatoides.com'),
    'www.habitatoides.com': ('Habitat Oides', 'https://habitatoides.com'),
    'huebyei8htplants.com': ('HUE by ei8ht plants', 'https://huebyei8htplants.com'),
    'www.huebyei8htplants.com': ('HUE by ei8ht plants', 'https://huebyei8htplants.com'),
}
SITE_ORIGIN = 'https://ei8htplants.com'


class TestResolveSpaRedirect:
    """ブランド管理画面と移転済み URL の転送先解決を確認する。"""

    @pytest.mark.parametrize(
        'host',
        [
            'habitatoides.com',
            'www.habitatoides.com',
            'huebyei8htplants.com',
            'www.huebyei8htplants.com',
        ],
    )
    def test_ブランドhostの管理画面はqueryを保持して公式サイトへ転送する(self, host):
        """ブランド host と www host の admin を公式サイトへ転送し、query を保持する。

        Args:
            self: テストクラスのインスタンス。
            host: 本番許可リストにあるブランド host。

        Returns:
            なし。
        """
        # 1. ブランド host の管理画面トップを query 付きで解決する。
        destination = resolve_spa_redirect(
            host, 'admin', 'next=%2Fadmin%2Fevents', SITE_ORIGIN, BRAND_DOMAINS
        )

        # 2. www を含む全ブランド host が同じ公式サイトのパスへ転送され、query も保たれることを確認する。
        assert destination == 'https://ei8htplants.com/admin?next=%2Fadmin%2Fevents'

    @pytest.mark.parametrize(
        'host',
        [
            'habitatoides.com',
            'www.habitatoides.com',
            'huebyei8htplants.com',
            'www.huebyei8htplants.com',
        ],
    )
    def test_ブランドhostのadmin配下もqueryを保持して転送する(self, host):
        """ブランド host と www host の admin 配下も公式サイトへ転送する。

        Args:
            self: テストクラスのインスタンス。
            host: 本番許可リストにあるブランド host。

        Returns:
            なし。
        """
        # 1. ブランド host の admin 配下を query 付きで解決する。
        destination = resolve_spa_redirect(
            host, 'admin/events/42', 'tab=photos', SITE_ORIGIN, BRAND_DOMAINS
        )

        # 2. 配下のパスと query を維持した公式サイト URL を確認する。
        assert destination == 'https://ei8htplants.com/admin/events/42?tab=photos'

    def test_ブランドhost以外やhostの大文字表記はadminでも転送しない(self):
        """通常 host と未正規化の大文字 host はブランド admin 転送対象外にする。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 1. 通常 host と大文字 host を同じブランド辞書でそれぞれ解決する。
        regular_host = resolve_spa_redirect(
            'ei8htplants.com', 'admin', '', SITE_ORIGIN, BRAND_DOMAINS
        )
        uppercase_host = resolve_spa_redirect(
            'HABITATOIDES.COM', 'admin', '', SITE_ORIGIN, BRAND_DOMAINS
        )

        # 2. host の正規化は呼び出し側の責務なので、どちらも転送しないことを確認する。
        assert regular_host is None
        assert uppercase_host is None

    @pytest.mark.parametrize(
        ('host', 'path', 'expected'),
        [
            ('ei8htplants.com', 'habitatoides', 'https://habitatoides.com/'),
            ('ei8htplants.com', 'habitatoides/workshop', 'https://habitatoides.com/workshop'),
            ('ei8htplants.com', 'hue', 'https://huebyei8htplants.com/'),
            ('ei8htplants.com', 'collaborations', 'https://habitatoides.com/collaborations'),
            ('www.ei8htplants.com', 'habitatoides', 'https://habitatoides.com/'),
            ('www.ei8htplants.com', 'habitatoides/workshop', 'https://habitatoides.com/workshop'),
            ('www.ei8htplants.com', 'hue', 'https://huebyei8htplants.com/'),
            ('www.ei8htplants.com', 'collaborations', 'https://habitatoides.com/collaborations'),
            ('habitatoides.com', 'hue', 'https://huebyei8htplants.com/'),
            ('www.habitatoides.com', 'hue', 'https://huebyei8htplants.com/'),
            ('huebyei8htplants.com', 'habitatoides', 'https://habitatoides.com/'),
            ('www.huebyei8htplants.com', 'habitatoides', 'https://habitatoides.com/'),
        ],
    )
    def test_旧ブランドURLは現行対応表に従いqueryを保持して転送する(
        self, host, path, expected
    ):
        """現行の旧 URL 対応表にある全経路で転送先と query 保持を確認する。

        Args:
            self: テストクラスのインスタンス。
            host: 旧 URL を受け付ける host。
            path: 対応表に登録された旧 URL のパス。
            expected: 対応表が定める転送先 URL。

        Returns:
            なし。
        """
        # 1. 現行の移転先と query を指定して旧 URL の転送先を解決する。
        destination = resolve_spa_redirect(
            host, path, 'source=legacy&page=2', SITE_ORIGIN, BRAND_DOMAINS
        )

        # 2. 対応表の転送先に query がそのまま付加されることを確認する。
        assert destination == f'{expected}?source=legacy&page=2'

    def test_対応表にないhostやpathは転送先なしを返す(self):
        """旧 URL 対応表にもブランド admin にも該当しない場合は転送しない。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 1. 未登録 host と登録 host の未登録 path をそれぞれ解決する。
        unknown_host = resolve_spa_redirect(
            'unknown.example.com', 'habitatoides', '', SITE_ORIGIN, BRAND_DOMAINS
        )
        unknown_path = resolve_spa_redirect(
            'ei8htplants.com', 'habitatoides/about', '', SITE_ORIGIN, BRAND_DOMAINS
        )

        # 2. いずれも対象外として None が返ることを確認する。
        assert unknown_host is None
        assert unknown_path is None
