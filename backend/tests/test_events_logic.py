"""
純粋関数のユニットテスト。DB や HTTP に依存しない。
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import date


# --- _calc_is_past ---

def _calc_is_past(start_date: str, end_date=None, today: str = None) -> bool:
    """events.py の _calc_is_past をインライン再現して独立テストする。

    Args:
        start_date: イベントの開始日。
        end_date: イベントの終了日。
        today: 過去判定の基準日。

    Returns:
        bool を返す。
    """
    # 1. 終了日があれば終了日、なければ開始日を比較対象に選ぶ。
    # 変数の内容: effective: 過去判定に使う終了日または開始日。
    effective = end_date or start_date
    # 2. ISO日付として読み取れた場合だけ基準日と比較し、不正値は過去扱いしない。
    try:
        return date.fromisoformat(effective).isoformat() < today
    except Exception:
        return False


class TestCalcIsPast:
    """TestCalcIsPast に関するテストと補助処理をまとめる。"""
    # 変数の内容: TODAY: テストで固定する今日の日付。
    TODAY = '2025-10-08'

    def test_過去の開始日(self):
        """過去の開始日ことを確認する。

        戻り値:
            なし。"""
        # 1. 過去の開始日ことを確認する。
        assert _calc_is_past('2025-09-01', today=self.TODAY) is True

    def test_今日は過去でない(self):
        """今日は過去でないことを確認する。

        戻り値:
            なし。"""
        # 1. 今日は過去でないことを確認する。
        assert _calc_is_past('2025-10-08', today=self.TODAY) is False

    def test_未来の開始日(self):
        """未来の開始日ことを確認する。

        戻り値:
            なし。"""
        # 1. 未来の開始日ことを確認する。
        assert _calc_is_past('2025-11-01', today=self.TODAY) is False

    def test_end_date優先(self):
        # 開始は過去でも終了が未来なら過去でない
        """end date優先ことを確認する。

        戻り値:
            なし。"""
        # 1. end date優先ことを確認する。
        assert _calc_is_past('2025-09-01', end_date='2025-10-10', today=self.TODAY) is False

    def test_end_dateが過去なら過去(self):
        """end dateが過去なら過去ことを確認する。

        戻り値:
            なし。"""
        # 1. end dateが過去なら過去ことを確認する。
        assert _calc_is_past('2025-09-01', end_date='2025-09-30', today=self.TODAY) is True

    def test_不正な日付は過去でない(self):
        """不正な日付は過去でないことを確認する。

        戻り値:
            なし。"""
        # 1. 不正な日付は過去でないことを確認する。
        assert _calc_is_past('not-a-date', today=self.TODAY) is False


# --- FinanceBody バリデーション ---

from app.routes.events import FinanceBody


class TestFinanceBody:
    """TestFinanceBody に関するテストと補助処理をまとめる。"""
    def test_デフォルト値(self):
        """デフォルト値ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: body: リクエスト本文。
        # 1. デフォルト値ことを確認する。
        body = FinanceBody()
        assert body.sales == 0
        assert body.payment_flag is False
        assert body.ws_payment_done is False
        assert body.gas_price == 170

    def test_空文字列はそのまま保持(self):
        # notes / other_expenses_note はバリデーターの対象外なので空文字のまま
        """空文字列はそのまま保持ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: body: リクエスト本文。
        # 1. 空文字列はそのまま保持ことを確認する。
        body = FinanceBody(other_expenses_note='', notes='')
        assert body.other_expenses_note == ''
        assert body.notes == ''

    def test_正常値(self):
        """正常値ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: body: リクエスト本文。
        # 1. 正常値ことを確認する。
        body = FinanceBody(
            sales=100000,
            booth_fee=20000,
            distance=50,
            gas_price=170,
            ws_participants=3,
            payment_flag=True,
        )
        assert body.sales == 100000
        assert body.ws_participants == 3
        assert body.payment_flag is True

    def test_ws_payment_done(self):
        """ws payment doneことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: body: リクエスト本文。
        # 1. ws payment doneことを確認する。
        body = FinanceBody(ws_payment_done=True)
        assert body.ws_payment_done is True


# --- API エンドポイント (TestClient + mock) ---
# events.py は `from ..db import supabase` でローカル参照を持つため、
# app.db.supabase をパッチしても効果がない。
# app.routes.events.supabase を直接パッチすることで正しくモックできる。

from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app


def _make_sb_mock(events_data: list, images_data: list = None):
    """イベントと画像の DB 呼び出しチェーンを設定したモックを返す。

    Args:
        events_data: イベント一覧 API が返すテスト用イベント行。
        images_data: テスト用画像レコードの一覧。

    Returns:
        設定したテスト用モックを返す。
    """
    # 1. イベントとイベント画像の各クエリに対する応答を設定する。
    # 変数の内容: chain: Supabase クエリの呼び出し連鎖モック、images_data: テスト用画像行の一覧、mock_sb: 公開用 Supabase クライアントのモック。
    images_data = images_data or []
    mock_sb = MagicMock()
    chain = mock_sb.table.return_value
    # supabase.table('events').select('*').order(...).execute().data
    chain.select.return_value.order.return_value.execute.return_value.data = events_data
    # supabase.table('event_images').select('*').in_(...).order(...).execute().data
    chain.select.return_value.in_.return_value.order.return_value.execute.return_value.data = images_data
    return mock_sb


class TestEventsEndpoint:
    """TestEventsEndpoint に関するテストと補助処理をまとめる。"""
    def test_イベント一覧_空(self):
        """イベント一覧 空ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. イベント一覧 空ことを確認する。
        mock_sb = _make_sb_mock([])
        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events')
        assert resp.status_code == 200
        assert resp.json() == []

    def test_イベント一覧_過去イベント除外(self):
        """イベント一覧 過去イベント除外ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: events: 取得したイベントの一覧、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. イベント一覧 過去イベント除外ことを確認する。
        events = [
            {'id': '1', 'name': 'Past', 'start_date': '2020-01-01', 'end_date': None},
            {'id': '2', 'name': 'Future', 'start_date': '2099-01-01', 'end_date': None},
        ]
        mock_sb = _make_sb_mock(events)
        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events?past=false')
        assert resp.status_code == 200
        # 変数の内容: data: API に返すイベントレコード一覧。。
        data = resp.json()
        assert len(data) == 1
        assert data[0]['name'] == 'Future'

    def test_イベント一覧_過去イベント取得(self):
        """イベント一覧 過去イベント取得ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: events: 取得したイベントの一覧、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. イベント一覧 過去イベント取得ことを確認する。
        events = [
            {'id': '1', 'name': 'Past', 'start_date': '2020-01-01', 'end_date': None},
            {'id': '2', 'name': 'Future', 'start_date': '2099-01-01', 'end_date': None},
        ]
        mock_sb = _make_sb_mock(events)
        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events?past=true')
        assert resp.status_code == 200
        # 変数の内容: data: API に返す過去イベントレコード一覧。。
        data = resp.json()
        assert len(data) == 1
        assert data[0]['name'] == 'Past'

    def test_イベント一覧_end_dateで過去判定(self):
        # 開始日が未来でも終了日が過去ならis_past=True
        """イベント一覧 end dateで過去判定ことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: events: 取得したイベントの一覧、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. イベント一覧 end dateで過去判定ことを確認する。
        events = [
            {'id': '1', 'name': 'EndedEvent', 'start_date': '2099-01-01', 'end_date': '2020-01-01'},
        ]
        mock_sb = _make_sb_mock(events)
        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events?past=true')
        assert resp.status_code == 200
        # 変数の内容: data: API の過去判定に使うイベントレコード一覧。。
        data = resp.json()
        assert len(data) == 1
        assert data[0]['name'] == 'EndedEvent'
