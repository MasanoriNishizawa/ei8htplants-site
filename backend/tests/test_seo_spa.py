"""SPA 用 HTML と SEO メタ情報の連携を行う純関数のテスト。"""

from unittest.mock import patch

import pytest

from app.routes import seo
from app.routes.seo_spa import render_spa_html


class TestRenderSpaHtml:
    """SEO メタ情報の生成・HTML 注入・ブランド後処理の順序を確認する。"""

    def test_通常hostでは正規化hostを渡して後処理を呼ばない(self):
        """通常 host を正規化してメタ情報生成へ渡し、後処理なしで HTML を返す。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: calls: 各依存関数が呼ばれた順と引数を記録する一覧。
        calls = []
        # 変数の内容: meta: メタ情報生成関数が返すテスト用オブジェクト。
        meta = object()
        # 変数の内容: original_html: 注入対象として渡す index.html。
        original_html = '<html><head></head><body>site</body></html>'
        # 変数の内容: injected_html: inject_head が返す注入後の HTML。
        injected_html = '<html><head><title>site</title></head><body>site</body></html>'

        # 1. 通常 host と各処理を記録する依存関数を渡して関数を実行する。
        # 変数の内容: result: テスト対象関数が返した結果。
        result = render_spa_html(
            original_html,
            '/official/events/market',
            {'page': 'past'},
            'WWW.EI8HTPLANTS.COM:8443',
            lambda path, query, hostname: calls.append(('build', path, query, hostname)) or meta,
            lambda page, page_meta: calls.append(('inject', page, page_meta)) or injected_html,
            {'habitatoides.com': ('Habitat Oides', 'https://habitatoides.com')},
            lambda page, site_name: calls.append(('cleanup', page, site_name)) or 'cleaned',
        )

        # 2. hostname の正規化、引数、注入出力、ブランド後処理の省略を確認する。
        assert calls == [
            ('build', '/official/events/market', {'page': 'past'}, 'www.ei8htplants.com'),
            ('inject', original_html, meta),
        ]
        assert result == injected_html

    def test_brand_hostではブランド名でcleanupして最終HTMLを返す(self):
        """許可されたブランド host だけにブランド名を渡して HTML 後処理を行う。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: calls: SEO処理が実行された順と引数を記録する一覧。
        calls = []
        # 変数の内容: meta: build_page_meta が作るメタ情報の偽物。
        meta = {'title': 'Habitat'}
        # 変数の内容: injected_html: head 注入処理の結果。
        injected_html = '<html><head>meta</head><body>brand</body></html>'
        # 変数の内容: cleaned_html: ブランド用後処理の最終結果。
        cleaned_html = '<html><head>brand meta</head><body>brand</body></html>'
        # 変数の内容: brands: host をブランド名と origin に対応付ける許可辞書。
        brands = {'habitatoides.com': ('Habitat Oides', 'https://habitatoides.com')}

        # 1. ブランド host に対し、生成・注入・ブランド後処理の各依存関数を実行する。
        # 変数の内容: result: テスト対象関数が返した結果。
        result = render_spa_html(
            '<html></html>', '/workshop', None, 'habitatoides.com',
            lambda path, query, hostname: calls.append(('build', path, query, hostname)) or meta,
            lambda page, page_meta: calls.append(('inject', page, page_meta)) or injected_html,
            brands,
            lambda page, site_name: calls.append(('cleanup', page, site_name)) or cleaned_html,
        )

        # 2. build→inject→cleanup の順、ブランド名、後処理後の戻り値を確認する。
        assert calls == [
            ('build', '/workshop', None, 'habitatoides.com'),
            ('inject', '<html></html>', meta),
            ('cleanup', injected_html, 'Habitat Oides'),
        ]
        assert result == cleaned_html

    def test_大文字とport付きbrand_hostを正規化してブランド判定する(self):
        """host を小文字化して port を除いてからブランド辞書を参照する。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: calls: 関数間の呼び出し順を記録する一覧。
        calls = []
        # 変数の内容: brands: 正規化後の host に対応するブランド情報。
        brands = {'huebyei8htplants.com': ('HUE by ei8ht plants', 'https://huebyei8htplants.com')}
        # 変数の内容: injected_html: inject_head が生成する HTML。
        injected_html = '<html>injected</html>'

        # 1. 大文字かつ port 付きの host を渡し、正規化後のブランド処理を実行する。
        # 変数の内容: result: テスト対象関数が返した結果。
        result = render_spa_html(
            '<html>source</html>', '/about', {'lang': 'ja'}, 'HUEBYEI8HTPLANTS.COM:443',
            lambda path, query, hostname: calls.append(('build', path, query, hostname)) or 'meta',
            lambda page, meta: calls.append(('inject', page, meta)) or injected_html,
            brands,
            lambda page, site_name: calls.append(('cleanup', page, site_name)) or 'hue-cleaned',
        )

        # 2. 正規化した host が meta 生成とブランド判定の両方に使われることを確認する。
        assert calls == [
            ('build', '/about', {'lang': 'ja'}, 'huebyei8htplants.com'),
            ('inject', '<html>source</html>', 'meta'),
            ('cleanup', injected_html, 'HUE by ei8ht plants'),
        ]
        assert result == 'hue-cleaned'

    def test_未知hostではcleanupを呼ばずinject結果をそのまま返す(self):
        """ブランド辞書に無い host ではブランド専用の HTML 後処理を行わない。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: cleanup_calls: ブランド後処理の呼び出しを記録する一覧。
        cleanup_calls = []
        # 変数の内容: injected_html: head 注入後に返す通常サイトの HTML。
        injected_html = '<html><head>meta</head></html>'

        # 1. 未知 host と、呼び出しの有無を記録する依存関数を使って実行する。
        # 変数の内容: result: テスト対象関数が返した結果。
        result = render_spa_html(
            '<html></html>', '/', {}, 'unknown.example',
            lambda path, query, hostname: {'path': path, 'hostname': hostname},
            lambda page, meta: injected_html,
            {},
            lambda page, site_name: cleanup_calls.append((page, site_name)) or 'unexpected',
        )

        # 2. ブランド後処理が呼ばれず、inject_head の戻り値がそのまま返ることを確認する。
        assert cleanup_calls == []
        assert result == injected_html

    def test_hostnameがNoneならindexを読む前にAttributeErrorになる(self):
        """互換ラッパーが hostname を先に処理し、index 読み込みを行わないことを確認する。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 1. index 読み込みを偽物へ置き換え、hostname=None でラッパーを呼ぶ。
        # 変数の内容: read_index: index.html 読み込み関数の置き換えモック。
        with patch.object(seo, '_read_index') as read_index:
            # 変数の内容: error: hostname を文字列として処理できない場合の例外情報。
            with pytest.raises(AttributeError):
                seo.render_spa_index('/unused/index.html', '/', hostname=None)

            # 2. hostname の処理で例外になり、index ファイルへ触れていないことを確認する。
            read_index.assert_not_called()
