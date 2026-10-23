"""
products エンドポイントのテスト。
対象: backend/app/routes/products.py
テスト概要: 商品の一覧取得・単件取得・作成・更新・削除・在庫更新の正常/異常ケースを確認する。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth
from tests._helpers import as_admin, not_found_error

# --- テスト用サンプルデータ ---

# 公開済み商品サンプル
PUBLISHED_PRODUCT = {
    'id': 'p1',
    'name': '公開商品',
    'description': '説明',
    'price': 5000,
    'stock': 10,
    'image_urls': [],
    'tags': [],
    'is_published': True,
    'display_order': 1,
    'category': 'アガベ',
}

# 非公開商品サンプル
DRAFT_PRODUCT = {
    'id': 'p2',
    'name': '非公開商品',
    'description': '説明2',
    'price': 3000,
    'stock': 5,
    'image_urls': [],
    'tags': [],
    'is_published': False,
    'display_order': 2,
    'category': '鉢',
}


def _make_sb_mock():
    """admin_supabase の MagicMock を返す。各テストで個別に設定する。"""
    return MagicMock()


def _auth_override():
    """認証を無効化するオーバーライド関数。テスト時のみ使用する。"""
    return None


class TestListProducts:
    """商品一覧 GET /api/products のテスト。"""

    def test_デフォルトは公開済みのみ返す(self):
        """?all 未指定のとき is_published=True の商品のみ返ること。"""
        mock_sb = _make_sb_mock()
        # table().select().order().eq().execute().data のチェーン
        chain = mock_sb.table.return_value.select.return_value.order.return_value
        chain.eq.return_value.execute.return_value.data = [PUBLISHED_PRODUCT]
        chain.execute.return_value.data = [PUBLISHED_PRODUCT, DRAFT_PRODUCT]

        with patch('app.routes.products.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/products')

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]['id'] == 'p1'

    def test_ログイン済みでall_trueを指定すると非公開も含む全件が返る(self):
        """管理者としてログインして ?all=true を指定すると、非公開を含む全件が返り is_published で絞らないこと。"""
        mock_sb = _make_sb_mock()
        chain = mock_sb.table.return_value.select.return_value.order.return_value
        # all=true では eq を呼ばずそのまま execute する
        chain.execute.return_value.data = [PUBLISHED_PRODUCT, DRAFT_PRODUCT]

        with patch('app.routes.products.admin_supabase', mock_sb), as_admin():
            resp = TestClient(app).get('/api/products?all=true')

        assert resp.status_code == 200
        assert len(resp.json()) == 2
        chain.eq.assert_not_called()

    def test_未ログインでall_trueを指定すると401になりDBを読まない(self):
        """Authorization ヘッダーなしで ?all=true を指定すると 401 になり、非公開の商品が漏れないこと。"""
        mock_sb = _make_sb_mock()

        with patch('app.routes.products.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/products?all=true')

        assert resp.status_code == 401
        mock_sb.table.assert_not_called()

    def test_商品が0件のとき空配列(self):
        """DBが空のとき空配列が返ること。"""
        mock_sb = _make_sb_mock()
        chain = mock_sb.table.return_value.select.return_value.order.return_value
        chain.eq.return_value.execute.return_value.data = []

        with patch('app.routes.products.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/products')

        assert resp.status_code == 200
        assert resp.json() == []


class TestGetProduct:
    """商品単件取得 GET /api/products/:id のテスト。"""

    def test_存在するIDで商品を取得できる(self):
        """未ログインで公開中の商品の ID を指定すると、is_published=True で絞った上で商品が返ること。"""
        mock_sb = _make_sb_mock()
        eq_id = mock_sb.table.return_value.select.return_value.eq.return_value
        eq_id.eq.return_value.single.return_value.execute.return_value.data = PUBLISHED_PRODUCT

        with patch('app.routes.products.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/products/p1')

        assert resp.status_code == 200
        assert resp.json()['id'] == 'p1'
        assert resp.json()['name'] == '公開商品'
        eq_id.eq.assert_called_once_with('is_published', True)

    def test_存在しないIDで404(self):
        """存在しない ID（single() が PGRST116 を投げる）を指定すると 404 が返ること。"""
        mock_sb = _make_sb_mock()
        eq_id = mock_sb.table.return_value.select.return_value.eq.return_value
        eq_id.eq.return_value.single.return_value.execute.side_effect = not_found_error()

        with patch('app.routes.products.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/products/nonexistent')

        assert resp.status_code == 404

    def test_未ログインで非公開の商品を指定すると404になる(self):
        """非公開の商品は公開で絞ると 0 件になるため、未ログインでは 404 が返り商品名が漏れないこと。"""
        mock_sb = _make_sb_mock()
        eq_id = mock_sb.table.return_value.select.return_value.eq.return_value
        eq_id.eq.return_value.single.return_value.execute.side_effect = not_found_error()
        eq_id.single.return_value.execute.return_value.data = DRAFT_PRODUCT

        with patch('app.routes.products.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/products/p2')

        assert resp.status_code == 404
        assert '非公開商品' not in resp.text

    def test_ログイン済みなら非公開の商品も取得できる(self):
        """管理者としてログインしていれば is_published で絞らず、非公開の商品も返ること。"""
        mock_sb = _make_sb_mock()
        eq_id = mock_sb.table.return_value.select.return_value.eq.return_value
        eq_id.single.return_value.execute.return_value.data = DRAFT_PRODUCT

        with patch('app.routes.products.admin_supabase', mock_sb), as_admin():
            resp = TestClient(app).get('/api/products/p2')

        assert resp.status_code == 200
        assert resp.json()['id'] == 'p2'
        eq_id.eq.assert_not_called()


class TestCreateProduct:
    """商品作成 POST /api/products のテスト。"""

    def test_正常に商品を作成できる(self):
        """正しいリクエストボディで商品が作成され、作成されたレコードが返ること。"""
        mock_sb = _make_sb_mock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [PUBLISHED_PRODUCT]

        payload = {
            'name': '新商品',
            'price': 5000,
            'stock': 10,
            'is_published': True,
        }

        # 1. app.dependency_overrides で require_auth を無効化する
        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.products.admin_supabase', mock_sb):
                resp = TestClient(app).post('/api/products', json=payload)
        finally:
            # 2. テスト後に必ずオーバーライドを解除する
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['id'] == 'p1'


class TestUpdateProduct:
    """商品更新 PUT /api/products/:id のテスト。"""

    def test_正常に商品を更新できる(self):
        """既存商品の更新ができ、更新後レコードが返ること。"""
        mock_sb = _make_sb_mock()
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [PUBLISHED_PRODUCT]

        payload = {
            'name': '更新後商品名',
            'price': 6000,
            'stock': 8,
            'is_published': True,
        }

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.products.admin_supabase', mock_sb):
                resp = TestClient(app).put('/api/products/p1', json=payload)
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['id'] == 'p1'


class TestDeleteProduct:
    """商品削除 DELETE /api/products/:id のテスト。"""

    def test_正常に商品を削除するとokが返る(self):
        """削除に成功すると {"ok": True} が返ること。"""
        mock_sb = _make_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.products.admin_supabase', mock_sb):
                resp = TestClient(app).delete('/api/products/p1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}


class TestUpdateStock:
    """在庫更新 PATCH /api/products/:id/stock のテスト。"""

    def test_在庫数を正常に更新できる(self):
        """在庫数の更新ができ、更新後レコードが返ること。"""
        mock_sb = _make_sb_mock()
        updated = {**PUBLISHED_PRODUCT, 'stock': 20}
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [updated]

        payload = {'stock': 20}

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.products.admin_supabase', mock_sb):
                resp = TestClient(app).patch('/api/products/p1/stock', json=payload)
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['stock'] == 20
