"""
auth.py の require_auth 関数のテスト。

実際の認証フローを保護されたエンドポイントへのリクエストを通してテストする。
- app.auth.supabase をパッチして Supabase への接続を防ぐ
- conftest.py がモジュールレベルで supabase をモック済みのため、
  本番 DB への接続は発生しない
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_auth


# 認証が必要なエンドポイント（GET /api/events/finances）をテストに使う
PROTECTED_URL = '/api/events/finances'


def _make_auth_supabase_mock(user_obj=None, raise_exc: Exception = None) -> MagicMock:
    """app.auth.supabase のモックを作成して返す。

    Args:
        user_obj: supabase.auth.get_user が返すユーザーオブジェクト（None なら認証失敗）
        raise_exc: get_user が投げる例外（指定した場合は user_obj を無視）

    Returns:
        supabase モック
    """
    mock_auth_sb = MagicMock()
    if raise_exc is not None:
        mock_auth_sb.auth.get_user.side_effect = raise_exc
    else:
        result = MagicMock()
        result.user = user_obj
        mock_auth_sb.auth.get_user.return_value = result
    return mock_auth_sb


class TestRequireAuth:
    """require_auth 依存関数のテスト。"""

    def setup_method(self):
        """テストごとに dependency_overrides をクリアして実際の require_auth を使う。"""
        app.dependency_overrides.clear()

    def teardown_method(self):
        """テスト後に dependency_overrides をリセットする。"""
        app.dependency_overrides.clear()

    def test_Authorizationヘッダーなし_401(self):
        """Authorization ヘッダーを送らない場合は 401 が返る。"""
        client = TestClient(app)
        resp = client.get(PROTECTED_URL)
        assert resp.status_code == 401

    def test_Bearerプレフィックスなし_401(self):
        """Authorization ヘッダーが 'Bearer ' で始まらない場合は 401 が返る。"""
        client = TestClient(app)
        resp = client.get(PROTECTED_URL, headers={'Authorization': 'Token abc123'})
        assert resp.status_code == 401

    def test_Bearerプレフィックスのみ_空トークン_401(self):
        """'Bearer ' プレフィックスのみでトークンが空の場合は 401 が返る。

        Supabase が空トークンに対して例外を投げるケースをシミュレートする。
        """
        mock_auth_sb = _make_auth_supabase_mock(raise_exc=Exception('Invalid token'))

        with patch('app.auth.supabase', mock_auth_sb):
            client = TestClient(app)
            resp = client.get(PROTECTED_URL, headers={'Authorization': 'Bearer '})

        assert resp.status_code == 401

    def test_無効なトークン_Supabaseがユーザーなし_401(self):
        """Supabase が user=None を返す場合は 401 が返る。"""
        mock_auth_sb = _make_auth_supabase_mock(user_obj=None)

        with patch('app.auth.supabase', mock_auth_sb):
            client = TestClient(app)
            resp = client.get(PROTECTED_URL, headers={'Authorization': 'Bearer invalid-token'})

        assert resp.status_code == 401

    def test_無効なトークン_Supabaseが例外_401(self):
        """Supabase の get_user が例外を投げる場合は 401 が返る。"""
        mock_auth_sb = _make_auth_supabase_mock(raise_exc=Exception('Token verification failed'))

        with patch('app.auth.supabase', mock_auth_sb):
            client = TestClient(app)
            resp = client.get(PROTECTED_URL, headers={'Authorization': 'Bearer bad-token'})

        assert resp.status_code == 401

    def test_有効なトークン_認証成功(self):
        """Supabase がユーザーオブジェクトを返す有効なトークンで認証が通る。"""
        # 有効なユーザーオブジェクトを返すモック
        user = MagicMock()
        user.id = 'user-123'
        mock_auth_sb = _make_auth_supabase_mock(user_obj=user)

        # admin_supabase のモック（finances 取得に必要）
        mock_admin_sb = MagicMock()
        mock_admin_sb.table.return_value.select.return_value.execute.return_value.data = []

        with patch('app.auth.supabase', mock_auth_sb), \
             patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.get(PROTECTED_URL, headers={'Authorization': 'Bearer valid-token'})

        # 認証が通って 200 が返ること（finances は空リスト）
        assert resp.status_code == 200

    def test_有効なトークン_get_userが呼ばれる(self):
        """有効なトークンで require_auth が Supabase の get_user を正しく呼ぶ。"""
        user = MagicMock()
        user.id = 'user-456'
        mock_auth_sb = _make_auth_supabase_mock(user_obj=user)

        mock_admin_sb = MagicMock()
        mock_admin_sb.table.return_value.select.return_value.execute.return_value.data = []

        with patch('app.auth.supabase', mock_auth_sb), \
             patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.get(PROTECTED_URL, headers={'Authorization': 'Bearer my-token'})

        # get_user が 'my-token' で呼ばれていること
        mock_auth_sb.auth.get_user.assert_called_once_with('my-token')
        assert resp.status_code == 200
