"""
/api/docs エンドポイントのテスト。
設計書（doc/ ディレクトリ）の構造・内容・マークダウン有効性を検証する。
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth

# 変数の内容: client: テスト対象の API クライアント。
client = TestClient(app)


@pytest.fixture(autouse=True)
def _login_as_admin(request):
    """/api/docs はログイン必須のため、TestDocsAuth 以外のテストでは管理者としてログインした扱いにする。

    Args:
        request: FastAPI に渡す HTTP リクエスト。

    Returns:
        なし。
    """
    # 1. /api/docs はログイン必須のため、TestDocsAuth 以外のテストでは管理者としてログインした扱いにする。
    if request.cls is not None and request.cls.__name__ == 'TestDocsAuth':
        yield
        return
    app.dependency_overrides[require_auth] = lambda: None
    yield
    app.dependency_overrides.pop(require_auth, None)


def _collect_files(nodes: list) -> list[str]:
    """設計書ツリーを再帰的にたどり、ファイルパスを集める。

    引数:
        nodes: 探索する HTML/XML ノード。

    戻り値:
        指定ノード配下の Markdown ファイルを集めて返す。"""
    # 1. ファイルノードを記録し、子ノードがあれば再帰的に探索する。
    # 変数の内容: paths: 走査・出力するパスの一覧。
    paths = []
    # 変数の内容: node: 現在処理する設計書ツリー項目。
    for node in nodes:
        if node['type'] == 'file':
            paths.append(node['path'])
        elif node.get('children'):
            paths.extend(_collect_files(node['children']))
    return paths


class TestDocsAuth:
    """設計書の API はログイン必須（未ログイン・無効なトークンは 401）。"""

    def test_未ログインでツリーを取得すると401になる(self):
        """Authorization ヘッダーなしの GET /api/docs/tree は 401 になり、ファイル名の一覧を返さないこと。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. Authorization ヘッダーなしの GET /api/docs/tree は 401 になり、ファイル名の一覧を返さないこと。
        resp = client.get('/api/docs/tree')
        assert resp.status_code == 401
        assert 'TEST' not in resp.text

    def test_未ログインで本文を取得すると401になる(self):
        """Authorization ヘッダーなしの GET /api/docs/content は 401 になり、設計書の本文を返さないこと。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. Authorization ヘッダーなしの GET /api/docs/content は 401 になり、設計書の本文を返さないこと。
        resp = client.get('/api/docs/content?path=04_TEST/01_マスターテスト計画書.md')
        assert resp.status_code == 401
        assert not resp.text.lstrip().startswith('#')

    def test_無効なトークンで本文を取得すると401になる(self):
        """Supabase がトークンを無効と判定したときも 401 になること。

        Returns:
            なし。
        """
        # 変数の内容: mock_auth_sb: 認証用 Supabase クライアントのモック。
        # 1. Supabase がトークンを無効と判定したときも 401 になること。
        mock_auth_sb = MagicMock()
        # 変数の内容: mock_auth_sb.auth.get_user.return_value: モック呼び出しの返却値。
        mock_auth_sb.auth.get_user.return_value = MagicMock(user=None)
        with patch('app.auth.supabase', mock_auth_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = client.get(
                '/api/docs/content?path=04_TEST/01_マスターテスト計画書.md',
                headers={'Authorization': 'Bearer invalid'},
            )
        assert resp.status_code == 401


class TestDocsTree:
    """TestDocsTree に関するテストと補助処理をまとめる。"""
    def test_ツリーが200を返す(self):
        """ツリーが200を返すことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. ツリーが200を返すことを確認する。
        resp = client.get('/api/docs/tree')
        assert resp.status_code == 200

    def test_ツリーに必須フィールドが含まれる(self):
        """ツリーに必須フィールドが含まれることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス、tree: 設計書ファイルのツリー。
        # 1. ツリーに必須フィールドが含まれることを確認する。
        resp = client.get('/api/docs/tree')
        tree = resp.json()
        assert isinstance(tree, list)
        assert len(tree) > 0
        # 変数の内容: item: 現在処理する一覧項目。
        for item in tree:
            assert 'type' in item
            assert 'name' in item
            assert 'path' in item

    def test_テストディレクトリが存在する(self):
        """テストディレクトリが存在することを確認する。

        戻り値:
            なし。"""
        # 変数の内容: names: テストで扱う名前の一覧、resp: API から返されたレスポンス。
        # 1. テストディレクトリが存在することを確認する。
        resp = client.get('/api/docs/tree')
        # 変数の内容: n: API 応答に含まれるドキュメント名。
        names = [n['name'] for n in resp.json()]
        # 変数の内容: n: TEST ディレクトリの有無を調べる各ドキュメント名。
        assert any('TEST' in n for n in names), '04_TEST ディレクトリが見つからない'

    def test_PMディレクトリが存在する(self):
        """PMディレクトリが存在することを確認する。

        戻り値:
            なし。"""
        # 変数の内容: names: テストで扱う名前の一覧、resp: API から返されたレスポンス。
        # 1. PMディレクトリが存在することを確認する。
        resp = client.get('/api/docs/tree')
        # 変数の内容: n: API 応答に含まれるドキュメント名。
        names = [n['name'] for n in resp.json()]
        # 変数の内容: n: PM ディレクトリの有無を調べる各ドキュメント名。
        assert any('PM' in n for n in names), '03_PM ディレクトリが見つからない'


class TestDocsContent:
    """TestDocsContent に関するテストと補助処理をまとめる。"""
    def test_マスターテスト計画書が取得できる(self):
        """マスターテスト計画書が取得できることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. マスターテスト計画書が取得できることを確認する。
        resp = client.get('/api/docs/content?path=04_TEST/01_マスターテスト計画書.md')
        assert resp.status_code == 200
        assert resp.text.strip().startswith('#')
        assert len(resp.text) > 100

    def test_存在しないファイルは404(self):
        """存在しないファイルは404ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. 存在しないファイルは404ことを確認する。
        resp = client.get('/api/docs/content?path=nonexistent.md')
        assert resp.status_code == 404

    def test_ディレクトリトラバーサルは拒否される(self):
        """ディレクトリトラバーサルは拒否されることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. ディレクトリトラバーサルは拒否されることを確認する。
        resp = client.get('/api/docs/content?path=../backend/app/main.py')
        assert resp.status_code in (400, 404)

    def test_mdでないファイルは拒否される(self):
        """mdでないファイルは拒否されることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. mdでないファイルは拒否されることを確認する。
        resp = client.get('/api/docs/content?path=../frontend/package.json')
        assert resp.status_code in (400, 404)


class TestAllDocsValid:
    """TestAllDocsValid に関するテストと補助処理をまとめる。"""
    def test_全設計書ファイルが取得可能(self):
        """全設計書ファイルが取得可能ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: files: 対象ファイルの一覧、tree_resp: 設計書ツリー API の応答。
        # 1. 全設計書ファイルが取得可能ことを確認する。
        tree_resp = client.get('/api/docs/tree')
        files = _collect_files(tree_resp.json())
        assert len(files) > 0, '設計書ファイルが1件もない'
        # 変数の内容: path: 現在処理するファイルまたは URL パス。
        for path in files:
            # 変数の内容: resp: API から返されたレスポンス。
            resp = client.get(f'/api/docs/content?path={path}')
            assert resp.status_code == 200, f'{path} が取得できない (status={resp.status_code})'

    def test_全設計書がH1見出しで始まる(self):
        """全設計書がH1見出しで始まることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: files: 対象ファイルの一覧、tree_resp: 設計書ツリー API の応答。
        # 1. 全設計書がH1見出しで始まることを確認する。
        tree_resp = client.get('/api/docs/tree')
        files = _collect_files(tree_resp.json())
        # 変数の内容: path: 現在処理するファイルまたは URL パス。
        for path in files:
            # 変数の内容: content: 読み込んだ、または生成した内容、resp: API から返されたレスポンス。
            resp = client.get(f'/api/docs/content?path={path}')
            content = resp.text.strip()
            assert content.startswith('#'), f'{path} が # 見出しで始まっていない'

    def test_全設計書が空でない(self):
        """全設計書が空でないことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: files: 対象ファイルの一覧、tree_resp: 設計書ツリー API の応答。
        # 1. 全設計書が空でないことを確認する。
        tree_resp = client.get('/api/docs/tree')
        files = _collect_files(tree_resp.json())
        # 変数の内容: path: 現在処理するファイルまたは URL パス。
        for path in files:
            # 変数の内容: resp: API から返されたレスポンス。
            resp = client.get(f'/api/docs/content?path={path}')
            assert len(resp.text.strip()) > 50, f'{path} の内容が短すぎる（空または未記入の疑い）'
