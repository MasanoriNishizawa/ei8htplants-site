"""SPA fallback の Host と path の既存正規化を固定するテスト。"""

import pytest

from app.spa_normalization import normalize_spa_host, normalize_spa_path


class TestNormalizeSpaHost:
    """SPA fallback が使う Host 正規化の既存仕様を確認する。"""

    @pytest.mark.parametrize(
        ('host', 'expected'),
        [
            ('HABITATOIDES.COM', 'habitatoides.com'),
            ('HUEBYEI8HTPLANTS.COM:8443', 'huebyei8htplants.com'),
            ('', ''),
        ],
    )
    def test_hostを小文字化し最初のコロン以降を除き空hostは空文字のまま返す(
        self, host, expected
    ):
        """小文字化・port 除去・空 Host の既存結果を確認する。

        Args:
            self: テストクラスのインスタンス。
            host: SPA fallback が受け取る Host の値。
            expected: 既存処理で正規化したときの Host。

        Returns:
            なし。
        """
        # 1. Host を SPA fallback が使う既存の小文字化・コロン分割規則で正規化する。
        # 2. 大文字、port 付き、空文字の各入力で既存の戻り値を確認する。
        assert normalize_spa_host(host) == expected


class TestNormalizeSpaPath:
    """SPA fallback が使う path の前後スラッシュ除去を確認する。"""

    @pytest.mark.parametrize(
        ('path', 'expected'),
        [
            ('/admin/events/', 'admin/events'),
            ('admin/events/', 'admin/events'),
            ('/admin/events', 'admin/events'),
            ('/', ''),
            ('', ''),
        ],
    )
    def test_pathの前後slashを除きslashだけと空文字は空文字で返す(
        self, path, expected
    ):
        """path の前後スラッシュ除去と空入力の既存結果を確認する。

        Args:
            self: テストクラスのインスタンス。
            path: SPA fallback が受け取る URL path。
            expected: 既存処理で正規化したときの path。

        Returns:
            なし。
        """
        # 1. path の先頭と末尾にある slash を既存の strip 規則で除く。
        # 2. 前後に slash がある値、片側の slash、slash だけ、空文字の結果を確認する。
        assert normalize_spa_path(path) == expected
