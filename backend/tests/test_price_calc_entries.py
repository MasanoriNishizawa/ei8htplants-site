"""
price_calc_entries エンドポイントのテスト。
対象: backend/app/routes/price_calc_entries.py
テスト概要: 価格計算エントリの一覧取得・作成・削除の正常/異常ケースを確認する。
全エンドポイントが管理者認証（require_auth）を要求するため、テスト時はオーバーライドする。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth

# --- テスト用サンプルデータ ---

# 価格計算エントリサンプル
ENTRY_1 = {
    'id': 'e1',
    'brand': 'ei8ht plants',
    'plant_name': 'アガベ チタノタ',
    'pot_artist_name': '山田鉢師',
    'cost': 3000.0,
    'selling_price': 8000.0,
    'created_at': '2024-01-01T00:00:00+00:00',
}

ENTRY_2 = {
    'id': 'e2',
    'brand': 'HUE',
    'plant_name': 'パキポディウム',
    'pot_artist_name': None,
    'cost': 5000.0,
    'selling_price': 12000.0,
    'created_at': '2024-01-02T00:00:00+00:00',
}


def _make_sb_mock():
    """admin_supabase の MagicMock を返す。"""
    return MagicMock()


def _auth_override():
    """認証を無効化するオーバーライド関数。テスト時のみ使用する。"""
    return None


class TestListEntries:
    """価格計算エントリ一覧 GET /api/price-calc-entries のテスト。"""

    def test_一覧が返る(self):
        """エントリが存在するとき配列が返ること。"""
        mock_sb = _make_sb_mock()
        # table().select().order().execute().data のチェーン
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = [ENTRY_1, ENTRY_2]

        # 1. require_auth を無効化してリクエストを送る
        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                resp = TestClient(app).get('/api/price-calc-entries')
        finally:
            # 2. テスト後に必ずオーバーライドを解除する
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]['id'] == 'e1'

    def test_0件のとき空配列(self):
        """エントリが0件のとき空配列が返ること。"""
        mock_sb = _make_sb_mock()
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = []

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                resp = TestClient(app).get('/api/price-calc-entries')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == []

    def test_認証なしで401(self):
        """Authorization ヘッダーなしでアクセスすると 401 が返ること。"""
        # require_auth をオーバーライドしないで本来の認証チェックが走るようにする
        resp = TestClient(app).get('/api/price-calc-entries')
        assert resp.status_code == 401


class TestAddEntry:
    """価格計算エントリ作成 POST /api/price-calc-entries のテスト。"""

    def test_正常にエントリを作成できる(self):
        """正しいリクエストボディでエントリが作成され、作成されたレコードが返ること。"""
        mock_sb = _make_sb_mock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [ENTRY_1]

        payload = {
            'brand': 'ei8ht plants',
            'plant_name': 'アガベ チタノタ',
            'pot_artist_name': '山田鉢師',
            'cost': 3000.0,
            'selling_price': 8000.0,
        }

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                resp = TestClient(app).post('/api/price-calc-entries', json=payload)
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['id'] == 'e1'

    def test_pot_artist_nameはNullable(self):
        """pot_artist_name は省略可能でNoneでも正常に作成できること。"""
        mock_sb = _make_sb_mock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [ENTRY_2]

        payload = {
            'brand': 'HUE',
            'plant_name': 'パキポディウム',
            'cost': 5000.0,
            'selling_price': 12000.0,
        }

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                resp = TestClient(app).post('/api/price-calc-entries', json=payload)
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200

    def test_brandが欠けると422(self):
        """brand フィールドが欠けると 422 バリデーションエラーが返ること。"""
        mock_sb = _make_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                resp = TestClient(app).post('/api/price-calc-entries', json={
                    'plant_name': 'アガベ',
                    'cost': 1000.0,
                    'selling_price': 3000.0,
                })
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 422

    def test_plant_nameが欠けると422(self):
        """plant_name フィールドが欠けると 422 バリデーションエラーが返ること。"""
        mock_sb = _make_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                resp = TestClient(app).post('/api/price-calc-entries', json={
                    'brand': 'ei8ht plants',
                    'cost': 1000.0,
                    'selling_price': 3000.0,
                })
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 422


class TestDeleteEntry:
    """価格計算エントリ削除 DELETE /api/price-calc-entries/:id のテスト。"""

    def test_正常に削除するとokが返る(self):
        """削除に成功すると {"ok": True} が返ること。"""
        mock_sb = _make_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                resp = TestClient(app).delete('/api/price-calc-entries/e1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
