"""
gallery / stockists エンドポイントのテスト。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app


def _make_gallery_mock(all_data: list, brand_data: list = None):
    """gallery_images テーブルへの2通りのクエリチェーンを設定したモックを返す。
    - ブランド指定なし: table().select().order().execute().data
    - ブランド指定あり: table().select().order().eq().execute().data

    Args:
        all_data: 全サイト分のテスト用データ。
        brand_data: ブランドサイト用のテストデータ。

    Returns:
        設定したテスト用モックを返す。
    """
    # 1. 公開ギャラリー一覧、表示順、ブランド条件のクエリモックを設定する。
    # 変数の内容: brand_data: ブランド指定時に返す画像行、chain: Supabase クエリの呼び出し連鎖モック、mock_sb: 公開用 Supabase クライアントのモック。
    brand_data = brand_data if brand_data is not None else []
    mock_sb = MagicMock()
    chain = mock_sb.table.return_value.select.return_value.order.return_value
    # 変数の内容: chain.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ、chain.execute.return_value.data: モックのクエリ応答に含めるデータ。
    chain.execute.return_value.data = all_data
    chain.eq.return_value.execute.return_value.data = brand_data
    return mock_sb


def _make_stockists_mock(data: list):
    """stockists テーブルの読み取り結果を返す DB モックを作る。

    引数:
        data: テスト対象に渡すデータ。

    戻り値:
        テスト用の stockists Supabase クライアントモックを作成する。"""
    # 1. stockists テーブルの読み取り結果を返す DB モックを作る。
    # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    # 変数の内容: mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
    mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = data
    return mock_sb


# 変数の内容: GALLERY_DATA: ギャラリー API のテスト用画像行、HUE_DATA: HUE ブランドのテスト用ギャラリー画像行、STOCKISTS_DATA: 取扱店 API のテスト用データ。
GALLERY_DATA = [
    {'id': 'g1', 'url': 'https://example.com/a.jpg', 'brand': 'ei8ht plants', 'display_order': 1},
    {'id': 'g2', 'url': 'https://example.com/b.jpg', 'brand': 'HUE', 'display_order': 2},
    {'id': 'g3', 'url': 'https://example.com/c.jpg', 'brand': 'ei8ht plants', 'display_order': 3},
]

HUE_DATA = [GALLERY_DATA[1]]

# STOCKISTS_DATA: 公開店舗一覧の表示内容を検証するデータ。
STOCKISTS_DATA = [
    {'id': 's1', 'name': 'Green Shop', 'area': '東京', 'display_order': 1},
    {'id': 's2', 'name': 'Plant Store', 'area': '大阪', 'display_order': 2},
]


class TestGalleryEndpoint:
    """TestGalleryEndpoint に関するテストと補助処理をまとめる。"""
    def test_全件取得(self):
        """全件取得ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 全件取得ことを確認する。
        mock_sb = _make_gallery_mock(GALLERY_DATA)
        with patch('app.routes.gallery.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/gallery')
        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックから返すギャラリーまたは取扱店レコード一覧。。
        data = resp.json()
        assert len(data) == 3

    def test_brand指定でフィルタリング(self):
        """brand指定でフィルタリングことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. brand指定でフィルタリングことを確認する。
        mock_sb = _make_gallery_mock(GALLERY_DATA, brand_data=HUE_DATA)
        with patch('app.routes.gallery.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/gallery?brand=HUE')
        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す複数ブランドのギャラリー画像一覧。。
        data = resp.json()
        assert len(data) == 1
        assert data[0]['brand'] == 'HUE'

    def test_brand空文字は全件返す(self):
        """brand='' は falsy なのでフィルタなし全件取得になる

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. brand='' は falsy なのでフィルタなし全件取得になる。
        mock_sb = _make_gallery_mock(GALLERY_DATA)
        with patch('app.routes.gallery.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/gallery?brand=')
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_空一覧(self):
        """空一覧ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 空一覧ことを確認する。
        mock_sb = _make_gallery_mock([])
        with patch('app.routes.gallery.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/gallery')
        assert resp.status_code == 200
        assert resp.json() == []


class TestStockistsEndpoint:
    """TestStockistsEndpoint に関するテストと補助処理をまとめる。"""
    def test_全件取得(self):
        """全件取得ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 全件取得ことを確認する。
        mock_sb = _make_stockists_mock(STOCKISTS_DATA)
        with patch('app.routes.stockists.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/stockists')
        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックから返すギャラリーまたは取扱店レコード一覧。。
        data = resp.json()
        assert len(data) == 2
        assert data[0]['name'] == 'Green Shop'

    def test_空一覧(self):
        """空一覧ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 空一覧ことを確認する。
        mock_sb = _make_stockists_mock([])
        with patch('app.routes.stockists.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/stockists')
        assert resp.status_code == 200
        assert resp.json() == []
