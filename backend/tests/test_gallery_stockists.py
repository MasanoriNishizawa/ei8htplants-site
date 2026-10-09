"""
gallery / stockists エンドポイントのテスト。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app


def _make_gallery_mock(all_data: list, brand_data: list = None):
    """
    gallery_images テーブルへの2通りのクエリチェーンを設定したモックを返す。
    - ブランド指定なし: table().select().order().execute().data
    - ブランド指定あり: table().select().order().eq().execute().data
    """
    brand_data = brand_data if brand_data is not None else []
    mock_sb = MagicMock()
    chain = mock_sb.table.return_value.select.return_value.order.return_value
    chain.execute.return_value.data = all_data
    chain.eq.return_value.execute.return_value.data = brand_data
    return mock_sb


def _make_stockists_mock(data: list):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = data
    return mock_sb


GALLERY_DATA = [
    {'id': 'g1', 'url': 'https://example.com/a.jpg', 'brand': 'ei8ht plants', 'display_order': 1},
    {'id': 'g2', 'url': 'https://example.com/b.jpg', 'brand': 'HUE', 'display_order': 2},
    {'id': 'g3', 'url': 'https://example.com/c.jpg', 'brand': 'ei8ht plants', 'display_order': 3},
]

HUE_DATA = [GALLERY_DATA[1]]

STOCKISTS_DATA = [
    {'id': 's1', 'name': 'Green Shop', 'area': '東京', 'display_order': 1},
    {'id': 's2', 'name': 'Plant Store', 'area': '大阪', 'display_order': 2},
]


class TestGalleryEndpoint:
    def test_全件取得(self):
        mock_sb = _make_gallery_mock(GALLERY_DATA)
        with patch('app.routes.gallery.supabase', mock_sb):
            resp = TestClient(app).get('/api/gallery')
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3

    def test_brand指定でフィルタリング(self):
        mock_sb = _make_gallery_mock(GALLERY_DATA, brand_data=HUE_DATA)
        with patch('app.routes.gallery.supabase', mock_sb):
            resp = TestClient(app).get('/api/gallery?brand=HUE')
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]['brand'] == 'HUE'

    def test_brand空文字は全件返す(self):
        """brand='' は falsy なのでフィルタなし全件取得になる"""
        mock_sb = _make_gallery_mock(GALLERY_DATA)
        with patch('app.routes.gallery.supabase', mock_sb):
            resp = TestClient(app).get('/api/gallery?brand=')
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_空一覧(self):
        mock_sb = _make_gallery_mock([])
        with patch('app.routes.gallery.supabase', mock_sb):
            resp = TestClient(app).get('/api/gallery')
        assert resp.status_code == 200
        assert resp.json() == []


class TestStockistsEndpoint:
    def test_全件取得(self):
        mock_sb = _make_stockists_mock(STOCKISTS_DATA)
        with patch('app.routes.stockists.supabase', mock_sb):
            resp = TestClient(app).get('/api/stockists')
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]['name'] == 'Green Shop'

    def test_空一覧(self):
        mock_sb = _make_stockists_mock([])
        with patch('app.routes.stockists.supabase', mock_sb):
            resp = TestClient(app).get('/api/stockists')
        assert resp.status_code == 200
        assert resp.json() == []
