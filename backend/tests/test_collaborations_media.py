"""
collaborations / media-appearances エンドポイントのテスト。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app


def _simple_mock(data: list, error: Exception = None):
    """table().select().order().execute().data チェーンを設定したモックを返す。

    Args:
        data: テスト対象に渡すデータ。
        error: 検証対象で発生させる例外またはエラー内容。

    Returns:
        設定したテスト用モックを返す。
    """
    # 変数の内容: execute: クエリ実行を模擬する関数、mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    execute = mock_sb.table.return_value.select.return_value.order.return_value.execute
    if error:
        # 変数の内容: execute.return_value.data: モックのクエリ応答に含めるデータ、execute.side_effect: モック呼び出し時に返す例外または副作用。
        execute.side_effect = error
    else:
        # 変数の内容: execute.return_value.data: モックのクエリ応答に含めるデータ。
        execute.return_value.data = data
    return mock_sb


# 変数の内容: COLLABS_DATA: コラボレーション API のテストデータ、MEDIA_DATA: メディア掲載 API のテストデータ。
COLLABS_DATA = [
    {'id': 'c1', 'title': 'Collab A', 'partner_name': 'Partner X', 'display_order': 1},
    {'id': 'c2', 'title': 'Collab B', 'partner_name': 'Partner Y', 'display_order': 2},
]

# MEDIA_DATA: メディア掲載一覧 API のテストデータ。
MEDIA_DATA = [
    {'id': 'm1', 'title': 'Video A', 'youtube_url': 'https://youtube.com/watch?v=aaa', 'published_at': '2025-09-01'},
    {'id': 'm2', 'title': 'Video B', 'youtube_url': 'https://youtube.com/watch?v=bbb', 'published_at': '2025-06-01'},
]


class TestCollaborationsEndpoint:
    """TestCollaborationsEndpoint に関するテストと補助処理をまとめる。"""
    def test_全件取得(self):
        """全件取得ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _simple_mock(COLLABS_DATA)
        with patch('app.routes.collaborations.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/collaborations')
        assert resp.status_code == 200
        # 変数の内容: data: API 応答に含めるメディア掲載レコード一覧。。
        data = resp.json()
        assert len(data) == 2
        assert data[0]['title'] == 'Collab A'

    def test_空一覧(self):
        """空一覧ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _simple_mock([])
        with patch('app.routes.collaborations.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/collaborations')
        assert resp.status_code == 200
        assert resp.json() == []


class TestMediaAppearancesEndpoint:
    """TestMediaAppearancesEndpoint に関するテストと補助処理をまとめる。"""
    def test_全件取得(self):
        """全件取得ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _simple_mock(MEDIA_DATA)
        with patch('app.routes.media_appearances.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/media-appearances')
        assert resp.status_code == 200
        # 変数の内容: data: API 応答に含めるメディア掲載レコード一覧。。
        data = resp.json()
        assert len(data) == 2
        assert data[0]['title'] == 'Video A'

    def test_空一覧(self):
        """空一覧ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _simple_mock([])
        with patch('app.routes.media_appearances.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/media-appearances')
        assert resp.status_code == 200
        assert resp.json() == []

    def test_DB例外は500を返し例外の文字列は応答に出ない(self):
        """DB の例外は一般的な文言の 500 になり、内部の例外の文字列（detail=str(e) だったもの）を返さないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _simple_mock([], error=Exception('DB connection failed'))
        with patch('app.routes.media_appearances.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/media-appearances')
        assert resp.status_code == 500
        assert 'DB connection failed' not in resp.text
        assert resp.json()['detail'] == 'サーバーでエラーが発生しました。時間をおいて再度お試しください。'


class TestCollaborationsCRUD:
    """コラボレーション作成・削除 POST/DELETE /api/collaborations のテスト（管理者のみ）。"""

    def test_コラボレーションを作成すると追加されたレコードが返る(self):
        """POST /api/collaborations でコラボレーションを追加したとき、作成後のレコードが返ること。

        add_collaboration は supabase（件数取得）と admin_supabase（insert）の両方を使う。

        Returns:
            なし。
        """
        from app.auth import require_auth

        # supabase: 件数取得チェーン（select → count）
        mock_public_sb = MagicMock()
        # 変数の内容: mock_public_sb.table.return_value.select.return_value.execute.return_value.count: 対象オブジェクトに設定するcount属性値。
        mock_public_sb.table.return_value.select.return_value.execute.return_value.count = 2

        # admin_supabase: insert チェーン
        new_collab = {'id': 'c3', 'title': 'Collab C', 'partner_name': None, 'display_order': 2}
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.insert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_admin_sb.table.return_value.insert.return_value.execute.return_value.data = [new_collab]

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.collaborations.supabase', mock_public_sb), \
                 patch('app.routes.collaborations.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/collaborations', json={'title': 'Collab C'})
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['title'] == 'Collab C'
        # admin_supabase.insert が呼ばれたこと
        mock_admin_sb.table.return_value.insert.assert_called_once()

    def test_コラボレーション作成は認証なしで401(self):
        """Authorization ヘッダーなしで POST すると 401 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).post('/api/collaborations', json={'title': 'Collab X'})
        assert resp.status_code == 401

    def test_コラボレーションを削除するとokが返る(self):
        """DELETE /api/collaborations/{id} で削除したとき {"ok": True} が返ること。

        Returns:
            なし。
        """
        from app.auth import require_auth

        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        mock_admin_sb = MagicMock()
        # delete チェーン（戻り値は使わない）
        mock_admin_sb.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.collaborations.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).delete('/api/collaborations/c1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    def test_コラボレーション削除は認証なしで401(self):
        """Authorization ヘッダーなしで DELETE すると 401 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).delete('/api/collaborations/c1')
        assert resp.status_code == 401


class TestMediaAppearancesCRUD:
    """メディア出演情報 作成・削除 POST/DELETE /api/media-appearances のテスト（管理者のみ）。"""

    def test_メディア出演情報を作成すると追加されたレコードが返る(self):
        """POST /api/media-appearances でレコードを追加したとき、作成後のデータが返ること。

        Returns:
            なし。
        """
        from app.auth import require_auth

        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、new_item: 新規作成するテスト項目。
        new_item = {'id': 'm3', 'title': 'Video C', 'youtube_url': 'https://youtube.com/watch?v=ccc'}
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.insert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_admin_sb.table.return_value.insert.return_value.execute.return_value.data = [new_item]

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.media_appearances.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post(
                    '/api/media-appearances',
                    json={'title': 'Video C', 'youtube_url': 'https://youtube.com/watch?v=ccc'},
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['title'] == 'Video C'

    def test_メディア出演情報作成でDB例外が発生すると500(self):
        """admin_supabase.insert が例外を投げたとき 500 が返ること。

        Returns:
            なし。
        """
        from app.auth import require_auth

        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.insert.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        mock_admin_sb.table.return_value.insert.return_value.execute.side_effect = Exception('insert failed')

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.media_appearances.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post(
                    '/api/media-appearances',
                    json={'title': 'Video X', 'youtube_url': 'https://youtube.com/watch?v=xxx'},
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 500

    def test_メディア出演情報作成は認証なしで401(self):
        """Authorization ヘッダーなしで POST すると 401 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).post(
            '/api/media-appearances',
            json={'title': 'Video X', 'youtube_url': 'https://youtube.com/watch?v=xxx'},
        )
        assert resp.status_code == 401

    def test_メディア出演情報を削除するとokが返る(self):
        """DELETE /api/media-appearances/{id} で削除したとき {"ok": True} が返ること。

        Returns:
            なし。
        """
        from app.auth import require_auth

        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.delete.return_value.eq.return_value.execute.return_value: モック呼び出しの返却値。
        mock_admin_sb.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.media_appearances.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).delete('/api/media-appearances/m1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    def test_メディア出演情報削除でDB例外が発生すると500(self):
        """admin_supabase.delete が例外を投げたとき 500 が返ること。

        Returns:
            なし。
        """
        from app.auth import require_auth

        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.delete.return_value.eq.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        mock_admin_sb.table.return_value.delete.return_value.eq.return_value.execute.side_effect = Exception('delete failed')

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.media_appearances.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).delete('/api/media-appearances/m1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 500

    def test_メディア出演情報削除は認証なしで401(self):
        """Authorization ヘッダーなしで DELETE すると 401 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).delete('/api/media-appearances/m1')
        assert resp.status_code == 401
