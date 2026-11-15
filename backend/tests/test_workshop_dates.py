"""
ワークショップを「特定の日だけ」実施し、日ごとに時間枠を変えられる機能のテスト。
対象:
  - backend/app/services/reservation_policy.py（実施日の判定の純粋関数）
  - backend/app/routes/events.py（イベントの ws_dates・時間枠の session_date・GET /sessions の日付の絞り込み）
  - backend/app/routes/reserve.py（予約・当日参加の実施日と時間枠の確認）

テスト概要:
  - ws_dates の検証（並べ替え・NULL にそろえる条件・空の配列・期間外・重なり・形）
  - 時間枠の session_date の検証と、(time_label, session_date) での突き合わせ
  - GET /sessions の日付による絞り込みと、その日の予約での人数の数え方
  - 予約の各 400（予約不要・予約日なし・実施しない日・時間枠の指定なし・別の日の枠）
  - その日に使える枠が 0 件の日は時間枠なしで予約できる
  - 当日参加の実施日・時間枠の確認
  - 既存のデータ（ws_dates・session_date が NULL）で今までと同じ動きになること

DB（supabase・admin_supabase）はすべてモック。日付は today_jst をパッチして固定する。
"""
import json
from typing import Any, Optional
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.reservation_policy import (
    effective_ws_dates,
    is_multi_day_event,
    is_session_available_on,
    is_workshop_day,
)
from tests._helpers import PostgrestError, as_admin
from tests.test_reserve_hardening import BASE_REQUEST, EVENT, TODAY, _db, _post, _public_sb, _table_mock

# テストで使うイベントの UUID（GET /sessions は UUID の形でない id を 404 にするため）
EVENT_UUID = '11111111-1111-1111-1111-111111111111'

# ワークショップを 10/23・10/25 だけ実施する複数日イベント（開催は 10/20〜10/25。今日は 10/22）
WS_EVENT = {
    **EVENT,
    'has_workshop': True,
    'ws_requires_reservation': True,
    'ws_dates': ['2026-10-23', '2026-10-25'],
}
# 既存のデータと同じ形（ws_dates が NULL ＝ 全日程で実施）のワークショップありの複数日イベント
LEGACY_WS_EVENT = {**EVENT, 'has_workshop': True, 'ws_requires_reservation': True, 'ws_dates': None}

# 10/23 だけの時間枠（定員 5 名）
SESSION_23 = {'id': 'session-23', 'event_id': 'event-1', 'max_participants': 5, 'time_label': '10:00〜11:00',
              'session_date': '2026-10-23'}
# 10/25 だけの時間枠（定員 5 名）
SESSION_25 = {'id': 'session-25', 'event_id': 'event-1', 'max_participants': 5, 'time_label': '10:00〜11:00',
              'session_date': '2026-10-25'}
# 全日程で共通の時間枠（既存のデータの形。定員 5 名）
SESSION_ALL = {'id': 'session-1', 'event_id': 'event-1', 'max_participants': 5, 'time_label': '10:00〜11:00',
               'session_date': None}


# 移し先の無い予約があって保存できないときの 409 の文言
CONFLICT_DETAIL = '予約が入っている日時を変更・削除しようとしています。先に予約をキャンセルするか、別の日時へ変更してください。'


# ---------------------------------------------------------------------------
# 補助
# ---------------------------------------------------------------------------

def _pg_error(code: str, message: str, details: Optional[str] = None) -> PostgrestError:
    """DB 関数・トリガーが出す例外（PostgREST の APIError の代わり）を作る。

    Args:
        code: SQLSTATE（例 'P0409'）
        message: 例外の文言
        details: 例外の DETAIL（JSON の文字列など）

    Returns:
        code・message・details を持つ例外
    """
    # 1. code を持つ例外に、message・details を足す。
    # 変数の内容: e: 作る例外。
    e = PostgrestError(code, message)
    e.message = message
    e.details = details
    return e


def _sessions_table(all_sessions: list[dict], single: Optional[dict] = None) -> MagicMock:
    """予約の確認で使う ws_sessions の表のモックを作る。

    Args:
        all_sessions: select('*').eq('event_id').execute().data（イベントの全部の枠）で返す一覧
        single: select(...).eq('id').single().execute().data（指定した枠の 1 件）で返す行

    Returns:
        表のモック
    """
    # 1. 1 件の読み取りと一覧の読み取りの両方の応答を設定する。
    # 変数の内容: t: 表のモック。
    t = _table_mock(single_data=dict(single) if single else None)
    t.select.return_value.eq.return_value.execute.return_value.data = [dict(s) for s in all_sessions]
    return t


def _walkin(payload: dict, tables: dict[str, MagicMock], today: str = TODAY):
    """POST /api/reserve/walkin を管理者として呼ぶ。

    Args:
        payload: 当日参加の入力
        tables: 表の名前 → 表のモック（admin_supabase に使う）
        today: 今日の日付

    Returns:
        応答
    """
    # 1. 管理者として、DB と今日の日付を差し替えて呼ぶ。
    with as_admin(), patch('app.routes.reserve.admin_supabase', _db(tables)), \
         patch('app.routes.reserve.today_jst', return_value=today):
        return TestClient(app).post('/api/reserve/walkin', json=payload)


def _events_admin_sb(event: Optional[dict], sessions: Optional[list[dict]] = None,
                     reservations: Optional[list[dict]] = None,
                     existing: Optional[list[dict]] = None) -> tuple[MagicMock, dict[str, MagicMock]]:
    """events.py の時間枠の API（GET・PUT）で使う admin_supabase のモックを作る。

    Args:
        event: events の 1 件（None なら見つからない）
        sessions: ws_sessions を表示順で読んだ一覧（select('*').eq().order().execute().data）
        reservations: 予約の一覧（日付あり・なしの両方の読み取りで同じものを返す）
        existing: PUT のときの既存の枠（select('id, time_label, session_date').eq().execute().data）

    Returns:
        (クライアントのモック, 表の名前 → 表のモック)
    """
    # 1. 表ごとのモックを作り、それぞれの応答を設定する。
    # 変数の内容: events_t / sessions_t / reservations_t: 各表のモック。
    events_t = MagicMock()
    events_t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = event
    sessions_t = MagicMock()
    sessions_t.select.return_value.eq.return_value.order.return_value.execute.return_value.data = \
        [dict(s) for s in (sessions or [])]
    sessions_t.select.return_value.eq.return_value.execute.return_value.data = [dict(s) for s in (existing or [])]
    sessions_t.insert.return_value.execute.return_value.data = [{'id': 'new-session'}]
    # 時間枠の保存の DB 関数はイベントの ID を返す（表のモックとは別に、client.rpc に設定する）
    reservations_t = MagicMock()
    # 変数の内容: neq: 予約の検索のうち status の条件まで付けた段のモック。
    neq = reservations_t.select.return_value.eq.return_value.neq.return_value
    neq.execute.return_value.data = list(reservations or [])
    neq.eq.return_value.execute.return_value.data = list(reservations or [])
    # 変数の内容: tables: 表の名前 → 表のモック。
    tables = {'events': events_t, 'ws_sessions': sessions_t, 'workshop_reservations': reservations_t}
    # 2. table(name) で表のモックを返すクライアントを作る。
    # 変数の内容: client: admin_supabase のモック。
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    client.rpc.return_value.execute.return_value.data = EVENT_UUID
    return client, tables


# ---------------------------------------------------------------------------
# 実施日の判定（純粋関数）
# ---------------------------------------------------------------------------

class TestWorkshopDayPolicy:
    """reservation_policy の実施日の判定。"""

    def test_複数日の判定は終了日が開始日より後のときだけ真(self):
        """end_date が NULL・同じ日・前の日なら 1 日のイベント扱いになること。

        Returns:
            なし。
        """
        # 1. 終了日の有無・前後で判定が変わることを確かめる。
        assert is_multi_day_event({'start_date': '2026-10-20', 'end_date': '2026-10-21'}) is True
        assert is_multi_day_event({'start_date': '2026-10-20', 'end_date': None}) is False
        assert is_multi_day_event({'start_date': '2026-10-20', 'end_date': '2026-10-20'}) is False

    def test_ws_datesはワークショップありの複数日イベントでだけ効く(self):
        """has_workshop が false・1 日のイベント・NULL では None（全日程）になること。

        Returns:
            なし。
        """
        # 1. 効く条件と効かない条件を並べて確かめる。
        assert effective_ws_dates(WS_EVENT) == ['2026-10-23', '2026-10-25']
        assert effective_ws_dates({**WS_EVENT, 'has_workshop': False}) is None
        assert effective_ws_dates({**WS_EVENT, 'end_date': None}) is None
        assert effective_ws_dates(LEGACY_WS_EVENT) is None

    @pytest.mark.parametrize('day, expected', [
        ('2026-10-23', True), ('2026-10-25', True), ('2026-10-24', False), ('2026-10-19', False), ('2026-10-26', False),
    ])
    def test_実施日の一覧と開催期間で実施する日かが決まる(self, day, expected):
        """ws_dates にある日だけ実施し、開催期間の外は実施しないこと。

        Args:
            day: 確かめる日。
            expected: 実施する日なら True。

        Returns:
            なし。
        """
        # 1. 日ごとの判定を確かめる。
        assert is_workshop_day(WS_EVENT, day) is expected

    def test_既存のデータでは開催期間の全日程で実施しワークショップなしは実施しない(self):
        """ws_dates が NULL なら期間内の全日が実施日、has_workshop が false ならどの日も実施しないこと。

        Returns:
            なし。
        """
        # 1. 既存の形（NULL）とワークショップなしを確かめる。
        assert is_workshop_day(LEGACY_WS_EVENT, '2026-10-24') is True
        assert is_workshop_day({**LEGACY_WS_EVENT, 'has_workshop': False}, '2026-10-24') is False

    def test_日付のない枠はどの日でも日付のある枠はその日だけ使える(self):
        """session_date が NULL（列が無い古い行も）なら共通、日付があればその日だけ使えること。

        Returns:
            なし。
        """
        # 1. 共通の枠・日ごとの枠・列の無い行を確かめる。
        assert is_session_available_on(SESSION_ALL, '2026-10-24') is True
        assert is_session_available_on({'id': 'old'}, '2026-10-24') is True
        assert is_session_available_on(SESSION_23, '2026-10-23') is True
        assert is_session_available_on(SESSION_23, '2026-10-25') is False


# ---------------------------------------------------------------------------
# イベントの保存（ws_dates）
# ---------------------------------------------------------------------------

# 複数日・ワークショップありのイベントの入力
EVENT_BODY = {
    'name': 'テストイベント', 'start_date': '2026-10-20', 'end_date': '2026-10-25', 'location': '会場',
    'has_workshop': True,
}


def _create(body: dict) -> tuple[Any, MagicMock]:
    """POST /api/events を管理者として呼ぶ（保存後の読み直しは差し替える）。

    Args:
        body: イベントの入力

    Returns:
        (応答, admin_supabase のモック)
    """
    # 1. INSERT の応答を設定し、読み直し（get_event）を差し替えて呼ぶ。
    # 変数の内容: sb: admin_supabase のモック。
    sb = MagicMock()
    sb.table.return_value.insert.return_value.execute.return_value.data = [{'id': EVENT_UUID}]
    with as_admin(), patch('app.routes.events.admin_supabase', sb), \
         patch('app.routes.events.get_event', return_value={'id': EVENT_UUID}):
        return TestClient(app).post('/api/events', json=body), sb


def _update(body: dict) -> tuple[Any, MagicMock]:
    """PUT /api/events/{id} を管理者として呼ぶ（保存後の読み直しは差し替える）。

    Args:
        body: イベントの入力

    Returns:
        (応答, admin_supabase のモック)
    """
    # 1. イベントがある応答を設定し、読み直し（get_event）を差し替えて呼ぶ。
    # 変数の内容: sb: admin_supabase のモック。
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = \
        {'id': EVENT_UUID}
    # 更新は DB 関数 save_event_schedule で行い、イベントの ID を返す
    sb.rpc.return_value.execute.return_value.data = EVENT_UUID
    with as_admin(), patch('app.routes.events.admin_supabase', sb), \
         patch('app.routes.events.get_event', return_value={'id': EVENT_UUID}):
        return TestClient(app).put(f'/api/events/{EVENT_UUID}', json=body), sb


class TestEventWsDates:
    """イベントの作成・更新での ws_dates の検証。"""

    def test_実施日は日付の順に並べ替えて保存する(self):
        """順不同で送った実施日が並べ替えて INSERT されること。

        Returns:
            なし。
        """
        # 1. 順不同で送り、INSERT の内容を確かめる。
        resp, sb = _create({**EVENT_BODY, 'ws_dates': ['2026-10-25', '2026-10-21']})
        assert resp.status_code == 200
        assert sb.table.return_value.insert.call_args.args[0]['ws_dates'] == ['2026-10-21', '2026-10-25']

    def test_更新でも実施日を並べ替えて保存する(self):
        """PUT でも並べ替えた実施日が UPDATE されること。

        Returns:
            なし。
        """
        # 1. PUT で送り、UPDATE の内容を確かめる。
        resp, sb = _update({**EVENT_BODY, 'ws_dates': ['2026-10-24', '2026-10-20']})
        assert resp.status_code == 200
        assert sb.rpc.call_args.args[1]['p_event']['ws_dates'] == ['2026-10-20', '2026-10-24']

    @pytest.mark.parametrize('override', [
        {'has_workshop': False},
        {'end_date': None},
        {'end_date': '2026-10-20'},
    ])
    def test_ワークショップなしや1日のイベントでは送られてもNULLで保存する(self, override):
        """has_workshop が false、または 1 日のイベントでは ws_dates を None にそろえること。

        Args:
            override: EVENT_BODY に上書きする項目。

        Returns:
            なし。
        """
        # 1. 実施日を送っても、条件に合わなければ None で保存されることを確かめる。
        resp, sb = _create({**EVENT_BODY, **override, 'ws_dates': ['2026-10-21']})
        assert resp.status_code == 200
        assert sb.table.return_value.insert.call_args.args[0]['ws_dates'] is None

    def test_実施日を送らなければ全日程のNULLで保存する(self):
        """ws_dates を省くと None（全日程）で保存されること（既存の画面と同じ動き）。

        Returns:
            なし。
        """
        # 1. ws_dates を省いて作る。
        resp, sb = _create(EVENT_BODY)
        assert resp.status_code == 200
        assert sb.table.return_value.insert.call_args.args[0]['ws_dates'] is None

    @pytest.mark.parametrize('ws_dates, message', [
        ([], '実施日を1日以上選んでください'),
        (['2026-10-19'], '開催期間の外'),
        (['2026-10-26'], '開催期間の外'),
        (['2026-10-21', '2026-10-21'], '重なって'),
        (['2026/10/21'], '形が正しくありません'),
        (['2026-02-30'], '形が正しくありません'),
    ])
    def test_空や期間外や重なりや形の違う実施日は422で保存しない(self, ws_dates, message):
        """不正な ws_dates は 422 になり、INSERT も UPDATE もしないこと。

        Args:
            ws_dates: 送る実施日の一覧。
            message: エラーの文言に含まれるはずの言葉。

        Returns:
            なし。
        """
        # 1. 作成と更新の両方で確かめる。
        resp, sb = _create({**EVENT_BODY, 'ws_dates': ws_dates})
        assert resp.status_code == 422
        assert message in resp.json()['detail']
        sb.table.return_value.insert.assert_not_called()
        resp, sb = _update({**EVENT_BODY, 'ws_dates': ws_dates})
        assert resp.status_code == 422
        sb.rpc.assert_not_called()

    def test_開催期間を縮めて期間外になった実施日は外さず422にする(self):
        """終了日を 10/23 に縮め、実施日に 10/25 が残っていれば 422 で保存しないこと（黙って外さない）。

        Returns:
            なし。
        """
        # 1. 期間外になった実施日を残したまま更新する。
        resp, sb = _update({**EVENT_BODY, 'end_date': '2026-10-23', 'ws_dates': ['2026-10-21', '2026-10-25']})
        assert resp.status_code == 422
        sb.rpc.assert_not_called()


# ---------------------------------------------------------------------------
# 時間枠の保存（session_date）
# ---------------------------------------------------------------------------

def _put_sessions_rpc(event: Optional[dict], sessions: list[dict], rpc_error: Optional[Exception] = None):
    """PUT /api/events/{id}/sessions を管理者として呼び、DB 関数のモックも返す。

    Args:
        event: events の 1 件
        sessions: 送る時間枠の一覧
        rpc_error: DB 関数に出させる例外（None なら成功）

    Returns:
        (応答, 表の名前 → 表のモック, admin_supabase のモック)
    """
    # 1. DB を差し替え、必要なら DB 関数を失敗させて呼ぶ。
    # 変数の内容: client: admin_supabase のモック、tables: 表のモック。
    client, tables = _events_admin_sb(event)
    if rpc_error is not None:
        client.rpc.return_value.execute.side_effect = rpc_error
    with as_admin(), patch('app.routes.events.admin_supabase', client):
        return (TestClient(app).put(f'/api/events/{EVENT_UUID}/sessions', json={'sessions': sessions}),
                tables, client)


class TestSaveSessionDates:
    """PUT /sessions の session_date の確認と突き合わせ。"""

    def test_全日程のイベントで日付付きの枠は422で書き込まない(self):
        """ws_dates が NULL のイベントでは session_date を指定できないこと。

        Returns:
            なし。
        """
        # 1. 日付付きの枠を送る。
        resp, tables, client = _put_sessions_rpc(LEGACY_WS_EVENT, [{'time_label': '10:00', 'session_date': '2026-10-21'}])
        assert resp.status_code == 422
        client.rpc.assert_not_called()

    @pytest.mark.parametrize('session_date', [None, '2026-10-24'])
    def test_実施日のあるイベントで日付なしや実施日以外の枠は422(self, session_date):
        """ws_dates があるイベントでは、session_date は実施日のどれかでなければならないこと。

        Args:
            session_date: 送る枠の日付。

        Returns:
            なし。
        """
        # 1. 日付なし・実施日以外の枠を送る。
        resp, tables, client = _put_sessions_rpc(WS_EVENT, [{'time_label': '10:00', 'session_date': session_date}])
        assert resp.status_code == 422
        client.rpc.assert_not_called()

    def test_実施日の枠はDB関数に日付付きで渡す(self):
        """実施日の枠を送ると、DB 関数（イベント本体なし）に session_date 付きで渡し、ws_sessions を直接書かないこと。

        Returns:
            なし。
        """
        # 1. 実施日の枠を送る。
        resp, tables, client = _put_sessions_rpc(
            WS_EVENT, [{'time_label': '10:00', 'max_participants': 4, 'session_date': '2026-10-23'}])
        assert resp.status_code == 200
        client.rpc.assert_called_once_with('save_event_schedule', {
            'p_event_id': EVENT_UUID, 'p_event': None,
            'p_sessions': [{'time_label': '10:00', 'max_participants': 4, 'session_date': '2026-10-23'}],
        })
        tables['ws_sessions'].insert.assert_not_called()
        tables['ws_sessions'].update.assert_not_called()

    def test_既存のデータは日付なしの枠のまま渡す(self):
        """全日程のイベントで日付を送らない（空文字も）枠は、session_date を None にして渡すこと。

        Returns:
            なし。
        """
        # 1. 空文字の日付を送る（None とみなす）。
        resp, _, client = _put_sessions_rpc(LEGACY_WS_EVENT, [{'id': EVENT_UUID, 'time_label': '10:00', 'session_date': ''}])
        assert resp.status_code == 200
        assert client.rpc.call_args.args[1]['p_sessions'] == [
            {'id': EVENT_UUID, 'time_label': '10:00', 'max_participants': 10, 'session_date': None}]

    def test_移し先の無い予約があれば409で日時ごとの一覧を返す(self):
        """DB 関数が P0409 を出したら、409 と detail・conflicts を返し、一覧を読み直さないこと。

        Returns:
            なし。
        """
        # 1. DB 関数に移し先の無い予約の例外を出させる。
        # 変数の内容: conflicts: DB 関数の DETAIL に入る一覧。
        conflicts = [{'date': '2026-10-24', 'time_label': '13:00〜', 'count': 2, 'participants': 3}]
        resp, tables, _ = _put_sessions_rpc(
            WS_EVENT, [{'time_label': '10:00', 'session_date': '2026-10-23'}],
            rpc_error=_pg_error('P0409', 'reservation_conflict', json.dumps(conflicts)))
        assert resp.status_code == 409
        assert resp.json() == {'detail': CONFLICT_DETAIL, 'conflicts': conflicts}
        tables['ws_sessions'].select.return_value.eq.return_value.order.assert_not_called()

    def test_DB関数の日付の検証の例外は422(self):
        """DB 関数が P0422（ロックを取って確かめ直したら日付が合わない）を出したら、その文言で 422 にすること。

        Returns:
            なし。
        """
        # 1. 確かめ直しで失敗させる。
        resp, _, _ = _put_sessions_rpc(WS_EVENT, [{'time_label': '10:00', 'session_date': '2026-10-23'}],
                                       rpc_error=_pg_error('P0422', '時間枠ごとにワークショップの実施日を指定してください'))
        assert resp.status_code == 422
        assert resp.json()['detail'] == '時間枠ごとにワークショップの実施日を指定してください'

    def test_DB関数がイベントなしの例外なら404(self):
        """DB 関数が P0404（読んだあとにイベントが消えた）を出したら 404 にすること。

        Returns:
            なし。
        """
        # 1. イベントなしの例外を出させる。
        resp, _, _ = _put_sessions_rpc(LEGACY_WS_EVENT, [{'time_label': '10:00'}],
                                       rpc_error=_pg_error('P0404', 'event_not_found'))
        assert resp.status_code == 404

    def test_イベントが無ければ404(self):
        """イベントが見つからなければ 404 で書き込まないこと。

        Returns:
            なし。
        """
        # 1. イベントが無い状態で送る。
        resp, tables, client = _put_sessions_rpc(None, [{'time_label': '10:00'}])
        assert resp.status_code == 404
        client.rpc.assert_not_called()


# ---------------------------------------------------------------------------
# 時間枠の取得（GET /sessions の日付の絞り込み）
# ---------------------------------------------------------------------------

def _get_sessions(event: Optional[dict], sessions: list[dict], reservations: Optional[list[dict]] = None,
                  date: Optional[str] = None):
    """GET /api/events/{id}/sessions を呼ぶ。

    Args:
        event: events の 1 件
        sessions: ws_sessions の一覧
        reservations: 予約の一覧
        date: 絞り込む日付

    Returns:
        (応答, 表の名前 → 表のモック)
    """
    # 1. DB を差し替えて呼ぶ。
    # 変数の内容: client: admin_supabase のモック、tables: 表のモック、params: クエリ文字列。
    client, tables = _events_admin_sb(event, sessions=sessions, reservations=reservations)
    params = {'date': date} if date else {}
    with patch('app.routes.events.admin_supabase', client):
        return TestClient(app).get(f'/api/events/{EVENT_UUID}/sessions', params=params), tables


class TestGetSessionsByDate:
    """GET /sessions の日付による絞り込み。"""

    def test_日付が無ければ全部の枠をsession_date付きで返す(self):
        """管理画面向けに、全部の枠を session_date 込みで返すこと（イベントは読まない）。

        Returns:
            なし。
        """
        # 1. 日付なしで読む。
        resp, tables = _get_sessions(WS_EVENT, [SESSION_23, SESSION_25])
        assert resp.status_code == 200
        assert [(s['id'], s['session_date']) for s in resp.json()] == [('session-23', '2026-10-23'), ('session-25', '2026-10-25')]
        tables['events'].select.assert_not_called()

    def test_その日の枠と共通の枠だけをその日の予約で数えて返す(self):
        """10/23 を指定すると、10/23 の枠と日付なしの枠だけを返し、別の日の枠は返さないこと。

        Returns:
            なし。
        """
        # 1. 日付なしの枠・10/23・10/25 の枠があり、10/23 の予約が 2 名ある状態で読む。
        # 変数の内容: common: 日付なしの枠（実施日のあるイベントには本来無いが、残っていても共通の枠として出す）。
        common = {**SESSION_ALL, 'time_label': '13:00〜14:00'}
        resp, tables = _get_sessions(WS_EVENT, [common, SESSION_23, SESSION_25],
                                     reservations=[{'session_id': 'session-23', 'participants': 2,
                                                    'preferred_time': None, 'preferred_date': '2026-10-23'}],
                                     date='2026-10-23')
        assert resp.status_code == 200
        assert [(s['id'], s['reserved_count']) for s in resp.json()] == [('session-1', 0), ('session-23', 2)]
        # 2. 予約はその日の分だけ読む。
        tables['workshop_reservations'].select.return_value.eq.return_value.neq.return_value.eq.assert_called_once_with(
            'preferred_date', '2026-10-23')

    @pytest.mark.parametrize('event, date', [
        (WS_EVENT, '2026-10-24'),
        (WS_EVENT, '2026-10-26'),
        ({**WS_EVENT, 'has_workshop': False}, '2026-10-23'),
        (None, '2026-10-23'),
    ])
    def test_ワークショップを実施しない日は空の一覧で枠を読まない(self, event, date):
        """実施日でない・開催期間の外・ワークショップなし・イベントなしなら空の一覧を返すこと。

        Args:
            event: events の 1 件。
            date: 指定する日付。

        Returns:
            なし。
        """
        # 1. 実施しない日を指定して読む。
        resp, tables = _get_sessions(event, [SESSION_23, SESSION_25], date=date)
        assert resp.status_code == 200
        assert resp.json() == []
        tables['ws_sessions'].select.assert_not_called()

    def test_古い予約は表示名と日付の組で照合して別の日の枠に数えない(self):
        """session_id が無い古い予約は (preferred_time, preferred_date) で照合されること。

        Returns:
            なし。
        """
        # 1. 日付なしで全部の枠を読み、10/25 の古い予約（session_id なし）が 10/25 の枠に数えられることを確かめる。
        resp, _ = _get_sessions(WS_EVENT, [SESSION_23, SESSION_25],
                                reservations=[{'session_id': None, 'participants': 3,
                                               'preferred_time': '10:00〜11:00', 'preferred_date': '2026-10-25'}])
        assert resp.status_code == 200
        assert [(s['id'], s['reserved_count']) for s in resp.json()] == [('session-23', 0), ('session-25', 3)]

    def test_既存のデータでは日付を指定しても全部の枠を今までどおり返す(self):
        """ws_dates・session_date が NULL なら、開催期間内の日付で全部の枠を返し、その日の予約で数えること。

        Returns:
            なし。
        """
        # 1. 既存の形のイベントと枠で、日付を指定して読む。
        # 変数の内容: legacy_session: 列 session_date が無い古い行（023 を実行する前の形）。
        legacy_session = {k: v for k, v in SESSION_ALL.items() if k != 'session_date'}
        resp, _ = _get_sessions(LEGACY_WS_EVENT, [legacy_session],
                                reservations=[{'session_id': None, 'participants': 2,
                                               'preferred_time': '10:00〜11:00', 'preferred_date': '2026-10-24'}],
                                date='2026-10-24')
        assert resp.status_code == 200
        assert resp.json() == [{**legacy_session, 'session_date': None, 'reserved_count': 2}]


# ---------------------------------------------------------------------------
# 予約（POST /api/reserve）
# ---------------------------------------------------------------------------

class TestReserveWorkshopDates:
    """ワークショップのあるイベントへの予約の確認。"""

    def _reserve(self, event: dict, payload: dict, sessions: list[dict], single: Optional[dict] = None,
                 used: Optional[list[dict]] = None):
        """予約を送る。

        Args:
            event: 予約するイベント
            payload: BASE_REQUEST に上書きする項目
            sessions: イベントの全部の時間枠
            single: session_id で読む時間枠の行
            used: 満席の確認で読む予約の一覧

        Returns:
            (応答, 予約の表のモック)
        """
        # 1. 予約の表と時間枠の表を用意して送る。
        # 変数の内容: reservations: 予約の表のモック。
        reservations = _table_mock(list_data=used)
        admin_sb = _db({'ws_sessions': _sessions_table(sessions, single), 'workshop_reservations': reservations})
        return _post({**BASE_REQUEST, **payload}, _public_sb(event), admin_sb), reservations

    def test_予約不要のワークショップは400で保存しない(self):
        """ws_requires_reservation が false なら 400 で、予約不要の文言を返すこと。

        Returns:
            なし。
        """
        # 1. 予約不要のイベントに送る。
        resp, reservations = self._reserve({**WS_EVENT, 'ws_requires_reservation': False},
                                           {'preferred_date': '2026-10-23'}, [])
        assert resp.status_code == 400
        assert '予約不要' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_複数日のイベントで予約日が無ければ400(self):
        """複数日のワークショップでは preferred_date が必須であること。

        Returns:
            なし。
        """
        # 1. 予約日なしで送る。
        resp, reservations = self._reserve(WS_EVENT, {}, [])
        assert resp.status_code == 400
        assert '予約日' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_ワークショップを実施しない日は400(self):
        """ws_dates に無い日（10/24）は 400 になること。

        Returns:
            なし。
        """
        # 1. 実施しない日に送る。
        resp, reservations = self._reserve(WS_EVENT, {'preferred_date': '2026-10-24'}, [])
        assert resp.status_code == 400
        assert '実施していません' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_その日に枠があるのに時間枠を指定しなければ400(self):
        """10/23 に枠があるのに session_id が無ければ 400 になること。

        Returns:
            なし。
        """
        # 1. 時間枠なしで送る。
        resp, reservations = self._reserve(WS_EVENT, {'preferred_date': '2026-10-23'}, [SESSION_23, SESSION_25])
        assert resp.status_code == 400
        assert '時間枠を選んで' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_別の日の時間枠は400(self):
        """10/23 の予約に 10/25 の枠を指定すると 400 になること。

        Returns:
            なし。
        """
        # 1. 別の日の枠で送る。
        resp, reservations = self._reserve(WS_EVENT, {'preferred_date': '2026-10-23', 'session_id': 'session-25'},
                                           [SESSION_23, SESSION_25], single=SESSION_25)
        assert resp.status_code == 400
        assert '選んだ日には使えません' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_ほかのイベントの時間枠は400(self):
        """イベントの枠の一覧に無い session_id は 400（時間枠が正しくない）になること。

        Returns:
            なし。
        """
        # 1. 一覧に無い枠で送る。
        resp, reservations = self._reserve(WS_EVENT, {'preferred_date': '2026-10-23', 'session_id': 'session-x'},
                                           [SESSION_23])
        assert resp.status_code == 400
        assert '時間枠が正しくありません' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_その日の時間枠なら保存される(self):
        """10/23 の枠で 10/23 に予約すると 200 で保存されること。

        Returns:
            なし。
        """
        # 1. その日の枠で送る。
        resp, reservations = self._reserve(WS_EVENT, {'preferred_date': '2026-10-23', 'session_id': 'session-23'},
                                           [SESSION_23, SESSION_25], single=SESSION_23)
        assert resp.status_code == 200
        assert reservations.insert.call_args.args[0]['session_id'] == 'session-23'

    def test_その日の時間枠が満席なら409(self):
        """満席の確認は今までどおり「枠×予約日」で数えること。

        Returns:
            なし。
        """
        # 1. 4 名入っている 10/23 の枠に 2 名で送る。
        resp, reservations = self._reserve(
            WS_EVENT, {'preferred_date': '2026-10-23', 'session_id': 'session-23', 'participants': 2},
            [SESSION_23], single=SESSION_23,
            used=[{'session_id': 'session-23', 'participants': 4, 'preferred_time': None}])
        assert resp.status_code == 409
        reservations.insert.assert_not_called()

    def test_その日に使える枠が無ければ時間枠なしで受け付ける(self):
        """10/25 の枠が無い（10/23 だけ）とき、10/25 は session_id なしで 200 になること。

        Returns:
            なし。
        """
        # 1. 10/23 の枠だけがある状態で、10/25 に時間枠なしで送る。
        resp, reservations = self._reserve(WS_EVENT, {'preferred_date': '2026-10-25'}, [SESSION_23])
        assert resp.status_code == 200
        # 変数の内容: saved: 保存された予約の内容。
        saved = reservations.insert.call_args.args[0]
        assert saved['session_id'] is None
        assert saved['preferred_date'] == '2026-10-25'

    def test_1日のイベントで予約日を省けば開始日とみなして保存する(self):
        """1 日のワークショップで予約日を省いたら、開始日として確かめ、開始日を予約日として保存すること。

        Returns:
            なし。
        """
        # 1. 今日開催の 1 日のイベントに、日付なし・時間枠なしで送る（枠が無いので受け付ける）。
        # 変数の内容: one_day: 1 日だけのワークショップのイベント。
        one_day = {**LEGACY_WS_EVENT, 'start_date': TODAY, 'end_date': None}
        resp, reservations = self._reserve(one_day, {}, [])
        assert resp.status_code == 200
        assert reservations.insert.call_args.args[0]['preferred_date'] == TODAY
        # 2. 共通の枠があれば、日付なしでも時間枠の指定が要る。
        resp, reservations = self._reserve(one_day, {}, [SESSION_ALL])
        assert resp.status_code == 400
        assert '時間枠を選んで' in resp.json()['detail']

    def test_既存のデータでは全日程の共通の枠で今までどおり予約できる(self):
        """ws_dates・session_date が NULL なら、開催期間内のどの日も共通の枠で予約できること。

        Returns:
            なし。
        """
        # 1. 既存の形のイベントと枠で、10/24 に予約する。
        resp, reservations = self._reserve(LEGACY_WS_EVENT, {'preferred_date': '2026-10-24', 'session_id': 'session-1'},
                                           [SESSION_ALL], single=SESSION_ALL)
        assert resp.status_code == 200
        reservations.insert.assert_called_once()

    def test_ワークショップなしのイベントは今までどおり日付と枠を確かめない(self):
        """has_workshop が false のイベントは、予約日なし・時間枠なしでも今までどおり受け付けること。

        Returns:
            なし。
        """
        # 1. ワークショップなしの複数日イベントに、予約日なしで送る。
        resp, reservations = self._reserve({**EVENT, 'has_workshop': False}, {}, [SESSION_ALL])
        assert resp.status_code == 200
        reservations.insert.assert_called_once()


# ---------------------------------------------------------------------------
# 当日参加（POST /api/reserve/walkin）
# ---------------------------------------------------------------------------

class TestWalkinWorkshopDates:
    """当日参加の実施日と時間枠の確認。"""

    def test_実施しない日の当日参加は400で保存しない(self):
        """送られた参加日（10/24）が実施日でなければ 400 になること。

        Returns:
            なし。
        """
        # 1. 実施しない日を指定して登録する。
        reservations = _table_mock()
        resp = _walkin({'event_id': 'event-1', 'participants': 1, 'preferred_date': '2026-10-24'},
                       {'events': _table_mock(single_data=dict(WS_EVENT)), 'workshop_reservations': reservations})
        assert resp.status_code == 400
        assert '実施していません' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_参加日を省くと今日で確かめる(self):
        """複数日イベントで参加日を省くと今日（10/22）で確かめ、実施日でなければ 400 になること。

        Returns:
            なし。
        """
        # 1. 今日（10/22）は実施日でない。
        reservations = _table_mock()
        resp = _walkin({'event_id': 'event-1', 'participants': 1},
                       {'events': _table_mock(single_data=dict(WS_EVENT)), 'workshop_reservations': reservations})
        assert resp.status_code == 400
        reservations.insert.assert_not_called()

    def test_ワークショップなしのイベントの当日参加は400(self):
        """has_workshop が false のイベントは、どの日も実施しない日として 400 になること。

        Returns:
            なし。
        """
        # 1. ワークショップなしのイベントに登録する。
        reservations = _table_mock()
        resp = _walkin({'event_id': 'event-1', 'participants': 1, 'preferred_date': '2026-10-23'},
                       {'events': _table_mock(single_data={**WS_EVENT, 'has_workshop': False}),
                        'workshop_reservations': reservations})
        assert resp.status_code == 400
        reservations.insert.assert_not_called()

    def test_別の日の時間枠の当日参加は400(self):
        """10/23 の参加に 10/25 の枠を指定すると 400 になること。

        Returns:
            なし。
        """
        # 1. 別の日の枠で登録する。
        reservations = _table_mock()
        resp = _walkin({'event_id': 'event-1', 'participants': 1, 'preferred_date': '2026-10-23', 'session_id': 'session-25'},
                       {'events': _table_mock(single_data=dict(WS_EVENT)),
                        'ws_sessions': _table_mock(single_data=dict(SESSION_25)),
                        'workshop_reservations': reservations})
        assert resp.status_code == 400
        assert '選んだ日には使えません' in resp.json()['detail']
        reservations.insert.assert_not_called()

    def test_ほかのイベントの時間枠の当日参加は400(self):
        """枠の event_id が違えば 400（イベントまたは時間枠が正しくない）になること。

        Returns:
            なし。
        """
        # 1. 別イベントの枠で登録する。
        reservations = _table_mock()
        resp = _walkin({'event_id': 'event-1', 'participants': 1, 'preferred_date': '2026-10-23', 'session_id': 'session-23'},
                       {'events': _table_mock(single_data=dict(WS_EVENT)),
                        'ws_sessions': _table_mock(single_data={**SESSION_23, 'event_id': 'event-other'}),
                        'workshop_reservations': reservations})
        assert resp.status_code == 400
        assert resp.json()['detail'] == 'イベントまたは時間枠が正しくありません'
        reservations.insert.assert_not_called()

    def test_イベントが無ければ400(self):
        """イベントが見つからなければ 400 になること。

        Returns:
            なし。
        """
        # 1. イベントの無い状態で登録する。
        reservations = _table_mock()
        resp = _walkin({'event_id': 'event-x', 'participants': 1},
                       {'events': _table_mock(single_data=None), 'workshop_reservations': reservations})
        assert resp.status_code == 400
        reservations.insert.assert_not_called()

    def test_その日の時間枠なら当日参加を保存する(self):
        """10/23 の枠で 10/23 の参加を登録すると 200 で保存されること（満席は確かめない）。

        Returns:
            なし。
        """
        # 1. その日の枠で登録する。
        reservations = _table_mock()
        resp = _walkin({'event_id': 'event-1', 'participants': 1, 'preferred_date': '2026-10-23', 'session_id': 'session-23'},
                       {'events': _table_mock(single_data=dict(WS_EVENT)),
                        'ws_sessions': _table_mock(single_data=dict(SESSION_23)),
                        'workshop_reservations': reservations})
        assert resp.status_code == 200
        reservations.insert.assert_called_once()

    def test_既存のデータでは今日の当日参加を今日の日付と枠の表示名で保存する(self):
        """ws_dates が NULL の複数日イベントで、参加日を省いた当日参加は 200 で、今日と枠の表示名を保存すること。

        Returns:
            なし。
        """
        # 1. 既存の形のイベントと共通の枠で登録する。
        reservations = _table_mock()
        resp = _walkin({'event_id': 'event-1', 'participants': 1, 'session_id': 'session-1'},
                       {'events': _table_mock(single_data=dict(LEGACY_WS_EVENT)),
                        'ws_sessions': _table_mock(single_data=dict(SESSION_ALL)),
                        'workshop_reservations': reservations})
        assert resp.status_code == 200
        # 変数の内容: saved: 保存された当日参加の内容。
        saved = reservations.insert.call_args.args[0]
        assert saved['preferred_date'] == TODAY
        assert saved['preferred_time'] == SESSION_ALL['time_label']

    def test_終わった1日のイベントへあとから記録する当日参加は開始日で確かめる(self):
        """1 日のイベントで参加日を省くと開始日で確かめるので、終わったあとでも記録できること。

        Returns:
            なし。
        """
        # 1. 10/01 に開催した 1 日のイベントに、今日（10/22）参加日なしで登録する。
        reservations = _table_mock()
        # 変数の内容: past_one_day: 終わった 1 日のワークショップのイベント。
        past_one_day = {**LEGACY_WS_EVENT, 'start_date': '2026-10-01', 'end_date': None}
        resp = _walkin({'event_id': 'event-1', 'participants': 1},
                       {'events': _table_mock(single_data=past_one_day), 'workshop_reservations': reservations})
        assert resp.status_code == 200
        assert reservations.insert.call_args.args[0]['preferred_date'] == '2026-10-01'

    def test_DBのトリガーが別の日の枠と判断したら400(self):
        """保存のときに DB のトリガーが P0410 を出したら、「選んだ日には使えません」の 400 にすること。

        Returns:
            なし。
        """
        # 1. 保存（insert）でトリガーの例外を出させる。
        reservations = _table_mock()
        reservations.insert.return_value.execute.side_effect = _pg_error('P0410', 'reservation_session_date_mismatch')
        resp = _walkin({'event_id': 'event-1', 'participants': 1, 'preferred_date': '2026-10-23', 'session_id': 'session-23'},
                       {'events': _table_mock(single_data=dict(WS_EVENT)),
                        'ws_sessions': _table_mock(single_data=dict(SESSION_23)),
                        'workshop_reservations': reservations})
        assert resp.status_code == 400
        assert '選んだ日には使えません' in resp.json()['detail']


# ---------------------------------------------------------------------------
# 予約の保存の値と、保存直前の確かめ直し・DB のトリガー（指摘 3・4）
# ---------------------------------------------------------------------------

class TestReserveSavedValuesAndRecheck:
    """予約の保存の値（予約日・枠の表示名）と、ロックの中での確かめ直し・トリガーの例外の変換。"""

    def _reserve(self, payload: dict, single: Any, insert_error: Optional[Exception] = None):
        """10/23 の枠への予約を送る。

        Args:
            payload: BASE_REQUEST に上書きする項目
            single: session_id で読む時間枠（1 回目と 2 回目で変えるときは、行のリストを side_effect にする）
            insert_error: 保存（insert）で出させる例外

        Returns:
            (応答, 予約の表のモック)
        """
        # 1. 時間枠の表は、全体の一覧に 10/23 の枠を返し、1 件の読み取りは single を返す。
        # 変数の内容: sessions_t: 時間枠の表のモック、reservations: 予約の表のモック。
        sessions_t = _sessions_table([SESSION_23])
        # 変数の内容: single_exec: 1 件の読み取りの execute のモック。
        single_exec = sessions_t.select.return_value.eq.return_value.single.return_value.execute
        if isinstance(single, list):
            single_exec.side_effect = [MagicMock(data=dict(x)) for x in single]
        else:
            single_exec.return_value.data = dict(single)
        reservations = _table_mock()
        if insert_error is not None:
            reservations.insert.return_value.execute.side_effect = insert_error
        admin_sb = _db({'ws_sessions': sessions_t, 'workshop_reservations': reservations})
        return _post({**BASE_REQUEST, **payload}, _public_sb(WS_EVENT), admin_sb), reservations

    def test_予約には枠の表示名をpreferred_timeとして保存する(self):
        """時間枠のある予約は、枠の表示名を preferred_time に入れて保存すること（付け替えの手がかり）。

        Returns:
            なし。
        """
        # 1. 10/23 の枠で予約する。
        resp, reservations = self._reserve({'preferred_date': '2026-10-23', 'session_id': 'session-23'}, SESSION_23)
        assert resp.status_code == 200
        # 変数の内容: saved: 保存された予約の内容。
        saved = reservations.insert.call_args.args[0]
        assert saved['preferred_time'] == SESSION_23['time_label']
        assert saved['preferred_date'] == '2026-10-23'

    def test_確かめたあとに枠の日付が変わっていたら保存せず400(self):
        """ロックの中で枠を読み直し、日付が予約日と違っていたら保存しないこと（管理者の変更と重なったとき）。

        Returns:
            なし。
        """
        # 1. 1 回目（ロックの前）は 10/23、2 回目（ロックの中）は 10/25 の枠として返す。
        resp, reservations = self._reserve({'preferred_date': '2026-10-23', 'session_id': 'session-23'},
                                           [SESSION_23, {**SESSION_23, 'session_date': '2026-10-25'}])
        assert resp.status_code == 400
        assert '選んだ日には使えません' in resp.json()['detail']
        reservations.insert.assert_not_called()

    @pytest.mark.parametrize('code, message', [
        ('P0410', '選んだ日には使えません'),
        ('P0411', '時間枠が正しくありません'),
    ])
    def test_DBのトリガーの例外は400(self, code, message):
        """保存のときに DB のトリガーが出した例外（P0410・P0411）を、今の文言の 400 にすること。

        Args:
            code: トリガーが出す SQLSTATE。
            message: 応答の文言に含まれるはずの言葉。

        Returns:
            なし。
        """
        # 1. 保存（insert）でトリガーの例外を出させる。
        resp, _ = self._reserve({'preferred_date': '2026-10-23', 'session_id': 'session-23'}, SESSION_23,
                                insert_error=_pg_error(code, 'trigger'))
        assert resp.status_code == 400
        assert message in resp.json()['detail']

    def test_そのほかの保存の失敗は500(self):
        """トリガー以外の保存の失敗は、今までどおり 500 にすること（握りつぶさない）。

        Returns:
            なし。
        """
        # 1. 保存（insert）で予期しない例外を出させる（アプリの共通の処理が 500 の応答にする）。
        resp, _ = self._reserve({'preferred_date': '2026-10-23', 'session_id': 'session-23'}, SESSION_23,
                                insert_error=RuntimeError('db down'))
        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# イベントと時間枠をまとめて保存する（POST・PUT /api/events の sessions）
# ---------------------------------------------------------------------------

def _save_event(method: str, body: dict, rpc_error: Optional[Exception] = None):
    """POST /api/events か PUT /api/events/{id} を管理者として呼ぶ（保存後の読み直しは差し替える）。

    Args:
        method: 'post' か 'put'
        body: イベントの入力
        rpc_error: DB 関数に出させる例外（None なら成功）

    Returns:
        (応答, admin_supabase のモック, get_event のモック)
    """
    # 1. DB 関数はイベントの ID を返し、イベントの存在の確認も通るようにする。
    # 変数の内容: sb: admin_supabase のモック。
    sb = MagicMock()
    sb.rpc.return_value.execute.return_value.data = EVENT_UUID
    sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = \
        {'id': EVENT_UUID}
    if rpc_error is not None:
        sb.rpc.return_value.execute.side_effect = rpc_error
    # 2. 呼ぶ。
    # 変数の内容: path: 呼ぶパス。
    path = '/api/events' if method == 'post' else f'/api/events/{EVENT_UUID}'
    with as_admin(), patch('app.routes.events.admin_supabase', sb), \
         patch('app.routes.events.get_event', return_value={'id': EVENT_UUID}) as get_event:
        return getattr(TestClient(app), method)(path, json=body), sb, get_event


class TestEventScheduleSave:
    """イベント本体と時間枠を DB 関数でまとめて保存する。"""

    @pytest.mark.parametrize('method, expected_id', [('post', None), ('put', EVENT_UUID)])
    def test_時間枠付きの保存はDB関数でまとめて保存する(self, method, expected_id):
        """sessions を送ると、イベント本体の列と時間枠を DB 関数に 1 回で渡し、events を直接書かないこと。

        Args:
            method: 'post' か 'put'。
            expected_id: DB 関数に渡すはずのイベントの ID（作成は None）。

        Returns:
            なし。
        """
        # 1. 実施日と日ごとの枠を送る。
        # 変数の内容: body: イベントの入力。
        body = {**EVENT_BODY, 'ws_dates': ['2026-10-25', '2026-10-23'], 'image_urls': ['https://example.com/a.jpg'],
                'sessions': [{'time_label': '10:00', 'session_date': '2026-10-23'}]}
        resp, sb, get_event = _save_event(method, body)
        assert resp.status_code == 200
        # 2. DB 関数への引数を確かめる（実施日は並べ替え済み・画像と時間枠は列に入れない）。
        # 変数の内容: params: DB 関数に渡した引数。
        params = sb.rpc.call_args.args[1]
        assert sb.rpc.call_args.args[0] == 'save_event_schedule'
        assert params['p_event_id'] == expected_id
        assert params['p_event']['ws_dates'] == ['2026-10-23', '2026-10-25']
        assert 'sessions' not in params['p_event'] and 'image_urls' not in params['p_event']
        assert params['p_sessions'] == [{'time_label': '10:00', 'max_participants': 10, 'session_date': '2026-10-23'}]
        # 3. events を直接 insert・update しない。画像は DB 関数のあとに保存し、作ったイベントを読み直す。
        sb.table.return_value.insert.assert_called_once_with(
            [{'event_id': EVENT_UUID, 'url': 'https://example.com/a.jpg', 'display_order': 0}])
        sb.table.return_value.update.assert_not_called()
        get_event.assert_called_once_with(EVENT_UUID)

    def test_時間枠なしの更新も必ずDB関数で今の枠のまま確かめる(self):
        """sessions を送らない更新も DB 関数を通し、p_sessions は None（今の枠を入力にして確かめる）で渡すこと。

        events を直接 UPDATE しない（日程を変えたときに予約の確認を抜かさないため）。

        Returns:
            なし。
        """
        # 1. sessions なしで更新する。
        resp, sb, _ = _save_event('put', {**EVENT_BODY, 'ws_dates': None})
        assert resp.status_code == 200
        # 変数の内容: params: DB 関数に渡した引数。
        params = sb.rpc.call_args.args[1]
        assert params['p_event_id'] == EVENT_UUID
        assert params['p_sessions'] is None
        assert params['p_event']['ws_dates'] is None
        sb.table.return_value.update.assert_not_called()

    def test_ws_datesを送らない更新はDBの今の値を残す(self):
        """本文に ws_dates の項目が無ければ、DB 関数に ws_dates のキーを渡さないこと（今の値のまま）。

        古い画面が ws_dates を送らなくても、既定の None で実施日の設定を消さないため。

        Returns:
            なし。
        """
        # 1. ws_dates の項目を含めずに更新する。
        resp, sb, _ = _save_event('put', EVENT_BODY)
        assert resp.status_code == 200
        assert 'ws_dates' not in sb.rpc.call_args.args[1]['p_event']

    def test_ws_datesを送らず時間枠を送るときはDB関数の確認に任せる(self):
        """実施日が送られていなければ今の値と比べる必要があるので、日付付きの枠でも先に 422 にせず DB 関数に渡すこと。

        Returns:
            なし。
        """
        # 1. ws_dates なし・日付付きの枠で更新する。
        resp, sb, _ = _save_event('put', {**EVENT_BODY, 'sessions': [{'time_label': '10:00', 'session_date': '2026-10-23'}]})
        assert resp.status_code == 200
        assert sb.rpc.call_args.args[1]['p_sessions'][0]['session_date'] == '2026-10-23'

    def test_時間枠なしの更新で枠の日付が合わなくなればDB関数の文言で422(self):
        """DB 関数が P0422（時間枠も一緒に保存してください）を出したら、その文言で 422 にし、画像を変えないこと。

        Returns:
            なし。
        """
        # 1. 今の枠が新しい実施日と合わない例外を出させる。
        # 変数の内容: message: DB 関数の文言。
        message = '時間枠の日付がワークショップの実施日と合わなくなります。時間枠も一緒に保存してください'
        resp, sb, _ = _save_event('put', {**EVENT_BODY, 'ws_dates': ['2026-10-23']}, rpc_error=_pg_error('P0422', message))
        assert resp.status_code == 422
        assert resp.json()['detail'] == message
        sb.table.return_value.delete.assert_not_called()

    def test_UUIDの形でないidの更新は404でDB関数を呼ばない(self):
        """UUID の形でない id の更新は、DB 関数を呼ばずに 404 にすること。

        Returns:
            なし。
        """
        # 1. UUID の形でない id で更新する。
        # 変数の内容: sb: admin_supabase のモック。
        sb = MagicMock()
        with as_admin(), patch('app.routes.events.admin_supabase', sb):
            # 変数の内容: resp: 応答。
            resp = TestClient(app).put('/api/events/not-a-uuid', json=EVENT_BODY)
        assert resp.status_code == 404
        sb.rpc.assert_not_called()

    def test_時間枠の日付が実施日に合わなければ422でDB関数を呼ばない(self):
        """保存後の実施日（送られた ws_dates）に無い日の枠は 422 で、何も保存しないこと。

        Returns:
            なし。
        """
        # 1. 実施日 10/23 だけのイベントに、10/24 の枠を送る。
        resp, sb, _ = _save_event('put', {**EVENT_BODY, 'ws_dates': ['2026-10-23'],
                                          'sessions': [{'time_label': '10:00', 'session_date': '2026-10-24'}]})
        assert resp.status_code == 422
        sb.rpc.assert_not_called()
        sb.table.return_value.delete.assert_not_called()

    def test_移し先の無い予約があれば409で画像も変えない(self):
        """DB 関数が P0409 を出したら 409（detail・conflicts）を返し、画像の削除・保存もしないこと。

        Returns:
            なし。
        """
        # 1. 移し先の無い予約の例外を出させる。
        # 変数の内容: conflicts: DB 関数の DETAIL に入る一覧。
        conflicts = [{'date': None, 'time_label': '13:00〜', 'count': 1, 'participants': 2}]
        resp, sb, get_event = _save_event(
            'put', {**EVENT_BODY, 'sessions': []},
            rpc_error=_pg_error('P0409', 'reservation_conflict', json.dumps(conflicts)))
        assert resp.status_code == 409
        assert resp.json() == {'detail': CONFLICT_DETAIL, 'conflicts': conflicts}
        sb.table.return_value.delete.assert_not_called()
        sb.table.return_value.insert.assert_not_called()
        get_event.assert_not_called()

    def test_409のDETAILが読めなくても409を返す(self):
        """DETAIL が JSON でなくても、conflicts を空にして 409 を返すこと。

        Returns:
            なし。
        """
        # 1. 壊れた DETAIL で例外を出させる。
        resp, _, _ = _save_event('put', {**EVENT_BODY, 'sessions': []},
                                 rpc_error=_pg_error('P0409', 'reservation_conflict', 'not json'))
        assert resp.status_code == 409
        assert resp.json() == {'detail': CONFLICT_DETAIL, 'conflicts': []}

    def test_DB関数がイベントなしなら404(self):
        """更新で DB 関数が P0404 を出したら 404 にし、画像を変えないこと。

        Returns:
            なし。
        """
        # 1. イベントなしの例外を出させる。
        resp, sb, _ = _save_event('put', {**EVENT_BODY, 'sessions': []}, rpc_error=_pg_error('P0404', 'event_not_found'))
        assert resp.status_code == 404
        sb.table.return_value.delete.assert_not_called()

    def test_DB関数の予期しない失敗は500(self):
        """DB 関数の予期しない例外は、そのまま 500 にすること（握りつぶさない）。

        Returns:
            なし。
        """
        # 1. 予期しない例外を出させる（アプリの共通の処理が 500 の応答にする）。画像は変えない。
        resp, sb, _ = _save_event('put', {**EVENT_BODY, 'sessions': []}, rpc_error=RuntimeError('db down'))
        assert resp.status_code == 500
        sb.table.return_value.delete.assert_not_called()


# ---------------------------------------------------------------------------
# 状態の変更（PATCH /api/reserves/{id}）でのキャンセルからの戻し（指摘 3）
# ---------------------------------------------------------------------------

class TestReinstateSessionDate:
    """キャンセルから戻すときは DB 関数 reinstate_reservation を呼び、その例外を HTTP の応答に変える（指摘 2・3）。"""

    # キャンセル済みで、予約日 10/23 のまま 10/23 の枠を指している予約
    ROW = {'id': 'r1', 'status': 'cancelled', 'session_id': 'session-23', 'event_id': 'event-1',
           'participants': 1, 'preferred_date': '2026-10-23', 'name': '山田', 'email': 'yamada@example.com'}

    def _patch(self, row: dict, rpc_error: Optional[Exception] = None):
        """予約の状態を pending に変える API を管理者として呼ぶ。

        Args:
            row: 今の予約の行
            rpc_error: DB 関数 reinstate_reservation に出させる例外（None なら成功）

        Returns:
            (応答, 予約の表のモック, admin_supabase のモック)
        """
        # 1. 予約の表と DB 関数を用意して呼ぶ。
        # 変数の内容: reservations: 予約の表のモック、client: admin_supabase のモック。
        reservations = _table_mock(single_data=dict(row))
        client = _db({'workshop_reservations': reservations, 'ws_sessions': _table_mock(single_data=dict(SESSION_23))})
        client.rpc.return_value.execute.return_value.data = {**row, 'status': 'pending'}
        if rpc_error is not None:
            client.rpc.return_value.execute.side_effect = rpc_error
        with as_admin(), patch('app.routes.reserve.admin_supabase', client), \
             patch('app.routes.reserve.HABITAT_RESEND_API_KEY', ''):
            return TestClient(app).patch('/api/reserves/r1', json={'status': 'pending'}), reservations, client

    @pytest.mark.parametrize('row', [ROW, {**ROW, 'session_id': None}], ids=['枠あり', '枠なし'])
    def test_キャンセルから戻すときはDB関数で戻し表を直接更新しない(self, row):
        """枠の有無にかかわらず DB 関数 reinstate_reservation で戻し、状態を直接 UPDATE しないこと。

        Args:
            row: 今の予約の行。

        Returns:
            なし。
        """
        # 1. 戻す。
        resp, reservations, client = self._patch(row)
        assert resp.status_code == 200
        assert resp.json()['status'] == 'pending'
        client.rpc.assert_called_once_with('reinstate_reservation', {'p_reservation_id': 'r1', 'p_status': 'pending'})
        reservations.update.assert_not_called()

    @pytest.mark.parametrize('code, status, message', [
        ('P0412', 400, '実施していません'),
        ('P0410', 400, '選んだ日には使えません'),
        ('P0411', 400, '時間枠が正しくありません'),
        ('P0413', 409, '満席のため'),
        ('P0404', 404, 'Not found'),
    ])
    def test_DB関数の例外を応答に変える(self, code, status, message):
        """DB 関数の例外（実施しない日・別の日の枠・枠なし・満席・予約なし）を、決まった応答に変えること。

        Args:
            code: DB 関数が出す SQLSTATE。
            status: 期待する HTTP の状態コード。
            message: 応答の文言に含まれるはずの言葉。

        Returns:
            なし。
        """
        # 1. DB 関数に例外を出させる。
        resp, _, _ = self._patch(self.ROW, rpc_error=_pg_error(code, 'reinstate'))
        assert resp.status_code == status
        assert message in resp.json()['detail']

    def test_DB関数の予期しない失敗は500(self):
        """DB 関数の予期しない例外は 500 にすること（握りつぶさない）。

        Returns:
            なし。
        """
        # 1. 予期しない例外を出させる。
        resp, _, _ = self._patch(self.ROW, rpc_error=RuntimeError('db down'))
        assert resp.status_code == 500

    def test_枠なしの予約の保存で実施しない日ならトリガーの例外を400にする(self):
        """予約の保存（INSERT）でトリガーが P0412（実施日を外す保存と重なった）を出したら、400 にすること。

        Returns:
            なし。
        """
        # 1. 枠0件の日（10/25）の予約の保存で、トリガーの例外を出させる。
        # 変数の内容: reservations: 予約の表のモック。
        reservations = _table_mock()
        reservations.insert.return_value.execute.side_effect = _pg_error('P0412', 'reservation_not_workshop_day')
        admin_sb = _db({'ws_sessions': _sessions_table([SESSION_23]), 'workshop_reservations': reservations})
        resp = _post({**BASE_REQUEST, 'preferred_date': '2026-10-25'}, _public_sb(WS_EVENT), admin_sb)
        assert resp.status_code == 400
        assert '実施していません' in resp.json()['detail']


# ---------------------------------------------------------------------------
# 状態を読んだあとでキャンセルされる場合・枠を足されたあとの枠なしの予約（Codex 4 回目の指摘 1・2）
# ---------------------------------------------------------------------------

class TestStatusChangeAlwaysThroughFunction:
    """キャンセル以外への状態の変更は、前に読んだ状態にかかわらず DB 関数 reinstate_reservation を通す。"""

    # 前に読んだときは受付済（confirmed）だった予約
    ROW = {'id': 'r1', 'status': 'confirmed', 'session_id': 'session-23', 'event_id': 'event-1',
           'participants': 1, 'preferred_date': '2026-10-23', 'name': '山田', 'email': 'yamada@example.com'}

    def _patch(self, row: dict, new_status: str, rpc_error: Optional[Exception] = None,
               update_error: Optional[Exception] = None):
        """予約の状態を変える API を管理者として呼ぶ。

        Args:
            row: 前に読む予約の行
            new_status: 新しい状態
            rpc_error: DB 関数 reinstate_reservation に出させる例外
            update_error: 状態の更新（update）に出させる例外（キャンセルへの変更の経路）

        Returns:
            (応答, 予約の表のモック, admin_supabase のモック)
        """
        # 1. 予約の表と DB 関数を用意して呼ぶ。
        # 変数の内容: reservations: 予約の表のモック、client: admin_supabase のモック。
        reservations = _table_mock(single_data=dict(row), update_data=[{**row, 'status': new_status}])
        if update_error is not None:
            reservations.update.return_value.eq.return_value.execute.side_effect = update_error
        client = _db({'workshop_reservations': reservations, 'ws_sessions': _table_mock(single_data=dict(SESSION_23))})
        client.rpc.return_value.execute.return_value.data = {**row, 'status': new_status}
        if rpc_error is not None:
            client.rpc.return_value.execute.side_effect = rpc_error
        with as_admin(), patch('app.routes.reserve.admin_supabase', client), \
             patch('app.routes.reserve.HABITAT_RESEND_API_KEY', ''):
            return TestClient(app).patch('/api/reserves/r1', json={'status': new_status}), reservations, client

    def test_読んだあとでキャンセルされていたらDB関数が満席を確かめ409(self):
        """confirmed と読んだあとに別のリクエストがキャンセルしても、DB 関数を通すので満席（P0413）なら 409 になること。

        表を直接 UPDATE しない（直接 UPDATE すると、満席の確認をすり抜け、日程の保存と行き詰まる）。

        Returns:
            なし。
        """
        # 1. 読んだときは confirmed。DB 関数はロックを取ったあとにキャンセルを見つけて満席で断る。
        resp, reservations, client = self._patch(self.ROW, 'pending', rpc_error=_pg_error('P0413', 'session_full'))
        assert resp.status_code == 409
        assert '満席' in resp.json()['detail']
        client.rpc.assert_called_once_with('reinstate_reservation', {'p_reservation_id': 'r1', 'p_status': 'pending'})
        reservations.update.assert_not_called()

    @pytest.mark.parametrize('before, after', [('confirmed', 'pending'), ('pending', 'confirmed')])
    def test_キャンセル以外どうしの変更もDB関数で行う(self, before, after):
        """キャンセル以外どうしの変更も DB 関数で行い、表を直接 UPDATE しないこと。

        Args:
            before: 前に読んだ状態。
            after: 新しい状態。

        Returns:
            なし。
        """
        # 1. 状態を変える。
        resp, reservations, client = self._patch({**self.ROW, 'status': before}, after)
        assert resp.status_code == 200
        assert resp.json()['status'] == after
        client.rpc.assert_called_once_with('reinstate_reservation', {'p_reservation_id': 'r1', 'p_status': after})
        reservations.update.assert_not_called()

    def test_キャンセルへの変更は状態だけを変えDB関数を呼ばない(self):
        """キャンセルへの変更は、確かめることが無いので表の状態だけを変え、DB 関数を呼ばないこと。

        Returns:
            なし。
        """
        # 1. キャンセルにする。
        resp, reservations, client = self._patch(self.ROW, 'cancelled')
        assert resp.status_code == 200
        reservations.update.assert_called_once_with({'status': 'cancelled'})
        client.rpc.assert_not_called()

    def test_関数を通さない戻しのトリガーの例外は409(self):
        """状態の更新で DB のトリガーが P0414（戻しは関数を通す）を出したら、読み込み直しを促す 409 にすること。

        Returns:
            なし。
        """
        # 1. キャンセルへの更新でトリガーの例外を出させる（ふつうは起きないが、変換を確かめる）。
        resp, _, _ = self._patch(self.ROW, 'cancelled', update_error=_pg_error('P0414', 'reinstate_requires_function'))
        assert resp.status_code == 409
        assert '読み込み直して' in resp.json()['detail']


class TestSessionAddedAfterCheck:
    """枠なしの予約を確かめたあとで枠が足された場合（トリガーの P0411）と、当日参加の目印。"""

    def _reserve(self, insert_error: Exception):
        """枠0件の日（10/25）に時間枠なしで予約し、保存でトリガーの例外を出させる。

        Args:
            insert_error: 保存（insert）で出させる例外

        Returns:
            応答
        """
        # 1. アプリの確認では枠0件（10/25 に枠なし）で、保存のときにトリガーが止める。
        # 変数の内容: reservations: 予約の表のモック。
        reservations = _table_mock()
        reservations.insert.return_value.execute.side_effect = insert_error
        admin_sb = _db({'ws_sessions': _sessions_table([SESSION_23]), 'workshop_reservations': reservations})
        return _post({**BASE_REQUEST, 'preferred_date': '2026-10-25'}, _public_sb(WS_EVENT), admin_sb)

    def test_確かめたあとで枠が足されたら時間枠を選んでくださいの400(self):
        """トリガーが「その日に枠があるのに枠なし」（P0411・reservation_session_required）で止めたら、
        「時間枠を選んでください」の 400 にすること。

        Returns:
            なし。
        """
        # 1. トリガーの例外を出させる。
        resp = self._reserve(_pg_error('P0411', 'reservation_session_required'))
        assert resp.status_code == 400
        assert resp.json()['detail'] == '時間枠を選んでください'

    def test_そのほかのP0411は今までの文言の400(self):
        """枠が無い・別のイベントの枠（P0411 の reservation_session_invalid）は、今までの文言の 400 のままにすること。

        Returns:
            なし。
        """
        # 1. 枠の誤りの例外を出させる。
        resp = self._reserve(_pg_error('P0411', 'reservation_session_invalid'))
        assert resp.status_code == 400
        assert resp.json()['detail'] == 'ワークショップの時間枠が正しくありません'

    def test_当日参加は当日参加の目印を付けて保存する(self):
        """当日参加は is_walkin=True で保存すること（トリガーが当日参加だけ枠なしを認めるため）。

        Returns:
            なし。
        """
        # 1. 枠なしで当日参加を登録する。
        reservations = _table_mock()
        resp = _walkin({'event_id': 'event-1', 'participants': 1, 'preferred_date': '2026-10-23', 'preferred_time': '13:00ごろ'},
                       {'events': _table_mock(single_data=dict(WS_EVENT)), 'workshop_reservations': reservations})
        assert resp.status_code == 200
        # 変数の内容: saved: 保存された当日参加の内容。
        saved = reservations.insert.call_args.args[0]
        assert saved['is_walkin'] is True
        assert saved['session_id'] is None

    def test_公開の予約は当日参加の目印を付けられない(self):
        """公開の予約の本文に is_walkin を入れても、保存する内容には入らないこと（入力の形に無い項目は捨てる）。

        Returns:
            なし。
        """
        # 1. is_walkin を付けて予約する（10/25 は枠0件なので、枠なしで受け付ける）。
        reservations = _table_mock()
        admin_sb = _db({'ws_sessions': _sessions_table([SESSION_23]), 'workshop_reservations': reservations})
        resp = _post({**BASE_REQUEST, 'preferred_date': '2026-10-25', 'is_walkin': True}, _public_sb(WS_EVENT), admin_sb)
        assert resp.status_code == 200
        assert 'is_walkin' not in reservations.insert.call_args.args[0]
