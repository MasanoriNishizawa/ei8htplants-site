"""検索済み予約データから時間枠の使用人数を集計する関数。"""

from typing import Any, Iterable, Mapping


def count_session_reservations(
    reservations: Iterable[Mapping[str, Any]],
    session: Mapping[str, Any],
) -> int:
    """予約行から、指定された時間枠に入っている参加人数を数える。

    Args:
        reservations: 既に検索・絞り込み済みの予約行。各行に session_id、participants、preferred_time を含む
        session: 対象の ws_sessions 行。id と time_label を含む

    Returns:
        対象の時間枠に予約済みの参加人数の合計
    """
    # 1. 集計対象の人数を 0 人で初期化する。
    # 変数の内容: used: 対象時間枠に予約済みの参加人数の合計。
    used = 0
    # 変数の内容: reservation: 時間枠との照合と人数加算を行う予約行。
    for reservation in reservations:
        # 2. セッション ID が一致する行、または ID が無い旧形式で表示時刻が一致する行を数える。
        # 変数の内容: reservation_session_id: 予約行に記録された時間枠 ID。旧形式では未設定。
        reservation_session_id = reservation.get('session_id')
        if reservation_session_id == session['id'] or (
            not reservation_session_id
            and reservation.get('preferred_time') == session['time_label']
        ):
            # 3. 参加人数が未設定または falsy の場合は、従来どおり 1 人として加算する。
            used += reservation.get('participants') or 1
    # 4. 対象時間枠の合計人数を返す。
    return used
