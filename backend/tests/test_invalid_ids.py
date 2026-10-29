"""存在しない id・UUID の形でない id を指定したときの応答と、エラーのログのテスト。

確かめること:
- db_utils: is_not_found_error・execute_or_404・execute_or_400
- events: 存在しない id への PUT（画像付き）・finances・sessions・page の保存は 404 で書き込まない。
  公開の GET /events/{id}/sessions は UUID の形でない id で 404、日付の形が違うと 400。
  DELETE・finances・admin-info の GET/PUT で UUID の形でない id（22P02）は 404
- 各 routes の PATCH・DELETE で 22P02 → 404。存在しない UUID の DELETE は従来どおり {ok: true}
- POST /api/orders で product_id が UUID の形でない（.in_ が 22P02）→ 404「商品が見つかりません」
- POST /api/reserve/walkin で insert が 23503・22P02 → 400
- 予約: 時間枠のロック（_session_locks）は使い終わると辞書から消える。存在しない時間枠ではロックを作らず 400
- chat・seo・main のエラーログに、例外の文字列ではなく型名とコード（error_summary）が出る

DB はすべてモックにして、本番の Supabase には接続しない。
"""
import logging
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import db_utils
from app.main import app
from app.routes import reserve as reserve_module
from app.routes import seo
from app.utils.errors import error_summary
from tests._helpers import PostgrestError, as_admin, invalid_uuid_error, not_found_error
from tests.test_orders import ORDER_REQUEST, _make_http_mock_success
from tests.test_reserve_hardening import BASE_REQUEST, SESSION, _db, _post, _public_sb, _table_mock

# 存在しない（DB に行が無い）が UUID の形の id
MISSING_UUID = '11111111-1111-1111-1111-111111111111'
# 例外の文字列に入れる、ログに出てはいけない値
SECRET = 'secret-hanako@example.com'


class _Query:
    """Supabase のクエリのモック。どのメソッドを呼んでも自分を返し、execute() だけが結果を返すか例外を投げる。

    update().eq()・delete().eq()・select().in_() のように、つなぎ方が API ごとに違っても同じように使える。
    """

    def __init__(self, error: Exception | None = None, data: Any = None) -> None:
        """クエリのモックを作る。

        Args:
            error: execute() で投げる例外（None なら投げない）
            data: execute() の結果の .data

        Returns:
            なし。"""
        # 1. クエリのモックを作る。
        # execute() で投げる例外
        self.error = error
        # execute() の結果の .data
        self.data = data if data is not None else []
        # 呼ばれたメソッドの名前（insert が呼ばれたかなどを確かめる）
        self.calls: list[str] = []

    def __getattr__(self, name: str):
        """execute 以外のメソッドは、呼ばれた名前を記録して自分を返す。

        Args:
            name: 呼び出された Supabase クエリメソッド名。

        Returns:
            呼び出し名が execute 以外なら、呼び出し履歴を記録したモック自身を返す。
        """
        # 1. execute 以外のメソッドは、呼ばれた名前を記録して自分を返す。
        if name == 'execute':
            def execute():
                """設定したエラーまたは結果を返すクエリ実行関数を作る。

                戻り値:
                    設定した PostgREST 例外またはデータを含む応答を返す。"""
                # 1. 設定したエラーまたは結果を返すクエリ実行関数を作る。
                if self.error is not None:
                    raise self.error
                return MagicMock(data=self.data)
            return execute

        def chain(*_args, **_kwargs):
            """呼び出されたクエリメソッドを記録してモックを返す。

            Args:
                *_args: クエリメソッドに渡された位置引数。
                **_kwargs: クエリメソッドに渡されたキーワード引数。

            Returns:
                連鎖呼び出し用のクエリモック自身。
            """
            # 1. 呼び出されたクエリメソッドを記録してモックを返す。
            self.calls.append(name)
            return self
        return chain


def _client_raising(error: Exception | None = None, data: Any = None) -> MagicMock:
    """table(...) がどの表でも同じクエリのモックを返すクライアントを作る。

    Args:
        error: execute() で投げる例外
        data: execute() の結果の .data

    Returns:
        supabase クライアントのモック（.query に共通のクエリのモックを入れている）
    """
    # 1. 指定された例外またはデータを返すクエリ連鎖を構成する。
    # 変数の内容: client: テスト対象の API クライアント、query: DB へ渡す検索条件。
    query = _Query(error, data)
    client = MagicMock()
    # 変数の内容: client.query: 対象オブジェクトに設定するquery属性値、client.table.return_value: モック呼び出しの返却値。
    # 2. table() と query 属性を同じクエリへ接続し、テスト対象へ返す。
    client.table.return_value = query
    client.query = query
    return client


# ---------------------------------------------------------------------------
# db_utils
# ---------------------------------------------------------------------------

class TestDbUtils:
    """db_utils の「見つからない」「入力の id が正しくない」の判定。"""

    @pytest.mark.parametrize('code', ['PGRST116', '22P02'])
    def test_PGRST116と22P02は見つからないと判定する(self, code):
        """0 件（PGRST116）・UUID の形でない（22P02）は見つからない扱いになること。

        Args:
            code: 検証対象のステータスコードまたは識別コード。

        Returns:
            なし。
        """
        # 1. 0 件（PGRST116）・UUID の形でない（22P02）は見つからない扱いになること。
        assert db_utils.is_not_found_error(PostgrestError(code)) is True

    @pytest.mark.parametrize('error', [PostgrestError('23503'), PostgrestError('42501'), ValueError('x'), Exception()])
    def test_ほかのコードやコードの無い例外は見つからないと判定しない(self, error):
        """外部キー違反・権限・コードの無い例外は見つからない扱いにしないこと。

        Args:
            error: 検証対象で発生させる例外またはエラー内容。

        Returns:
            なし。
        """
        # 1. 外部キー違反・権限・コードの無い例外は見つからない扱いにしないこと。
        assert db_utils.is_not_found_error(error) is False

    def test_execute_or_404は成功すれば結果をそのまま返す(self):
        """execute() の戻り値を返すこと。

        Returns:
            なし。
        """
        # 変数の内容: query: DB へ渡す検索条件。
        # 1. execute() の戻り値を返すこと。
        query = MagicMock()
        assert db_utils.execute_or_404(query) is query.execute.return_value

    @pytest.mark.parametrize('error', [invalid_uuid_error(), not_found_error()])
    def test_execute_or_404は見つからないエラーを404にする(self, error):
        """22P02・PGRST116 は指定の文言の 404 になること。

        Args:
            error: 検証対象で発生させる例外またはエラー内容。

        Returns:
            なし。
        """
        # 変数の内容: query: DB へ渡す検索条件。
        # 1. 22P02・PGRST116 は指定の文言の 404 になること。
        query = MagicMock()
        # 変数の内容: query.execute.side_effect: モック呼び出し時に返す例外または副作用。
        query.execute.side_effect = error
        # 変数の内容: exc: except で捕捉した処理例外。
        with pytest.raises(HTTPException) as exc:
            db_utils.execute_or_404(query, 'イベントが見つかりません')
        assert exc.value.status_code == 404
        assert exc.value.detail == 'イベントが見つかりません'

    def test_execute_or_404はほかのエラーをそのまま投げる(self):
        """接続の失敗などは 404 にせず、元の例外を投げ直すこと。

        Returns:
            なし。
        """
        # 変数の内容: query: DB へ渡す検索条件。
        # 1. 接続の失敗などは 404 にせず、元の例外を投げ直すこと。
        query = MagicMock()
        # 変数の内容: query.execute.side_effect: モック呼び出し時に返す例外または副作用。
        query.execute.side_effect = ConnectionError('down')
        with pytest.raises(ConnectionError):
            db_utils.execute_or_404(query)

    @pytest.mark.parametrize('code', ['22P02', '23503'])
    def test_execute_or_400は22P02と23503を400にする(self, code):
        """UUID の形でない・参照先が無い入力は指定の文言の 400 になること。

        Args:
            code: 検証対象のステータスコードまたは識別コード。

        Returns:
            なし。
        """
        # 変数の内容: query: DB へ渡す検索条件。
        # 1. UUID の形でない・参照先が無い入力は指定の文言の 400 になること。
        query = MagicMock()
        # 変数の内容: query.execute.side_effect: モック呼び出し時に返す例外または副作用。
        query.execute.side_effect = PostgrestError(code)
        # 変数の内容: exc: except で捕捉した処理例外。
        with pytest.raises(HTTPException) as exc:
            db_utils.execute_or_400(query, 'イベントまたは時間枠が正しくありません')
        assert exc.value.status_code == 400
        assert exc.value.detail == 'イベントまたは時間枠が正しくありません'

    def test_execute_or_400はPGRST116やほかのエラーをそのまま投げる(self):
        """400 にするのは 22P02・23503 だけで、ほかはそのまま投げ直すこと。

        Returns:
            なし。
        """
        # 変数の内容: query: DB へ渡す検索条件。
        # 1. 400 にするのは 22P02・23503 だけで、ほかはそのまま投げ直すこと。
        query = MagicMock()
        # 変数の内容: query.execute.side_effect: モック呼び出し時に返す例外または副作用。
        query.execute.side_effect = not_found_error()
        with pytest.raises(PostgrestError):
            db_utils.execute_or_400(query)

    def test_execute_or_400は成功すれば結果をそのまま返す(self):
        """execute() の戻り値を返すこと。

        Returns:
            なし。
        """
        # 変数の内容: query: DB へ渡す検索条件。
        # 1. execute() の戻り値を返すこと。
        query = MagicMock()
        assert db_utils.execute_or_400(query) is query.execute.return_value


# ---------------------------------------------------------------------------
# events
# ---------------------------------------------------------------------------

def _events_sb_missing() -> MagicMock:
    """イベントの存在確認（select().eq().single().execute()）が PGRST116 を投げる admin_supabase のモック。

    Returns:
        MagicMock を返す。
    """
    # 1. イベントの存在確認（select().eq().single().execute()）が PGRST116 を投げる admin_supabase のモック。
    # 変数の内容: sb: Supabase クライアントまたはそのモック。
    sb = MagicMock()
    # 変数の内容: sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
    sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = not_found_error()
    return sb


# イベントの更新の入力（画像付き）
EVENT_BODY = {'name': 'イベント', 'start_date': '2099-01-01', 'location': '会場', 'image_urls': ['https://example.com/a.jpg']}


class TestEventsNotFound:
    """events の存在しない id・UUID の形でない id。"""

    def test_存在しないidへのPUTは画像付きでも404でevent_imagesにinsertしない(self):
        """先にイベントを確かめるので、更新・画像の削除・insert を呼ばずに 404 になること。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. 先にイベントを確かめるので、更新・画像の削除・insert を呼ばずに 404 になること。
        sb = _events_sb_missing()
        with as_admin(), patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).put(f'/api/events/{MISSING_UUID}', json=EVENT_BODY)
        assert resp.status_code == 404
        sb.table.return_value.insert.assert_not_called()
        sb.table.return_value.update.assert_not_called()
        sb.table.return_value.delete.assert_not_called()

    @pytest.mark.parametrize('method, path, body', [
        ('put', '/finances', {'sales': 1000}),
        ('put', '/sessions', {'sessions': [{'time_label': '10:00〜11:00', 'max_participants': 4}]}),
        ('patch', '/page', {'page_content': {'concept': 'x'}}),
    ])
    def test_存在しないidへの収支_時間枠_ページの保存は404で書き込まない(self, method, path, body):
        """収支・時間枠・ページの保存も先にイベントを確かめ、無ければ 404 で書き込まないこと。

        Args:
            method: 呼び出す HTTP メソッド。
            path: 検証対象のファイルパスまたは URL パス。
            body: API に送るリクエスト本文。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. 収支・時間枠・ページの保存も先にイベントを確かめ、無ければ 404 で書き込まないこと。
        sb = _events_sb_missing()
        with as_admin(), patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = getattr(TestClient(app), method)(f'/api/events/{MISSING_UUID}{path}', json=body)
        assert resp.status_code == 404
        sb.table.return_value.insert.assert_not_called()
        sb.table.return_value.upsert.assert_not_called()
        sb.table.return_value.update.assert_not_called()

    def test_UUIDの形でないidのPUTも404(self):
        """single() が 22P02 を投げても 404 になること。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. single() が 22P02 を投げても 404 になること。
        sb = MagicMock()
        # 変数の内容: sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = invalid_uuid_error()
        with as_admin(), patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).put('/api/events/abc', json=EVENT_BODY)
        assert resp.status_code == 404

    def test_公開の時間枠のGETはUUIDの形でないidで404になりDBを読まない(self):
        """GET /api/events/abc/sessions は DB に渡さず 404 になること。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. GET /api/events/abc/sessions は DB に渡さず 404 になること。
        sb = MagicMock()
        with patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/abc/sessions')
        assert resp.status_code == 404
        sb.table.assert_not_called()

    @pytest.mark.parametrize('date', ['xx', '2026-1-1', '2026/01/01'])
    def test_公開の時間枠のGETは日付の形が違うと400(self, date):
        """?date= が YYYY-MM-DD の形でなければ 400 になること。

        Args:
            date: 検証対象の日付。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. ?date= が YYYY-MM-DD の形でなければ 400 になること。
        sb = MagicMock()
        with patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get(f'/api/events/{MISSING_UUID}/sessions', params={'date': date})
        assert resp.status_code == 400
        sb.table.assert_not_called()

    def test_UUIDの形でないidのDELETEは404(self):
        """delete().eq() が 22P02 を投げたら 404 になること。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. delete().eq() が 22P02 を投げたら 404 になること。
        sb = _client_raising(invalid_uuid_error())
        with as_admin(), patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).delete('/api/events/abc')
        assert resp.status_code == 404

    def test_存在しないUUIDのDELETEは従来どおりok(self):
        """消す対象が無いだけなので {ok: true} を返すこと。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. 消す対象が無いだけなので {ok: true} を返すこと。
        sb = _client_raising(data=[])
        with as_admin(), patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).delete(f'/api/events/{MISSING_UUID}')
        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    @pytest.mark.parametrize('method, path, body', [
        ('get', '/finances', None),
        ('get', '/admin-info', None),
        ('put', '/admin-info', {'notes': 'メモ'}),
    ])
    def test_UUIDの形でないidの収支と管理情報は404(self, method, path, body):
        """finances・admin-info の GET と admin-info の PUT で 22P02 なら 404 になること。

        Args:
            method: 呼び出す HTTP メソッド。
            path: 検証対象のファイルパスまたは URL パス。
            body: API に送るリクエスト本文。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. finances・admin-info の GET と admin-info の PUT で 22P02 なら 404 になること。
        sb = _client_raising(invalid_uuid_error())
        with as_admin(), patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get(f'/api/events/abc{path}') if method == 'get' else client.put(f'/api/events/abc{path}', json=body)
        assert resp.status_code == 404
        assert 'upsert' not in sb.query.calls

    def test_UUIDの形でないidの収支のPUTも404(self):
        """PUT /events/abc/finances は存在確認の single() が 22P02 なら 404 になること。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. PUT /events/abc/finances は存在確認の single() が 22P02 なら 404 になること。
        sb = MagicMock()
        # 変数の内容: sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = invalid_uuid_error()
        with as_admin(), patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).put('/api/events/abc/finances', json={'sales': 1})
        assert resp.status_code == 404
        sb.table.return_value.upsert.assert_not_called()


# ---------------------------------------------------------------------------
# 各 routes の PATCH・DELETE
# ---------------------------------------------------------------------------

# (モジュール名, メソッド, パス, 入力)。パスの {id} に UUID の形でない id・存在しない UUID を入れる
PATCH_DELETE_CASES = [
    ('collaborations', 'delete', '/api/collaborations/{id}', None),
    ('pot_artists', 'delete', '/api/pot-artists/{id}', None),
    ('media_appearances', 'delete', '/api/media-appearances/{id}', None),
    ('price_calc_entries', 'delete', '/api/price-calc-entries/{id}', None),
    ('chat_qa', 'patch', '/api/chat-qa/{id}', {'question': 'Q', 'answer': 'A'}),
    ('chat_qa', 'delete', '/api/chat-qa/{id}', None),
    ('gallery', 'patch', '/api/gallery/{id}', {'display_order': 1}),
    ('gallery', 'delete', '/api/gallery/{id}', None),
    ('stockists', 'patch', '/api/stockists/{id}', {'name': '店'}),
    ('stockists', 'delete', '/api/stockists/{id}', None),
    ('articles', 'put', '/api/articles/{id}', {'title': '記事'}),
    ('articles', 'delete', '/api/articles/{id}', None),
    ('products', 'put', '/api/products/{id}', {'name': '鉢', 'price': 100}),
    ('products', 'patch', '/api/products/{id}/stock', {'stock': 3}),
    ('products', 'delete', '/api/products/{id}', None),
    ('contact', 'patch', '/api/contacts/{id}', {'is_read': True}),
    ('orders', 'patch', '/api/orders/{id}', {'status': 'shipped'}),
]


def _send(method: str, path: str, body: dict | None):
    """管理者として API を呼ぶ。

    Args:
        method: HTTP メソッド（小文字）
        path: パス
        body: JSON の入力（None なら送らない）

    Returns:
        応答
    """
    # 1. 管理者として API を呼ぶ。
    # 変数の内容: client: テスト対象の API クライアント。
    client = TestClient(app)
    if body is None:
        return getattr(client, method)(path)
    return getattr(client, method)(path, json=body)


class TestRoutesInvalidId:
    """各 routes の PATCH・PUT・DELETE で UUID の形でない id（22P02）は 404。"""

    @pytest.mark.parametrize('module, method, path, body', PATCH_DELETE_CASES)
    def test_UUIDの形でないidは404(self, module, method, path, body):
        """22P02 を 500 にせず 404 にすること。

        Args:
            module: テスト対象の Python モジュール。
            method: 呼び出す HTTP メソッド。
            path: 検証対象のファイルパスまたは URL パス。
            body: API に送るリクエスト本文。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. 22P02 を 500 にせず 404 にすること。
        sb = _client_raising(invalid_uuid_error())
        with as_admin(), patch(f'app.routes.{module}.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = _send(method, path.format(id='abc'), body)
        assert resp.status_code == 404

    @pytest.mark.parametrize('module, path', [
        (m, p) for (m, method, p, _b) in PATCH_DELETE_CASES if method == 'delete'
    ])
    def test_存在しないUUIDのDELETEは従来どおりok(self, module, path):
        """消す対象が無いだけなので {ok: true} を返すこと。

        Args:
            module: テスト対象の Python モジュール。
            path: 検証対象のファイルパスまたは URL パス。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. 消す対象が無いだけなので {ok: true} を返すこと。
        sb = _client_raising(data=[])
        with as_admin(), patch(f'app.routes.{module}.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = _send('delete', path.format(id=MISSING_UUID), None)
        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    @pytest.mark.parametrize('module, method, path, body', [c for c in PATCH_DELETE_CASES if c[1] in ('patch', 'put')])
    def test_存在しないUUIDのPATCHとPUTは404(self, module, method, path, body):
        """更新の対象が 0 件（data が空）なら 404 になること。

        Args:
            module: テスト対象の Python モジュール。
            method: 呼び出す HTTP メソッド。
            path: 検証対象のファイルパスまたは URL パス。
            body: API に送るリクエスト本文。

        Returns:
            なし。
        """
        # どの読み書きも 0 件を返す（記事・注文などが先に single() で読む 1 件も空になり、見つからない扱いになる）
        # 1. 更新の対象が 0 件（data が空）なら 404 になること。
        # 変数の内容: sb: Supabase クライアントのモック。
        sb = _client_raising(data=[])
        with as_admin(), patch(f'app.routes.{module}.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = _send(method, path.format(id=MISSING_UUID), body)
        assert resp.status_code == 404

    def test_予約の一覧のevent_idがUUIDの形でなければ404(self):
        """GET /api/reserves?event_id=abc で 22P02 なら 404 になること。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. GET /api/reserves?event_id=abc で 22P02 なら 404 になること。
        sb = _client_raising(invalid_uuid_error())
        with as_admin(), patch('app.routes.reserve.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/reserves', params={'event_id': 'abc'})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 注文・当日参加
# ---------------------------------------------------------------------------

class TestOrderAndWalkin:
    """POST /api/orders の商品 ID と、当日参加の event_id・session_id。"""

    def test_注文のproduct_idがUUIDの形でなければ404で決済しない(self):
        """商品の読み取り（.in_）が 22P02 なら「商品が見つかりません」の 404 になり、Square を呼ばないこと。

        Returns:
            なし。
        """
        # 変数の内容: http: HTTP クライアントのモック、payload: DB に保存する値、sb: Supabase クライアントまたはそのモック。
        # 1. 商品の読み取り（.in_）が 22P02 なら「商品が見つかりません」の 404 になり、Square を呼ばないこと。
        sb = _client_raising(invalid_uuid_error())
        http = _make_http_mock_success()
        payload = {**ORDER_REQUEST, 'items': [{'product_id': 'not-a-uuid', 'quantity': 1}]}
        with patch('app.routes.orders.admin_supabase', sb), \
             patch('app.routes.orders.http', http), \
             patch('app.routes.orders.SQUARE_ACCESS_TOKEN', 'test-token'), \
             patch('app.routes.orders.RESEND_API_KEY', ''):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/orders', json=payload)
        assert resp.status_code == 404
        assert resp.json()['detail'] == '商品が見つかりません'
        http.post.assert_not_called()

    @pytest.mark.parametrize('code', ['23503', '22P02'])
    def test_当日参加でinsertが参照先なし_UUIDの形でないなら400(self, code):
        """存在しない・UUID の形でない event_id・session_id は 400 になること。

        Args:
            code: 検証対象のステータスコードまたは識別コード。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. 存在しない・UUID の形でない event_id・session_id は 400 になること。
        sb = _client_raising(PostgrestError(code))
        with as_admin(), patch('app.routes.reserve.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve/walkin', json={'event_id': 'abc', 'participants': 1, 'session_id': 'xyz'})
        assert resp.status_code == 400
        assert resp.json()['detail'] == 'イベントまたは時間枠が正しくありません'


# ---------------------------------------------------------------------------
# 予約の時間枠のロック
# ---------------------------------------------------------------------------

class TestSessionLock:
    """時間枠ごとのロック（_session_locks）が使い終わると消え、無い時間枠では作られないこと。"""

    def setup_method(self):
        """前のテストのロックが残っていないことを確かめる。

        Returns:
            なし。
        """
        # 1. 前のテストのロックが残っていないことを確かめる。
        reserve_module._session_locks.clear()

    def test_session_lockを抜けると辞書から消える(self):
        """with の中では辞書にあり、抜けると消えること。

        Returns:
            なし。
        """
        # 1. with の中では辞書にあり、抜けると消えること。
        with reserve_module._session_lock('session-1'):
            assert 'session-1' in reserve_module._session_locks
        assert reserve_module._session_locks == {}

    def test_入れ子で使っても最後の1つが抜けるまで残る(self):
        """同じ時間枠を 2 つの処理が使うとき、両方が抜けるまで消えないこと（別のロックを作らない）。

        Returns:
            なし。
        """
        # 変数の内容: entry: セッションロックの利用者数を持つ管理オブジェクト。
        # 1. 同じ時間枠を 2 つの処理が使うとき、両方が抜けるまで消えないこと（別のロックを作らない）。
        entry = reserve_module._LockEntry()
        reserve_module._session_locks['s'] = entry
        # 変数の内容: entry.users: このセッションロックを利用中の処理数。
        entry.users = 1  # もう 1 つの処理が使っている状態
        with reserve_module._session_lock('s'):
            assert reserve_module._session_locks['s'] is entry
        assert reserve_module._session_locks['s'] is entry
        # 変数の内容: entry.users: このセッションロックを利用中の処理数。
        entry.users = 0

    def test_with_の中で例外が起きても辞書から消える(self):
        """例外で抜けたときも使う数が戻り、辞書から消えること。

        Returns:
            なし。
        """
        # 1. 例外で抜けたときも使う数が戻り、辞書から消えること。
        with pytest.raises(RuntimeError):
            with reserve_module._session_lock('session-2'):
                raise RuntimeError('x')
        assert reserve_module._session_locks == {}

    def test_時間枠のある予約が終わるとロックは残らない(self):
        """予約の作成でロックを使ったあと、_session_locks が空に戻ること。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 予約の作成でロックを使ったあと、_session_locks が空に戻ること。
        reservations = _table_mock()
        admin_sb = _db({'ws_sessions': _table_mock(single_data=dict(SESSION)), 'workshop_reservations': reservations})
        resp = _post({**BASE_REQUEST, 'session_id': 'session-1'}, _public_sb(), admin_sb)
        assert resp.status_code == 200
        reservations.insert.assert_called_once()
        assert reserve_module._session_locks == {}

    def test_存在しない時間枠ではロックを作らず400(self):
        """時間枠が見つからないときは、ロックを取る前に 400 になること。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、reservations: 取得した予約の一覧。
        # 1. 時間枠が見つからないときは、ロックを取る前に 400 になること。
        reservations = _table_mock()
        admin_sb = _db({'ws_sessions': _table_mock(single_error=not_found_error()), 'workshop_reservations': reservations})
        # 変数の内容: spy: 元関数の呼び出しを記録するテスト用スパイ。
        with patch.object(reserve_module, '_session_lock', wraps=reserve_module._session_lock) as spy:
            # 変数の内容: resp: API から返されたレスポンス。
            resp = _post({**BASE_REQUEST, 'session_id': 'no-such-session'}, _public_sb(), admin_sb)
        assert resp.status_code == 400
        spy.assert_not_called()
        assert reserve_module._session_locks == {}
        reservations.insert.assert_not_called()


# ---------------------------------------------------------------------------
# エラーのログ（error_summary）
# ---------------------------------------------------------------------------

def _error_messages(caplog, logger_name: str) -> list[str]:
    """指定のロガーの ERROR のログの文を返す。

    Args:
        caplog: ログ出力を取得する pytest の caplog フィクスチャ。
        logger_name: ログを取得するロガー名。

    Returns:
        list[str] を返す。
    """
    # 1. 指定のロガーの ERROR のログの文を返す。
    return [r.getMessage() for r in caplog.records if r.name == logger_name and r.levelno >= logging.ERROR]


class TestErrorSummaryLogs:
    """例外の文字列（個人情報が入りうる）ではなく、型名とコードだけをログに出すこと。"""

    def test_error_summaryは型名とコードだけを返す(self):
        """コードがあれば「型名(code=…)」、無ければ型名だけになり、例外の文字列は入らないこと。

        Returns:
            なし。
        """
        # 1. コードがあれば「型名(code=…)」、無ければ型名だけになり、例外の文字列は入らないこと。
        assert error_summary(PostgrestError('23505', SECRET)) == 'PostgrestError(code=23505)'
        assert error_summary(ValueError(SECRET)) == 'ValueError'
        assert SECRET not in error_summary(Exception(SECRET))

    def test_error_summaryはstatus_codeも読む(self):
        """code が無く status_code がある例外（HTTP の失敗など）はそれを使うこと。

        Returns:
            なし。
        """
        # 変数の内容: e: 処理中に発生した例外。
        # 1. code が無く status_code がある例外（HTTP の失敗など）はそれを使うこと。
        e = Exception(SECRET)
        # 変数の内容: e.status_code: HTTP 例外の応答コード。
        e.status_code = 503  # type: ignore[attr-defined]
        assert error_summary(e) == 'Exception(code=503)'

    def test_チャットの読み取りの失敗のログに例外の文字列が出ない(self, caplog):
        """チャットの前置き（イベントなど）の読み取りに失敗しても、ログは型名とコードだけで、返事は返ること。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            なし。
        """
        # 1. チャットの前置き（イベントなど）の読み取りに失敗しても、ログは型名とコードだけで、返事は返ること。
        from tests.test_chat import VALID_PAYLOAD, _make_admin_sb_mock, _make_genai_mock
        caplog.set_level(logging.ERROR, logger='app.routes.chat')
        with patch('app.routes.chat.genai', _make_genai_mock()), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', _client_raising(PostgrestError('42501', SECRET))), \
             patch('app.routes.chat.admin_supabase', _make_admin_sb_mock()):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/chat', json=VALID_PAYLOAD)
        assert resp.status_code == 200
        # 変数の内容: messages: チャット履歴のメッセージ一覧。
        messages = _error_messages(caplog, 'app.routes.chat')
        assert any('PostgrestError(code=42501)' in m for m in messages)
        assert all(SECRET not in m for m in messages)

    def test_sitemapの読み取りの失敗のログに例外の文字列が出ない(self, caplog):
        """sitemap.xml の読み取りに失敗しても固定ページだけで返し、ログは型名とコードだけであること。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            なし。
        """
        # 1. sitemap.xml の読み取りに失敗しても固定ページだけで返し、ログは型名とコードだけであること。
        seo.clear_cache()
        caplog.set_level(logging.ERROR, logger='app.routes.seo')
        # 変数の内容: failing: 失敗するよう設定した処理のモック。
        failing = _client_raising(PostgrestError('PGRST301', SECRET))
        with patch('app.routes.seo.supabase', failing), patch('app.routes.seo.admin_supabase', failing):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/sitemap.xml')
        seo.clear_cache()
        assert resp.status_code == 200
        # 変数の内容: messages: チャット履歴のメッセージ一覧。
        messages = _error_messages(caplog, 'app.routes.seo')
        assert len(messages) == 3
        assert all('PostgrestError(code=PGRST301)' in m for m in messages)
        assert all(SECRET not in m for m in messages)

    def test_SPAのメタ情報の埋め込みの失敗のログに例外の文字列が出ない(self, caplog):
        """serve_spa でメタ情報の埋め込みに失敗しても index.html を返し、ログは型名だけであること。

        Args:
            caplog: ログ出力を取得する pytest の caplog フィクスチャ。

        Returns:
            なし。
        """
        # 1. serve_spa でメタ情報の埋め込みに失敗しても index.html を返し、ログは型名だけであること。
        from app import main as app_main
        import os
        if not os.path.isfile(os.path.join(app_main.DIST, 'index.html')):
            pytest.skip('frontend/dist/index.html が無い')
        caplog.set_level(logging.ERROR, logger='app.main')
        with patch.object(seo, 'render_spa_index', side_effect=RuntimeError(SECRET)):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/events')
        assert resp.status_code == 200
        # 変数の内容: messages: チャット履歴のメッセージ一覧。
        messages = _error_messages(caplog, 'app.main')
        assert any('RuntimeError' in m for m in messages)
        assert all(SECRET not in m for m in messages)
