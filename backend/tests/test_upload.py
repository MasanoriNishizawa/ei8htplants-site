"""
upload.py のエンドポイントのテスト。

- admin_supabase（ストレージ操作）をパッチする
- require_auth は app.dependency_overrides でバイパスする
- ファイルアップロードは TestClient の files= パラメータで渡す
- 中身の確認（先頭のバイト）があるため、各形式の正しい先頭のバイトを持つダミーの中身を使う
- バケットの確認（_ensure_bucket）はプロセスで 1 回だけなので、テストごとに記録を消す
"""
import logging
import re
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_auth
from app.routes import upload as upload_module


# ---------------------------------------------------------------------------
# 各形式の正しい先頭のバイトを持つダミーの中身
# ---------------------------------------------------------------------------

# JPEG（FF D8 FF で始まる）
JPEG_BYTES = b'\xff\xd8\xff\xe0' + b'\x00' * 32
# PNG（89 50 4E 47 0D 0A 1A 0A で始まる）
PNG_BYTES = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32
# GIF（GIF89a で始まる）
GIF_BYTES = b'GIF89a' + b'\x00' * 32
# WebP（RIFF....WEBP）
WEBP_BYTES = b'RIFF\x00\x00\x00\x00WEBPVP8 ' + b'\x00' * 32
# MP4（5〜8 バイト目が ftyp）
MP4_BYTES = b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 32
# MOV（古い QuickTime。5〜8 バイト目が moov）
MOV_BYTES = b'\x00\x00\x00\x08moov' + b'\x00' * 32
# WebM（1A 45 DF A3 で始まる）
WEBM_BYTES = b'\x1a\x45\xdf\xa3' + b'\x00' * 32
# 画像と偽った HTML
HTML_BYTES = b'<html><script>alert(1)</script></html>'

# 保存するファイル名の形（UUID + 拡張子）
_FILENAME_RE = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.{ext}$'


@pytest.fixture(autouse=True)
def _reset_bucket_state():
    """バケットを確認済みかどうかの記録（プロセスで 1 回だけのフラグ）をテストごとに消す。

    Returns:
        なし。
    """
    # 1. バケットを確認済みかどうかの記録（プロセスで 1 回だけのフラグ）をテストごとに消す。
    upload_module._ensured_buckets.clear()
    upload_module._ensure_failed_logged.clear()
    yield
    upload_module._ensured_buckets.clear()
    upload_module._ensure_failed_logged.clear()


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
    # 1. Storage のバケット確認・アップロード・公開URL取得応答を設定する。
    # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
    mock_admin_sb = MagicMock()
    # storage.from_(bucket).upload(...) の設定
    mock_admin_sb.storage.from_.return_value.upload.return_value = MagicMock()
    # storage.from_(bucket).get_public_url(filename) の戻り値
    mock_admin_sb.storage.from_.return_value.get_public_url.return_value = public_url
    # バケット作成は成功する
    mock_admin_sb.storage.create_bucket.return_value = MagicMock()
    return mock_admin_sb


def _uploaded(mock_admin_sb: MagicMock) -> tuple[str, bytes, dict]:
    """storage.upload に渡された（ファイル名, 中身, オプション）を返す。

    Args:
        mock_admin_sb: admin_supabase のモック

    Returns:
        (ファイル名, 中身, オプションの dict)
    """
    # 1. upload 呼び出しの引数を取り出して返す。
    # 変数の内容: args: テスト対象関数へ渡す位置引数。
    args = mock_admin_sb.storage.from_.return_value.upload.call_args[0]
    return args[0], args[1], args[2]


# ---------------------------------------------------------------------------
# クラス: 画像アップロード
# ---------------------------------------------------------------------------

class TestUploadImage:
    """POST /api/upload の画像アップロードテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。

        Returns:
            なし。
        """
        # 1. 認証をバイパスするよう設定する。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。

        Returns:
            なし。
        """
        # 1. dependency_overrides をリセットする。
        app.dependency_overrides.clear()

    def test_画像アップロード成功_URLが返る(self):
        """POST /api/upload で JPEG をアップロードすると URL が返り、images バケットに置かれる。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload で JPEG をアップロードすると URL が返り、images バケットに置かれる。
        mock_admin_sb = _make_storage_mock('https://example.com/image.jpg')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload',
                files={'file': ('test.jpg', BytesIO(JPEG_BYTES), 'image/jpeg')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/image.jpg'
        mock_admin_sb.storage.from_.assert_called_with('images')
        # 変数の内容: data: Supabase Storage へ送るアップロード画像のバイト列。、name: 画面やログに表示する名前、opts: 呼び出しに渡したオプション。
        name, data, opts = _uploaded(mock_admin_sb)
        assert re.match(_FILENAME_RE.replace('{ext}', 'jpg'), name)
        assert data == JPEG_BYTES
        assert opts['contentType'] == 'image/jpeg'

    def test_画像アップロード_PNG_成功(self):
        """POST /api/upload で PNG をアップロードすると URL が返る。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload で PNG をアップロードすると URL が返る。
        mock_admin_sb = _make_storage_mock('https://example.com/image.png')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload',
                files={'file': ('test.png', BytesIO(PNG_BYTES), 'image/png')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/image.png'

    def test_画像アップロード_GIF_成功(self):
        """POST /api/upload で GIF をアップロードすると URL が返り、拡張子は gif になる。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload で GIF をアップロードすると URL が返り、拡張子は gif になる。
        mock_admin_sb = _make_storage_mock('https://example.com/image.gif')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload',
                files={'file': ('anim.gif', BytesIO(GIF_BYTES), 'image/gif')},
            )

        assert resp.status_code == 200
        assert _uploaded(mock_admin_sb)[0].endswith('.gif')

    def test_画像アップロード_認証なし_401(self):
        """POST /api/upload で Authorization ヘッダーがない場合 401 が返る。

        Returns:
            なし。
        """
        # 1. POST /api/upload で Authorization ヘッダーがない場合 401 が返る。
        app.dependency_overrides.clear()
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).post(
            '/api/upload',
            files={'file': ('test.jpg', BytesIO(JPEG_BYTES), 'image/jpeg')},
        )
        assert resp.status_code == 401

    def test_画像アップロード_非対応形式_400(self):
        """POST /api/upload で非対応ファイル形式の場合 400 が返り、ストレージには置かない。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload で非対応ファイル形式の場合 400 が返り、ストレージには置かない。
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload',
                files={'file': ('test.pdf', BytesIO(b'%PDF-1.4'), 'application/pdf')},
            )

        assert resp.status_code == 400
        mock_admin_sb.storage.from_.return_value.upload.assert_not_called()

    def test_画像アップロード_ストレージエラー_500(self):
        """POST /api/upload でストレージが例外を投げた場合、一般的な文言の 500 が返り例外の文字列は出ない。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload でストレージが例外を投げた場合、一般的な文言の 500 が返り例外の文字列は出ない。
        mock_admin_sb = MagicMock()
        # upload メソッドが例外を投げるよう設定
        mock_admin_sb.storage.from_.return_value.upload.side_effect = Exception('Storage upload failed')
        # 変数の内容: mock_admin_sb.storage.create_bucket.return_value: モック呼び出しの返却値。
        mock_admin_sb.storage.create_bucket.return_value = MagicMock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app, raise_server_exceptions=False).post(
                '/api/upload',
                files={'file': ('test.jpg', BytesIO(JPEG_BYTES), 'image/jpeg')},
            )

        assert resp.status_code == 500
        assert 'Storage upload failed' not in resp.text

    def test_画像アップロード_WebP対応(self):
        """POST /api/upload で WebP もアップロードできる。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload で WebP もアップロードできる。
        mock_admin_sb = _make_storage_mock('https://example.com/image.webp')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload',
                files={'file': ('test.webp', BytesIO(WEBP_BYTES), 'image/webp')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/image.webp'

    def test_JPEGと申告してHTMLの中身を送ると400でストレージに置かない(self):
        """申告（image/jpeg）と先頭のバイトが違う（HTML）と 400 になり、公開バケットに置かれないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 申告（image/jpeg）と先頭のバイトが違う（HTML）と 400 になり、公開バケットに置かれないこと。
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload',
                files={'file': ('evil.jpg', BytesIO(HTML_BYTES), 'image/jpeg')},
            )

        assert resp.status_code == 400
        assert resp.json()['detail'] == 'ファイルの中身が形式と一致しません'
        mock_admin_sb.storage.from_.return_value.upload.assert_not_called()

    def test_PNGと申告してJPEGの中身を送ると400になる(self):
        """画像どうしでも、申告（image/png）と中身（JPEG）が違えば 400 になること。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 画像どうしでも、申告（image/png）と中身（JPEG）が違えば 400 になること。
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload',
                files={'file': ('test.png', BytesIO(JPEG_BYTES), 'image/png')},
            )

        assert resp.status_code == 400

    def test_拡張子はファイル名ではなく申告された種類から決まる(self):
        """ファイル名が evil.html でも、申告が image/png・中身が PNG なら .png で保存されること。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. ファイル名が evil.html でも、申告が image/png・中身が PNG なら .png で保存されること。
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload',
                files={'file': ('evil.html', BytesIO(PNG_BYTES), 'image/png')},
            )

        assert resp.status_code == 200
        # 変数の内容: _: テスト条件として指定する値、name: 画面やログに表示する名前、opts: 呼び出しに渡したオプション。
        name, _, opts = _uploaded(mock_admin_sb)
        assert re.match(_FILENAME_RE.replace('{ext}', 'png'), name)
        assert 'html' not in name
        assert opts['contentType'] == 'image/png'

    def test_上限ちょうどの大きさは通り上限を1バイト超えると400になる(self):
        """上限（MAX_SIZE）ちょうどは受け付け、1 バイト超えると 400 になること（上限を小さくして確かめる）。

        Returns:
            なし。
        """
        # 変数の内容: exact: 完全一致を期待するテスト値、limit: 回数または取得件数の上限、mock_admin_sb: 管理用 Supabase クライアントのモック、over: 既定テストデータへ上書きする値。
        # 1. 上限（MAX_SIZE）ちょうどは受け付け、1 バイト超えると 400 になること（上限を小さくして確かめる）。
        mock_admin_sb = _make_storage_mock()
        limit = 64
        exact = JPEG_BYTES + b'\x00' * (limit - len(JPEG_BYTES))
        over = exact + b'\x00'

        with patch('app.routes.upload.admin_supabase', mock_admin_sb), \
             patch.object(upload_module, '_IMAGE', upload_module._IMAGE.__class__(
                 'images', upload_module.IMAGE_EXTENSIONS, limit,
                 upload_module._IMAGE.type_error, upload_module._IMAGE.size_error)):
            # 変数の内容: ng: 無効な入力値のテスト一覧、ok: 処理の成功可否。
            ok = TestClient(app).post('/api/upload', files={'file': ('a.jpg', BytesIO(exact), 'image/jpeg')})
            ng = TestClient(app).post('/api/upload', files={'file': ('a.jpg', BytesIO(over), 'image/jpeg')})

        assert ok.status_code == 200
        assert ng.status_code == 400
        assert ng.json()['detail'] == 'ファイルサイズは10MB以内にしてください'


# ---------------------------------------------------------------------------
# クラス: 動画アップロード
# ---------------------------------------------------------------------------

class TestUploadVideo:
    """POST /api/upload/video の動画アップロードテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。

        Returns:
            なし。
        """
        # 1. 認証をバイパスするよう設定する。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。

        Returns:
            なし。
        """
        # 1. dependency_overrides をリセットする。
        app.dependency_overrides.clear()

    def test_動画アップロード成功_URLが返る(self):
        """POST /api/upload/video で MP4 をアップロードすると URL が返り、videos バケットに置かれる。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload/video で MP4 をアップロードすると URL が返り、videos バケットに置かれる。
        mock_admin_sb = _make_storage_mock('https://example.com/video.mp4')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload/video',
                files={'file': ('test.mp4', BytesIO(MP4_BYTES), 'video/mp4')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/video.mp4'
        mock_admin_sb.storage.from_.assert_called_with('videos')
        assert _uploaded(mock_admin_sb)[0].endswith('.mp4')

    def test_動画アップロード_認証なし_401(self):
        """POST /api/upload/video で Authorization ヘッダーがない場合 401 が返る。

        Returns:
            なし。
        """
        # 1. POST /api/upload/video で Authorization ヘッダーがない場合 401 が返る。
        app.dependency_overrides.clear()
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).post(
            '/api/upload/video',
            files={'file': ('test.mp4', BytesIO(MP4_BYTES), 'video/mp4')},
        )
        assert resp.status_code == 401

    def test_動画アップロード_非対応形式_400(self):
        """POST /api/upload/video で非対応ファイル形式の場合 400 が返る。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload/video で非対応ファイル形式の場合 400 が返る。
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload/video',
                files={'file': ('test.avi', BytesIO(b'RIFF\x00\x00\x00\x00AVI '), 'video/avi')},
            )

        assert resp.status_code == 400

    def test_動画アップロード_MOV対応(self):
        """POST /api/upload/video で QuickTime (MOV。ftyp の無い古い形式) もアップロードでき、拡張子は mov になる。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload/video で QuickTime (MOV。ftyp の無い古い形式) もアップロードでき、拡張子は mov…。
        mock_admin_sb = _make_storage_mock('https://example.com/video.mov')

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload/video',
                files={'file': ('test.mov', BytesIO(MOV_BYTES), 'video/quicktime')},
            )

        assert resp.status_code == 200
        assert resp.json()['url'] == 'https://example.com/video.mov'
        assert _uploaded(mock_admin_sb)[0].endswith('.mov')

    def test_動画アップロード_WebM対応(self):
        """POST /api/upload/video で WebM もアップロードでき、拡張子は webm になる。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. POST /api/upload/video で WebM もアップロードでき、拡張子は webm になる。
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload/video',
                files={'file': ('clip.webm', BytesIO(WEBM_BYTES), 'video/webm')},
            )

        assert resp.status_code == 200
        assert _uploaded(mock_admin_sb)[0].endswith('.webm')

    def test_MP4と申告して画像の中身を送ると400になる(self):
        """申告（video/mp4）と中身（JPEG）が違えば 400 になり、ストレージに置かないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 申告（video/mp4）と中身（JPEG）が違えば 400 になり、ストレージに置かないこと。
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(
                '/api/upload/video',
                files={'file': ('test.mp4', BytesIO(JPEG_BYTES), 'video/mp4')},
            )

        assert resp.status_code == 400
        mock_admin_sb.storage.from_.return_value.upload.assert_not_called()


# ---------------------------------------------------------------------------
# クラス: バケットの確認（_ensure_bucket）
# ---------------------------------------------------------------------------

class TestEnsureBucket:
    """アップロードの直前に、プロセスで最初の 1 回だけバケットの作成を呼ぶ動きのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。

        Returns:
            なし。
        """
        # 1. 認証をバイパスするよう設定する。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。

        Returns:
            なし。
        """
        # 1. dependency_overrides をリセットする。
        app.dependency_overrides.clear()

    def _upload_twice(self, mock_admin_sb: MagicMock) -> list:
        """JPEG を 2 回アップロードし、応答のリストを返す。

        Args:
            mock_admin_sb: admin_supabase のモック

        Returns:
            2 回分の応答
        """
        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント。
            client = TestClient(app)
            return [
                client.post('/api/upload', files={'file': ('a.jpg', BytesIO(JPEG_BYTES), 'image/jpeg')})
                for _ in range(2)
            ]

    def _bucket_warnings(self, caplog) -> list:
        """バケットの確認・作成の失敗の warning ログだけを返す。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            list を返す。
        """
        # 1. バケットの確認・作成の失敗の warning ログだけを返す。
        return [
            r for r in caplog.records
            if r.name == 'app.routes.upload' and r.levelno == logging.WARNING
        ]

    def test_作成に成功すると2回アップロードしても作成は1回だけ呼ばれwarningは出ない(self, caplog):
        """作成が成功したら以後は呼ばない。2 回のアップロードとも成功し、warning は出ない。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 作成が成功したら以後は呼ばない。2 回のアップロードとも成功し、warning は出ない。
        mock_admin_sb = _make_storage_mock()
        caplog.set_level(logging.INFO, logger='app.routes.upload')

        # 変数の内容: resps: API 呼び出し結果の一覧。
        resps = self._upload_twice(mock_admin_sb)

        assert [r.status_code for r in resps] == [200, 200]
        assert mock_admin_sb.storage.create_bucket.call_count == 1
        mock_admin_sb.storage.create_bucket.assert_called_with('images', {'public': True})
        assert self._bucket_warnings(caplog) == []

    def test_既にあるときは2回アップロードしても作成は1回だけ呼ばれwarningは出ない(self, caplog):
        """「already exists」の例外は成功扱い。以後は呼ばず、warning も出ない。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 「already exists」の例外は成功扱い。以後は呼ばず、warning も出ない。
        mock_admin_sb = _make_storage_mock()
        # 変数の内容: mock_admin_sb.storage.create_bucket.side_effect: モック呼び出し時に返す例外または副作用。
        mock_admin_sb.storage.create_bucket.side_effect = Exception('The resource already exists')
        caplog.set_level(logging.INFO, logger='app.routes.upload')

        # 変数の内容: resps: API 呼び出し結果の一覧。
        resps = self._upload_twice(mock_admin_sb)

        assert [r.status_code for r in resps] == [200, 200]
        assert mock_admin_sb.storage.create_bucket.call_count == 1
        assert self._bucket_warnings(caplog) == []

    def test_duplicateの例外も既にあるものとして扱う(self, caplog):
        """例外の文言に duplicate を含む場合も成功扱いで、以後は作成を呼ばない。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 例外の文言に duplicate を含む場合も成功扱いで、以後は作成を呼ばない。
        mock_admin_sb = _make_storage_mock()
        # 変数の内容: mock_admin_sb.storage.create_bucket.side_effect: モック呼び出し時に返す例外または副作用。
        mock_admin_sb.storage.create_bucket.side_effect = Exception('Duplicate key value violates unique constraint')
        caplog.set_level(logging.INFO, logger='app.routes.upload')

        # 変数の内容: resps: API 呼び出し結果の一覧。
        resps = self._upload_twice(mock_admin_sb)

        assert [r.status_code for r in resps] == [200, 200]
        assert mock_admin_sb.storage.create_bucket.call_count == 1
        assert self._bucket_warnings(caplog) == []

    def test_作成に失敗するとアップロードは続け毎回作成を試しwarningは最初の1回だけ(self, caplog):
        """それ以外の失敗ではアップロードは続ける。次のアップロードでまた作成を試し、warning は 1 回だけ（型名だけで文言は出さない）。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. それ以外の失敗ではアップロードは続ける。次のアップロードでまた作成を試し、warning は 1 回だけ（型名だけで文言は出さない）。
        mock_admin_sb = _make_storage_mock()
        # 変数の内容: mock_admin_sb.storage.create_bucket.side_effect: モック呼び出し時に返す例外または副作用。
        mock_admin_sb.storage.create_bucket.side_effect = PermissionError('secret-detail permission denied')
        caplog.set_level(logging.INFO, logger='app.routes.upload')

        # 変数の内容: resps: API 呼び出し結果の一覧。
        resps = self._upload_twice(mock_admin_sb)

        assert [r.status_code for r in resps] == [200, 200]
        assert mock_admin_sb.storage.from_.return_value.upload.call_count == 2
        assert mock_admin_sb.storage.create_bucket.call_count == 2
        # 変数の内容: warnings: 記録された警告メッセージ一覧。
        warnings = self._bucket_warnings(caplog)
        assert len(warnings) == 1
        assert 'PermissionError' in warnings[0].getMessage()
        assert 'secret-detail' not in warnings[0].getMessage()

    def test_Bucket_does_not_existの例外は成功扱いにせず次のアップロードでまた作成を試しwarningは1回だけ(self, caplog):
        """「Bucket does not exist」は文言に exist を含むが既にある扱いにしない。

        以前の判定（'exist' を含めば成功扱い）では作成済みとして記録され、以後作成を試さなかった。
        'already exist' / 'duplicate' に絞ったので、次のアップロードでまた作成を試し、warning は最初の 1 回だけ出ること。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        mock_admin_sb = _make_storage_mock()
        # 変数の内容: mock_admin_sb.storage.create_bucket.side_effect: モック呼び出し時に返す例外または副作用。
        mock_admin_sb.storage.create_bucket.side_effect = Exception('Bucket does not exist')
        caplog.set_level(logging.INFO, logger='app.routes.upload')

        # 変数の内容: resps: API 呼び出し結果の一覧。
        resps = self._upload_twice(mock_admin_sb)

        # 1. アップロードはそのまま試みる
        assert [r.status_code for r in resps] == [200, 200]
        # 2. 成功扱いにしないので、2 回とも作成を試す（作成済みの記録に入らない）
        assert mock_admin_sb.storage.create_bucket.call_count == 2
        assert 'images' not in upload_module._ensured_buckets
        # 3. warning は最初の 1 回だけ
        assert len(self._bucket_warnings(caplog)) == 1

    def test_画像と動画のバケットはそれぞれ1回ずつ確認される(self):
        """images と videos は別々に記録し、それぞれ最初の 1 回だけ作成を呼ぶ。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. images と videos は別々に記録し、それぞれ最初の 1 回だけ作成を呼ぶ。
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント。
            client = TestClient(app)
            client.post('/api/upload', files={'file': ('a.jpg', BytesIO(JPEG_BYTES), 'image/jpeg')})
            client.post('/api/upload/video', files={'file': ('a.mp4', BytesIO(MP4_BYTES), 'video/mp4')})
            client.post('/api/upload/video', files={'file': ('a.mp4', BytesIO(MP4_BYTES), 'video/mp4')})

        # 変数の内容: buckets: 作成済みストレージバケット集合。
        buckets = [c.args[0] for c in mock_admin_sb.storage.create_bucket.call_args_list]
        assert buckets == ['images', 'videos']

    def test_中身の確認で400になったときはバケットの作成を呼ばない(self):
        """中身の確認のあとにバケットを確かめるため、400 のときは作成を呼ばないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 中身の確認のあとにバケットを確かめるため、400 のときは作成を呼ばないこと。
        mock_admin_sb = _make_storage_mock()

        with patch('app.routes.upload.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/upload', files={'file': ('a.jpg', BytesIO(HTML_BYTES), 'image/jpeg')})

        assert resp.status_code == 400
        mock_admin_sb.storage.create_bucket.assert_not_called()
