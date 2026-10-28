"""予約日ポリシーの純関数テスト。

対象: backend/app/services/reservation_policy.py
"""
import pytest

from app.services.reservation_policy import reservation_date_error


class TestReservationDateError:
    """イベントの受付状態と希望日から予約エラーを分類する。"""

    @pytest.mark.parametrize(
        ('event', 'preferred_date', 'today', 'expected_error'),
        [
            pytest.param(
                {'start_date': '2026-10-20', 'end_date': '2026-10-21'},
                None,
                '2026-10-22',
                'このイベントの予約受付は終了しています',
                id='受付終了は希望日なしより優先',
            ),
            pytest.param(
                {'start_date': '2026-10-20', 'end_date': '2026-10-21'},
                '2026-10-19',
                '2026-10-22',
                'このイベントの予約受付は終了しています',
                id='受付終了は開催期間外より優先',
            ),
            pytest.param(
                {'start_date': '2026-10-20', 'end_date': '2026-10-25'},
                '2026-10-19',
                '2026-10-22',
                '予約日がイベントの開催期間外です',
                id='開始日より前は開催期間外',
            ),
            pytest.param(
                {'start_date': '2026-10-20', 'end_date': '2026-10-25'},
                '2026-10-26',
                '2026-10-22',
                '予約日がイベントの開催期間外です',
                id='最終日より後は開催期間外',
            ),
            pytest.param(
                {'start_date': '2026-10-20', 'end_date': '2026-10-25'},
                '2026-10-21',
                '2026-10-22',
                'この日の予約受付は終了しています',
                id='開催期間内でも今日より前は受付終了',
            ),
            pytest.param(
                {'start_date': '2026-10-20', 'end_date': '2026-10-25'},
                '2026-10-22',
                '2026-10-22',
                None,
                id='希望日が今日なら予約可能',
            ),
            pytest.param(
                {'start_date': '2026-10-20', 'end_date': '2026-10-25'},
                '2026-10-25',
                '2026-10-22',
                None,
                id='希望日が最終日なら予約可能',
            ),
            pytest.param(
                {'start_date': '2026-10-20', 'end_date': '2026-10-25'},
                '2026-10-23',
                '2026-10-22',
                None,
                id='開催期間内の未来日は予約可能',
            ),
            pytest.param(
                {'start_date': '2026-10-20', 'end_date': '2026-10-25'},
                None,
                '2026-10-22',
                None,
                id='受付中なら希望日なしでも予約可能',
            ),
            pytest.param(
                {'start_date': '2026-10-20'},
                '2026-10-20',
                '2026-10-20',
                None,
                id='終了日未設定なら開始日を最終日として扱う',
            ),
        ],
    )
    def test_受付状態と希望日に応じたエラーを返す(
        self, event, preferred_date, today, expected_error
    ):
        """受付終了・開催期間外・過去日・予約可能日を分類する。

        Args:
            event: 判定対象イベントの日付情報。
            preferred_date: 予約希望日。希望日なしは None。
            today: 判定に使う基準日。
            expected_error: 期待する既存 API エラー文言。予約可能なら None。

        Returns:
            なし。
        """
        # 1. 固定した日付条件を純関数へ渡し、既存のエラー順と文言を確認する。
        assert reservation_date_error(event, preferred_date, today) == expected_error
