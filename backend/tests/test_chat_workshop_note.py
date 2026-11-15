"""
AI コンシェルジュに渡すイベント情報のワークショップの案内（予約の要否・実施日）のテスト。
対象: backend/app/routes/chat.py（_workshop_note・_build_site_context）

- ワークショップなしは何も付けない
- ws_requires_reservation が false なら「予約不要」、true・列なしなら「要予約」
- ws_dates があれば実施日を添える（1 日のイベント・NULL では添えない）
- _build_site_context のイベントの行に案内が入る

DB（supabase・admin_supabase）はモック。今日は today_jst をパッチして固定する。
"""
from unittest.mock import MagicMock, patch

import pytest

from app.routes.chat import _build_site_context, _workshop_note

# ワークショップありの複数日イベント（11/02〜11/05）
WS_EVENT = {
    'name': '秋のマーケット', 'start_date': '2026-11-02', 'end_date': '2026-11-05', 'time': '10:00〜17:00',
    'location': '会場', 'has_workshop': True, 'ws_requires_reservation': True, 'ws_dates': None,
}


class TestWorkshopNote:
    """_workshop_note の文言。"""

    def test_ワークショップなしは何も付けない(self):
        """has_workshop が false なら空文字になること。

        Returns:
            なし。
        """
        # 1. ワークショップなしのイベントで確かめる。
        assert _workshop_note({**WS_EVENT, 'has_workshop': False, 'ws_dates': ['2026-11-03']}) == ''

    @pytest.mark.parametrize('override, expected', [
        ({'ws_requires_reservation': True}, '（ワークショップあり・要予約）'),
        ({'ws_requires_reservation': False}, '（ワークショップあり・予約不要）'),
        ({'ws_requires_reservation': None}, '（ワークショップあり・要予約）'),
    ])
    def test_予約の要否で文言が変わる(self, override, expected):
        """予約不要なら「予約不要」、それ以外は今までどおり「要予約」になること。

        Args:
            override: WS_EVENT に上書きする項目。
            expected: 期待する文言。

        Returns:
            なし。
        """
        # 1. 実施日の指定なし（全日程）で確かめる。
        assert _workshop_note({**WS_EVENT, **override}) == expected

    def test_実施日があれば添える(self):
        """ws_dates があれば「ワークショップ実施日: 日付・日付」を続けること。

        Returns:
            なし。
        """
        # 1. 実施日を 2 日指定して確かめる。
        assert _workshop_note({**WS_EVENT, 'ws_dates': ['2026-11-03', '2026-11-05']}) == \
            '（ワークショップあり・要予約）ワークショップ実施日: 2026-11-03・2026-11-05'

    def test_1日のイベントでは実施日を添えない(self):
        """ws_dates が効かない 1 日のイベントでは、実施日を添えないこと。

        Returns:
            なし。
        """
        # 1. 終了日なしで実施日を持つ（壊れた）データで確かめる。
        assert _workshop_note({**WS_EVENT, 'end_date': None, 'ws_dates': ['2026-11-02']}) == '（ワークショップあり・要予約）'


def test_サイトの情報のイベントの行に予約不要と実施日が入る():
    """_build_site_context のイベントの説明文に、予約不要と実施日が入ること。

    Returns:
        なし。
    """
    # 1. events だけ 1 件返し、ほかの表は空にする。
    # 変数の内容: sb: 公開用 DB のモック、admin_sb: 管理用 DB のモック、event: 予約不要・実施日ありのイベント。
    event = {**WS_EVENT, 'ws_requires_reservation': False, 'ws_dates': ['2026-11-03', '2026-11-05']}
    sb = MagicMock()
    sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = [event]
    sb.table.return_value.select.return_value.eq.return_value.gt.return_value.order.return_value.execute.return_value.data = []
    admin_sb = MagicMock()
    admin_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    # 2. 今日を開催前に固定して組み立てる。
    with patch('app.routes.chat.supabase', sb), patch('app.routes.chat.admin_supabase', admin_sb), \
         patch('app.routes.chat.today_jst', return_value='2026-10-01'):
        # 変数の内容: text: 組み立てたサイトの情報。
        text = _build_site_context()
    assert '- 秋のマーケット：2026-11-02〜2026-11-05 10:00〜17:00、会場（ワークショップあり・予約不要）' \
           'ワークショップ実施日: 2026-11-03・2026-11-05' in text
