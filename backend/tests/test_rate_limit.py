"""
回数制限（app/rate_limit.py）のテスト。

- 問い合わせ・予約・キャンセル・注文はそれぞれ IP ごとに 1 分 5 回（6 回目は 429）
- チャットは 1 分 10 回（11 回目は 429）
- 入力チェック（422）で弾かれた送信は数えない
- 期間（60 秒）が過ぎればまた通る
- API ごとに別々に数える。IP ごとにも別々に数える
- reset_all() で記録が消える

時刻は app.rate_limit.time.time をパッチして進める。DB・メール・決済・Gemini はすべてモック。
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import rate_limit
from app.main import app
from app.rate_limit import PUBLIC_WRITE_LIMIT, PUBLIC_WRITE_WINDOW, RATE_LIMIT_MESSAGE, RateLimiter
from tests._helpers import not_found_error
from tests.test_chat import VALID_PAYLOAD as CHAT_PAYLOAD, _post_with_mocks as post_chat

# 正しい問い合わせの入力
CONTACT = {'name': 'テスト', 'email': 'a@example.com', 'message': '本文'}


def _post_contact(client: TestClient, payload: dict = CONTACT):
    """問い合わせを送る（DB はモック・メールは送らない）。

    Args:
        client: API リクエストを送るテストクライアント。
        payload: API に送信する JSON データ。

    Returns:
        問い合わせ API のテストレスポンスを返す。
    """
    # 1. 問い合わせを送る（DB はモック・メールは送らない）。
    with patch('app.routes.contact.admin_supabase', MagicMock()), \
         patch('app.routes.contact.RESEND_API_KEY', ''):
        return client.post('/api/contact', json=payload)


class TestRateLimiterUnit:
    """RateLimiter そのものの動き。"""

    def test_上限回数までは通り次の1回で429になりその回は数えない(self):
        """limit 回までは通り、limit+1 回目は 429。429 になった回は記録に加えないこと。

        Returns:
            なし。
        """
        # 変数の内容: limiter: 回数制限インスタンス。
        # 1. limit 回までは通り、limit+1 回目は 429。429 になった回は記録に加えないこと。
        limiter = RateLimiter(3, 60)
        # 変数の内容: _: 繰り返し回数だけを使うための未使用値。
        for _ in range(3):
            limiter.check('1.1.1.1')
        # 変数の内容: e: except で捕捉した処理例外。
        with pytest.raises(HTTPException) as e:
            limiter.check('1.1.1.1')
        assert e.value.status_code == 429
        assert e.value.detail == RATE_LIMIT_MESSAGE
        assert len(limiter.log['1.1.1.1']) == 3

    def test_期間が過ぎるとまた通る(self):
        """最初の記録から window 秒たつと、また受け付けること（境界: window 秒ちょうどで通る）。

        Returns:
            なし。
        """
        # 変数の内容: limiter: 回数制限インスタンス。
        # 1. 最初の記録から window 秒たつと、また受け付けること（境界: window 秒ちょうどで通る）。
        limiter = RateLimiter(2, 60)
        with patch('app.rate_limit.time.time', return_value=1000.0):
            limiter.check('ip')
            limiter.check('ip')
        with patch('app.rate_limit.time.time', return_value=1059.9), pytest.raises(HTTPException):
            limiter.check('ip')
        with patch('app.rate_limit.time.time', return_value=1060.0):
            limiter.check('ip')

    def test_IPごとに別々に数える(self):
        """ある IP が上限に達しても、別の IP は通ること。

        Returns:
            なし。
        """
        # 変数の内容: limiter: 回数制限インスタンス。
        # 1. ある IP が上限に達しても、別の IP は通ること。
        limiter = RateLimiter(1, 60)
        limiter.check('a')
        with pytest.raises(HTTPException):
            limiter.check('a')
        limiter.check('b')

    def test_古いIPの記録は掃除される(self):
        """window 秒より前の記録しか無い IP は、次の確認のときに記録から消えること（記録が増え続けない）。

        Returns:
            なし。
        """
        # 変数の内容: limiter: 回数制限インスタンス。
        # 1. window 秒より前の記録しか無い IP は、次の確認のときに記録から消えること（記録が増え続けない）。
        limiter = RateLimiter(5, 60)
        with patch('app.rate_limit.time.time', return_value=1000.0):
            limiter.check('old')
        with patch('app.rate_limit.time.time', return_value=1100.0):
            limiter.check('new')
        assert 'old' not in limiter.log
        assert 'new' in limiter.log

    def test_reset_allで公開の書き込みAPIの記録がすべて消える(self):
        """reset_all() で 4 つの回数制限の記録が消えること。

        Returns:
            なし。
        """
        # 変数の内容: limiter: 対象の回数制限インスタンス。
        # 1. reset_all() で 4 つの回数制限の記録が消えること。
        for limiter in (rate_limit.contact_limiter, rate_limit.reserve_limiter,
                        rate_limit.cancel_limiter, rate_limit.order_limiter):
            limiter.check('x')
        rate_limit.reset_all()
        # 変数の内容: limiter: 対象の回数制限インスタンス。
        for limiter in (rate_limit.contact_limiter, rate_limit.reserve_limiter,
                        rate_limit.cancel_limiter, rate_limit.order_limiter):
            assert limiter.log == {}

    def test_公開の書き込みAPIの上限は1分5回(self):
        """PUBLIC_WRITE_LIMIT=5・PUBLIC_WRITE_WINDOW=60 であること。

        Returns:
            なし。
        """
        # 1. PUBLIC_WRITE_LIMIT=5・PUBLIC_WRITE_WINDOW=60 であること。
        assert PUBLIC_WRITE_LIMIT == 5
        assert PUBLIC_WRITE_WINDOW == 60


class TestContactRateLimit:
    """問い合わせ POST /api/contact の回数制限。"""

    def test_5回までは通り6回目は429で保存しない(self):
        """同じ IP から 5 回は 200、6 回目は 429 で DB に保存しないこと。

        Returns:
            なし。
        """
        # 変数の内容: client: テスト対象の API クライアント。
        # 1. 同じ IP から 5 回は 200、6 回目は 429 で DB に保存しないこと。
        client = TestClient(app)
        # 変数の内容: _: 繰り返し回数だけを使うための未使用値。
        for _ in range(5):
            assert _post_contact(client).status_code == 200
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = MagicMock()
        with patch('app.routes.contact.admin_supabase', mock_sb), patch('app.routes.contact.RESEND_API_KEY', ''):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = client.post('/api/contact', json=CONTACT)
        assert resp.status_code == 429
        assert resp.json()['detail'] == RATE_LIMIT_MESSAGE
        mock_sb.table.assert_not_called()

    def test_入力エラーの422は回数に数えない(self):
        """422 になった送信を 10 回しても数えず、そのあと正しい送信が 5 回通ること。

        Returns:
            なし。
        """
        # 変数の内容: client: テスト対象の API クライアント。
        # 1. 422 になった送信を 10 回しても数えず、そのあと正しい送信が 5 回通ること。
        client = TestClient(app)
        # 変数の内容: _: 繰り返し回数だけを使うための未使用値。
        for _ in range(10):
            assert _post_contact(client, {**CONTACT, 'email': 'bad'}).status_code == 422
        # 変数の内容: _: 繰り返し回数だけを使うための未使用値。
        for _ in range(5):
            assert _post_contact(client).status_code == 200
        assert _post_contact(client).status_code == 429

    def test_期間が過ぎればまた送れる(self):
        """5 回送ったあと、60 秒たてば 6 回目も通ること。

        Returns:
            なし。
        """
        # 変数の内容: client: テスト対象の API クライアント。
        # 1. 5 回送ったあと、60 秒たてば 6 回目も通ること。
        client = TestClient(app)
        with patch('app.rate_limit.time.time', return_value=10_000.0):
            # 変数の内容: _: 繰り返し回数だけを使うための未使用値。
            for _ in range(5):
                assert _post_contact(client).status_code == 200
            assert _post_contact(client).status_code == 429
        with patch('app.rate_limit.time.time', return_value=10_000.0 + PUBLIC_WRITE_WINDOW):
            assert _post_contact(client).status_code == 200


class TestOtherPublicWriteRateLimits:
    """予約・キャンセル・注文の回数制限と、API ごとに別に数えること。"""

    def test_予約は6回目で429になり別のAPIの回数は食い合わない(self):
        """予約を 5 回（イベント無しの 404 も数える）送ると 6 回目は 429。問い合わせはその後も通ること。

        Returns:
            なし。
        """
        # 変数の内容: body: リクエスト本文、client: テスト対象の API クライアント、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 予約を 5 回（イベント無しの 404 も数える）送ると 6 回目は 429。問い合わせはその後も通ること。
        client = TestClient(app)
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = not_found_error()
        body = {'event_id': 'e', 'name': 'n', 'email': 'a@example.com', 'participants': 1}
        with patch('app.routes.reserve.supabase', mock_sb), patch('app.routes.reserve.admin_supabase', MagicMock()):
            # 変数の内容: codes: 期待する応答コード一覧、invalid: 無効な入力値。
            codes = [client.post('/api/reserve', json=body).status_code for _ in range(6)]
            # 入力エラー（人数 0）は 429 より先に 422 になる（数えない）
            invalid = client.post('/api/reserve', json={**body, 'participants': 0}).status_code
        assert codes == [404] * 5 + [429]
        assert invalid == 422
        assert _post_contact(client).status_code == 200

    def test_キャンセルは6回目で429になる(self):
        """存在しないトークンで 5 回（404）試すと、6 回目は 429（トークンの総当たり対策）。

        Returns:
            なし。
        """
        # 変数の内容: client: テスト対象の API クライアント、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 存在しないトークンで 5 回（404）試すと、6 回目は 429（トークンの総当たり対策）。
        client = TestClient(app)
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
        with patch('app.routes.reserve.admin_supabase', mock_sb):
            # 変数の内容: codes: 期待する応答コード一覧。
            codes = [client.post('/api/reserve/cancel', json={'token': f'{i:08d}'}).status_code for i in range(6)]
        assert codes == [404] * 5 + [429]

    def test_注文は6回目で429になり決済を呼ばない(self):
        """注文を 5 回（商品無しの 404）送ると 6 回目は 429 で、商品の読み取りも決済もしないこと。

        Returns:
            なし。
        """
        # 1. 注文を 5 回（商品無しの 404）送ると 6 回目は 429 で、商品の読み取りも決済もしないこと。
        from tests.test_orders import ORDER_REQUEST
        # 変数の内容: client: テスト対象の API クライアント、mock_http: HTTP 通信のモック、mock_sb: 公開用 Supabase クライアントのモック。
        client = TestClient(app)
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.in_.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []
        mock_http = MagicMock()
        with patch('app.routes.orders.admin_supabase', mock_sb), \
             patch('app.routes.orders.http', mock_http), \
             patch('app.routes.orders.SQUARE_ACCESS_TOKEN', 'test-token'):
            # 変数の内容: calls_before: 処理前に記録されていた呼び出し数、codes: 期待する応答コード一覧、last: 最後に処理した値。
            codes = [client.post('/api/orders', json=ORDER_REQUEST).status_code for _ in range(5)]
            calls_before = mock_sb.table.call_count
            last = client.post('/api/orders', json=ORDER_REQUEST)
        assert codes == [404] * 5
        assert last.status_code == 429
        assert mock_sb.table.call_count == calls_before
        mock_http.post.assert_not_called()

    def test_注文の入力エラーは数えない(self):
        """数量 0 の注文（422）を何度送っても数えず、429 にならないこと。

        Returns:
            なし。
        """
        # 1. 数量 0 の注文（422）を何度送っても数えず、429 にならないこと。
        from tests.test_orders import ORDER_REQUEST
        # 変数の内容: bad: 不正な入力値、client: テスト対象の API クライアント、codes: 期待する応答コード一覧。
        client = TestClient(app)
        bad = {**ORDER_REQUEST, 'items': [{'product_id': 'p', 'quantity': 0}]}
        codes = [client.post('/api/orders', json=bad).status_code for _ in range(8)]
        assert codes == [422] * 8
        assert rate_limit.order_limiter.log == {}


class TestChatRateLimit:
    """チャットは 1 分 10 回（公開の書き込み API とは別に数える）。"""

    def test_10回までは通り11回目は429(self):
        """同じ IP から 10 回は 200、11 回目は 429 になり Gemini を呼ばないこと。

        Returns:
            なし。
        """
        # 変数の内容: codes: 期待する応答コード一覧、mock_genai: Gemini クライアントのモック、resp: API から返されたレスポンス。
        # 1. 同じ IP から 10 回は 200、11 回目は 429 になり Gemini を呼ばないこと。
        codes = [post_chat(CHAT_PAYLOAD)[0].status_code for _ in range(10)]
        resp, mock_genai = post_chat(CHAT_PAYLOAD)
        assert codes == [200] * 10
        assert resp.status_code == 429
        mock_genai.Client.assert_not_called()

    def test_チャットの回数は問い合わせの回数と別に数える(self):
        """問い合わせを 5 回送って上限にしても、チャットは通ること。

        Returns:
            なし。
        """
        # 変数の内容: client: テスト対象の API クライアント。
        # 1. 問い合わせを 5 回送って上限にしても、チャットは通ること。
        client = TestClient(app)
        # 変数の内容: _: 繰り返し回数だけを使うための未使用値。
        for _ in range(5):
            _post_contact(client)
        assert _post_contact(client).status_code == 429
        assert post_chat(CHAT_PAYLOAD)[0].status_code == 200


class TestClientIp:
    """client_ip は CF-Connecting-IP → X-Forwarded-For の右端（最後の値）→ client.host の順に送り元の IP を決め、MAX_IP_LENGTH 文字で切る。"""

    @staticmethod
    def _request(headers: dict[str, str] | None = None, host: str | None = '10.0.0.1') -> MagicMock:
        """client_ip に渡すリクエストのモックを作る。

        Args:
            headers: リクエストヘッダー（キーは小文字で渡す。Starlette の Headers と同じく小文字で引く）
            host: 接続してきた相手の IP（None なら request.client が無い）

        Returns:
            headers と client を持つモック
        """
        # 1. 指定ヘッダー・接続元を持つリクエストモックを作成して返す。
        # 変数の内容: request: 現在の HTTP リクエスト。
        request = MagicMock()
        # 変数の内容: request.client: テスト用リクエスト接続元、request.headers: テスト用 HTTP リクエストヘッダー。
        request.headers = {k.lower(): v for k, v in (headers or {}).items()}
        request.client = MagicMock(host=host) if host is not None else None
        return request

    def test_CF_Connecting_IPがあればX_Forwarded_Forより優先する(self):
        """Cloudflare の CF-Connecting-IP を最初に使うこと。

        Returns:
            なし。
        """
        # 変数の内容: req: テスト対象の HTTP リクエスト。
        # 1. Cloudflare の CF-Connecting-IP を最初に使うこと。
        req = self._request({'CF-Connecting-IP': '203.0.113.5', 'X-Forwarded-For': '198.51.100.7, 10.0.0.2'})
        assert rate_limit.client_ip(req) == '203.0.113.5'

    def test_CF_Connecting_IPの前後の空白は除く(self):
        """値の前後の空白を除いて使うこと。

        Returns:
            なし。
        """
        # 1. 値の前後の空白を除いて使うこと。
        assert rate_limit.client_ip(self._request({'CF-Connecting-IP': '  203.0.113.5  '})) == '203.0.113.5'

    def test_CF_Connecting_IPが無ければX_Forwarded_Forの右端を使う(self):
        """「利用者が書ける値, …, 中継に接続してきた相手」の右端（Render が付け足した値）を空白を除いて使うこと。

        Returns:
            なし。
        """
        # 変数の内容: req: テスト対象の HTTP リクエスト。
        # 1. 「利用者が書ける値, …, 中継に接続してきた相手」の右端（Render が付け足した値）を空白を除いて使うこと。
        req = self._request({'X-Forwarded-For': ' 198.51.100.7 , 10.0.0.2, 10.0.0.3 '})
        assert rate_limit.client_ip(req) == '10.0.0.3'

    def test_X_Forwarded_Forが偽の値と本物の値のときは本物の右端を使う(self):
        """利用者が先頭に偽の IP を書いても、中継が右端に付けた本物の IP で数えること（先頭は使わない）。

        Returns:
            なし。
        """
        # 変数の内容: req: テスト対象の HTTP リクエスト。
        # 1. 利用者が先頭に偽の IP を書いても、中継が右端に付けた本物の IP で数えること（先頭は使わない）。
        req = self._request({'X-Forwarded-For': '1.2.3.4, 203.0.113.9'})
        assert rate_limit.client_ip(req) == '203.0.113.9'

    def test_X_Forwarded_Forの空の要素は飛ばして右端の値を使う(self):
        """末尾が空（「a, b, 」）でも、空の要素を除いた右端を使うこと。

        Returns:
            なし。
        """
        # 1. 末尾が空（「a, b, 」）でも、空の要素を除いた右端を使うこと。
        assert rate_limit.client_ip(self._request({'X-Forwarded-For': '198.51.100.7, 203.0.113.9, , '})) == '203.0.113.9'
        assert rate_limit.client_ip(self._request({'X-Forwarded-For': ' , 10.0.0.2'})) == '10.0.0.2'

    def test_CF_Connecting_IPが空白だけならX_Forwarded_Forを使う(self):
        """空白だけの CF-Connecting-IP は無いものとして次を見ること。

        Returns:
            なし。
        """
        # 変数の内容: req: テスト対象の HTTP リクエスト。
        # 1. 空白だけの CF-Connecting-IP は無いものとして次を見ること。
        req = self._request({'CF-Connecting-IP': '   ', 'X-Forwarded-For': '198.51.100.7'})
        assert rate_limit.client_ip(req) == '198.51.100.7'

    def test_どちらのヘッダーも無ければclient_hostを使う(self):
        """ヘッダーが無いとき（ローカル実行・テスト）は接続してきた相手の IP を使うこと。

        Returns:
            なし。
        """
        # 1. ヘッダーが無いとき（ローカル実行・テスト）は接続してきた相手の IP を使うこと。
        assert rate_limit.client_ip(self._request()) == '10.0.0.1'

    def test_X_Forwarded_Forが空の要素だけならclient_hostを使う(self):
        """「 , , 」のように値が 1 つも無いときは client.host を使うこと。

        Returns:
            なし。
        """
        # 1. 「 , , 」のように値が 1 つも無いときは client.host を使うこと。
        assert rate_limit.client_ip(self._request({'X-Forwarded-For': ' , , '})) == '10.0.0.1'

    def test_CF_Connecting_IPはMAX_IP_LENGTH文字で切る(self):
        """長すぎる値は 64 文字までにして記録すること（記録が大きくならないようにする）。

        Returns:
            なし。
        """
        # 1. 長すぎる値は 64 文字までにして記録すること（記録が大きくならないようにする）。
        assert rate_limit.MAX_IP_LENGTH == 64
        assert rate_limit.client_ip(self._request({'CF-Connecting-IP': 'a' * 100})) == 'a' * 64

    def test_X_Forwarded_Forの右端もMAX_IP_LENGTH文字で切る(self):
        """X-Forwarded-For の右端の値も 64 文字までに切ること。ちょうど 64 文字はそのまま。

        Returns:
            なし。
        """
        # 1. X-Forwarded-For の右端の値も 64 文字までに切ること。ちょうど 64 文字はそのまま。
        assert rate_limit.client_ip(self._request({'X-Forwarded-For': 'x, ' + 'b' * 70})) == 'b' * 64
        assert rate_limit.client_ip(self._request({'X-Forwarded-For': 'c' * 64})) == 'c' * 64

    def test_ヘッダーもclientも無ければunknown(self):
        """request.client が無いときは 'unknown' を返すこと。

        Returns:
            なし。
        """
        # 1. request.client が無いときは 'unknown' を返すこと。
        assert rate_limit.client_ip(self._request(host=None)) == 'unknown'

    def test_実際のAPIでもCF_Connecting_IPごとに回数を数える(self):
        """同じ接続元でも CF-Connecting-IP が違えば別の利用者として数え、同じなら上限で 429 になること。

        Returns:
            なし。
        """
        # 変数の内容: client: テスト対象の API クライアント。
        client = TestClient(app)
        # 1. 利用者 A が上限まで送ると、次は 429
        for _ in range(PUBLIC_WRITE_LIMIT):
            with patch('app.routes.contact.admin_supabase', MagicMock()), patch('app.routes.contact.RESEND_API_KEY', ''):
                assert client.post('/api/contact', json=CONTACT, headers={'CF-Connecting-IP': '203.0.113.1'}).status_code == 200
        with patch('app.routes.contact.admin_supabase', MagicMock()), patch('app.routes.contact.RESEND_API_KEY', ''):
            assert client.post('/api/contact', json=CONTACT, headers={'CF-Connecting-IP': '203.0.113.1'}).status_code == 429
            # 2. 利用者 B（別の CF-Connecting-IP）は通る
            assert client.post('/api/contact', json=CONTACT, headers={'CF-Connecting-IP': '203.0.113.2'}).status_code == 200


class TestMaxTrackedIps:
    """記録する IP の数が MAX_TRACKED_IPS を超えると、最後の受付が古いものから捨てる。"""

    def test_上限を超えると最後の受付が古いIPから捨てる(self, monkeypatch):
        """上限を 3 にして 4 つ目の IP を受け付けると、いちばん古い IP の記録が消えること。

        Args:
            monkeypatch: 環境変数や属性を一時差し替えする pytest フィクスチャ。

        Returns:
            なし。
        """
        # 1. 上限を小さくし、時刻を 1 秒ずつ進める
        monkeypatch.setattr(rate_limit, 'MAX_TRACKED_IPS', 3)
        # 変数の内容: clock: テスト時刻を固定する時計モック、limiter: 回数制限インスタンス。
        clock = iter([1000.0, 1001.0, 1002.0, 1003.0, 1004.0])
        monkeypatch.setattr(rate_limit.time, 'time', lambda: next(clock))
        limiter = RateLimiter(limit=5, window=60)
        # 2. 4 つの IP から 1 回ずつ
        for ip in ['ip-a', 'ip-b', 'ip-c', 'ip-d']:
            limiter.check(ip)
        # 3. 上限の 3 つだけ残り、いちばん古い ip-a が消える
        assert set(limiter.log) == {'ip-b', 'ip-c', 'ip-d'}

    def test_上限を超えたとき先に期限切れの記録を消して足りればほかは残す(self, monkeypatch):
        """期限切れ（window 秒より前）の記録を掃除して上限内に収まれば、期限内の IP は捨てないこと。

        Args:
            monkeypatch: 環境変数や属性を一時差し替えする pytest フィクスチャ。

        Returns:
            なし。
        """
        # 1. 期限切れ（window 秒より前）の記録を掃除して上限内に収まれば、期限内の IP は捨てないこと。
        monkeypatch.setattr(rate_limit, 'MAX_TRACKED_IPS', 2)
        # ip-old は 0 秒、ip-b は 100 秒、ip-c は 101 秒に受け付け（window は 60 秒）
        # 変数の内容: clock: テストで固定する単調時計のモック。
        clock = iter([0.0, 100.0, 101.0])
        monkeypatch.setattr(rate_limit.time, 'time', lambda: next(clock))
        limiter = RateLimiter(limit=5, window=60)
        # 変数の内容: limiter._last_purge: 古い IP 記録を最後に整理した時刻。
        limiter._last_purge = 100.0  # 途中の定期の掃除を起こさない
        # 変数の内容: ip: 処理対象のクライアント IP アドレス。
        for ip in ['ip-old', 'ip-b', 'ip-c']:
            limiter.check(ip)
        assert set(limiter.log) == {'ip-b', 'ip-c'}

    def test_上限ちょうどまでは何も捨てない(self, monkeypatch):
        """記録する IP の数が上限と同じなら捨てないこと（境界）。

        Args:
            monkeypatch: 環境変数や属性を一時差し替えする pytest フィクスチャ。

        Returns:
            なし。
        """
        # 1. 記録する IP の数が上限と同じなら捨てないこと（境界）。
        monkeypatch.setattr(rate_limit, 'MAX_TRACKED_IPS', 3)
        # 変数の内容: limiter: 回数制限インスタンス。
        limiter = RateLimiter(limit=5, window=60)
        # 変数の内容: ip: 処理対象のクライアント IP アドレス。
        for ip in ['ip-a', 'ip-b', 'ip-c']:
            limiter.check(ip)
        assert set(limiter.log) == {'ip-a', 'ip-b', 'ip-c'}
