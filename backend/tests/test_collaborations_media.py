"""
collaborations / media-appearances エンドポイントのテスト。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app


def _simple_mock(data: list, error: Exception = None):
    """table().select().order().execute().data チェーンを設定したモックを返す。"""
    mock_sb = MagicMock()
    execute = mock_sb.table.return_value.select.return_value.order.return_value.execute
    if error:
        execute.side_effect = error
    else:
        execute.return_value.data = data
    return mock_sb


COLLABS_DATA = [
    {'id': 'c1', 'title': 'Collab A', 'partner_name': 'Partner X', 'display_order': 1},
    {'id': 'c2', 'title': 'Collab B', 'partner_name': 'Partner Y', 'display_order': 2},
]

MEDIA_DATA = [
    {'id': 'm1', 'title': 'Video A', 'youtube_url': 'https://youtube.com/watch?v=aaa', 'published_at': '2025-09-01'},
    {'id': 'm2', 'title': 'Video B', 'youtube_url': 'https://youtube.com/watch?v=bbb', 'published_at': '2025-06-01'},
]


class TestCollaborationsEndpoint:
    def test_全件取得(self):
        mock_sb = _simple_mock(COLLABS_DATA)
        with patch('app.routes.collaborations.supabase', mock_sb):
            resp = TestClient(app).get('/api/collaborations')
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]['title'] == 'Collab A'

    def test_空一覧(self):
        mock_sb = _simple_mock([])
        with patch('app.routes.collaborations.supabase', mock_sb):
            resp = TestClient(app).get('/api/collaborations')
        assert resp.status_code == 200
        assert resp.json() == []


class TestMediaAppearancesEndpoint:
    def test_全件取得(self):
        mock_sb = _simple_mock(MEDIA_DATA)
        with patch('app.routes.media_appearances.supabase', mock_sb):
            resp = TestClient(app).get('/api/media-appearances')
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]['title'] == 'Video A'

    def test_空一覧(self):
        mock_sb = _simple_mock([])
        with patch('app.routes.media_appearances.supabase', mock_sb):
            resp = TestClient(app).get('/api/media-appearances')
        assert resp.status_code == 200
        assert resp.json() == []

    def test_DB例外は500を返す(self):
        mock_sb = _simple_mock([], error=Exception('DB connection failed'))
        with patch('app.routes.media_appearances.supabase', mock_sb):
            resp = TestClient(app).get('/api/media-appearances')
        assert resp.status_code == 500
        assert 'DB connection failed' in resp.json()['detail']
