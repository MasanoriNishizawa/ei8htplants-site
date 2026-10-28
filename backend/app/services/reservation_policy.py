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
