"""
/api/docs エンドポイントのテスト。
設計書（doc/ ディレクトリ）の構造・内容・マークダウン有効性を検証する。
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth

client = TestClient(app)


@pytest.fixture(autouse=True)
def _login_as_admin(request):
    """/api/docs はログイン必須のため、TestDocsAuth 以外のテストでは管理者としてログインした扱いにする。"""
    if request.cls is not None and request.cls.__name__ == 'TestDocsAuth':
        yield
        return
    app.dependency_overrides[require_auth] = lambda: None
    yield
    app.dependency_overrides.pop(require_auth, None)


def _collect_files(nodes: list) -> list[str]:
    paths = []
    for node in nodes:
        if node['type'] == 'file':
            paths.append(node['path'])
        elif node.get('children'):
            paths.extend(_collect_files(node['children']))
    return paths


class TestDocsAuth:
    """設計書の API はログイン必須（未ログイン・無効なトークンは 401）。"""

    def test_未ログインでツリーを取得すると401になる(self):
        """Authorization ヘッダーなしの GET /api/docs/tree は 401 になり、ファイル名の一覧を返さないこと。"""
        resp = client.get('/api/docs/tree')
        assert resp.status_code == 401
        assert 'TEST' not in resp.text

    def test_未ログインで本文を取得すると401になる(self):
        """Authorization ヘッダーなしの GET /api/docs/content は 401 になり、設計書の本文を返さないこと。"""
        resp = client.get('/api/docs/content?path=04_TEST/01_マスターテスト計画書.md')
        assert resp.status_code == 401
        assert not resp.text.lstrip().startswith('#')

    def test_無効なトークンで本文を取得すると401になる(self):
        """Supabase がトークンを無効と判定したときも 401 になること。"""
        mock_auth_sb = MagicMock()
        mock_auth_sb.auth.get_user.return_value = MagicMock(user=None)
        with patch('app.auth.supabase', mock_auth_sb):
            resp = client.get(
                '/api/docs/content?path=04_TEST/01_マスターテスト計画書.md',
                headers={'Authorization': 'Bearer invalid'},
            )
        assert resp.status_code == 401


class TestDocsTree:
    def test_ツリーが200を返す(self):
        resp = client.get('/api/docs/tree')
        assert resp.status_code == 200

    def test_ツリーに必須フィールドが含まれる(self):
        resp = client.get('/api/docs/tree')
        tree = resp.json()
        assert isinstance(tree, list)
        assert len(tree) > 0
        for item in tree:
            assert 'type' in item
            assert 'name' in item
            assert 'path' in item

    def test_テストディレクトリが存在する(self):
        resp = client.get('/api/docs/tree')
        names = [n['name'] for n in resp.json()]
        assert any('TEST' in n for n in names), '04_TEST ディレクトリが見つからない'

    def test_PMディレクトリが存在する(self):
        resp = client.get('/api/docs/tree')
        names = [n['name'] for n in resp.json()]
        assert any('PM' in n for n in names), '03_PM ディレクトリが見つからない'


class TestDocsContent:
    def test_マスターテスト計画書が取得できる(self):
        resp = client.get('/api/docs/content?path=04_TEST/01_マスターテスト計画書.md')
        assert resp.status_code == 200
        assert resp.text.strip().startswith('#')
        assert len(resp.text) > 100

    def test_存在しないファイルは404(self):
        resp = client.get('/api/docs/content?path=nonexistent.md')
        assert resp.status_code == 404

    def test_ディレクトリトラバーサルは拒否される(self):
        resp = client.get('/api/docs/content?path=../backend/app/main.py')
        assert resp.status_code in (400, 404)

    def test_mdでないファイルは拒否される(self):
        resp = client.get('/api/docs/content?path=../frontend/package.json')
        assert resp.status_code in (400, 404)


class TestAllDocsValid:
    def test_全設計書ファイルが取得可能(self):
        tree_resp = client.get('/api/docs/tree')
        files = _collect_files(tree_resp.json())
        assert len(files) > 0, '設計書ファイルが1件もない'
        for path in files:
            resp = client.get(f'/api/docs/content?path={path}')
            assert resp.status_code == 200, f'{path} が取得できない (status={resp.status_code})'

    def test_全設計書がH1見出しで始まる(self):
        tree_resp = client.get('/api/docs/tree')
        files = _collect_files(tree_resp.json())
        for path in files:
            resp = client.get(f'/api/docs/content?path={path}')
            content = resp.text.strip()
            assert content.startswith('#'), f'{path} が # 見出しで始まっていない'

    def test_全設計書が空でない(self):
        tree_resp = client.get('/api/docs/tree')
        files = _collect_files(tree_resp.json())
        for path in files:
            resp = client.get(f'/api/docs/content?path={path}')
            assert len(resp.text.strip()) > 50, f'{path} の内容が短すぎる（空または未記入の疑い）'
