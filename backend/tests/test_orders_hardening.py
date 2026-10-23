"""
注文 API のセキュリティ修正・失敗時の扱いのテスト。
対象: backend/app/routes/orders.py

- 数量（1〜99）・品目の数（1〜50）の入力チェック。違反は 422 で、商品の読み取り・在庫の確保・決済を呼ばない
- Square の失敗 3 通り（接続の時間切れ・接続失敗・応答が読めない）は 502 で在庫を戻す
- 送ったあとの時間切れは 502 で在庫を戻さず、CRITICAL ログと管理者メール
- 注文のステータスは paid|shipped|delivered|cancelled だけ（それ以外は 422）
- 存在しない注文の更新は 404
"""
import logging
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import ConnectTimeout, ReadTimeout

from app.main import app
from app.auth import require_auth
from tests.test_orders import ORDER_REQUEST, SAMPLE_ORDER, _make_admin_sb_for_create, _make_http_mock_success


def _order_with_items(items: list) -> dict:
    """品目だけを差し替えた注文の入力を返す。

    Args:
        items: items に入れるリスト

    Returns:
        注文の入力の dict
    """
    return {**ORDER_REQUEST, 'items': items}


def _post_order(payload: dict, mock_sb: MagicMock, mock_http: MagicMock, mock_resend: MagicMock | None = None,
                resend_key: str = '', contact_to: str = ''):
    """注文 API を呼ぶ（DB・Square・メールはすべてモック）。

    Args:
        payload: 注文の入力
        mock_sb: admin_supabase のモック
        mock_http: requests（http）のモック
        mock_resend: resend のモック（省略時は新しい MagicMock）
        resend_key: RESEND_API_KEY に入れる値
        contact_to: CONTACT_TO_EMAIL に入れる値

    Returns:
        応答
    """
    with patch('app.routes.orders.admin_supabase', mock_sb), \
         patch('app.routes.orders.http', mock_http), \
         patch('app.mail.resend', mock_resend or MagicMock()), \
         patch('app.routes.orders.SQUARE_ACCESS_TOKEN', 'test-token'), \
         patch('app.routes.orders.RESEND_API_KEY', resend_key), \
         patch('app.routes.orders.CONTACT_TO_EMAIL', contact_to):
        return TestClient(app).post('/api/orders', json=payload)


def _rpc_names(mock_sb: MagicMock) -> list[str]:
    """呼ばれた RPC の名前を順に返す。"""
    return [c.args[0] for c in mock_sb.rpc.call_args_list]


class TestOrderQuantityValidation:
    """数量・品目の数の入力チェック（S1: 負の数量で合計金額を減らす攻撃を防ぐ）。"""

    @pytest.mark.parametrize('quantity', [-1, 0, 100, -99])
    def test_数量が1から99の範囲外なら422で決済も在庫の確保も呼ばない(self, quantity):
        """数量が 0・負・100 以上のとき 422 になり、商品の読み取り・在庫の確保・Square の決済を呼ばないこと。"""
        mock_sb = _make_admin_sb_for_create()
        mock_http = _make_http_mock_success()

        resp = _post_order(_order_with_items([{'product_id': 'product-1', 'quantity': quantity}]), mock_sb, mock_http)

        assert resp.status_code == 422
        mock_http.post.assert_not_called()
        mock_sb.rpc.assert_not_called()
        mock_sb.table.assert_not_called()

    def test_負の数量を混ぜて合計を減らそうとしても422になる(self):
        """正の数量の品目と負の数量の品目を混ぜても 422 になり、決済されないこと。"""
        mock_sb = _make_admin_sb_for_create()
        mock_http = _make_http_mock_success()
        items = [{'product_id': 'product-1', 'quantity': 2}, {'product_id': 'product-2', 'quantity': -1}]

        resp = _post_order(_order_with_items(items), mock_sb, mock_http)

        assert resp.status_code == 422
        mock_http.post.assert_not_called()

    @pytest.mark.parametrize('quantity', [1, 99])
    def test_数量が1と99の境界は受け付ける(self, quantity):
        """数量 1 と 99（上限ちょうど）は 422 にならず、決済まで進むこと。"""
        mock_sb = _make_admin_sb_for_create(stock=99)
        mock_http = _make_http_mock_success()

        resp = _post_order(_order_with_items([{'product_id': 'product-1', 'quantity': quantity}]), mock_sb, mock_http)

        assert resp.status_code == 200
        # 金額は単価 × 数量 + 送料（東京都）
        sent = mock_http.post.call_args.kwargs['json']
        assert sent['amount_money']['amount'] == 3000 * quantity + 1000

    def test_数量が小数なら422になる(self):
        """数量に 1.5 のような小数を送ると 422 になること。"""
        mock_sb = _make_admin_sb_for_create()
        mock_http = _make_http_mock_success()

        resp = _post_order(_order_with_items([{'product_id': 'product-1', 'quantity': 1.5}]), mock_sb, mock_http)

        assert resp.status_code == 422
        mock_http.post.assert_not_called()

    def test_品目が空なら422で決済を呼ばない(self):
        """items が空のリストなら 422 になり、決済されないこと。"""
        mock_sb = _make_admin_sb_for_create()
        mock_http = _make_http_mock_success()

        resp = _post_order(_order_with_items([]), mock_sb, mock_http)

        assert resp.status_code == 422
        mock_http.post.assert_not_called()
        mock_sb.rpc.assert_not_called()

    def test_品目が51件なら422になる(self):
        """1 回の注文の品目は 50 件まで。51 件は 422 になること。"""
        mock_sb = _make_admin_sb_for_create()
        mock_http = _make_http_mock_success()
        items = [{'product_id': f'product-{i}', 'quantity': 1} for i in range(51)]

        resp = _post_order(_order_with_items(items), mock_sb, mock_http)

        assert resp.status_code == 422
        mock_http.post.assert_not_called()

    def test_品目が50件ちょうどなら入力チェックは通る(self):
        """品目 50 件は 422 にならないこと（商品が無いので 404 で止まる）。"""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []
        mock_http = _make_http_mock_success()
        items = [{'product_id': f'product-{i}', 'quantity': 1} for i in range(50)]

        resp = _post_order(_order_with_items(items), mock_sb, mock_http)

        assert resp.status_code == 404
        mock_http.post.assert_not_called()


class TestSquareFailures:
    """Square の失敗時の在庫と通知の扱い。"""

    @pytest.mark.parametrize('error', [
        ConnectTimeout('connect timeout'),
        RequestsConnectionError('connection refused'),
    ])
    def test_接続の時間切れや接続失敗は502で在庫を戻す(self, error):
        """つながる前の時間切れ・接続失敗では決済されていないので、502 を返し確保した在庫を戻すこと。"""
        mock_sb = _make_admin_sb_for_create()
        mock_http = MagicMock()
        mock_http.post.side_effect = error
        mock_resend = MagicMock()

        resp = _post_order(ORDER_REQUEST, mock_sb, mock_http, mock_resend, resend_key='k', contact_to='admin@example.com')

        assert resp.status_code == 502
        assert _rpc_names(mock_sb) == ['decrement_stock', 'increment_stock']
        # 注文は保存しない
        mock_sb.table.return_value.insert.assert_not_called()
        # CRITICAL の管理者通知は送らない
        for c in mock_resend.Emails.send.call_args_list:
            assert 'CRITICAL' not in c.args[0]['subject']

    def test_応答がJSONとして読めないときは502で在庫を戻す(self):
        """Square の応答が JSON として読めない（ValueError）ときは 502 を返し在庫を戻すこと。"""
        mock_sb = _make_admin_sb_for_create()
        mock_http = MagicMock()
        mock_http.post.return_value.ok = True
        mock_http.post.return_value.json.side_effect = ValueError('Expecting value')

        resp = _post_order(ORDER_REQUEST, mock_sb, mock_http)

        assert resp.status_code == 502
        assert _rpc_names(mock_sb) == ['decrement_stock', 'increment_stock']
        assert 'Expecting value' not in resp.text

    def test_送ったあとの時間切れは502で在庫を戻さずCRITICALログと管理者メール(self, caplog):
        """応答を待つ間の時間切れ（ReadTimeout）は決済された可能性があるので在庫を戻さず、CRITICAL ログと管理者メールを出すこと。"""
        mock_sb = _make_admin_sb_for_create()
        mock_http = MagicMock()
        mock_http.post.side_effect = ReadTimeout('read timeout')
        mock_resend = MagicMock()
        caplog.set_level(logging.CRITICAL, logger='app.routes.orders')

        resp = _post_order(ORDER_REQUEST, mock_sb, mock_http, mock_resend, resend_key='k', contact_to='admin@example.com')

        assert resp.status_code == 502
        assert 'お問い合わせ' in resp.json()['detail']
        # 1. 在庫は確保したまま（increment_stock を呼ばない）
        assert _rpc_names(mock_sb) == ['decrement_stock']
        # 2. 注文は保存しない
        mock_sb.table.return_value.insert.assert_not_called()
        # 3. CRITICAL ログ
        assert any(r.levelno == logging.CRITICAL for r in caplog.records)
        # 4. 管理者に CRITICAL のメールを 1 通
        subjects = [c.args[0]['subject'] for c in mock_resend.Emails.send.call_args_list]
        assert len([s for s in subjects if 'CRITICAL' in s]) == 1
        assert mock_resend.Emails.send.call_args_list[0].args[0]['to'] == ['admin@example.com']

    def test_Squareが決済を拒否したときは402で在庫を戻す(self):
        """Square が errors を返した（カードの拒否など）ときは 402 で Square の文言を返し、在庫を戻すこと。"""
        mock_sb = _make_admin_sb_for_create()
        mock_http = MagicMock()
        mock_http.post.return_value.ok = False
        mock_http.post.return_value.json.return_value = {'errors': [{'detail': 'カードが拒否されました'}]}

        resp = _post_order(ORDER_REQUEST, mock_sb, mock_http)

        assert resp.status_code == 402
        assert resp.json()['detail'] == 'カードが拒否されました'
        assert _rpc_names(mock_sb) == ['decrement_stock', 'increment_stock']


class TestOrderStatusLiteral:
    """注文のステータスの入力チェックと、存在しない注文の 404。"""

    def setup_method(self):
        """認証をバイパスする。"""
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """認証のバイパスを戻す。"""
        app.dependency_overrides.pop(require_auth, None)

    @pytest.mark.parametrize('status', ['refunded', 'PAID', '', 'pending'])
    def test_決められた値以外のステータスは422でDBを更新しない(self, status):
        """paid|shipped|delivered|cancelled 以外のステータスは 422 になり、DB を更新しないこと。"""
        mock_sb = MagicMock()

        with patch('app.routes.orders.admin_supabase', mock_sb):
            resp = TestClient(app).patch('/api/orders/order-uuid-1', json={'status': status})

        assert resp.status_code == 422
        mock_sb.table.assert_not_called()

    @pytest.mark.parametrize('status', ['paid', 'shipped', 'delivered', 'cancelled'])
    def test_決められた4つのステータスは受け付ける(self, status):
        """4 つのステータスはどれも 200 で更新できること。"""
        mock_sb = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{**SAMPLE_ORDER, 'status': status}]

        with patch('app.routes.orders.admin_supabase', mock_sb), \
             patch('app.routes.orders.RESEND_API_KEY', ''):
            resp = TestClient(app).patch('/api/orders/order-uuid-1', json={'status': status})

        assert resp.status_code == 200
        assert resp.json()['status'] == status

    def test_存在しない注文のステータスを変えると404になる(self):
        """更新の結果が 0 件（存在しない注文）なら 404 になり、メールは送らないこと。"""
        mock_sb = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = []
        mock_resend = MagicMock()

        with patch('app.routes.orders.admin_supabase', mock_sb), \
             patch('app.mail.resend', mock_resend), \
             patch('app.routes.orders.RESEND_API_KEY', 'k'):
            resp = TestClient(app).patch('/api/orders/nope', json={'status': 'shipped'})

        assert resp.status_code == 404
        mock_resend.Emails.send.assert_not_called()
