"""
upload.py のエンドポイントのテスト。

- admin_supabase（ストレージ操作）をパッチする
- require_auth は app.dependency_overrides でバイパスする
- ファイルアップロードは TestClient の files= パラメータで渡す
"""
import pytest
from io import BytesIO
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_auth


# ---------------------------------------------------------------------------
# ヘルパー: ストレージモックを生成する
# ---------------------------------------------------------------------------

def _make_storage_mock(public_url: str = 'https://example.com/image.jpg') -> MagicMock:
    """正常系のストレージモックを返す。

    Args:
        public_url: get_public_url が返す URL

    Returns:
        admin_supabase のストレージモック
    """
    mock_admin_sb = MagicMock()
    # storage.from_(bucket).upload(...) の設定
    mock_admin_sb.storage.from_.return_value.upload.return_value = MagicMock()
    # storage.from_(bucket).get_public_url(filename) の戻り値
    mock_admin_sb.storage.from_.return_value.get_public_url.return_value = public_url
    # バケット作成は例外を無視する（_ensure_bucket の挙動）
    mock_admin_sb.storage.create_bucket.return_value = MagicMock()
    return mock_admin_sb


# ---------------------------------------------------------------------------
# クラス: 画像アップロード
# ---------------------------------------------------------------------------

class TestUploadImage:
    """POST /api/upload の画像アップロードテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。"""
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。"""
        app.dependency_overrides.clear()

    def test_画像アップロード成功_URLが返る(self):
        """POST /api/upload で JPEG をアップロードすると URL が返る。"""
        mock_admin_sb = _make_storage_mock('https://example.com/image.jpg')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.post(
                '/api/upload',
                files={'file': ('test.jpg', BytesIO(b'fake-image-data'), 'image/jpeg')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/image.jpg'

    def test_画像アップロード_PNG_成功(self):
        """POST /api/upload で PNG をアップロードすると URL が返る。"""
        mock_admin_sb = _make_storage_mock('https://example.com/image.png')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.post(
                '/api/upload',
                files={'file': ('test.png', BytesIO(b'fake-png-data'), 'image/png')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/image.png'

    def test_画像アップロード_認証なし_401(self):
        """POST /api/upload で Authorization ヘッダーがない場合 401 が返る。"""
        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.post(
            '/api/upload',
            files={'file': ('test.jpg', BytesIO(b'fake-image-data'), 'image/jpeg')},
        )
        app.dependency_overrides[require_auth] = lambda: None
        assert resp.status_code == 401

    def test_画像アップロード_非対応形式_400(self):
        """POST /api/upload で非対応ファイル形式の場合 400 が返る。"""
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.post(
                '/api/upload',
                files={'file': ('test.pdf', BytesIO(b'fake-pdf-data'), 'application/pdf')},
            )

        assert resp.status_code == 400

    def test_画像アップロード_ストレージエラー_500(self):
        """POST /api/upload でストレージが例外を投げた場合 500 が返る。"""
        mock_admin_sb = MagicMock()
        # upload メソッドが例外を投げるよう設定
        mock_admin_sb.storage.from_.return_value.upload.side_effect = Exception('Storage upload failed')
        mock_admin_sb.storage.create_bucket.return_value = MagicMock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                '/api/upload',
                files={'file': ('test.jpg', BytesIO(b'fake-image-data'), 'image/jpeg')},
            )

        assert resp.status_code == 500

    def test_画像アップロード_WebP対応(self):
        """POST /api/upload で WebP もアップロードできる。"""
        mock_admin_sb = _make_storage_mock('https://example.com/image.webp')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.post(
                '/api/upload',
                files={'file': ('test.webp', BytesIO(b'fake-webp-data'), 'image/webp')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/image.webp'


# ---------------------------------------------------------------------------
# クラス: 動画アップロード
# ---------------------------------------------------------------------------

class TestUploadVideo:
    """POST /api/upload/video の動画アップロードテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。"""
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。"""
        app.dependency_overrides.clear()

    def test_動画アップロード成功_URLが返る(self):
        """POST /api/upload/video で MP4 をアップロードすると URL が返る。"""
        mock_admin_sb = _make_storage_mock('https://example.com/video.mp4')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.post(
                '/api/upload/video',
                files={'file': ('test.mp4', BytesIO(b'fake-video-data'), 'video/mp4')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/video.mp4'

    def test_動画アップロード_認証なし_401(self):
        """POST /api/upload/video で Authorization ヘッダーがない場合 401 が返る。"""
        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.post(
            '/api/upload/video',
            files={'file': ('test.mp4', BytesIO(b'fake-video-data'), 'video/mp4')},
        )
        app.dependency_overrides[require_auth] = lambda: None
        assert resp.status_code == 401

    def test_動画アップロード_非対応形式_400(self):
        """POST /api/upload/video で非対応ファイル形式の場合 400 が返る。"""
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.post(
                '/api/upload/video',
                files={'file': ('test.avi', BytesIO(b'fake-avi-data'), 'video/avi')},
            )

        assert resp.status_code == 400

    def test_動画アップロード_MOV対応(self):
        """POST /api/upload/video で QuickTime (MOV) もアップロードできる。"""
        mock_admin_sb = _make_storage_mock('https://example.com/video.mov')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.post(
                '/api/upload/video',
                files={'file': ('test.mov', BytesIO(b'fake-mov-data'), 'video/quicktime')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/video.mov'
