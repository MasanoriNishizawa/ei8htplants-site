"""予約可否を決める、外部状態に依存しない日付ポリシー。"""
from typing import Any, Optional

from ..utils.dates import event_end_date


def reservation_date_error(
    event: dict[str, Any],
    preferred_date: Optional[str],
    today: str,
) -> Optional[str]:
    """イベントの受付期間と希望日を検証し、予約不可の理由を返す。

    Args:
        event: events テーブルの行（start_date・end_date を含む dict）
        preferred_date: 予約日（YYYY-MM-DD）。None なら希望日の検証をしない
        today: 日付比較に使う基準日（YYYY-MM-DD）。呼び出し側が日本時間の日付を渡す

    Returns:
        予約不可の場合は既存 API の日本語エラー detail、予約可能なら None
    """
    # 変数の内容: end: event_end_date の既存仕様に基づくイベント最終日。
    end = event_end_date(event)
    # 1. イベント最終日が今日より前なら、予約受付終了の理由を返す。
    if end < today:
        return 'このイベントの予約受付は終了しています'
    # 2. 希望日が無い場合は、イベント自体の受付期間だけを確認して成功とする。
    if not preferred_date:
        return None
    # 変数の内容: start: イベント開始日。未設定の場合は空文字列として扱う。
    start = event.get('start_date') or ''
    # 3. 希望日が開始日から最終日の範囲外なら、その理由を返す。
    if not (start <= preferred_date <= end):
        return '予約日がイベントの開催期間外です'
    # 4. 開催期間内でも希望日が今日より前なら、当日の受付終了理由を返す。
    if preferred_date < today:
        return 'この日の予約受付は終了しています'
    # 5. すべての条件を通過した場合は予約可能とする。
    return None


def is_multi_day_event(event: dict[str, Any]) -> bool:
    """イベントが複数日（終了日が開始日より後）かどうかを返す。

    Args:
        event: events テーブルの行（start_date・end_date を含む dict）

    Returns:
        end_date があり start_date より後なら True。1 日だけのイベント（end_date が NULL・同じ日）は False
    """
    # 1. 開始日と終了日を文字列のまま比べる（どちらも YYYY-MM-DD なので大小がそのまま日付の前後になる）。
    #    文字列でない値（壊れたデータ）は日付が無いものとして扱い、1 日のイベントとみなす。
    # 変数の内容: start: 開始日、end: 終了日（1 日だけのイベントは None）。
    start = event.get('start_date')
    end = event.get('end_date')
    if not isinstance(start, str) or not isinstance(end, str):
        return False
    return bool(start and end and end > start)


def effective_ws_dates(event: dict[str, Any]) -> Optional[list[str]]:
    """ワークショップの実施日の一覧（events.ws_dates）のうち、効き目のあるものを返す。

    ws_dates が効くのは「has_workshop が true」かつ「複数日のイベント」のときだけ。
    それ以外（NULL・配列でない・1 日のイベント・ワークショップなし）は None（＝全日程で実施）を返す。

    Args:
        event: events テーブルの行（has_workshop・start_date・end_date・ws_dates を含む dict）

    Returns:
        実施日（YYYY-MM-DD）のリスト。全日程で実施するときは None
    """
    # 1. ワークショップが無い・1 日のイベントなら、ws_dates は使わない。
    if not event.get('has_workshop') or not is_multi_day_event(event):
        return None
    # 2. 配列でない（NULL を含む）なら全日程とみなす。
    # 変数の内容: raw: DB に保存された ws_dates の値（jsonb を読んだもの）。
    raw = event.get('ws_dates')
    if not isinstance(raw, list):
        return None
    # 3. 文字列の要素だけを返す（壊れた値が混ざっていても例外にしない）。
    # 変数の内容: d: ws_dates の要素。
    return [d for d in raw if isinstance(d, str)]


def is_workshop_day(event: dict[str, Any], day: str) -> bool:
    """指定した日がワークショップを実施する日かどうかを返す。

    実施しない日:
    - has_workshop が false のイベント
    - 開催期間（start_date〜最終日）の外
    - ws_dates があり、その中に無い日

    Args:
        event: events テーブルの行（has_workshop・start_date・end_date・ws_dates を含む dict）
        day: 確かめる日（YYYY-MM-DD）

    Returns:
        ワークショップを実施する日なら True
    """
    # 1. ワークショップの無いイベントは、どの日も実施しない。
    if not event.get('has_workshop'):
        return False
    # 2. 開催期間の外の日は実施しない。
    # 変数の内容: start: 開始日、end: 最終日（終了日が無ければ開始日）。
    start = event.get('start_date') or ''
    end = event_end_date(event)
    if not (start <= day <= end):
        return False
    # 3. 実施日の指定があれば、その中にある日だけ実施する（指定が無ければ全日程）。
    # 変数の内容: ws_dates: 効き目のある実施日の一覧（None なら全日程）。
    ws_dates = effective_ws_dates(event)
    return ws_dates is None or day in ws_dates


def is_session_available_on(session: dict[str, Any], day: str) -> bool:
    """時間枠がその日に使えるかどうかを返す。

    session_date が NULL の枠は全日程で共通なので、どの日でも使える。日付のある枠はその日だけ使える。

    Args:
        session: ws_sessions の行（session_date を含む dict。古い行で列が無ければ NULL 扱い）
        day: 確かめる日（YYYY-MM-DD）

    Returns:
        その日に使える枠なら True
    """
    # 1. 枠の日付が無ければ共通の枠、あればその日と同じときだけ使える。
    # 変数の内容: session_date: 枠を使う日（NULL なら全日程）。
    session_date = session.get('session_date')
    return session_date is None or session_date == day
