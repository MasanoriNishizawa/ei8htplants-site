"""
articles エンドポイントのテスト。
対象: backend/app/routes/articles.py
テスト概要: 記事の一覧取得・単件取得・作成・更新・削除の正常/異常ケースを確認する。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth

# --- テスト用サンプルデータ ---

# 公開済み記事サンプル
PUBLISHED_ARTICLE = {
    'id': 'a1',
    'title': '公開記事',
    'content': '本文',
    'is_published': True,
    'display_order': 1,
    'image_urls': [],
    'tags': [],
    'product_ids': [],
    'published_at': '2024-01-01T00:00:00+00:00',
}

# 非公開記事サンプル
DRAFT_ARTICLE = {
    'id': 'a2',
    'title': '下書き記事',
    'content': '本文2',
    'is_published': False,
    'display_order': 2,
    'image_urls': [],
    'tags': [],
    'product_ids': [],
    'published_at': None,
}


def _make_sb_mock():
    """admin_supabase の MagicMock を返す。各テストで個別に .return_value を設定する。"""
    return MagicMock()


def _auth_override():
    """認証を無効化するオーバーライド関数。テスト時のみ使用する。"""
    return None


class TestListArticles:
    """記事一覧 GET /api/articles のテスト。"""

    def test_デフォルトは公開済みのみ返す(self):
        """?all 未指定のとき is_published=True の記事のみ返ること。"""
        mock_sb = _make_sb_mock()
        # supabase.table().select().order().order().eq().execute().data のチェーン
        chain = mock_sb.table.return_value.select.return_value.order.return_value.order.return_value
        # .eq('is_published', True) が呼ばれた後の結果
        chain.eq.return_value.execute.return_value.data = [PUBLISHED_ARTICLE]
        # .execute() が直接呼ばれた（all=True）場合も念のため設定
        chain.execute.return_value.data = [PUBLISHED_ARTICLE, DRAFT_ARTICLE]

        with patch('app.routes.articles.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/articles')

        assert resp.status_code == 200
        data = resp.json()
        # 公開済みのみが返る
        assert len(data) == 1
        assert data[0]['id'] == 'a1'

    def test_all_true_で全件返す(self):
        """?all=true のとき非公開も含む全件が返ること。"""
        mock_sb = _make_sb_mock()
        chain = mock_sb.table.return_value.select.return_value.order.return_value.order.return_value
        # all=true では eq を呼ばずそのまま execute する
        chain.execute.return_value.data = [PUBLISHED_ARTICLE, DRAFT_ARTICLE]

        with patch('app.routes.articles.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/articles?all=true')

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    def test_記事が0件のとき空配列(self):
        """DBが空のとき空配列が返ること。"""
        mock_sb = _make_sb_mock()
        chain = mock_sb.table.return_value.select.return_value.order.return_value.order.return_value
        chain.eq.return_value.execute.return_value.data = []

        with patch('app.routes.articles.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/articles')

        assert resp.status_code == 200
        assert resp.json() == []


class TestGetArticle:
    """記事単件取得 GET /api/articles/:id のテスト。"""

    def test_存在するIDで記事を取得できる(self):
        """存在するIDを指定したとき記事オブジェクトが返ること。"""
        mock_sb = _make_sb_mock()
        # table().select().eq().single().execute().data のチェーン
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = PUBLISHED_ARTICLE

        with patch('app.routes.articles.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/articles/a1')

        assert resp.status_code == 200
        assert resp.json()['id'] == 'a1'

    def test_存在しないIDで404(self):
        """存在しないIDを指定したとき404が返ること。"""
        mock_sb = _make_sb_mock()
        # data = None で存在しないことを表現
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

        with patch('app.routes.articles.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/articles/nonexistent')

        assert resp.status_code == 404


class TestCreateArticle:
    """記事作成 POST /api/articles のテスト。"""

    def test_正常に記事を作成できる(self):
        """正しいリクエストボディで記事が作成され、作成されたレコードが返ること。"""
        mock_sb = _make_sb_mock()
        # table().insert().execute().data[0] のチェーン
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [PUBLISHED_ARTICLE]

        payload = {
            'title': '新しい記事',
            'content': '内容',
            'is_published': True,
        }

        # 1. app.dependency_overrides で require_auth を無効化する
        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.articles.admin_supabase', mock_sb):
                resp = TestClient(app).post('/api/articles', json=payload)
        finally:
            # 2. テスト後に必ずオーバーライドを解除する
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['id'] == 'a1'


class TestUpdateArticle:
    """記事更新 PUT /api/articles/:id のテスト。"""

    def test_正常に記事を更新できる(self):
        """既存レコードの更新ができ、更新後レコードが返ること。"""
        mock_sb = _make_sb_mock()
        # 既存レコード取得チェーン（is_published, published_at の確認用）
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
            'is_published': False,
            'published_at': None,
        }
        # update チェーン
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [PUBLISHED_ARTICLE]

        payload = {
            'title': '更新後タイトル',
            'content': '更新後内容',
            'is_published': True,
        }

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.articles.admin_supabase', mock_sb):
                resp = TestClient(app).put('/api/articles/a1', json=payload)
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['id'] == 'a1'


class TestDeleteArticle:
    """記事削除 DELETE /api/articles/:id のテスト。"""

    def test_正常に記事を削除するとokが返る(self):
        """削除に成功すると {"ok": True} が返ること。"""
        mock_sb = _make_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.articles.admin_supabase', mock_sb):
                resp = TestClient(app).delete('/api/articles/a1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
