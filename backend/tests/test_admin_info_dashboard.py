"""
GET /api/events/admin-info/dashboard（管理画面ダッシュボード用の管理情報一覧）のテスト。

- admin_supabase は app.routes.events をパッチして差し替える
- 今日の日付は app.routes.events.today_jst をパッチして固定する
- require_auth は dependency_overrides でバイパスし、テスト後に必ず戻す
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_auth

# テストで「今日」とする日付（JST）
TODAY = '2026-10-21'

# ダッシュボードの1件が持つキー
ITEM_KEYS = {
    'event_id', 'name', 'start_date', 'end_date', 'location',
    'carry_in_time', 'carry_out_time', 'hotel_name',
    'booth_fee', 'booth_fee_pay_method', 'booth_fee_due', 'booth_fee_paid',
}


def _ev(eid, start, end=None, name=None, location='会場'):
    """テスト用のイベント行を返す。

    Args:
        eid: イベント ID。
        start: 期間の開始日時。
        end: 期間の終了日時。
        name: イベント名。
        location: 開催場所または対象 URL。

    Returns:
        作成したテスト用レコードの辞書を返す。
    """
    return {'id': eid, 'name': name or eid, 'start_date': start, 'end_date': end, 'location': location}


def _make_sb(events, infos):
    """events と event_admin_info を返す admin_supabase のモックを作る。

    events: table('events').select().order().execute().data
    infos:  table('event_admin_info').select().execute().data

    Args:
        events: テスト用イベント行の一覧。
        infos: 管理画面に表示する情報レコード。

    Returns:
        設定したテスト用モックを返す。
    """
    # 変数の内容: sb: Supabase クライアントまたはそのモック。
    sb = MagicMock()

    def table(name):
        """指定したテーブルに対応するクエリモックを返す。

        引数:
            name: Supabase テーブル名。

        戻り値:
            指定されたテーブル名に対応するクエリモックを返す。"""
        # 変数の内容: q: DB テーブルに対するクエリ。
        q = MagicMock()
        if name == 'events':
            # 変数の内容: q.select.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ、q.select.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
            q.select.return_value.order.return_value.execute.return_value.data = events
        elif name == 'event_admin_info':
            q.select.return_value.execute.return_value.data = infos
        else:
            raise AssertionError(f'想定外のテーブル: {name}')
        return q

    # 変数の内容: sb.table.side_effect: モック呼び出し時に返す例外または副作用。
    sb.table.side_effect = table
    return sb


class TestAdminInfoDashboard:
    """GET /api/events/admin-info/dashboard"""

    def setup_method(self):
        """各テストの前に認証状態を管理者として設定する。

        戻り値:
            各テストの前に認証依存関係をモックへ差し替える。"""
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """各テストの後に認証状態を初期化する。

        戻り値:
            各テスト後に FastAPI の依存関係差し替えを解除する。"""
        app.dependency_overrides.clear()

    def _get(self, events, infos, today=TODAY):
        """モックを差し替えて API を呼び、レスポンスを返す。

        Args:
            events: テスト用イベント行の一覧。
            infos: 管理画面に表示する情報レコード。
            today: 過去判定の基準日。

        Returns:
            ダッシュボード API が返す集計データを辞書で返す。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        sb = _make_sb(events, infos)
        with patch('app.routes.events.admin_supabase', sb), \
             patch('app.routes.events.today_jst', return_value=today):
            return TestClient(app).get('/api/events/admin-info/dashboard')

    def test_認証なしで呼ぶと401になる(self):
        """認証なしで呼ぶと401になることを確認する。

        戻り値:
            なし。"""
        # 1. 認証なしで呼ぶと401になることを確認する。
        app.dependency_overrides.clear()
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/api/events/admin-info/dashboard')
        assert resp.status_code == 401

    def test_今後のイベントと未払いの終了済みイベントだけが開始日順で返る(self):
        """今後のイベントと未払いの終了済みイベントだけが開始日順で返ることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: events: 取得したイベントの一覧、infos: イベント管理情報の一覧、items: 応答へ返す項目の一覧、resp: API から返されたレスポンス。
        # 1. 今後のイベントと未払いの終了済みイベントだけが開始日順で返ることを確認する。
        events = [
            _ev('past-unpaid', '2026-01-01', '2026-01-02'),
            _ev('past-paid', '2026-02-01'),
            _ev('past-noinfo', '2026-03-01'),
            _ev('future-b', '2026-12-01'),
            _ev('future-a', '2026-11-01'),
        ]
        infos = [
            {'event_id': 'past-unpaid', 'info': {'booth_fee': 5000, 'booth_fee_paid': False, 'hotel_name': 'H'}},
            {'event_id': 'past-paid', 'info': {'booth_fee': 5000, 'booth_fee_paid': True}},
            {'event_id': 'future-a', 'info': {'carry_in_time': '2026-11-01T09:00', 'booth_fee_due': '2026-10-25'}},
        ]
        resp = self._get(events, infos)
        assert resp.status_code == 200
        items = resp.json()['items']
        assert [i['event_id'] for i in items] == ['past-unpaid', 'future-a', 'future-b']
        # 変数の内容: i: 現在処理する一覧要素の番号。
        for i in items:
            assert set(i.keys()) == ITEM_KEYS

    def test_返す値は管理情報の値がそのまま入る(self):
        """返す値は管理情報の値がそのまま入ることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: info: イベントに紐づく管理情報、item: 一覧から処理する単一項目、resp: API から返されたレスポンス。
        # 1. 返す値は管理情報の値がそのまま入ることを確認する。
        info = {
            'carry_in_time': '2026-11-01T09:00', 'carry_out_time': '2026-11-02T18:00',
            'hotel_name': 'ホテルA', 'booth_fee': 12000, 'booth_fee_pay_method': '振込',
            'booth_fee_due': '2026-10-30', 'booth_fee_paid': False,
            # ダッシュボードで返さない項目
            'memo': '秘密のメモ',
        }
        resp = self._get([_ev('e1', '2026-11-01', '2026-11-02', name='イベント1', location='東京')],
                         [{'event_id': 'e1', 'info': info}])
        item = resp.json()['items'][0]
        assert item == {
            'event_id': 'e1', 'name': 'イベント1', 'start_date': '2026-11-01', 'end_date': '2026-11-02',
            'location': '東京', 'carry_in_time': '2026-11-01T09:00', 'carry_out_time': '2026-11-02T18:00',
            'hotel_name': 'ホテルA', 'booth_fee': 12000, 'booth_fee_pay_method': '振込',
            'booth_fee_due': '2026-10-30', 'booth_fee_paid': False,
        }
        assert 'memo' not in item

    def test_管理情報が無いイベントは各値がnullで支払い済みはfalseになる(self):
        """管理情報が無いイベントは各値がnullで支払い済みはfalseになることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: item: 一覧から処理する単一項目、resp: API から返されたレスポンス。
        # 1. 管理情報が無いイベントは各値がnullで支払い済みはfalseになることを確認する。
        resp = self._get([_ev('e1', '2026-11-01')], [])
        item = resp.json()['items'][0]
        # 変数の内容: k: 現在処理する辞書キー。
        for k in ('carry_in_time', 'carry_out_time', 'hotel_name', 'booth_fee', 'booth_fee_pay_method', 'booth_fee_due'):
            assert item[k] is None
        assert item['booth_fee_paid'] is False

    def test_infoがdictでない行は管理情報なしとして扱う(self):
        """infoがdictでない行は管理情報なしとして扱うことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: item: 一覧から処理する単一項目、resp: API から返されたレスポンス。
        # 1. infoがdictでない行は管理情報なしとして扱うことを確認する。
        resp = self._get([_ev('e1', '2026-11-01')], [{'event_id': 'e1', 'info': None}])
        item = resp.json()['items'][0]
        assert item['hotel_name'] is None
        assert item['booth_fee_paid'] is False

    @pytest.mark.parametrize('start,end,expected', [
        ('2026-10-21', None, True),  # 開始日が今日（終了日なし）
        ('2026-10-20', '2026-10-21', True),  # 終了日が今日
        ('2026-10-19', '2026-10-20', False),  # 昨日終了
        ('2026-10-20', None, False),  # 昨日開始・終了日なし
    ])
    def test_終了日が今日以降なら含まれ昨日までなら含まれない(self, start, end, expected):
        """終了日が今日以降なら含まれ昨日までなら含まれないことを確認する。

        引数:
            start: 期間の開始日時。
            end: 期間の終了日時。
            expected: 検証する期待値。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. 終了日が今日以降なら含まれ昨日までなら含まれないことを確認する。
        resp = self._get([_ev('e1', start, end)], [])
        assert (len(resp.json()['items']) == 1) is expected

    @pytest.mark.parametrize('info,expected', [
        ({'booth_fee': 3000}, True),  # 未払い・出店料あり
        ({'booth_fee_due': '2026-09-30'}, True),  # 未払い・期限のみ
        ({'booth_fee': 0}, False),  # 出店料 0・期限なし
        ({'booth_fee': 0, 'booth_fee_due': '2026-09-30'}, True),  # 出店料 0 でも期限あり
        ({'booth_fee': 3000, 'booth_fee_paid': True}, False),  # 支払い済み
        ({'hotel_name': 'H'}, False),  # 出店料の情報なし
        ({}, False),
    ])
    def test_終了済みイベントは未払いで出店料か期限があるときだけ含まれる(self, info, expected):
        """終了済みイベントは未払いで出店料か期限があるときだけ含まれることを確認する。

        引数:
            info: 管理画面に表示する情報レコード。
            expected: 検証する期待値。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. 終了済みイベントは未払いで出店料か期限があるときだけ含まれることを確認する。
        resp = self._get([_ev('old', '2026-05-01', '2026-05-02')], [{'event_id': 'old', 'info': info}])
        assert (len(resp.json()['items']) == 1) is expected

    def test_DBの並びが崩れていても開始日の昇順に並べ直す(self):
        """DBの並びが崩れていても開始日の昇順に並べ直すことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: events: 取得したイベントの一覧、resp: API から返されたレスポンス。
        # 1. DBの並びが崩れていても開始日の昇順に並べ直すことを確認する。
        events = [_ev('c', '2026-12-03'), _ev('a', '2026-11-01'), _ev('b', '2026-11-15')]
        resp = self._get(events, [])
        assert [i['event_id'] for i in resp.json()['items']] == ['a', 'b', 'c']

    def test_対象が無いときは空のitemsを返す(self):
        """対象が無いときは空のitemsを返すことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. 対象が無いときは空のitemsを返すことを確認する。
        resp = self._get([_ev('old', '2020-01-01')], [])
        assert resp.status_code == 200
        assert resp.json() == {'items': []}

    def test_イベントが0件でも空のitemsを返す(self):
        """イベントが0件でも空のitemsを返すことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. イベントが0件でも空のitemsを返すことを確認する。
        resp = self._get([], [])
        assert resp.json() == {'items': []}

    def test_DBの読み取りで例外が出ると500になる(self):
        """DBの読み取りで例外が出ると500になることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. DBの読み取りで例外が出ると500になることを確認する。
        sb = MagicMock()
        # 変数の内容: sb.table.side_effect: モック呼び出し時に返す例外または副作用。
        sb.table.side_effect = RuntimeError('boom')
        with patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/admin-info/dashboard')
        assert resp.status_code == 500
        assert 'boom' not in resp.text

    def test_dashboardというパスがイベントIDとして扱われない(self):
        """/admin-info/dashboard が /{event_id}/... の別ルートに吸われていない。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. /admin-info/dashboard が /{event_id}/... の別ルートに吸われていない。
        resp = self._get([_ev('e1', '2026-11-01')], [])
        assert resp.status_code == 200
        assert 'items' in resp.json()

    def test_認証ヘッダー付きの応答はキャッシュされない(self):
        """管理情報が CDN・ブラウザに残らないよう、Authorization 付きの GET は no-store になる。

        Returns:
            なし。
        """
        # 変数の内容: sb: Supabase クライアントまたはそのモック。
        # 1. 管理情報が CDN・ブラウザに残らないよう、Authorization 付きの GET は no-store になる。
        sb = _make_sb([_ev('e1', '2026-11-01')], [])
        with patch('app.routes.events.admin_supabase', sb), \
             patch('app.routes.events.today_jst', return_value=TODAY):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/admin-info/dashboard', headers={'Authorization': 'Bearer x'})
        assert resp.status_code == 200
        assert resp.headers['cache-control'] == 'no-store'
        assert resp.headers['cdn-cache-control'] == 'no-store'
