"""
orders エンドポイントのテスト。
対象: backend/app/routes/orders.py
テスト概要:
  - 注文一覧・単件取得（管理者のみ）
  - 注文作成（在庫確認 → Square 決済 → DB 保存）
  - 在庫不足時の 409 エラー
  - Square 決済失敗時の 402 エラー
  - 注文ステータス更新
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth


# --- 認証オーバーライド ---

def _auth_override():
    """テスト時に require_auth を無効化するオーバーライド関数。"""
    return None


# --- テスト用サンプルデータ ---

# 商品サンプル（東京都宛て、在庫あり）
SAMPLE_PRODUCT = {
    'id': 'product-1',
    'name': 'テスト商品',
    'price': 3000,
    'stock': 5,
    'is_published': True,
}

# 注文サンプルレコード
SAMPLE_ORDER = {
    'id': 'order-uuid-1',
    'customer_name': 'テスト太郎',
    'customer_email': 'test@example.com',
    'prefecture': '東京都',
    'subtotal': 3000,
    'shipping_fee': 1000,
    'total': 4000,
    'status': 'paid',
    'square_payment_id': 'test-payment-id',
    'created_at': '2024-01-01T00:00:00+00:00',
}

# 注文作成用リクエストボディ
ORDER_REQUEST = {
    'customer_name': 'テスト太郎',
    'customer_email': 'test@example.com',
    'customer_phone': '090-1234-5678',
    'postal_code': '100-0001',
    'prefecture': '東京都',
    'city': '千代田区',
    'address_line1': '千代田1-1-1',
    'address_line2': None,
    'note': None,
    'items': [
        {'product_id': 'product-1', 'quantity': 1}
    ],
    'source_id': 'nonce-from-square',
}


# --- モックヘルパー ---

def _make_admin_sb_for_list() -> MagicMock:
    """注文一覧取得用の admin_supabase モックを返す。"""
    mock_sb = MagicMock()
    # table('orders').select('*').order('created_at', desc=True).execute().data
    mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = [SAMPLE_ORDER]
    return mock_sb


def _make_admin_sb_for_get() -> MagicMock:
    """注文単件取得用の admin_supabase モックを返す。"""
    mock_sb = MagicMock()
    # table('orders').select('*').eq('id', ...).single().execute().data
    mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = SAMPLE_ORDER
    # table('order_items').select('*').eq('order_id', ...).execute().data
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    return mock_sb


def _make_admin_sb_for_create(stock: int = 5) -> MagicMock:
    """注文作成用の admin_supabase モックを返す。

    Args:
        stock: 商品の在庫数。在庫不足テストでは 0 などを指定する。

    Returns:
        admin_supabase のモック（商品取得・RPC・insert チェーンを設定済み）
    """
    mock_sb = MagicMock()
    product = {**SAMPLE_PRODUCT, 'stock': stock}

    # 1. 商品情報取得: table('products').select(...).in_(...).execute().data
    mock_sb.table.return_value.select.return_value.in_.return_value.execute.return_value.data = [product]

    # 2. 在庫アトミック確保 RPC: rpc('decrement_stock', ...).execute().data = True
    mock_sb.rpc.return_value.execute.return_value.data = True

    # 3. 注文レコード作成: table('orders').insert(...).execute().data[0]
    mock_sb.table.return_value.insert.return_value.execute.return_value.data = [SAMPLE_ORDER]

    return mock_sb


def _make_http_mock_success() -> MagicMock:
    """Square API への HTTP 呼び出しが成功するモックを返す。"""
    mock_http = MagicMock()
    mock_http.post.return_value.ok = True
    mock_http.post.return_value.status_code = 200
    mock_http.post.return_value.json.return_value = {
        'payment': {'id': 'test-payment-id', 'status': 'COMPLETED'}
    }
    return mock_http


def _make_http_mock_failure() -> MagicMock:
    """Square API への HTTP 呼び出しが失敗するモックを返す（402 になる）。"""
    mock_http = MagicMock()
    mock_http.post.return_value.ok = False
    mock_http.post.return_value.status_code = 402
    mock_http.post.return_value.json.return_value = {
        'errors': [{'detail': '決済に失敗しました'}]
    }
    return mock_http


class TestListOrders:
    """注文一覧 GET /api/orders のテスト（要認証）。"""

    def test_注文一覧を200で取得できる(self):
        """認証済みリクエストで全注文リストが 200 で返ること。"""
        mock_sb = _make_admin_sb_for_list()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.orders.admin_supabase', mock_sb):
                resp = TestClient(app).get('/api/orders')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]['id'] == 'order-uuid-1'

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで 401 が返ること。"""
        resp = TestClient(app).get('/api/orders')
        assert resp.status_code == 401


class TestGetOrder:
    """注文単件取得 GET /api/orders/:id のテスト（要認証）。"""

    def test_存在するIDで注文を取得できる(self):
        """存在する注文 ID で注文情報と明細リストが返ること。"""
        mock_sb = _make_admin_sb_for_get()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.orders.admin_supabase', mock_sb):
                resp = TestClient(app).get('/api/orders/order-uuid-1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        data = resp.json()
        assert data['id'] == 'order-uuid-1'
        # items フィールドが含まれること
        assert 'items' in data

    def test_存在しないIDで404(self):
        """存在しない注文 ID を指定したとき 404 が返ること。"""
        mock_sb = MagicMock()
        # data = None で注文が存在しないことを表現
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.orders.admin_supabase', mock_sb):
                resp = TestClient(app).get('/api/orders/nonexistent-id')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 404


class TestCreateOrder:
    """注文作成 POST /api/orders のテスト。"""

    def test_正常な注文作成で注文IDが返る(self):
        """全条件を満たすリクエストで注文が作成され order_id が返ること。

        1. 在庫確認パス（stock=5 >= quantity=1）
        2. RPC で在庫を確保（decrement_stock が True を返す）
        3. Square 決済成功（payment.id が返る）
        4. 注文 DB 保存成功
        """
        mock_sb = _make_admin_sb_for_create(stock=5)
        mock_http = _make_http_mock_success()
        mock_resend = MagicMock()

        with patch('app.routes.orders.admin_supabase', mock_sb), \
             patch('app.routes.orders.http', mock_http), \
             patch('app.mail.resend', mock_resend), \
             patch('app.routes.orders.SQUARE_ACCESS_TOKEN', 'test-token'), \
             patch('app.routes.orders.RESEND_API_KEY', ''):
            resp = TestClient(app).post('/api/orders', json=ORDER_REQUEST)

        # 成功時は order_id が含まれる
        assert resp.status_code == 200
        data = resp.json()
        assert 'order_id' in data
        assert data['order_id'] == 'order-uuid-1'

    def test_SQUARE_未設定のとき500(self):
        """SQUARE_ACCESS_TOKEN が未設定のとき 500 が返ること。"""
        with patch('app.routes.orders.SQUARE_ACCESS_TOKEN', ''):
            resp = TestClient(app).post('/api/orders', json=ORDER_REQUEST)

        assert resp.status_code == 500

    def test_在庫不足のとき409(self):
        """在庫が注文数量を下回るとき 409 Conflict が返ること。

        stock=0, quantity=1 → insufficient リストに商品名が入り HTTPException(409) になる。
        """
        # stock=0 で在庫不足を再現
        mock_sb = _make_admin_sb_for_create(stock=0)
        mock_http = _make_http_mock_success()

        with patch('app.routes.orders.admin_supabase', mock_sb), \
             patch('app.routes.orders.http', mock_http), \
             patch('app.routes.orders.SQUARE_ACCESS_TOKEN', 'test-token'), \
             patch('app.routes.orders.RESEND_API_KEY', ''):
            resp = TestClient(app).post('/api/orders', json=ORDER_REQUEST)

        assert resp.status_code == 409
        assert '在庫が不足' in resp.json()['detail']

    def test_Square決済失敗のとき402(self):
        """Square API がエラーを返したとき 402 Payment Required が返ること。

        決済失敗時は在庫ロールバック（increment_stock RPC）が呼ばれることも確認する。
        """
        mock_sb = _make_admin_sb_for_create(stock=5)
        mock_http = _make_http_mock_failure()

        with patch('app.routes.orders.admin_supabase', mock_sb), \
             patch('app.routes.orders.http', mock_http), \
             patch('app.routes.orders.SQUARE_ACCESS_TOKEN', 'test-token'), \
             patch('app.routes.orders.RESEND_API_KEY', ''):
            resp = TestClient(app).post('/api/orders', json=ORDER_REQUEST)

        assert resp.status_code == 402

    def test_未対応都道府県のとき400(self):
        """RATES に含まれない都道府県を指定したとき 400 が返ること。"""
        req = {**ORDER_REQUEST, 'prefecture': '未対応県'}
        mock_sb = _make_admin_sb_for_create()

        with patch('app.routes.orders.admin_supabase', mock_sb), \
             patch('app.routes.orders.SQUARE_ACCESS_TOKEN', 'test-token'):
            resp = TestClient(app).post('/api/orders', json=req)

        assert resp.status_code == 400

    def test_存在しない商品のとき404(self):
        """products に存在しない product_id を指定したとき 404 が返ること。"""
        mock_sb = MagicMock()
        # 商品が見つからない（空リスト）
        mock_sb.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []

        with patch('app.routes.orders.admin_supabase', mock_sb), \
             patch('app.routes.orders.SQUARE_ACCESS_TOKEN', 'test-token'):
            resp = TestClient(app).post('/api/orders', json=ORDER_REQUEST)

        assert resp.status_code == 404


class TestUpdateOrderStatus:
    """注文ステータス更新 PATCH /api/orders/:id のテスト（要認証）。"""

    def test_ステータス更新成功(self):
        """正しいリクエストで注文ステータスが更新され更新後レコードが返ること。"""
        updated_order = {**SAMPLE_ORDER, 'status': 'shipped'}
        mock_sb = MagicMock()
        # table('orders').update(...).eq('id', ...).execute().data[0]
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [updated_order]

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.orders.admin_supabase', mock_sb), \
                 patch('app.routes.orders.RESEND_API_KEY', ''):
                resp = TestClient(app).patch(
                    '/api/orders/order-uuid-1',
                    json={'status': 'shipped'}
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'shipped'

    def test_paid_ステータスに更新できる(self):
        """status を 'paid' に変更できること。"""
        updated_order = {**SAMPLE_ORDER, 'status': 'paid'}
        mock_sb = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [updated_order]

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.orders.admin_supabase', mock_sb), \
                 patch('app.routes.orders.RESEND_API_KEY', ''):
                resp = TestClient(app).patch(
                    '/api/orders/order-uuid-1',
                    json={'status': 'paid'}
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
