"""SPA・API のキャッシュヘッダー選択を純関数で確認するテスト。"""
import pytest

from app.spa_cache import resolve_cache_control_headers


class TestResolveCacheControlHeaders:
    """リクエストと応答に応じたキャッシュヘッダーの選択を確認する。"""

    def test_認証なしGETの成功APIは公開キャッシュになる(self):
        """公開 GET API の成功応答には共有キャッシュとブラウザーキャッシュを設定する。"""
        # 1. ギャラリーの成功応答に適用するヘッダーを選ぶ。
        headers = resolve_cache_control_headers('GET', '/api/gallery', False, 200, '')

        # 2. 公開 API 用の Cache-Control だけが選ばれることを確認する。
        assert headers == {'Cache-Control': 'public, s-maxage=300, max-age=60'}

    def test_成功境界の399も公開キャッシュになる(self):
        """ステータスコードが 400 未満なら API 応答は成功として扱う。"""
        # 1. 400 の直前のステータスで公開 API のヘッダーを選ぶ。
        headers = resolve_cache_control_headers('GET', '/api/gallery', False, 399, '')

        # 2. 400 未満の応答には公開キャッシュを設定することを確認する。
        assert headers == {'Cache-Control': 'public, s-maxage=300, max-age=60'}

    def test_公開GETの400エラーはCDNを含めてno_storeになる(self):
        """公開 GET API でも 400 以上の応答はブラウザーと CDN の両方で保存しない。"""
        # 1. 400 の公開 API 応答に適用するヘッダーを選ぶ。
        headers = resolve_cache_control_headers('GET', '/api/gallery', False, 400, '')

        # 2. 両方のキャッシュ層へ no-store を指定することを確認する。
        assert headers == {
            'Cache-Control': 'no-store',
            'CDN-Cache-Control': 'no-store',
        }

    def test_認証ヘッダーがあるGET_APIはno_storeになる(self):
        """Authorization を伴う GET API は成功応答でもキャッシュしない。"""
        # 1. 認証情報がある API 応答に適用するヘッダーを選ぶ。
        headers = resolve_cache_control_headers('GET', '/api/gallery', True, 200, '')

        # 2. Cache-Control と CDN-Cache-Control の両方が no-store になることを確認する。
        assert headers == {
            'Cache-Control': 'no-store',
            'CDN-Cache-Control': 'no-store',
        }

    def test_書き込みAPIは認証の有無にかかわらずno_storeになる(self):
        """GET 以外の API は認証がなくてもキャッシュしない。"""
        # 1. 未認証の POST API に適用するヘッダーを選ぶ。
        headers = resolve_cache_control_headers('POST', '/api/contacts', False, 200, '')

        # 2. Cache-Control と CDN-Cache-Control の両方が no-store になることを確認する。
        assert headers == {
            'Cache-Control': 'no-store',
            'CDN-Cache-Control': 'no-store',
        }

    def test_予約枠APIは公開GETでもno_storeになる(self):
        """予約状況は変化が速いため、対象パスの公開 GET も保存しない。"""
        # 1. イベントの予約枠 API に適用するヘッダーを選ぶ。
        headers = resolve_cache_control_headers(
            'GET', '/api/events/event-123/sessions', False, 200, ''
        )

        # 2. 両方のキャッシュ層へ no-store を指定することを確認する。
        assert headers == {
            'Cache-Control': 'no-store',
            'CDN-Cache-Control': 'no-store',
        }

    def test_サイト画像APIは公開GETでもno_storeになる(self):
        """管理画面から変更するサイト画像 API は公開 GET の形でも保存しない。"""
        # 1. サイト画像 API に適用するヘッダーを選ぶ。
        headers = resolve_cache_control_headers(
            'GET', '/api/site-assets/hue-home', False, 200, ''
        )

        # 2. 両方のキャッシュ層へ no-store を指定することを確認する。
        assert headers == {
            'Cache-Control': 'no-store',
            'CDN-Cache-Control': 'no-store',
        }

    @pytest.mark.parametrize(
        ('path',),
        [
            ('/assets/app-abc123.js',),
            ('/img/plant.jpg',),
            ('/favicon/favicon.ico',),
        ],
        ids=['assets', 'img', 'favicon'],
    )
    def test_静的ファイルは長期キャッシュになる(self, path):
        """静的配信対象の3つの prefix は同じ長期キャッシュを使う。

        Args:
            path: キャッシュ方針を確認する静的ファイルの URL パス。

        Returns:
            なし。
        """
        # 1. 指定された静的ファイルのパスに適用するヘッダーを選ぶ。
        headers = resolve_cache_control_headers('GET', path, False, 200, '')

        # 2. キャッシュ期間1年・ブラウザー1日の静的ファイル用ヘッダーを確認する。
        assert headers == {
            'Cache-Control': 'public, s-maxage=31536000, max-age=86400, immutable'
        }

    def test_HTMLのGETは再検証付きキャッシュになる(self):
        """API や静的ファイルではない GET は HTML 用の再検証付きキャッシュを使う。"""
        # 1. SPA の公式ページに適用するヘッダーを選ぶ。
        headers = resolve_cache_control_headers('GET', '/official', False, 200, '')

        # 2. ブラウザーが毎回再検証する HTML 用の値を確認する。
        assert headers == {
            'Cache-Control': 'public, s-maxage=60, max-age=0, must-revalidate'
        }

    def test_HTMLのPOSTも再検証付きキャッシュになる(self):
        """HTML 分岐では HTTP メソッドによるキャッシュ値の変更を行わない。"""
        # 1. POST で HTML 分岐に入るパスのヘッダーを選ぶ。
        headers = resolve_cache_control_headers('POST', '/official/contact', False, 200, '')

        # 2. GET と同じ HTML 用の値が選ばれることを確認する。
        assert headers == {
            'Cache-Control': 'public, s-maxage=60, max-age=0, must-revalidate'
        }

    def test_既存のno_storeは大小文字を問わず変更しない(self):
        """既存 Cache-Control に no-store があれば、後段の値を選ばない。"""
        # 1. HTML 応答にすでに設定された大文字混在の no-store を渡す。
        headers = resolve_cache_control_headers(
            'GET', '/official', False, 200, 'private, NO-STORE, must-revalidate'
        )

        # 2. 呼び出し元が既存ヘッダーをそのまま維持できるよう None を返すことを確認する。
        assert headers is None
