"""
pot_artists エンドポイントのテスト。
対象: backend/app/routes/pot_artists.py
テスト概要: 鉢作家の一覧取得（公開）・作成（管理者）・削除（管理者）の正常/異常ケースを確認する。
一覧取得は supabase（公開クライアント）、作成・削除は admin_supabase を使う。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth

# --- テスト用サンプルデータ ---

ARTIST_1 = {
    'id': 'art1',
    'name': '山田鉢師',
    'created_at': '2024-01-01T00:00:00+00:00',
}

# ARTIST_2: 作家一覧と詳細の別レコード検証に使うデータ。
ARTIST_2 = {
    'id': 'art2',
    'name': '佐藤陶芸',
    'created_at': '2024-01-02T00:00:00+00:00',
}


def _make_public_sb_mock(data: list):
    """公開クライアント（supabase）の MagicMock を返す。

    Args:
        data: テスト対象に渡すデータ。

    Returns:
        設定したテスト用モックを返す。
    """
    # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    # table().select().order().execute().data のチェーン
    mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = data
    return mock_sb


def _make_admin_sb_mock():
    """管理クライアント（admin_supabase）の MagicMock を返す。

    Returns:
        設定したテスト用モックを返す。
    """
    return MagicMock()


def _auth_override():
    """認証を無効化するオーバーライド関数。テスト時のみ使用する。

    Returns:
        認証依存関係を差し替える関数を返す。
    """
    return None


class TestListPotArtists:
    """鉢作家一覧 GET /api/pot-artists のテスト。"""

    def test_一覧が返る(self):
        """鉢作家が存在するとき配列が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 鉢作家が存在するとき配列が返ること。
        mock_sb = _make_public_sb_mock([ARTIST_1, ARTIST_2])

        with patch('app.routes.pot_artists.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/pot-artists')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す作家レコード一覧。。
        data = resp.json()
        assert len(data) == 2
        assert data[0]['id'] == 'art1'

    def test_0件のとき空配列(self):
        """鉢作家が0件のとき空配列が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 鉢作家が0件のとき空配列が返ること。
        mock_sb = _make_public_sb_mock([])

        with patch('app.routes.pot_artists.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/pot-artists')

        assert resp.status_code == 200
        assert resp.json() == []

    def test_認証なしでアクセスできる(self):
        """一覧取得は認証不要でアクセスできること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 一覧取得は認証不要でアクセスできること。
        mock_sb = _make_public_sb_mock([ARTIST_1])

        with patch('app.routes.pot_artists.supabase', mock_sb):
            # Authorization ヘッダーなし
            resp = TestClient(app).get('/api/pot-artists')

        # 認証なしでも200が返ること
        assert resp.status_code == 200

    def test_名前フィールドが含まれる(self):
        """返却されるオブジェクトに name フィールドが含まれること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 返却されるオブジェクトに name フィールドが含まれること。
        mock_sb = _make_public_sb_mock([ARTIST_1])

        with patch('app.routes.pot_artists.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/pot-artists')

        assert resp.status_code == 200
        assert 'name' in resp.json()[0]
        assert resp.json()[0]['name'] == '山田鉢師'


class TestAddPotArtist:
    """鉢作家作成 POST /api/pot-artists のテスト。"""

    def test_正常に鉢作家を追加できる(self):
        """正しいリクエストボディで鉢作家が追加され、作成されたレコードが返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        mock_admin_sb = _make_admin_sb_mock()
        # 変数の内容: mock_admin_sb.table.return_value.insert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_admin_sb.table.return_value.insert.return_value.execute.return_value.data = [ARTIST_1]

        # 変数の内容: payload: DB に保存する値。
        payload = {'name': '山田鉢師'}

        # 1. app.dependency_overrides で require_auth を無効化する
        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.pot_artists.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/pot-artists', json=payload)
        finally:
            # 2. テスト後に必ずオーバーライドを解除する
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['id'] == 'art1'
        assert resp.json()['name'] == '山田鉢師'

    def test_nameが欠けると422(self):
        """name フィールドが欠けると 422 バリデーションエラーが返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. name フィールドが欠けると 422 バリデーションエラーが返ること。
        mock_admin_sb = _make_admin_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.pot_artists.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/pot-artists', json={})
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 422

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで作成しようとすると 401 が返ること。

        Returns:
            なし。
        """
        # require_auth をオーバーライドせず本来の認証チェックを走らせる
        # 1. Authorization ヘッダーなしで作成しようとすると 401 が返ること。
        resp = TestClient(app).post('/api/pot-artists', json={'name': 'テスト'})
        assert resp.status_code == 401


class TestDeletePotArtist:
    """鉢作家削除 DELETE /api/pot-artists/:id のテスト。"""

    def test_正常に削除するとokが返る(self):
        """削除に成功すると {"ok": True} が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 削除に成功すると {"ok": True} が返ること。
        mock_admin_sb = _make_admin_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.pot_artists.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).delete('/api/pot-artists/art1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで削除しようとすると 401 が返ること。

        Returns:
            なし。
        """
        # require_auth をオーバーライドせず本来の認証チェックを走らせる
        # 1. Authorization ヘッダーなしで削除しようとすると 401 が返ること。
        resp = TestClient(app).delete('/api/pot-artists/art1')
        assert resp.status_code == 401
