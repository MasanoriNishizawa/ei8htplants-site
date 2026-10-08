"""
純粋関数のユニットテスト。DB や HTTP に依存しない。
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import date


# --- _calc_is_past ---

def _calc_is_past(start_date: str, end_date=None, today: str = None) -> bool:
    """events.py の _calc_is_past をインライン再現して独立テストする。"""
    effective = end_date or start_date
    try:
        return date.fromisoformat(effective).isoformat() < today
    except Exception:
        return False


class TestCalcIsPast:
    TODAY = '2025-10-08'

    def test_過去の開始日(self):
        assert _calc_is_past('2025-09-01', today=self.TODAY) is True

    def test_今日は過去でない(self):
        assert _calc_is_past('2025-10-08', today=self.TODAY) is False

    def test_未来の開始日(self):
        assert _calc_is_past('2025-11-01', today=self.TODAY) is False

    def test_end_date優先(self):
        # 開始は過去でも終了が未来なら過去でない
        assert _calc_is_past('2025-09-01', end_date='2025-10-10', today=self.TODAY) is False

    def test_end_dateが過去なら過去(self):
        assert _calc_is_past('2025-09-01', end_date='2025-09-30', today=self.TODAY) is True

    def test_不正な日付は過去でない(self):
        assert _calc_is_past('not-a-date', today=self.TODAY) is False


# --- FinanceBody バリデーション ---

from app.routes.events import FinanceBody


class TestFinanceBody:
    def test_デフォルト値(self):
        body = FinanceBody()
        assert body.sales == 0
        assert body.payment_flag is False
        assert body.ws_payment_done is False
        assert body.gas_price == 170

    def test_空文字列はそのまま保持(self):
        # notes / other_expenses_note はバリデーターの対象外なので空文字のまま
        body = FinanceBody(other_expenses_note='', notes='')
        assert body.other_expenses_note == ''
        assert body.notes == ''

    def test_正常値(self):
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
        body = FinanceBody(ws_payment_done=True)
        assert body.ws_payment_done is True


# --- API エンドポイント (TestClient + mock) ---

from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


def make_client():
    """Supabase クライアントをモックしてテスト用の FastAPI クライアントを返す。"""
    mock_sb = MagicMock()
    mock_admin_sb = MagicMock()
    with patch('app.db.supabase', mock_sb), patch('app.db.admin_supabase', mock_admin_sb):
        from app.main import app
        return TestClient(app), mock_sb, mock_admin_sb


class TestEventsEndpoint:
    def setup_method(self):
        self.mock_sb = MagicMock()
        self.mock_admin_sb = MagicMock()

    def _mock_events(self, events_data: list, images_data: list = None):
        images_data = images_data or []
        chain = self.mock_sb.table.return_value
        # .select('*').order(...).execute().data の呼び出しチェーンをモック
        chain.select.return_value.order.return_value.execute.return_value.data = events_data
        chain.select.return_value.in_.return_value.order.return_value.execute.return_value.data = images_data

    def test_イベント一覧_空(self):
        self._mock_events([])
        with patch('app.db.supabase', self.mock_sb), patch('app.db.admin_supabase', self.mock_admin_sb):
            from app.main import app
            client = TestClient(app)
            resp = client.get('/api/events')
            assert resp.status_code == 200
            assert resp.json() == []

    def test_イベント一覧_過去イベント除外(self):
        events = [
            {'id': '1', 'name': 'Past', 'start_date': '2020-01-01', 'end_date': None},
            {'id': '2', 'name': 'Future', 'start_date': '2099-01-01', 'end_date': None},
        ]
        self._mock_events(events)
        with patch('app.db.supabase', self.mock_sb), patch('app.db.admin_supabase', self.mock_admin_sb):
            from app.main import app
            client = TestClient(app)
            resp = client.get('/api/events?past=false')
            assert resp.status_code == 200
            data = resp.json()
            assert all(e['name'] == 'Future' for e in data)

    def test_イベント一覧_過去イベント取得(self):
        events = [
            {'id': '1', 'name': 'Past', 'start_date': '2020-01-01', 'end_date': None},
            {'id': '2', 'name': 'Future', 'start_date': '2099-01-01', 'end_date': None},
        ]
        self._mock_events(events)
        with patch('app.db.supabase', self.mock_sb), patch('app.db.admin_supabase', self.mock_admin_sb):
            from app.main import app
            client = TestClient(app)
            resp = client.get('/api/events?past=true')
            assert resp.status_code == 200
            data = resp.json()
            assert all(e['name'] == 'Past' for e in data)
