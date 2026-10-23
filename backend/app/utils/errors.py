"""ログに出す例外の要約の共通部品。"""
from typing import Any


def error_summary(e: BaseException) -> str:
    """例外を「型名（コード）」の短い文字列にする。

    メール送信や DB の例外の文字列には、メールアドレス・氏名などの個人情報が入ることがあるため、
    個人情報を扱う処理のログには例外の文字列ではなくこれを出す。

    Args:
        e: 例外

    Returns:
        例 'APIError(code=23505)'・'ConnectionError'
    """
    code: Any = getattr(e, 'code', None) or getattr(e, 'status_code', None)
    name = type(e).__name__
    return f'{name}(code={code})' if code else name
