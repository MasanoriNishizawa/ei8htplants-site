"""日付の共通部品。

イベントが「終わったか」「予約を受け付けるか」の判定はすべて日本時間（JST）の今日で行う。
サーバー（Render）の時計は UTC なので、date.today() を使うと日本の 0 時〜9 時に前日として判定してしまう。
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

# 日本時間（UTC+9）。夏時間は無いので固定の差で表す
JST = timezone(timedelta(hours=9))


def today_jst() -> str:
    """日本時間の今日の日付を 'YYYY-MM-DD' の文字列で返す。

    Returns:
        例 '2026-10-21'。DB の日付列（文字列）とそのまま大小を比べられる形
    """
    # 1. 日本時間の今日の日付を 'YYYY-MM-DD' の文字列で返す。
    return datetime.now(JST).date().isoformat()


def event_end_date(event: dict[str, Any]) -> str:
    """イベントの最終日を返す。終了日が無ければ開始日、どちらも無ければ空文字を返す。

    Args:
        event: events テーブルの行（start_date・end_date を含む dict）

    Returns:
        'YYYY-MM-DD' の文字列（無いときは ''）
    """
    # 1. イベントの最終日を返す。終了日が無ければ開始日、どちらも無ければ空文字を返す。
    return event.get('end_date') or event.get('start_date') or ''


def is_past_event(event: dict[str, Any], today: Optional[str] = None) -> bool:
    """イベントが終わっている（最終日が今日より前）かどうかを返す。

    Args:
        event: events テーブルの行
        today: 比べる今日の日付（'YYYY-MM-DD'）。省略すると日本時間の今日

    Returns:
        最終日が今日より前なら True。今日が最終日のイベントはまだ終わっていない扱い（False）
    """
    # 1. イベントが終わっている（最終日が今日より前）かどうかを返す。
    return event_end_date(event) < (today or today_jst())
