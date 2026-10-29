"""
セキュリティ修正・リファクタリングで変わった横断的な動きのテスト。

- 予期しない例外は一般的な文言の 500（例外の文字列を返さない）
- セキュリティヘッダー（X-XSS-Protection なし・Referrer-Policy）と空き状況 API の no-store
- 存在しない id は 404（PGRST116・22P02・更新 0 件）
- イベントは UUID の形のときだけ id で検索する
- 表示順は max(display_order) + 1
- 問い合わせの名前 100・本文 5000 文字
- 商品のカテゴリー・価格・在庫の入力チェック
- 共通部品（db_utils・auth.optional_auth・utils.errors）
"""
import logging
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app, INTERNAL_ERROR_MESSAGE
from app.auth import optional_auth, require_auth
from app.db_utils import fetch_one_or_404, fetch_one_or_none, first_or_404, next_display_order
from app.utils.errors import error_summary
from app.utils.ids import is_uuid
from tests._helpers import PostgrestError, as_admin, invalid_uuid_error, not_found_error

# 例外の文字列に入っている「外に出してはいけない」内容
SECRET_TEXT = 'secret-detail user@example.com password=hunter2'


@pytest.fixture
def admin():
    """require_auth を通す（管理者としてログインしている扱い）。

    Returns:
        なし。
    """
    # 1. require_auth を通す（管理者としてログインしている扱い）。
    with as_admin():
        yield


# ---------------------------------------------------------------------------
# 500 の文言
# ---------------------------------------------------------------------------

class TestInternalErrorMessage:
    """予期しない例外は main.py のミドルウェアで一般的な文言の 500 になる。"""

    def test_公開APIのDB例外は一般的な文言の500で例外の文字列を返さない(self, caplog):
        """GET /api/pot-artists で DB が例外を投げても、応答は一般的な文言だけで例外の文字列は出ない（ログには残る）。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. GET /api/pot-artists で DB が例外を投げても、応答は一般的な文言だけで例外の文字列は出ない（ログには残る）。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.order.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        mock_sb.table.return_value.select.return_value.order.return_value.execute.side_effect = Exception(SECRET_TEXT)
        caplog.set_level(logging.ERROR, logger='app.main')

        with patch('app.routes.pot_artists.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/pot-artists')

        assert resp.status_code == 500
        assert resp.json() == {'detail': INTERNAL_ERROR_MESSAGE}
        assert 'secret-detail' not in resp.text
        assert 'hunter2' not in resp.text
        # 変数の内容: r: caplog に記録された各ログレコード。
        assert any('未処理の例外' in r.getMessage() for r in caplog.records)

    @pytest.mark.parametrize('path,module,body', [
        ('/api/pot-artists', 'pot_artists', {'name': '作家'}),
        ('/api/media-appearances', 'media_appearances', None),
        ('/api/price-calc-entries', 'price_calc_entries', None),
    ])
    def test_管理APIの保存の例外もdetailに例外の文字列を入れない(self, admin, path, module, body):
        """pot_artists・media・price_calc の追加で DB が例外を投げても、detail に str(e) を入れず一般的な文言の 500 になる。

        Args:
            admin: 管理者権限の認証状態または管理者データ。
            path: 検証対象のファイルパスまたは URL パス。
            module: テスト対象の Python モジュール。
            body: API に送るリクエスト本文。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. pot_artists・media・price_calc の追加で DB が例外を投げても、detail に str(e) を入れず一般的な文言…。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.insert.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception(SECRET_TEXT)
        if body is None:
            # 入力の形はルートごとに違うので、必須項目を満たすものを使う
            # 変数の内容: body: API に渡すテスト用リクエスト本文。
            body = {
                'media_appearances': {'title': 't', 'youtube_url': 'https://www.youtube.com/watch?v=x'},
                'price_calc_entries': {'brand': 'b', 'plant_name': 'p', 'cost': 100, 'selling_price': 300},
            }[module]

        with patch(f'app.routes.{module}.admin_supabase', mock_sb), \
             patch(f'app.routes.{module}.supabase', mock_sb, create=True):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post(path, json=body)

        # 入力の形が合わず 422 になったときはテストの前提が崩れているので気づけるようにする
        assert resp.status_code != 422, resp.text
        assert resp.status_code == 500
        assert 'secret-detail' not in resp.text
        assert resp.json()['detail'] == INTERNAL_ERROR_MESSAGE

    def test_500の応答にもセキュリティヘッダーが付く(self):
        """500 の応答にも Referrer-Policy・nosniff などのヘッダーが付くこと（ミドルウェアの順番）。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 500 の応答にも Referrer-Policy・nosniff などのヘッダーが付くこと（ミドルウェアの順番）。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.order.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        mock_sb.table.return_value.select.return_value.order.return_value.execute.side_effect = Exception('x')

        with patch('app.routes.pot_artists.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/pot-artists')

        assert resp.status_code == 500
        assert resp.headers['X-Content-Type-Options'] == 'nosniff'
        assert resp.headers['Referrer-Policy'] == 'strict-origin-when-cross-origin'
        assert resp.headers['Cache-Control'] == 'no-store'

    def test_HTTPExceptionの4xxは従来どおりの文言で返る(self):
        """ルートが意図して返す 4xx（例: 404 の文言）はミドルウェアで書き換えられないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. ルートが意図して返す 4xx（例: 404 の文言）はミドルウェアで書き換えられないこと。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []

        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/no-such-slug')

        assert resp.status_code == 404
        assert resp.json()['detail'] == 'イベントが見つかりません'


# ---------------------------------------------------------------------------
# ヘッダー
# ---------------------------------------------------------------------------

class TestSecurityHeaders:
    """セキュリティヘッダーとキャッシュのヘッダー。"""

    def _get_gallery(self):
        """GET /api/gallery を呼ぶ（DB はモック）。

        Returns:
            GET /api/gallery のテストレスポンスを返す。
        """
        # 1. GET /api/gallery を呼ぶ（DB はモック）。
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = []
        with patch('app.routes.gallery.supabase', mock_sb):
            return TestClient(app).get('/api/gallery')

    def test_XXSSProtectionは付かずReferrerPolicyはstrictOriginWhenCrossOrigin(self):
        """X-XSS-Protection は付けず、Referrer-Policy は strict-origin-when-cross-origin になること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. X-XSS-Protection は付けず、Referrer-Policy は strict-origin-when-cross-origin …。
        resp = self._get_gallery()

        assert resp.status_code == 200
        assert 'X-XSS-Protection' not in resp.headers
        assert resp.headers['Referrer-Policy'] == 'strict-origin-when-cross-origin'

    def test_HSTSとnosniffとXFrameOptionsは引き続き付く(self):
        """Strict-Transport-Security・X-Content-Type-Options・X-Frame-Options は付くこと。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. Strict-Transport-Security・X-Content-Type-Options・X-Frame-Options は付くこと。
        resp = self._get_gallery()

        assert resp.headers['Strict-Transport-Security'] == 'max-age=31536000'
        assert resp.headers['X-Content-Type-Options'] == 'nosniff'
        assert resp.headers['X-Frame-Options'] == 'SAMEORIGIN'

    def test_空き状況のAPIはログインなしでもnostoreになる(self):
        """GET /api/events/{id}/sessions は予約のたびに変わるので、公開の GET でも no-store（CDN も no-store）になること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. GET /api/events/{id}/sessions は予約のたびに変わるので、公開の GET でも no-store（CDN も no-…。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        with patch('app.routes.events.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/11111111-1111-1111-1111-111111111111/sessions')

        assert resp.status_code == 200
        assert resp.headers['Cache-Control'] == 'no-store'
        assert resp.headers['CDN-Cache-Control'] == 'no-store'

    def test_ほかの公開GETは公開キャッシュになる(self):
        """空き状況以外の公開 GET（ギャラリー）は公開キャッシュ（s-maxage=300）のままであること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. 空き状況以外の公開 GET（ギャラリー）は公開キャッシュ（s-maxage=300）のままであること。
        resp = self._get_gallery()

        assert resp.headers['Cache-Control'] == 'public, s-maxage=300, max-age=60'

    def test_公開GETのエラー応答はキャッシュしない(self):
        """公開 GET でも 404 などのエラー応答は no-store になること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 公開 GET でも 404 などのエラー応答は no-store になること。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []

        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/no-such-slug')

        assert resp.status_code == 404
        assert resp.headers['Cache-Control'] == 'no-store'


# ---------------------------------------------------------------------------
# 存在しない id は 404
# ---------------------------------------------------------------------------

def _update_returns_empty() -> MagicMock:
    """update(...).eq(...).execute().data が空のリスト（更新 0 件）になるモックを返す。

    Returns:
        MagicMock を返す。
    """
    # 1. update(...).eq(...).execute().data が空のリスト（更新 0 件）になるモックを返す。
    # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    # 変数の内容: mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = []
    return mock_sb


class TestNotFound:
    """存在しない id を指定したときは 500 ではなく 404 になる。"""

    @pytest.mark.parametrize('method,path,module,body', [
        ('patch', '/api/gallery/nope', 'gallery', {'display_order': 1}),
        ('patch', '/api/stockists/nope', 'stockists', None),
        ('put', '/api/products/nope', 'products', {'name': 'x', 'price': 1}),
        ('patch', '/api/products/nope/stock', 'products', {'stock': 1}),
        ('put', '/api/articles/nope', 'articles', {'title': 'x'}),
        ('patch', '/api/chat-qa/nope', 'chat_qa', {'question': 'q', 'answer': 'a'}),
        ('patch', '/api/contacts/nope', 'contact', {'is_read': True}),
        ('patch', '/api/orders/nope', 'orders', {'status': 'paid'}),
    ])
    def test_更新の対象が0件なら404(self, admin, method, path, module, body):
        """update の結果が 0 件（存在しない id）なら、data[0] の IndexError による 500 ではなく 404 になること。

        Args:
            admin: 管理者権限の認証状態または管理者データ。
            method: 呼び出す HTTP メソッド。
            path: 検証対象のファイルパスまたは URL パス。
            module: テスト対象の Python モジュール。
            body: API に送るリクエスト本文。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. update の結果が 0 件（存在しない id）なら、data[0] の IndexError による 500 ではなく 404 になること。
        mock_sb = _update_returns_empty()
        # articles の更新は先に既存の行を読む（無い = PGRST116）
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = not_found_error()
        if body is None:
            from app.routes.stockists import StockistBody
            # 変数の内容: body: リクエスト本文。
            # 変数の内容: f: モデル項目またはファイル、k: 辞書キーまたは項目名。
            body = {k: 'x' for k, f in StockistBody.model_fields.items() if f.is_required()}

        with patch(f'app.routes.{module}.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = getattr(TestClient(app), method)(path, json=body)

        assert resp.status_code == 404, resp.text

    @pytest.mark.parametrize('error', [not_found_error(), invalid_uuid_error()])
    def test_注文の詳細で0件やUUIDでないidは404(self, admin, error):
        """GET /api/orders/{id} で single() が PGRST116（0 件）・22P02（UUID でない）を投げたら 404 になること。

        Args:
            admin: 管理者権限の認証状態または管理者データ。
            error: 検証対象で発生させる例外またはエラー内容。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. GET /api/orders/{id} で single() が PGRST116（0 件）・22P02（UUID でない）を投げたら 404…。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = error

        with patch('app.routes.orders.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/orders/not-a-uuid')

        assert resp.status_code == 404

    def test_問い合わせへの返信で存在しないidは404でメールを送らない(self, admin):
        """返信の宛先が見つからない（PGRST116）なら 404 で、メールは送らないこと。

        Args:
            admin: 管理者権限の認証状態または管理者データ。

        Returns:
            なし。
        """
        # 変数の内容: mock_resend: Resend メール送信のモック、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 返信の宛先が見つからない（PGRST116）なら 404 で、メールは送らないこと。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = not_found_error()
        mock_resend = MagicMock()

        with patch('app.routes.contact.admin_supabase', mock_sb), \
             patch('app.mail.resend', mock_resend), \
             patch('app.routes.contact.RESEND_API_KEY', 'k'):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/contacts/nope/reply', json={'subject': 's', 'body': 'b'})

        assert resp.status_code == 404
        mock_resend.Emails.send.assert_not_called()

    def test_見つからない以外のDBエラーは404にせず500にする(self):
        """接続の失敗など、コードが PGRST116・22P02 以外の例外は 404 に変えず 500（一般的な文言）になること。

        Returns:
            なし。
        """
        # 変数の内容: eq_id: 対象 ID で絞り込むモック条件、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 接続の失敗など、コードが PGRST116・22P02 以外の例外は 404 に変えず 500（一般的な文言）になること。
        mock_sb = MagicMock()
        eq_id = mock_sb.table.return_value.select.return_value.eq.return_value
        # 変数の内容: eq_id.eq.return_value.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        eq_id.eq.return_value.single.return_value.execute.side_effect = PostgrestError('08006', SECRET_TEXT)

        with patch('app.routes.products.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/products/p1')

        assert resp.status_code == 500
        assert 'secret-detail' not in resp.text


# ---------------------------------------------------------------------------
# イベントの id / slug
# ---------------------------------------------------------------------------

class TestEventIdLookup:
    """イベントは slug で探し、無ければ UUID の形のときだけ id で探す。"""

    def test_UUIDでない文字列はidで検索せず404(self):
        """slug で見つからず、UUID の形でもなければ id 列を検索せず（22P02 を起こさず）404 になること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. slug で見つからず、UUID の形でもなければ id 列を検索せず（22P02 を起こさず）404 になること。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []

        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/not-a-uuid')

        assert resp.status_code == 404
        # 変数の内容: cols: 対象テーブルのカラム一覧。
        # 変数の内容: c: 呼び出し履歴から取り出すモック呼び出し。
        cols = [c.args[0] for c in mock_sb.table.return_value.select.return_value.eq.call_args_list]
        assert cols == ['slug']

    def test_UUIDの形ならslugで見つからなくてもidで検索する(self):
        """UUID の形の文字列なら slug → id の順に検索し、id で見つかったイベントを返すこと。

        Returns:
            なし。
        """
        # 変数の内容: eq: ID 条件を加えるモック関数、event_id: 対象のイベント ID、mock_admin: 管理者認証のモック、mock_sb: 公開用 Supabase クライアントのモック、row: DB から取得した単一レコード。
        # 1. UUID の形の文字列なら slug → id の順に検索し、id で見つかったイベントを返すこと。
        event_id = '123e4567-e89b-12d3-a456-426614174000'
        row = {'id': event_id, 'name': 'イベント', 'start_date': '2099-01-01', 'end_date': None}
        mock_sb = MagicMock()
        eq = mock_sb.table.return_value.select.return_value.eq
        # 変数の内容: eq.side_effect: モック呼び出し時に返す例外または副作用、mock_admin.table.return_value.select.return_value.in_.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        eq.side_effect = lambda col, val: MagicMock(**{'execute.return_value.data': [dict(row)] if col == 'id' else []})
        mock_admin = MagicMock()
        mock_admin.table.return_value.select.return_value.in_.return_value.order.return_value.execute.return_value.data = []

        with patch('app.routes.events.supabase', mock_sb), patch('app.routes.events.admin_supabase', mock_admin):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get(f'/api/events/{event_id}')

        assert resp.status_code == 200, resp.text
        assert resp.json()['id'] == event_id
        # 変数の内容: c: 呼び出し履歴から取り出すモック呼び出し。
        assert [c.args[0] for c in eq.call_args_list] == ['slug', 'id']

    @pytest.mark.parametrize('value,expected', [
        ('123e4567-e89b-12d3-a456-426614174000', True),
        ('123E4567-E89B-12D3-A456-426614174000', True),
        ('123e4567e89b12d3a456426614174000', False),
        ('my-event-2026', False),
        ('', False),
    ])
    def test_is_uuidはUUIDの形だけTrueを返す(self, value, expected):
        """is_uuid はハイフン区切りの UUID の形（大文字小文字どちらも）のときだけ True。

        Args:
            value: 設定キーに保存する値。
            expected: 検証する期待値。

        Returns:
            なし。
        """
        # 1. is_uuid はハイフン区切りの UUID の形（大文字小文字どちらも）のときだけ True。
        assert is_uuid(value) is expected


# ---------------------------------------------------------------------------
# 表示順
# ---------------------------------------------------------------------------

class TestNextDisplayOrder:
    """表示順は件数ではなく max(display_order) + 1。"""

    def _max_mock(self, rows: list) -> MagicMock:
        """display_order の最大の 1 件の読み取りが rows を返すモックを作る。

        Args:
            rows: DB モックが返すレコード一覧。

        Returns:
            MagicMock を返す。
        """
        # 1. 表示順の最大値取得とINSERTの応答をクエリモックへ設定する。
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.insert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ、mock_sb.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value.data = rows
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [{'id': 'new'}]
        return mock_sb

    def test_途中を消したあとでも最大値の次の番号で追加される(self, admin):
        """表示順 0,1,7 の 3 件（件数 3）でも、新しい画像は 8 番で追加されること（既存と重ならない）。

        Args:
            admin: 管理者権限の認証状態または管理者データ。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 表示順 0,1,7 の 3 件（件数 3）でも、新しい画像は 8 番で追加されること（既存と重ならない）。
        mock_sb = self._max_mock([{'display_order': 7}])

        with patch('app.routes.gallery.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/gallery', json={'url': 'https://example.com/a.jpg'})

        assert resp.status_code == 200
        assert mock_sb.table.return_value.insert.call_args.args[0]['display_order'] == 8
        mock_sb.table.return_value.select.return_value.order.assert_called_with('display_order', desc=True)

    def test_行が無いときは0番になる(self):
        """表に行が無ければ 0 を返すこと。

        Returns:
            なし。
        """
        # 1. 表に行が無ければ 0 を返すこと。
        assert next_display_order(self._max_mock([]), 'stockists') == 0

    def test_display_orderが数値でない行しか無いときは0番になる(self):
        """最大の行の display_order が None なら 0 を返すこと。

        Returns:
            なし。
        """
        # 1. 最大の行の display_order が None なら 0 を返すこと。
        assert next_display_order(self._max_mock([{'display_order': None}]), 'collaborations') == 0


# ---------------------------------------------------------------------------
# 問い合わせの長さ
# ---------------------------------------------------------------------------

class TestContactLength:
    """問い合わせの名前は 100 文字・本文は 5000 文字まで。"""

    def _post(self, name: str, message: str):
        """問い合わせを送る（DB はモック・メールは送らない）。

        Args:
            name: 問い合わせ送信者の名前。
            message: 検証対象のメッセージ。

        Returns:
            POST リクエストのテストレスポンスを返す。
        """
        # 1. 問い合わせを送る（DB はモック・メールは送らない）。
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = MagicMock()
        with patch('app.routes.contact.admin_supabase', mock_sb), \
             patch('app.routes.contact.RESEND_API_KEY', ''):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/contact', json={'name': name, 'email': 'a@example.com', 'message': message})
        return resp, mock_sb

    def test_名前100文字と本文5000文字ちょうどは受け付ける(self):
        """上限ちょうどは 200 で保存されること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. 上限ちょうどは 200 で保存されること。
        resp, mock_sb = self._post('名' * 100, 'あ' * 5000)
        assert resp.status_code == 200
        mock_sb.table.return_value.insert.assert_called_once()

    def test_名前101文字は422で保存しない(self):
        """名前が 101 文字なら 422 で保存しないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. 名前が 101 文字なら 422 で保存しないこと。
        resp, mock_sb = self._post('名' * 101, '本文')
        assert resp.status_code == 422
        mock_sb.table.assert_not_called()

    def test_本文5001文字は422で保存しない(self):
        """本文が 5001 文字なら 422 で保存しないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. 本文が 5001 文字なら 422 で保存しないこと。
        resp, mock_sb = self._post('名前', 'あ' * 5001)
        assert resp.status_code == 422
        mock_sb.table.assert_not_called()

    def test_空の名前と空の本文は422(self):
        """名前・本文が空文字なら 422 になること。

        Returns:
            なし。
        """
        # 1. 名前・本文が空文字なら 422 になること。
        assert self._post('', '本文')[0].status_code == 422
        assert self._post('名前', '')[0].status_code == 422

    def test_自動返信に本文を入れない(self):
        """自動返信（送信者宛て）には本文を入れない（第三者に任意の文章を届ける踏み台にさせない）。

        Returns:
            なし。
        """
        # 変数の内容: mock_resend: Resend メール送信のモック、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 自動返信（送信者宛て）には本文を入れない（第三者に任意の文章を届ける踏み台にさせない）。
        mock_sb = MagicMock()
        mock_resend = MagicMock()
        with patch('app.routes.contact.admin_supabase', mock_sb), \
             patch('app.mail.resend', mock_resend), \
             patch('app.routes.contact.RESEND_API_KEY', 'k'), \
             patch('app.routes.contact.CONTACT_TO_EMAIL', 'admin@example.com'):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/contact', json={'name': 'n', 'email': 'victim@example.com', 'message': 'SPAM-BODY'})

        assert resp.status_code == 200
        # 変数の内容: auto_reply: 自動返信メールの内容、mails: モックが記録した送信メール一覧。
        # 変数の内容: c: 呼び出し履歴から取り出すモック呼び出し。
        mails = [c.args[0] for c in mock_resend.Emails.send.call_args_list]
        # 変数の内容: m: 検証対象のメッセージ。
        auto_reply = [m for m in mails if m['to'] == ['victim@example.com']]
        assert len(auto_reply) == 1
        assert 'SPAM-BODY' not in auto_reply[0]['text']


# ---------------------------------------------------------------------------
# 商品の入力チェック
# ---------------------------------------------------------------------------

class TestProductValidation:
    """商品のカテゴリーは VALID_CATEGORIES のどれか・価格と在庫は 0 以上。"""

    def _post(self, body: dict):
        """商品を作る（DB はモック）。

        Args:
            body: API に送るリクエスト本文。

        Returns:
            POST リクエストのテストレスポンスを返す。
        """
        # 1. 管理DBを差し替え、商品作成APIへPOSTする。
        # 変数の内容: mock_sb: 管理用 Supabase クライアントのモック。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.insert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [{'id': 'p1', **body}]
        with patch('app.routes.products.admin_supabase', mock_sb), as_admin():
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/products', json=body)
        return resp, mock_sb

    def test_決められていないカテゴリーは422(self):
        """VALID_CATEGORIES に無いカテゴリーは 422 で保存しないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. VALID_CATEGORIES に無いカテゴリーは 422 で保存しないこと。
        resp, mock_sb = self._post({'name': 'x', 'price': 100, 'category': '<script>'})
        assert resp.status_code == 422
        mock_sb.table.assert_not_called()

    def test_決められたカテゴリーは受け付ける(self):
        """VALID_CATEGORIES のカテゴリーは 200 で保存されること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. VALID_CATEGORIES のカテゴリーは 200 で保存されること。
        resp, mock_sb = self._post({'name': 'x', 'price': 100, 'category': '塊根植物'})
        assert resp.status_code == 200
        assert mock_sb.table.return_value.insert.call_args.args[0]['category'] == '塊根植物'

    def test_空文字のカテゴリーは未設定として保存される(self):
        """カテゴリーの空文字は None（未設定）として保存されること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. カテゴリーの空文字は None（未設定）として保存されること。
        resp, mock_sb = self._post({'name': 'x', 'price': 100, 'category': ''})
        assert resp.status_code == 200
        assert mock_sb.table.return_value.insert.call_args.args[0]['category'] is None

    @pytest.mark.parametrize('field', ['price', 'stock'])
    def test_価格や在庫が負なら422で0は受け付ける(self, field):
        """価格・在庫が -1 なら 422、0 なら 200 になること。

        Args:
            field: 検証対象のフィールド名。

        Returns:
            なし。
        """
        # 変数の内容: base: 相対パス計算の基準ディレクトリ。
        # 1. 価格・在庫が -1 なら 422、0 なら 200 になること。
        base = {'name': 'x', 'price': 100, 'stock': 1}
        assert self._post({**base, field: -1})[0].status_code == 422
        assert self._post({**base, field: 0})[0].status_code == 200

    def test_在庫数だけの変更でも負の在庫は422(self):
        """PATCH /api/products/{id}/stock で -1 は 422 になり、DB を更新しないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. PATCH /api/products/{id}/stock で -1 は 422 になり、DB を更新しないこと。
        mock_sb = MagicMock()
        with patch('app.routes.products.admin_supabase', mock_sb), as_admin():
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).patch('/api/products/p1/stock', json={'stock': -1})
        assert resp.status_code == 422
        mock_sb.table.assert_not_called()


# ---------------------------------------------------------------------------
# 共通部品
# ---------------------------------------------------------------------------

class TestCommonParts:
    """db_utils・optional_auth・error_summary の単体の動き。"""

    def test_fetch_one_or_noneは見つからないコードだけNoneにしてほかは投げ直す(self):
        """PGRST116・22P02 は None、それ以外のコードの例外はそのまま投げること。

        Returns:
            なし。
        """
        # 変数の内容: q: DB テーブルに対するクエリ。
        # 1. PGRST116・22P02 は None、それ以外のコードの例外はそのまま投げること。
        q = MagicMock()
        # 変数の内容: q.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        q.single.return_value.execute.side_effect = not_found_error()
        assert fetch_one_or_none(q) is None
        # 変数の内容: q.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        q.single.return_value.execute.side_effect = invalid_uuid_error()
        assert fetch_one_or_none(q) is None
        # 変数の内容: q.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        q.single.return_value.execute.side_effect = PostgrestError('42501')
        with pytest.raises(PostgrestError):
            fetch_one_or_none(q)

    def test_fetch_one_or_404は見つからないとき指定の文言で404(self):
        """見つからなければ detail に指定の文言を入れた 404 を投げること。

        Returns:
            なし。
        """
        # 変数の内容: q: DB テーブルに対するクエリ。
        # 1. 見つからなければ detail に指定の文言を入れた 404 を投げること。
        q = MagicMock()
        # 変数の内容: q.single.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        q.single.return_value.execute.return_value.data = None
        # 変数の内容: e: except で捕捉した処理例外。
        with pytest.raises(HTTPException) as e:
            fetch_one_or_404(q, '無い')
        assert e.value.status_code == 404
        assert e.value.detail == '無い'

    def test_first_or_404は空のリストやNoneで404(self):
        """execute() の data が空のリスト・None なら 404、行があれば先頭を返すこと。

        Returns:
            なし。
        """
        # 変数の内容: data: 現在処理するテストデータ。
        # 1. execute() の data が空のリスト・None なら 404、行があれば先頭を返すこと。
        for data in ([], None):
            # 変数の内容: e: except で捕捉した処理例外。
            with pytest.raises(HTTPException) as e:
                first_or_404(MagicMock(data=data))
            assert e.value.status_code == 404
        assert first_or_404(MagicMock(data=[{'id': 1}, {'id': 2}])) == {'id': 1}

    def test_optional_authはヘッダーなしならFalseで有効なトークンならTrue(self):
        """ヘッダーが無ければ未ログイン（False）、有効なトークンなら True を返すこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. ヘッダーが無ければ未ログイン（False）、有効なトークンなら True を返すこと。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.auth.get_user.return_value: モック呼び出しの返却値。
        mock_sb.auth.get_user.return_value = MagicMock(user={'id': 'u1'})
        with patch('app.auth.supabase', mock_sb):
            assert optional_auth(None) is False
            assert optional_auth('Bearer good') is True
        mock_sb.auth.get_user.assert_called_once_with('good')

    @pytest.mark.parametrize('header', ['Bearer bad', 'Basic abc', 'bad'])
    def test_optional_authはヘッダーがあって無効なら401(self, header):
        """ヘッダーがあるのにトークンが無効・形が違うときは 401 を投げる（未ログイン扱いにしない）。

        Args:
            header: HTTP リクエストヘッダー。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. ヘッダーがあるのにトークンが無効・形が違うときは 401 を投げる（未ログイン扱いにしない）。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.auth.get_user.side_effect: モック呼び出し時に返す例外または副作用。
        mock_sb.auth.get_user.side_effect = Exception('invalid')
        # 変数の内容: e: except で捕捉した処理例外。
        with patch('app.auth.supabase', mock_sb), pytest.raises(HTTPException) as e:
            optional_auth(header)
        assert e.value.status_code == 401

    def test_require_authはSupabaseの例外も401にそろえる(self):
        """Supabase の SDK が例外を投げても 500 ではなく 401 になること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. Supabase の SDK が例外を投げても 500 ではなく 401 になること。
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.auth.get_user.side_effect: モック呼び出し時に返す例外または副作用。
        mock_sb.auth.get_user.side_effect = RuntimeError('network')
        # 変数の内容: e: except で捕捉した処理例外。
        with patch('app.auth.supabase', mock_sb), pytest.raises(HTTPException) as e:
            require_auth('Bearer t')
        assert e.value.status_code == 401

    def test_error_summaryは例外の文字列を含めず型とコードだけを返す(self):
        """ログ用の要約は「型名(code=…)」だけで、例外の文字列（個人情報を含みうる）を入れないこと。

        Returns:
            なし。
        """
        # 1. ログ用の要約は「型名(code=…)」だけで、例外の文字列（個人情報を含みうる）を入れないこと。
        assert error_summary(PostgrestError('23505', SECRET_TEXT)) == 'PostgrestError(code=23505)'
        assert error_summary(ValueError(SECRET_TEXT)) == 'ValueError'
        assert 'secret' not in error_summary(RuntimeError(SECRET_TEXT))


# ---------------------------------------------------------------------------
# メール送信の共通部品
# ---------------------------------------------------------------------------

class TestMailParts:
    """app/mail.py の send_mail と esc。"""

    def test_send_mailは渡したキーを設定して送りメールIDを返す(self):
        """send_mail は resend.api_key に渡したキーを設定してから送り、dict・オブジェクトどちらの戻り値からも ID を返すこと。

        Returns:
            なし。
        """
        # 1. send_mail は resend.api_key に渡したキーを設定してから送り、dict・オブジェクトどちらの戻り値からも ID を返すこと。
        from app import mail
        # 変数の内容: mock_resend: Resend メール送信のモック、seen_keys: 確認済みのキー集合。
        mock_resend = MagicMock()
        seen_keys = []
        # 変数の内容: mock_resend.Emails.send.side_effect: モック呼び出し時に返す例外または副作用。
        mock_resend.Emails.send.side_effect = lambda payload: seen_keys.append(mock_resend.api_key) or {'id': 'm1'}

        with patch('app.mail.resend', mock_resend):
            assert mail.send_mail('key-a', {'to': ['a@example.com']}) == 'm1'
            # 変数の内容: mock_resend.Emails.send.side_effect: モック呼び出し時に返す例外または副作用。
            mock_resend.Emails.send.side_effect = lambda payload: seen_keys.append(mock_resend.api_key) or MagicMock(id='m2')
            assert mail.send_mail('key-b', {'to': ['b@example.com']}) == 'm2'

        assert seen_keys == ['key-a', 'key-b']

    def test_send_mailは送信の例外をそのまま投げる(self):
        """Resend の例外は呼び出し元で扱うため、send_mail は握りつぶさないこと。

        Returns:
            なし。
        """
        # 1. Resend の例外は呼び出し元で扱うため、send_mail は握りつぶさないこと。
        from app import mail
        # 変数の内容: mock_resend: Resend メール送信のモック。
        mock_resend = MagicMock()
        # 変数の内容: mock_resend.Emails.send.side_effect: モック呼び出し時に返す例外または副作用。
        mock_resend.Emails.send.side_effect = RuntimeError('down')
        with patch('app.mail.resend', mock_resend), pytest.raises(RuntimeError):
            mail.send_mail('k', {})

    @pytest.mark.parametrize('value,expected', [
        ('<a href="x">\'&', '&lt;a href=&quot;x&quot;&gt;&#x27;&amp;'),
        (None, ''),
        (3, '3'),
    ])
    def test_escはHTMLの特殊文字を実体参照にしNoneは空文字にする(self, value, expected):
        """esc は < > & " ' を実体参照にし、None は空文字・数値は文字列にすること。

        Args:
            value: 設定キーに保存する値。
            expected: 検証する期待値。

        Returns:
            なし。
        """
        # 1. esc は < > & " ' を実体参照にし、None は空文字・数値は文字列にすること。
        from app.mail import esc
        assert esc(value) == expected
