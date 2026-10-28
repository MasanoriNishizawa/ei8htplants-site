"""
articles エンドポイントのテスト。
対象: backend/app/routes/articles.py
テスト概要: 記事の一覧取得・単件取得・作成・更新・削除の正常/異常ケースを確認する。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth
from tests._helpers import as_admin, not_found_error

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
    """admin_supabase の MagicMock を返す。各テストで個別に .return_value を設定する。

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


class TestListArticles:
    """記事一覧 GET /api/articles のテスト。"""

    def test_デフォルトは公開済みのみ返す(self):
        """?all 未指定のとき is_published=True の記事のみ返ること。

        Returns:
            なし。
        """
        # 変数の内容: chain: Supabase クエリの呼び出し連鎖モック、mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        # supabase.table().select().order().order().eq().execute().data のチェーン
        chain = mock_sb.table.return_value.select.return_value.order.return_value.order.return_value
        # .eq('is_published', True) が呼ばれた後の結果
        chain.eq.return_value.execute.return_value.data = [PUBLISHED_ARTICLE]
        # .execute() が直接呼ばれた（all=True）場合も念のため設定
        chain.execute.return_value.data = [PUBLISHED_ARTICLE, DRAFT_ARTICLE]

        with patch('app.routes.articles.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/articles')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す記事レコード一覧。。
        data = resp.json()
        # 公開済みのみが返る
        assert len(data) == 1
        assert data[0]['id'] == 'a1'

    def test_ログイン済みでall_trueを指定すると非公開も含む全件が返る(self):
        """管理者としてログインして ?all=true を指定すると、非公開も含む全件が返り is_published で絞らないこと。

        Returns:
            なし。
        """
        # 変数の内容: chain: Supabase クエリの呼び出し連鎖モック、mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        chain = mock_sb.table.return_value.select.return_value.order.return_value.order.return_value
        # all=true では eq を呼ばずそのまま execute する
        chain.execute.return_value.data = [PUBLISHED_ARTICLE, DRAFT_ARTICLE]

        with patch('app.routes.articles.admin_supabase', mock_sb), as_admin():
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/articles?all=true')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す公開・非公開の記事レコード一覧。。
        data = resp.json()
        assert len(data) == 2
        chain.eq.assert_not_called()

    def test_未ログインでall_trueを指定すると401になりDBを読まない(self):
        """Authorization ヘッダーなしで ?all=true を指定すると 401 になり、非公開の記事が漏れないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()

        with patch('app.routes.articles.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/articles?all=true')

        assert resp.status_code == 401
        mock_sb.table.assert_not_called()

    def test_無効なトークンでall_trueを指定すると401になる(self):
        """Authorization ヘッダーがあってもトークンが無効なら 401（期限切れに気づけるよう未ログイン扱いにしない）。

        Returns:
            なし。
        """
        # 変数の内容: mock_auth_sb: 認証用 Supabase クライアントのモック。
        mock_auth_sb = MagicMock()
        # 変数の内容: mock_auth_sb.auth.get_user.side_effect: モック呼び出し時に返す例外または副作用。
        mock_auth_sb.auth.get_user.side_effect = Exception('invalid token')

        with patch('app.auth.supabase', mock_auth_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/articles?all=true', headers={'Authorization': 'Bearer bad'})

        assert resp.status_code == 401

    def test_記事が0件のとき空配列(self):
        """DBが空のとき空配列が返ること。

        Returns:
            なし。
        """
        # 変数の内容: chain: Supabase クエリの呼び出し連鎖モック、mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        chain = mock_sb.table.return_value.select.return_value.order.return_value.order.return_value
        # 変数の内容: chain.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        chain.eq.return_value.execute.return_value.data = []

        with patch('app.routes.articles.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/articles')

        assert resp.status_code == 200
        assert resp.json() == []


class TestGetArticle:
    """記事単件取得 GET /api/articles/:id のテスト。"""

    def test_存在するIDで記事を取得できる(self):
        """未ログインで公開済みの記事の ID を指定すると、is_published=True で絞った上で記事が返ること。

        Returns:
            なし。
        """
        # 変数の内容: eq_id: 対象 ID で絞り込むモック条件、mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        # 未ログイン: table().select().eq('id').eq('is_published', True).single().execute().data
        eq_id = mock_sb.table.return_value.select.return_value.eq.return_value
        # 変数の内容: eq_id.eq.return_value.single.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        eq_id.eq.return_value.single.return_value.execute.return_value.data = PUBLISHED_ARTICLE

        with patch('app.routes.articles.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/articles/a1')

        assert resp.status_code == 200
        assert resp.json()['id'] == 'a1'
        eq_id.eq.assert_called_once_with('is_published', True)

    def test_存在しないIDで404(self):
        """存在しない ID（single() が PGRST116 を投げる）を指定すると 404 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: eq_id: 対象 ID で絞り込むモック条件、mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        eq_id = mock_sb.table.return_value.select.return_value.eq.return_value
        # 変数の内容: eq_id.eq.return_value.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        eq_id.eq.return_value.single.return_value.execute.side_effect = not_found_error()

        with patch('app.routes.articles.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/articles/nonexistent')

        assert resp.status_code == 404

    def test_未ログインで非公開の記事を指定すると404になる(self):
        """非公開の記事は公開で絞ると 0 件（PGRST116）になるため、未ログインでは 404 が返り下書きが漏れないこと。

        Returns:
            なし。
        """
        # 変数の内容: eq_id: 対象 ID で絞り込むモック条件、mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        eq_id = mock_sb.table.return_value.select.return_value.eq.return_value
        # 公開で絞った結果は 0 件
        eq_id.eq.return_value.single.return_value.execute.side_effect = not_found_error()
        # 絞らない場合は下書きが取れてしまう（使われないことを確かめるため設定しておく）
        eq_id.single.return_value.execute.return_value.data = DRAFT_ARTICLE

        with patch('app.routes.articles.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/articles/a2')

        assert resp.status_code == 404
        assert '下書き' not in resp.text

    def test_ログイン済みなら非公開の記事も取得できる(self):
        """管理者としてログインしていれば is_published で絞らず、非公開の記事も返ること。

        Returns:
            なし。
        """
        # 変数の内容: eq_id: 対象 ID で絞り込むモック条件、mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        eq_id = mock_sb.table.return_value.select.return_value.eq.return_value
        # 変数の内容: eq_id.single.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        eq_id.single.return_value.execute.return_value.data = DRAFT_ARTICLE

        with patch('app.routes.articles.admin_supabase', mock_sb), as_admin():
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/articles/a2')

        assert resp.status_code == 200
        assert resp.json()['id'] == 'a2'
        eq_id.eq.assert_not_called()


class TestCreateArticle:
    """記事作成 POST /api/articles のテスト。"""

    def test_正常に記事を作成できる(self):
        """正しいリクエストボディで記事が作成され、作成されたレコードが返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        # table().insert().execute().data[0] のチェーン
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [PUBLISHED_ARTICLE]

        # 変数の内容: payload: DB に保存する値。
        payload = {
            'title': '新しい記事',
            'content': '内容',
            'is_published': True,
        }

        # 1. app.dependency_overrides で require_auth を無効化する
        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.articles.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/articles', json=payload)
        finally:
            # 2. テスト後に必ずオーバーライドを解除する
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['id'] == 'a1'


class TestUpdateArticle:
    """記事更新 PUT /api/articles/:id のテスト。"""

    def test_正常に記事を更新できる(self):
        """既存レコードの更新ができ、更新後レコードが返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        # 既存レコード取得チェーン（is_published, published_at の確認用）
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
            'is_published': False,
            'published_at': None,
        }
        # update チェーン
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [PUBLISHED_ARTICLE]

        # 変数の内容: payload: DB に保存する値。
        payload = {
            'title': '更新後タイトル',
            'content': '更新後内容',
            'is_published': True,
        }

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.articles.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).put('/api/articles/a1', json=payload)
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['id'] == 'a1'


class TestDeleteArticle:
    """記事削除 DELETE /api/articles/:id のテスト。"""

    def test_正常に記事を削除するとokが返る(self):
        """削除に成功すると {"ok": True} が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.articles.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).delete('/api/articles/a1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
