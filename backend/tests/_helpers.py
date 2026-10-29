"""テストで共通に使う小さな部品。

- PostgREST の「見つからない」例外（PGRST116・22P02）を作る
- 管理者ログイン（optional_auth / require_auth）を差し替える
"""
from contextlib import contextmanager
from typing import Iterator

from app.auth import optional_auth, require_auth
from app.main import app


class PostgrestError(Exception):
    """postgrest の APIError の代わり。code 属性だけを持つ。"""

    def __init__(self, code: str, message: str = 'postgrest error') -> None:
        """例外を作る。

        Args:
            code: PostgREST / PostgreSQL のエラーコード（例 'PGRST116'）
            message: 例外の文字列

        Returns:
            なし。"""
        # 1. 例外を作る。
        super().__init__(message)
        # db_utils が見るエラーコード
        self.code = code


def not_found_error() -> PostgrestError:
    """single() で 0 件だったときの例外（PGRST116）を返す。

    Returns:
        code='PGRST116' の例外
    """
    # 1. single() で 0 件だったときの例外（PGRST116）を返す。
    return PostgrestError('PGRST116', 'JSON object requested, multiple (or no) rows returned')


def invalid_uuid_error() -> PostgrestError:
    """uuid 列に UUID でない文字列を渡したときの例外（22P02）を返す。

    Returns:
        code='22P02' の例外
    """
    # 1. uuid 列に UUID でない文字列を渡したときの例外（22P02）を返す。
    return PostgrestError('22P02', 'invalid input syntax for type uuid')


@contextmanager
def as_admin() -> Iterator[None]:
    """with の中だけ管理者としてログインしている扱いにする（optional_auth=True・require_auth を通す）。

    Yields:
        なし

    Returns:
        なし。
    """
    # 1. 依存関数を差し替える
    app.dependency_overrides[optional_auth] = lambda: True
    app.dependency_overrides[require_auth] = lambda: None
    try:
        yield
    finally:
        # 2. 元に戻す
        app.dependency_overrides.pop(optional_auth, None)
        app.dependency_overrides.pop(require_auth, None)
