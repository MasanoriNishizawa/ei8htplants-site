"""ID の形を確かめる共通部品。"""
import re

# UUID の形（events・articles・products などの id 列）。
# UUID でない文字列で id 列（uuid 型）を検索すると PostgREST がエラー（22P02）を返すので、
# id で検索する前にこれで確かめる
UUID_RE = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')


def is_uuid(value: str) -> bool:
    """文字列が UUID の形かどうかを返す。

    Args:
        value: 確かめる文字列（slug や URL の一部など）

    Returns:
        UUID の形なら True
    """
    # 1. 文字列が UUID の形かどうかを返す。
    return bool(UUID_RE.match(value or ''))
