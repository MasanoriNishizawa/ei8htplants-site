"""
予約 API のセキュリティ修正・検証の追加のテスト。
対象: backend/app/routes/reserve.py

- 人数 1〜10（予約・当日参加）。違反は 422 で、満席チェックをすり抜けない
- 予約の HTML メールに入れる値（名前・備考・イベント名など）はエスケープされる
- キャンセルの応答は {"ok": true} だけ。新しい長いトークンと古い 8 桁の両方で通る
- 時間枠がそのイベントのものか・予約日が開催期間内か・過ぎていないか（400）
- 管理画面のステータス変更: 同じなら何もしない・キャンセルから戻すときに満席なら 409・メールはキャンセルに変えたときだけ

DB（supabase・admin_supabase）とメール（app.mail.resend）はすべてモック。
日付は app.routes.reserve.today_jst をパッチして固定する。
"""
import re
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
from types import SimpleNamespace
from typing import Any, Optional
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_auth
from app.routes import reserve as reserve_module
from tests._helpers import not_found_error

# テストで使う「今日」（日本時間）
TODAY = '2026-10-22'

# 予約するイベント（10/20〜10/25 の開催。今日は開催中）
EVENT = {
    'id': 'event-1',
    'name': 'テストワークショップ',
    'start_date': '2026-10-20',
    'end_date': '2026-10-25',
    'location': 'テスト会場',
}

# 時間枠（定員 5 名）
SESSION = {'id': 'session-1', 'event_id': 'event-1', 'max_participants': 5, 'time_label': '10:00〜11:00'}

# 予約の入力（時間枠なし）
BASE_REQUEST = {
    'event_id': 'event-1',
    'name': 'テスト花子',
    'email': 'hanako@example.com',
    'phone': '090-1111-2222',
    'participants': 1,
}

# 保存された予約の行
SAVED_ROW = {'id': 'reservation-1', 'event_id': 'event-1', 'status': 'pending', 'session_id': None}


def _table_mock(single_data: Any = None, single_error: Optional[Exception] = None,
                list_data: Optional[list] = None, insert_data: Optional[list] = None,
                update_data: Optional[list] = None) -> MagicMock:
    """1 つの表のモックを作る（select の 1 件・一覧・insert・update の結果を設定する）。

    Args:
        single_data: select(...).eq(...).single().execute().data の値
        single_error: single().execute() が投げる例外（設定すると single_data より優先）
        list_data: select(...).eq(...).neq(...)[.eq(...)].execute().data の値（人数の集計用）
        insert_data: insert(...).execute().data の値
        update_data: update(...).eq(...).execute().data の値

    Returns:
        表のモック
    """
    # 1. 検索・単一取得・更新の各DB応答と呼び出し記録を設定する。
    # 変数の内容: eq: ID 条件を加えるモック関数、t: 現在処理するテスト値。
    t = MagicMock()
    eq = t.select.return_value.eq.return_value
    if single_error is not None:
        # 変数の内容: eq.single.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ、eq.single.return_value.execute.side_effect: モック呼び出し時に返す例外または副作用。
        eq.single.return_value.execute.side_effect = single_error
    else:
        eq.single.return_value.execute.return_value.data = single_data
    # 人数の集計（eq('event_id').neq('status', 'cancelled')[.eq('preferred_date')]）
    neq = eq.neq.return_value
    # 変数の内容: neq.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ、neq.execute.return_value.data: モックのクエリ応答に含めるデータ、t.insert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ、t.update.return_value.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
    neq.execute.return_value.data = list_data or []
    neq.eq.return_value.execute.return_value.data = list_data or []
    t.insert.return_value.execute.return_value.data = insert_data if insert_data is not None else [dict(SAVED_ROW)]
    t.update.return_value.eq.return_value.execute.return_value.data = update_data if update_data is not None else [dict(SAVED_ROW)]
    return t


def _db(tables: dict[str, MagicMock]) -> MagicMock:
    """表の名前ごとに別のモックを返すクライアントのモックを作る。

    Args:
        tables: 表の名前 → 表のモック

    Returns:
        supabase クライアントのモック（table(name) で tables[name] を返す。無ければ空の表）
    """
    # 1. 公開DBと管理DBへテーブル別クエリモックを割り当てる。
    # 変数の内容: client: テスト対象の API クライアント、default: 既定の設定値。
    client = MagicMock()
    default = _table_mock()
    # 変数の内容: client.table.side_effect: モック呼び出し時に返す例外または副作用。
    client.table.side_effect = lambda name: tables.get(name, default)
    return client


def _public_sb(event: Optional[dict] = EVENT) -> MagicMock:
    """公開用の supabase モック（events の 1 件を返す）を作る。

    Args:
        event: テスト対象のイベントレコード。

    Returns:
        MagicMock を返す。
    """
    # 1. 公開用の supabase モック（events の 1 件を返す）を作る。
    if event is None:
        return _db({'events': _table_mock(single_error=not_found_error())})
    return _db({'events': _table_mock(single_data=dict(event))})


def _post(payload: dict, public_sb: MagicMock, admin_sb: MagicMock, resend: Optional[MagicMock] = None,
          key: str = '', today: str = TODAY, raise_server_exceptions: bool = True):
    """POST /api/reserve を呼ぶ。

    Args:
        payload: 予約の入力
        public_sb: supabase のモック
        admin_sb: admin_supabase のモック
        resend: resend のモック
        key: HABITAT_RESEND_API_KEY の値（空ならメールを送らない）
        today: 今日の日付
        raise_server_exceptions: True なら未処理例外をテスト側へ送る

    Returns:
        応答
    """
    # 1. POST /api/reserve を呼ぶ。
    with patch('app.routes.reserve.supabase', public_sb), \
         patch('app.routes.reserve.admin_supabase', admin_sb), \
         patch('app.mail.resend', resend or MagicMock()), \
         patch('app.routes.reserve.HABITAT_RESEND_API_KEY', key), \
         patch('app.routes.reserve.HABITAT_ADMIN_EMAIL', 'admin@example.com'), \
         patch('app.routes.reserve.today_jst', return_value=today):
        return TestClient(app, raise_server_exceptions=raise_server_exceptions).post('/api/reserve', json=payload)


# ---------------------------------------------------------------------------
# 人数の検証
# ---------------------------------------------------------------------------

class TestParticipantsValidation:
    """予約・当日参加の人数は 1〜10。"""

    @pytest.mark.parametrize('participants', [-1, 0, 11, -100])
    def test_予約の人数が1から10の範囲外なら422で保存しない(self, participants):
        """人数が 0・負・11 以上なら 422 になり、DB を読まず保存もしないこと。

        Args:
            participants: 参加者数。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、public_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. 人数が 0・負・11 以上なら 422 になり、DB を読まず保存もしないこと。
        public_sb = _public_sb()
        admin_sb = _db({})

        resp = _post({**BASE_REQUEST, 'participants': participants}, public_sb, admin_sb)

        assert resp.status_code == 422
        public_sb.table.assert_not_called()
        admin_sb.table.assert_not_called()

    def test_満席の時間枠に負の人数で予約しても422で満席チェックをすり抜けない(self):
        """定員 5・予約済み 5 の時間枠に人数 -1 で予約すると、5 + (-1) <= 5 で通ってしまわず 422 になること。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 定員 5・予約済み 5 の時間枠に人数 -1 で予約すると、5 + (-1) <= 5 で通ってしまわず 422 になること。
        reservations = _table_mock(list_data=[{'session_id': 'session-1', 'participants': 5, 'preferred_time': None}])
        admin_sb = _db({'ws_sessions': _table_mock(single_data=dict(SESSION)), 'workshop_reservations': reservations})

        resp = _post({**BASE_REQUEST, 'session_id': 'session-1', 'participants': -1}, _public_sb(), admin_sb)

        assert resp.status_code == 422
        reservations.insert.assert_not_called()

    @pytest.mark.parametrize('participants', [1, 10])
    def test_予約の人数1と10の境界は受け付ける(self, participants):
        """人数 1 と 10（上限ちょうど）は 200 で保存されること。

        Args:
            participants: 参加者数。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 人数 1 と 10（上限ちょうど）は 200 で保存されること。
        reservations = _table_mock()
        admin_sb = _db({'workshop_reservations': reservations})

        resp = _post({**BASE_REQUEST, 'participants': participants}, _public_sb(), admin_sb)

        assert resp.status_code == 200
        assert reservations.insert.call_args.args[0]['participants'] == participants

    @pytest.mark.parametrize('participants', [-1, 0, 11])
    def test_当日参加の人数が範囲外なら422で保存しない(self, participants):
        """管理画面の当日参加も人数 1〜10。範囲外は 422 で保存しないこと。

        Args:
            participants: 参加者数。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 管理画面の当日参加も人数 1〜10。範囲外は 422 で保存しないこと。
        admin_sb = _db({})
        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.reserve.admin_supabase', admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/reserve/walkin', json={'event_id': 'event-1', 'participants': participants})
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 422
        admin_sb.table.assert_not_called()


# ---------------------------------------------------------------------------
# メールのエスケープ
# ---------------------------------------------------------------------------

class TestReservationMailEscape:
    """予約の HTML メールに入れる値はすべてエスケープされる。"""

    # 利用者の入力に混ぜる HTML
    SCRIPT_NAME = '<script>alert(1)</script>'
    IMG_NOTE = '<img src=x onerror=alert(1)>'

    def _send(self, payload: dict, event: dict = EVENT) -> list[dict]:
        """メールありで予約し、送ったメールの中身（payload）のリストを返す。

        Args:
            payload: API に送信する JSON データ。
            event: テスト対象のイベントレコード。

        Returns:
            Resend モックに渡されたメール payload の一覧を返す。
        """
        # 1. 依存DB・メール送信関数を差し替えて予約APIを呼び出す。
        # 変数の内容: resend: Resend メール送信関数のモック、resp: API から返されたレスポンス。
        resend = MagicMock()
        # 変数の内容: resend.Emails.send.return_value: モック呼び出しの返却値。
        resend.Emails.send.return_value = {'id': 'mail-1'}
        resp = _post(payload, _public_sb(event), _db({}), resend=resend, key='habitat-key')
        assert resp.status_code == 200
        return [c.args[0] for c in resend.Emails.send.call_args_list]

    def test_名前と備考のscriptとimgタグは受付メールと管理者通知の両方でエスケープされる(self):
        """名前の <script> と備考の <img onerror> は、どちらのメールの HTML でもタグとして入らず実体参照になること。

        Returns:
            なし。
        """
        # 変数の内容: mails: モックが記録した送信メール一覧。
        # 1. 名前の <script> と備考の <img onerror> は、どちらのメールの HTML でもタグとして入らず実体参照になること。
        mails = self._send({**BASE_REQUEST, 'name': self.SCRIPT_NAME, 'note': self.IMG_NOTE})

        # 受付メール（予約者宛て）と管理者通知の 2 通
        assert [m['to'] for m in mails] == [['hanako@example.com'], ['admin@example.com']]
        # 変数の内容: m: 現在処理するチャット発言。
        for m in mails:
            # 変数の内容: html: 生成または読み込んだ HTML。
            html = m['html']
            assert '<script' not in html
            assert '<img' not in html
            assert 'onerror=alert(1)>' not in html
            assert '&lt;script&gt;alert(1)&lt;/script&gt;' in html
            assert '&lt;img src=x onerror=alert(1)&gt;' in html

    def test_イベント名や会場もエスケープされる(self):
        """DB から読んだイベント名・会場も HTML に入れる前にエスケープされること。

        Returns:
            なし。
        """
        # 変数の内容: event: 処理対象のイベント、mails: モックが記録した送信メール一覧。
        # 1. DB から読んだイベント名・会場も HTML に入れる前にエスケープされること。
        event = {**EVENT, 'name': '<b>ws</b>', 'location': '"><a href="https://evil.example">x</a>'}
        mails = self._send(BASE_REQUEST, event)

        # 変数の内容: m: 現在処理するチャット発言。
        for m in mails:
            assert '<b>ws</b>' not in m['html']
            assert '&lt;b&gt;ws&lt;/b&gt;' in m['html']
            assert 'href="https://evil.example"' not in m['html']

    def test_電話番号と希望の時間も管理者通知でエスケープされる(self):
        """電話番号・希望の時間（時間枠なしの予約）に入れたタグも管理者通知でエスケープされること。

        Returns:
            なし。
        """
        # 変数の内容: admin_html: 管理画面用 HTML テストデータ、mails: モックが記録した送信メール一覧。
        # 1. 電話番号・希望の時間（時間枠なしの予約）に入れたタグも管理者通知でエスケープされること。
        mails = self._send({**BASE_REQUEST, 'phone': '<i>090</i>', 'preferred_time': '<u>10時</u>'})

        admin_html = mails[1]['html']
        assert '<i>090</i>' not in admin_html
        assert '&lt;i&gt;090&lt;/i&gt;' in admin_html
        assert '<u>10時</u>' not in admin_html
        assert '&lt;u&gt;10時&lt;/u&gt;' in admin_html

    def test_キャンセルのメールでも名前がエスケープされる(self):
        """キャンセルの確認メールでも予約者の名前はエスケープされること。

        Returns:
            なし。
        """
        # 変数の内容: resend: Resend メール送信関数のモック、reservations: 取得した予約の一覧、row: DB から取得した単一レコード。
        # 1. キャンセルの確認メールでも予約者の名前はエスケープされること。
        row = {'id': 'r1', 'status': 'pending', 'session_id': None, 'event_id': 'event-1',
               'name': self.SCRIPT_NAME, 'email': 'hanako@example.com', 'created_at': '2026-10-01T00:00:00+00:00'}
        reservations = _table_mock(update_data=[{**row, 'status': 'cancelled'}])
        # 変数の内容: reservations.select.return_value.eq.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        reservations.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [row]
        resend = MagicMock()

        with patch('app.routes.reserve.supabase', _public_sb()), \
             patch('app.routes.reserve.admin_supabase', _db({'workshop_reservations': reservations})), \
             patch('app.mail.resend', resend), \
             patch('app.routes.reserve.HABITAT_RESEND_API_KEY', 'habitat-key'):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve/cancel', json={'token': '12345678'})

        assert resp.status_code == 200
        # 変数の内容: html: 生成または読み込んだ HTML。
        html = resend.Emails.send.call_args.args[0]['html']
        assert '<script' not in html
        assert '&lt;script&gt;' in html


# ---------------------------------------------------------------------------
# キャンセル
# ---------------------------------------------------------------------------

class TestCancelToken:
    """キャンセルの応答とトークンの形。"""

    def _cancel(self, token: str, rows: list[dict]):
        """POST /api/reserve/cancel を呼び、(応答, 予約の表のモック) を返す。

        Args:
            token: 認証ヘッダーに使うアクセストークン。
            rows: DB モックが返すレコード一覧。

        Returns:
            Resend モックに渡されたメール payload の一覧を返す。
        """
        # 1. キャンセルトークン照合用DBを設定しキャンセルAPIを呼び出す。
        # 変数の内容: reservations: 取得した予約の一覧。
        reservations = _table_mock(update_data=[{**rows[0], 'status': 'cancelled'}] if rows else [])
        # 変数の内容: reservations.select.return_value.eq.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        reservations.select.return_value.eq.return_value.order.return_value.execute.return_value.data = rows
        with patch('app.routes.reserve.supabase', _public_sb()), \
             patch('app.routes.reserve.admin_supabase', _db({'workshop_reservations': reservations})), \
             patch('app.routes.reserve.HABITAT_RESEND_API_KEY', ''):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve/cancel', json={'token': token})
        return resp, reservations

    def _row(self) -> dict:
        """キャンセル前の予約の行を返す。

        Returns:
            dict を返す。
        """
        # 1. キャンセル前の予約の行を返す。
        return {'id': 'r1', 'status': 'pending', 'session_id': None, 'event_id': 'event-1',
                'name': '山田花子', 'email': 'yamada@example.com', 'created_at': '2026-10-01T00:00:00+00:00'}

    def test_キャンセルの応答には予約者の名前やメールが含まれない(self):
        """応答は {"ok": true} だけで、名前・メールアドレス・予約 ID を返さないこと。

        Returns:
            なし。
        """
        # 変数の内容: _: テスト条件として指定する値、resp: API から返されたレスポンス。
        # 1. 応答は {"ok": true} だけで、名前・メールアドレス・予約 ID を返さないこと。
        resp, _ = self._cancel('12345678', [self._row()])

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        assert '山田花子' not in resp.text
        assert 'yamada@example.com' not in resp.text
        assert 'r1' not in resp.text

    @pytest.mark.parametrize('token', ['12345678', 'Ab3_-xYz0123456789AbCd'])
    def test_古い8桁のトークンと新しい長いトークンの両方でキャンセルできる(self, token):
        """古い 8 桁の数字のトークンも、token_urlsafe(16) の約 22 文字のトークンもキャンセルできること。

        Args:
            token: 認証ヘッダーに使うアクセストークン。

        Returns:
            なし。
        """
        # 変数の内容: reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 古い 8 桁の数字のトークンも、token_urlsafe(16) の約 22 文字のトークンもキャンセルできること。
        resp, reservations = self._cancel(token, [self._row()])

        assert resp.status_code == 200
        reservations.select.return_value.eq.assert_called_with('cancel_token', token)
        reservations.update.assert_called_with({'status': 'cancelled'})

    def test_65文字以上のトークンは422でDBを読まない(self):
        """トークンは 64 文字まで。65 文字は 422 になり DB を読まないこと。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック。
        # 1. トークンは 64 文字まで。65 文字は 422 になり DB を読まないこと。
        admin_sb = _db({})
        with patch('app.routes.reserve.admin_supabase', admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve/cancel', json={'token': 'a' * 65})

        assert resp.status_code == 422
        admin_sb.table.assert_not_called()

    def test_空のトークンは422になる(self):
        """空文字のトークンは 422 になること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. 空文字のトークンは 422 になること。
        resp = TestClient(app).post('/api/reserve/cancel', json={'token': ''})
        assert resp.status_code == 422

    def test_新しい予約のキャンセルトークンは推測されにくい長い文字列になる(self):
        """予約を作るとき保存するキャンセルトークンは URL に使える 20 文字以上の文字列で、毎回違うこと。

        Returns:
            なし。
        """
        # 変数の内容: tokens: 認証トークンの一覧。
        # 1. 予約を作るとき保存するキャンセルトークンは URL に使える 20 文字以上の文字列で、毎回違うこと。
        tokens = []
        # 変数の内容: _: 繰り返し回数だけを使うための未使用値。
        for _ in range(2):
            # 変数の内容: reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
            reservations = _table_mock()
            resp = _post(BASE_REQUEST, _public_sb(), _db({'workshop_reservations': reservations}))
            assert resp.status_code == 200
            tokens.append(reservations.insert.call_args.args[0]['cancel_token'])

        # 変数の内容: t: t の反復ごとの値。
        for t in tokens:
            assert len(t) >= 20
            assert re.fullmatch(r'[A-Za-z0-9_-]+', t)
            assert not t.isdigit()
        assert tokens[0] != tokens[1]

    def test_当日参加のキャンセルトークンも長い文字列になる(self):
        """管理画面の当日参加で作る予約のトークンも 20 文字以上になること。

        Returns:
            なし。
        """
        # 変数の内容: reservations: 取得した予約の一覧。
        # 1. 管理画面の当日参加で作る予約のトークンも 20 文字以上になること。
        reservations = _table_mock()
        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.reserve.admin_supabase', _db({'workshop_reservations': reservations})):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/reserve/walkin', json={'event_id': 'event-1', 'participants': 2})
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert len(reservations.insert.call_args.args[0]['cancel_token']) >= 20


# ---------------------------------------------------------------------------
# 時間枠・日付の検証
# ---------------------------------------------------------------------------

class TestSessionAndDateValidation:
    """時間枠がそのイベントのものか・予約日が開催期間内か・過ぎていないか。"""

    def test_別のイベントの時間枠を指定すると400で保存しない(self):
        """時間枠の event_id が予約するイベントと違えば 400 になり、保存しないこと。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、other: 比較対象となる別の値、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 時間枠の event_id が予約するイベントと違えば 400 になり、保存しないこと。
        reservations = _table_mock()
        other = {**SESSION, 'event_id': 'event-other'}
        admin_sb = _db({'ws_sessions': _table_mock(single_data=other), 'workshop_reservations': reservations})

        resp = _post({**BASE_REQUEST, 'session_id': 'session-1'}, _public_sb(), admin_sb)

        assert resp.status_code == 400
        assert '時間枠' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_存在しない時間枠を指定すると400で保存しない(self):
        """時間枠が見つからない（PGRST116）ときは 400 になり、保存しないこと。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 時間枠が見つからない（PGRST116）ときは 400 になり、保存しないこと。
        reservations = _table_mock()
        admin_sb = _db({'ws_sessions': _table_mock(single_error=not_found_error()), 'workshop_reservations': reservations})

        resp = _post({**BASE_REQUEST, 'session_id': 'session-x'}, _public_sb(), admin_sb)

        assert resp.status_code == 400
        reservations.insert.assert_not_called()

    def test_そのイベントの時間枠で空きがあれば保存される(self):
        """そのイベントの時間枠で、予約済み 3 + 2 名 <= 定員 5 なら 200 で保存されること。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. そのイベントの時間枠で、予約済み 3 + 2 名 <= 定員 5 なら 200 で保存されること。
        reservations = _table_mock(list_data=[{'session_id': 'session-1', 'participants': 3, 'preferred_time': None}])
        admin_sb = _db({'ws_sessions': _table_mock(single_data=dict(SESSION)), 'workshop_reservations': reservations})

        resp = _post({**BASE_REQUEST, 'session_id': 'session-1', 'participants': 2}, _public_sb(), admin_sb)

        assert resp.status_code == 200
        reservations.insert.assert_called_once()

    def test_定員を超える予約は409で保存しない(self):
        """予約済み 4 + 2 名 > 定員 5 なら 409 になり、保存しないこと。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 予約済み 4 + 2 名 > 定員 5 なら 409 になり、保存しないこと。
        reservations = _table_mock(list_data=[{'session_id': 'session-1', 'participants': 4, 'preferred_time': None}])
        admin_sb = _db({'ws_sessions': _table_mock(single_data=dict(SESSION)), 'workshop_reservations': reservations})

        resp = _post({**BASE_REQUEST, 'session_id': 'session-1', 'participants': 2}, _public_sb(), admin_sb)

        assert resp.status_code == 409
        reservations.insert.assert_not_called()


class TestReservationFailurePaths:
    """予約処理を分割する前に、DB・メール・Webhookの失敗時の応答を固定する。"""

    def test_予約の保存に失敗すると500でメールを送らない(self):
        """予約 insert の障害は成功扱いせず、後続のメール送信も行わないこと。

        Returns:
            なし。
        """
        # 変数の内容: reservations: insert を失敗させる予約テーブル、admin_sb: DB クライアント、resend: メール未送信を確認するモック。
        reservations = _table_mock()
        reservations.insert.return_value.execute.side_effect = RuntimeError('database unavailable')
        admin_sb = _db({'workshop_reservations': reservations})
        resend = MagicMock()

        # 1. DB insert を失敗させ、外部には一般的な 500 応答だけを返す。
        # 変数の内容: resp: 予約保存失敗時のHTTP応答。
        resp = _post(BASE_REQUEST, _public_sb(), admin_sb, resend=resend,
                     key='test-key', raise_server_exceptions=False)

        assert resp.status_code == 500
        reservations.insert.assert_called_once()
        resend.Emails.send.assert_not_called()

    def test_同じ時間枠への同時予約で定員を超えない(self):
        """同時に2件が空席を読んでも、時間枠ロック内の再確認で片方だけを保存すること。

        Returns:
            なし。
        """
        # 変数の内容: session_id: 他テストと衝突しない時間枠ID、rows: 保存済み予約、rows_lock: 保存行の読み書きロック、start: 同時にリクエストを始める同期器。
        session_id = f'parallel-{uuid4()}'
        rows: list[dict] = []
        rows_lock = Lock()
        start = Barrier(2)
        # 変数の内容: reservations: insert 呼び出しを共有して記録する予約テーブルのモック。
        reservations = MagicMock()
        # 変数の内容: insert_query: 保存処理を共有リストへ反映するための execute モック。
        insert_query = reservations.insert.return_value.execute

        # 2名ずつの予約を同時に送り、定員3名なら1件のみ保存される条件にする。
        def save_reservation():
            """1件分の予約を共有リストへ追加し、DB insert の応答形式で返す。

            Returns:
                data に保存行を含む DB 応答相当のオブジェクト。
            """
            with rows_lock:
                # 変数の内容: row: DB に保存されたものとして扱う予約レコード。
                row = {'id': f'reservation-{len(rows) + 1}', 'event_id': 'event-1',
                       'session_id': session_id, 'participants': 2, 'status': 'pending'}
                rows.append(row)
            return SimpleNamespace(data=[dict(row)])

        insert_query.side_effect = save_reservation

        # 1. 満席確認はロック内で共有された保存済み人数を読む。
        def used_count(_event_id, _session, _preferred_date):
            """キャンセルされていない共有予約の参加人数を合計する。

            Args:
                _event_id: テストでは使用しないイベント ID。
                _session: テスト対象の時間枠。
                _preferred_date: テストでは指定しない予約日。

            Returns:
                共有リストに保存済みの参加人数。
            """
            with rows_lock:
                return sum(row['participants'] for row in rows if row['status'] != 'cancelled')

        # 2. 二つのHTTP要求を別スレッドから同時に実行する。
        def send_request():
            """予約要求を同期開始点で待たせてから API に送る。

            Returns:
                予約 API の HTTP 応答。
            """
            # 1. スレッド専用クライアントで予約リクエストを送り、応答を保存する。
            start.wait(timeout=5)
            # 変数の内容: client: このworker専用のHTTPクライアント、response: 並列送信した予約API応答。
            client = TestClient(app)
            response = client.post('/api/reserve', json={
                **BASE_REQUEST, 'session_id': session_id, 'participants': 2,
            })
            return response

        # 変数の内容: session: このテスト専用の時間枠。定員は3名とし、2名の同時予約のうち片方だけ通す。
        session = {**SESSION, 'max_participants': 3}
        session['id'] = session_id
        # 変数の内容: public_sb: 並列要求で共有する公開Supabaseモック、admin_sb: 予約テーブルを共有する管理用Supabaseモック。
        public_sb = _public_sb()
        admin_sb = _db({'workshop_reservations': reservations})

        # 3. モジュールpatchは要求スレッドの外で一度だけ行い、同じモックを両要求に共有する。
        with patch.object(reserve_module, 'supabase', public_sb), \
             patch.object(reserve_module, 'admin_supabase', admin_sb), \
             patch.object(reserve_module, 'HABITAT_RESEND_API_KEY', ''), \
             patch.object(reserve_module, 'today_jst', return_value=TODAY), \
             patch.object(reserve_module, '_load_session_for_event', return_value=session), \
             patch.object(reserve_module, '_session_used_count', side_effect=used_count), \
             patch.object(reserve_module, '_sync_reserved_count_safely'):
            # 変数の内容: executor: 並列HTTP要求を実行するスレッドプール。
            with ThreadPoolExecutor(max_workers=2) as executor:
                # 変数の内容: responses: 2つの予約要求から返されたHTTP応答。
                responses = list(executor.map(lambda _: send_request(), range(2)))

        assert sorted(response.status_code for response in responses) == [200, 409]
        assert len(rows) == 1
        assert sum(row['participants'] for row in rows) <= session['max_participants']
        insert_query.assert_called_once()
        # 4. 実処理の finally が今回の時間枠ロックだけを後片付けしたことを確認する。
        with reserve_module._session_locks_mu:
            assert session_id not in reserve_module._session_locks

    def test_キャンセルのDB更新に失敗すると500でメールを送らない(self):
        """キャンセル状態の保存に失敗した場合、成功応答や確認メールを返さないこと。

        Returns:
            なし。
        """
        # 変数の内容: row: キャンセル対象、admin_sb: 更新を失敗させる管理用DB、resend: メール未送信確認用モック。
        row = {'id': 'reservation-1', 'status': 'pending', 'session_id': None,
               'event_id': 'event-1', 'name': 'テスト花子', 'email': 'hanako@example.com',
               'created_at': '2099-01-01T00:00:00+00:00'}
        admin_sb = MagicMock()
        admin_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [row]
        admin_sb.table.return_value.update.return_value.eq.return_value.execute.side_effect = RuntimeError('database unavailable')
        resend = MagicMock()

        # 1. キャンセル処理を実行し、未処理のDB障害が500となることを確認する。
        with patch('app.routes.reserve.admin_supabase', admin_sb), \
             patch('app.routes.reserve.HABITAT_RESEND_API_KEY', 'test-key'), \
             patch('app.mail.resend', resend):
            # 変数の内容: resp: キャンセル状態のDB更新失敗に対するHTTP応答。
            resp = TestClient(app, raise_server_exceptions=False).post(
                '/api/reserve/cancel', json={'token': 'token-123'})

        assert resp.status_code == 500
        admin_sb.table.return_value.update.assert_called_once_with({'status': 'cancelled'})
        resend.Emails.send.assert_not_called()

    def test_配信失敗WebhookのDB更新失敗でも200を返す(self):
        """配信失敗Webhookの更新がDB障害になっても200を返し、配信元の再送を止めること。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: email_failed の更新を失敗させる DB モック。
        admin_sb = MagicMock()
        admin_sb.table.return_value.update.return_value.eq.return_value.execute.side_effect = RuntimeError('database unavailable')

        # 1. Resend形式の配信失敗通知を送り、例外を握って固定応答することを確認する。
        with patch('app.routes.reserve.admin_supabase', admin_sb):
            # 変数の内容: resp: WebhookのDB更新失敗に対するHTTP応答。
            resp = TestClient(app).post('/api/reserve/webhook/resend', json={
                'type': 'email.failed', 'data': {'email_id': 'mail-123'},
            })

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        admin_sb.table.return_value.update.assert_called_once_with({'email_failed': True})

    def test_不正なJSONのWebhookでも200を返しDBを更新しない(self):
        """JSONを解析できないWebhookは再送を促さず、DB更新もしないこと。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 不正なWebhook本文でDBが呼ばれないことを確認するモック。
        admin_sb = MagicMock()

        # 1. JSON構文が壊れた本文を送り、固定応答とDB未呼び出しを確認する。
        with patch('app.routes.reserve.admin_supabase', admin_sb):
            # 変数の内容: resp: 不正なJSONを受け取ったWebhookのHTTP応答。
            resp = TestClient(app).post('/api/reserve/webhook/resend',
                                        data=b'{invalid',
                                        headers={'content-type': 'application/json'})

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        admin_sb.table.assert_not_called()

    def test_未知イベントのWebhookではDBを更新しない(self):
        """配信失敗以外のイベント種別は無視して固定応答すること。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: WebhookでDB更新が発生しないことを確認するモック。
        admin_sb = MagicMock()

        # 1. ID付きの未知イベントを送り、通知を無視する契約を確認する。
        with patch('app.routes.reserve.admin_supabase', admin_sb):
            # 変数の内容: resp: 未知イベントを受け取ったWebhookのHTTP応答。
            resp = TestClient(app).post('/api/reserve/webhook/resend', json={
                'type': 'email.delivered', 'data': {'email_id': 'mail-123'},
            })

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        admin_sb.table.assert_not_called()

    @pytest.mark.parametrize('event_type', ['email.failed', 'email.bounced'])
    def test_配信失敗WebhookにメールIDが無ければDBを更新しない(self, event_type):
        """配信失敗イベントに特定用メールIDが無い場合は安全に何もしないこと。

        Args:
            event_type: ID欠落を検証する配信失敗イベント種別。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: ID欠落の通知でDB更新が発生しないことを確認するモック。
        admin_sb = MagicMock()

        # 1. email_id と id の両方が無い通知を送り、DBを更新しないことを確認する。
        with patch('app.routes.reserve.admin_supabase', admin_sb):
            # 変数の内容: resp: メールIDがない配信失敗WebhookのHTTP応答。
            resp = TestClient(app).post('/api/reserve/webhook/resend', json={
                'type': event_type, 'data': {},
            })

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        admin_sb.table.assert_not_called()

    @pytest.mark.parametrize('event_type', ['email.failed', 'email.bounced'])
    @pytest.mark.parametrize('email_id_key', ['email_id', 'id'])
    def test_配信失敗Webhookが各ID形式を受けて予約に失敗フラグを保存する(
            self, event_type, email_id_key):
        """両方の配信失敗種別とResendの2種類のID項目を処理すること。

        Args:
            event_type: 検証する配信失敗イベント種別。
            email_id_key: Webhook本文で使うメールIDの項目名。

        Returns:
            なし。
        """
        # 変数の内容: admin_sb: 失敗フラグ更新を記録する管理用DBモック。
        admin_sb = MagicMock()

        # 1. 通知を送り、対象メールIDでemail_failedを更新することを確認する。
        with patch('app.routes.reserve.admin_supabase', admin_sb):
            # 変数の内容: resp: 配信失敗WebhookのHTTP応答。
            resp = TestClient(app).post('/api/reserve/webhook/resend', json={
                'type': event_type, 'data': {email_id_key: 'mail-123'},
            })

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        # 変数の内容: update_query: email_failedを指定メールIDの予約へ保存する更新モック。
        update_query = admin_sb.table.return_value.update
        update_query.assert_called_once_with({'email_failed': True})
        update_query.return_value.eq.assert_called_once_with('resend_email_id', 'mail-123')

    @pytest.mark.parametrize('preferred_date', ['2026-10-19', '2026-10-26'])
    def test_予約日が開催期間の外なら400(self, preferred_date):
        """予約日が開始日より前・最終日より後なら 400（開催期間外）になること。

        Args:
            preferred_date: 予約希望日。

        Returns:
            なし。
        """
        # 変数の内容: reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 予約日が開始日より前・最終日より後なら 400（開催期間外）になること。
        reservations = _table_mock()

        resp = _post({**BASE_REQUEST, 'preferred_date': preferred_date}, _public_sb(),
                     _db({'workshop_reservations': reservations}), today='2026-10-01')

        assert resp.status_code == 400
        assert '開催期間外' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_開催期間内でも予約日が過ぎていれば400(self):
        """開催中のイベントで、今日より前の日（10/21）を予約日にすると 400 になること。

        Returns:
            なし。
        """
        # 変数の内容: reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 開催中のイベントで、今日より前の日（10/21）を予約日にすると 400 になること。
        reservations = _table_mock()

        resp = _post({**BASE_REQUEST, 'preferred_date': '2026-10-21'}, _public_sb(), _db({'workshop_reservations': reservations}))

        assert resp.status_code == 400
        assert '受付は終了' in resp.json()['detail']
        reservations.insert.assert_not_called()

    @pytest.mark.parametrize('preferred_date', ['2026-10-22', '2026-10-25'])
    def test_今日と最終日は予約できる(self, preferred_date):
        """予約日が今日（境界）・最終日（境界）なら 200 で保存されること。

        Args:
            preferred_date: 予約希望日。

        Returns:
            なし。
        """
        # 変数の内容: reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 予約日が今日（境界）・最終日（境界）なら 200 で保存されること。
        reservations = _table_mock()

        resp = _post({**BASE_REQUEST, 'preferred_date': preferred_date}, _public_sb(), _db({'workshop_reservations': reservations}))

        assert resp.status_code == 200
        assert reservations.insert.call_args.args[0]['preferred_date'] == preferred_date

    def test_最終日が昨日のイベントは400で今日が最終日なら予約できる(self):
        """イベントの最終日が今日より前なら受付終了（400）、今日が最終日ならまだ受け付けること（日本時間で判定）。

        Returns:
            なし。
        """
        # 変数の内容: last_day: イベント開催期間の最終日、past: 過去イベントを選ぶかどうか、r1: 最初の API 応答、r2: 次の API 応答。
        # 1. イベントの最終日が今日より前なら受付終了（400）、今日が最終日ならまだ受け付けること（日本時間で判定）。
        past = {**EVENT, 'end_date': '2026-10-21'}
        last_day = {**EVENT, 'end_date': TODAY}

        r1 = _post(BASE_REQUEST, _public_sb(past), _db({}))
        r2 = _post(BASE_REQUEST, _public_sb(last_day), _db({}))

        assert r1.status_code == 400
        assert r2.status_code == 200

    def test_予約日の形が違うと422(self):
        """予約日が YYYY-MM-DD の形でなければ 422 になること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. 予約日が YYYY-MM-DD の形でなければ 422 になること。
        resp = _post({**BASE_REQUEST, 'preferred_date': '2026/10/22'}, _public_sb(), _db({}))
        assert resp.status_code == 422

    def test_存在しないイベントへの予約は404(self):
        """イベントが見つからない（PGRST116）ときは 404 になること。

        Returns:
            なし。
        """
        # 変数の内容: reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. イベントが見つからない（PGRST116）ときは 404 になること。
        reservations = _table_mock()
        resp = _post(BASE_REQUEST, _public_sb(None), _db({'workshop_reservations': reservations}))
        assert resp.status_code == 404
        reservations.insert.assert_not_called()


# ---------------------------------------------------------------------------
# 管理画面のステータス変更
# ---------------------------------------------------------------------------

class TestReservationStatusChange:
    """PATCH /api/reserves/{id} のステータス変更。"""

    def setup_method(self):
        """認証をバイパスする。

        Returns:
            なし。
        """
        # 1. 認証をバイパスする。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """認証のバイパスを戻す。

        Returns:
            なし。
        """
        # 1. 認証のバイパスを戻す。
        app.dependency_overrides.pop(require_auth, None)

    def _row(self, status: str, session_id: Optional[str] = 'session-1') -> dict:
        """予約の行を返す。

        Args:
            status: 検証対象の HTTP ステータスコード。
            session_id: ワークショップセッション ID。

        Returns:
            dict を返す。
        """
        # 1. 予約の行を返す。
        return {'id': 'r1', 'status': status, 'session_id': session_id, 'event_id': 'event-1',
                'participants': 2, 'preferred_date': None, 'name': '山田', 'email': 'yamada@example.com'}

    def _patch(self, row: Optional[dict], new_status: str, used: int = 0):
        """ステータスを変える API を呼び、(応答, 予約の表のモック, resend のモック) を返す。

        Args:
            row: 今の予約の行（None なら存在しない）
            new_status: 新しいステータス
            used: その時間枠にすでに入っている人数（キャンセルを除く）

        Returns:
            Resend モックに渡されたメール payload の一覧を返す。
        """
        # 1. 指定された予約API依存を複数まとめて差し替える。
        if row is None:
            # 変数の内容: reservations: 取得した予約の一覧。
            reservations = _table_mock(single_error=not_found_error())
        else:
            # 変数の内容: reservations: 取得した予約の一覧。
            reservations = _table_mock(
                single_data=dict(row),
                list_data=[{'session_id': 'session-1', 'participants': used, 'preferred_time': None}] if used else [],
                update_data=[{**row, 'status': new_status}],
            )
        # 変数の内容: admin_sb: 管理用 Supabase クライアントのモック、resend: Resend メール送信関数のモック。
        admin_sb = _db({'workshop_reservations': reservations, 'ws_sessions': _table_mock(single_data=dict(SESSION))})
        resend = MagicMock()
        with patch('app.routes.reserve.admin_supabase', admin_sb), \
             patch('app.routes.reserve.supabase', _public_sb()), \
             patch('app.mail.resend', resend), \
             patch('app.routes.reserve.HABITAT_RESEND_API_KEY', 'habitat-key'):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).patch('/api/reserves/r1', json={'status': new_status})
        return resp, reservations, resend

    def test_同じステータスなら更新もメールもしない(self):
        """今と同じステータス（cancelled → cancelled）なら更新せず、メールも送らず今の行を返すこと。

        Returns:
            なし。
        """
        # 変数の内容: resend: Resend メール送信関数のモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 今と同じステータス（cancelled → cancelled）なら更新せず、メールも送らず今の行を返すこと。
        resp, reservations, resend = self._patch(self._row('cancelled'), 'cancelled')

        assert resp.status_code == 200
        assert resp.json()['status'] == 'cancelled'
        reservations.update.assert_not_called()
        resend.Emails.send.assert_not_called()

    def test_キャンセルに変えるとメールが1回だけ送られる(self):
        """pending → cancelled ではキャンセルのメールが予約者に 1 通だけ送られること。

        Returns:
            なし。
        """
        # 変数の内容: resend: Resend メール送信関数のモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. pending → cancelled ではキャンセルのメールが予約者に 1 通だけ送られること。
        resp, reservations, resend = self._patch(self._row('pending'), 'cancelled')

        assert resp.status_code == 200
        reservations.update.assert_any_call({'status': 'cancelled'})
        assert resend.Emails.send.call_count == 1
        assert resend.Emails.send.call_args.args[0]['to'] == ['yamada@example.com']

    def test_キャンセルから戻すとき満席なら409で更新しない(self):
        """cancelled → pending で、時間枠に 4 名入っている（4 + 2 > 定員 5）なら 409 になり更新しないこと。

        Returns:
            なし。
        """
        # 変数の内容: resend: Resend メール送信関数のモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. cancelled → pending で、時間枠に 4 名入っている（4 + 2 > 定員 5）なら 409 になり更新しないこと。
        resp, reservations, resend = self._patch(self._row('cancelled'), 'pending', used=4)

        assert resp.status_code == 409
        assert all(c.args[0] != {'status': 'pending'} for c in reservations.update.call_args_list)
        resend.Emails.send.assert_not_called()

    def test_キャンセルから戻すとき空きがあれば更新されメールは送らない(self):
        """cancelled → confirmed で 3 + 2 <= 5 なら更新され、メールは送らないこと（メールはキャンセルに変えたときだけ）。

        Returns:
            なし。
        """
        # 変数の内容: resend: Resend メール送信関数のモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. cancelled → confirmed で 3 + 2 <= 5 なら更新され、メールは送らないこと（メールはキャンセルに変えたときだけ）。
        resp, reservations, resend = self._patch(self._row('cancelled'), 'confirmed', used=3)

        assert resp.status_code == 200
        reservations.update.assert_any_call({'status': 'confirmed'})
        resend.Emails.send.assert_not_called()

    def test_時間枠の無い予約はキャンセルから戻すとき満席を確かめない(self):
        """session_id が無い予約は満席の確認をせずに戻せること。

        Returns:
            なし。
        """
        # 変数の内容: _: テスト条件として指定する値、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. session_id が無い予約は満席の確認をせずに戻せること。
        resp, reservations, _ = self._patch(self._row('cancelled', session_id=None), 'pending', used=100)

        assert resp.status_code == 200
        reservations.update.assert_any_call({'status': 'pending'})

    def test_pendingからconfirmedに変えてもメールは送らない(self):
        """キャンセル以外への変更ではメールを送らないこと。

        Returns:
            なし。
        """
        # 変数の内容: _: テスト条件として指定する値、resend: Resend メール送信関数のモック、resp: API から返されたレスポンス。
        # 1. キャンセル以外への変更ではメールを送らないこと。
        resp, _, resend = self._patch(self._row('pending'), 'confirmed')

        assert resp.status_code == 200
        resend.Emails.send.assert_not_called()

    @pytest.mark.parametrize('status', ['done', 'CANCELLED', ''])
    def test_決められた値以外のステータスは422(self, status):
        """pending|confirmed|cancelled 以外は 422 になること。

        Args:
            status: 検証対象の HTTP ステータスコード。

        Returns:
            なし。
        """
        # 変数の内容: _: テスト条件として指定する値、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. pending|confirmed|cancelled 以外は 422 になること。
        resp, reservations, _ = self._patch(self._row('pending'), status)

        assert resp.status_code == 422
        reservations.update.assert_not_called()

    def test_存在しない予約は404(self):
        """予約が見つからない（PGRST116）ときは 404 になること。

        Returns:
            なし。
        """
        # 変数の内容: resend: Resend メール送信関数のモック、reservations: 取得した予約の一覧、resp: API から返されたレスポンス。
        # 1. 予約が見つからない（PGRST116）ときは 404 になること。
        resp, reservations, resend = self._patch(None, 'cancelled')

        assert resp.status_code == 404
        reservations.update.assert_not_called()
        resend.Emails.send.assert_not_called()
