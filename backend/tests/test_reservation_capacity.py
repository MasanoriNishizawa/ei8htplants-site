"""予約時間枠の人数集計と予約検索条件のテスト。"""

from unittest.mock import MagicMock, call, patch

import pytest

from app.routes.reserve import _session_used_count
from app.services.reservation_capacity import count_session_reservations


SESSION = {'id': 'session-1', 'time_label': '10:00'}


class TestCountSessionReservations:
    """検索済み予約から指定時間枠の人数だけを集計する。"""

    @pytest.mark.parametrize(
        ('reservations', 'expected'),
        [
            pytest.param(
                [
                    {'session_id': 'session-1', 'participants': 2},
                    {'session_id': 'session-1', 'participants': 3},
                ],
                5,
                id='同じ時間枠の予約人数を合算',
            ),
            pytest.param(
                [
                    {'session_id': 'session-1', 'participants': 2},
                    {'session_id': 'session-2', 'participants': 7},
                ],
                2,
                id='別時間枠の予約を除外',
            ),
            pytest.param(
                [
                    {'session_id': None, 'preferred_time': '10:00', 'participants': 2},
                    {'session_id': None, 'preferred_time': '11:00', 'participants': 7},
                ],
                2,
                id='旧予約は希望時間が一致する場合だけ加算',
            ),
            pytest.param(
                [{'session_id': 'session-1'}],
                1,
                id='参加人数が未設定なら1人として加算',
            ),
            pytest.param(
                [{'session_id': 'session-1', 'participants': None}],
                1,
                id='参加人数がNoneなら1人として加算',
            ),
            pytest.param(
                [{'session_id': 'session-1', 'participants': 0}],
                1,
                id='参加人数が0なら1人として加算',
            ),
            pytest.param([], 0, id='予約一覧が空なら0人'),
        ],
    )
    def test_指定時間枠の予約人数を集計する(self, reservations, expected):
        """時間枠一致条件と `participants or 1` の人数規則を確認する。

        Args:
            reservations: 集計対象と集計対象外を含む予約行の一覧。
            expected: 指定時間枠に含まれる参加人数の期待値。

        Returns:
            なし。
        """
        # 1. 検索済みの予約行と時間枠を集計関数に渡す。
        actual = count_session_reservations(reservations, SESSION)

        # 2. 指定時間枠だけが従来の人数規則で合算されたことを確かめる。
        assert actual == expected


class TestSessionUsedCountQuery:
    """予約枠人数を取得するDB検索の絞り込み条件を確認する。"""

    @pytest.mark.parametrize(
        ('preferred_date', 'expected_date_call'),
        [
            pytest.param('2026-10-30', call('preferred_date', '2026-10-30'), id='予約日指定あり'),
            pytest.param(None, None, id='予約日指定なし'),
        ],
    )
    def test_イベントとキャンセル状態で絞り予約日条件は指定時だけ加える(
        self, preferred_date, expected_date_call
    ):
        """イベント ID と取消除外条件を常に付け、日付は任意で付ける。

        Args:
            preferred_date: 人数を数える予約日。None の場合は日付で絞らない。
            expected_date_call: 予約日指定時に追加される eq 呼び出し。指定なしは None。

        Returns:
            なし。
        """
        # 1. Fluent な Supabase クエリを模擬し、実行結果を空の予約一覧にする。
        query = MagicMock(name='reservation_query')
        query.select.return_value = query
        query.eq.return_value = query
        query.neq.return_value = query
        query.execute.return_value.data = []
        admin_supabase_mock = MagicMock(name='admin_supabase')
        admin_supabase_mock.table.return_value = query

        # 2. DB クライアントを差し替えて人数集計を実行する。
        with patch('app.routes.reserve.admin_supabase', admin_supabase_mock):
            result = _session_used_count('event-1', SESSION, preferred_date)

        # 3. 予約行が空なら0人で、常時条件と日付条件の有無が仕様どおりと確かめる。
        assert result == 0
        admin_supabase_mock.table.assert_called_once_with('workshop_reservations')
        query.select.assert_called_once_with('session_id, participants, preferred_time')
        query.eq.assert_any_call('event_id', 'event-1')
        query.neq.assert_called_once_with('status', 'cancelled')
        date_calls = [item for item in query.eq.call_args_list if item.args[0] == 'preferred_date']
        if expected_date_call is None:
            assert date_calls == []
        else:
            assert date_calls == [expected_date_call]
