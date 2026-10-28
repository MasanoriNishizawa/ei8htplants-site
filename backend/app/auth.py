"""管理者のログイン（Supabase Auth のアクセストークン）を確かめる FastAPI の依存関数。"""
from typing import Optional

from fastapi import Header, HTTPException

from .db import supabase

# Authorization ヘッダーの先頭に付く文字列
_BEARER_PREFIX = 'Bearer '


def _verify_bearer(authorization: str) -> None:
    """'Bearer <トークン>' の形のヘッダーを Supabase で確かめる。

    Args:
        authorization: Authorization ヘッダーの値

    Raises:
        HTTPException(401): 形が違う・トークンが無効・Supabase の呼び出しに失敗した場合

    Returns:
        なし。
    """
    # 1. 形を確かめる
    if not authorization.startswith(_BEARER_PREFIX):
        raise HTTPException(status_code=401, detail='Unauthorized')
    # 変数の内容: token: 認証に使うトークン。
    token = authorization.removeprefix(_BEARER_PREFIX)
    # 2. Supabase でトークンを確かめる。SDK が投げる例外も 401 にそろえる
    try:
        # 変数の内容: result: Supabase Auth が返す検証済みユーザー情報。
        result = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail='Unauthorized')
    # 3. ユーザーが取れなければ無効
    if not result or not getattr(result, 'user', None):
        raise HTTPException(status_code=401, detail='Unauthorized')


def require_auth(authorization: Optional[str] = Header(None)) -> None:
    """管理者のログインを必須にする依存関数。ログインしていなければ 401 を返す。

    Args:
        authorization: Authorization リクエストヘッダーの値（'Bearer <トークン>'）

    Raises:
        HTTPException(401): ヘッダーが無い・形が違う・トークンが無効な場合

    Returns:
        なし。
    """
    if not authorization:
        raise HTTPException(status_code=401, detail='Unauthorized')
    _verify_bearer(authorization)


def optional_auth(authorization: Optional[str] = Header(None)) -> bool:
    """ログインは任意で、管理者としてログインしているかどうかを返す依存関数。

    公開と管理画面で同じ API を使い、管理者にだけ非公開のデータも返すときに使う。
    Authorization ヘッダーが無ければ未ログイン（False）。ヘッダーがあるのにトークンが
    無効なときは、期限切れに気づけるよう 401 を返す。

    Args:
        authorization: Authorization リクエストヘッダーの値

    Returns:
        有効なトークンがあれば True、ヘッダーが無ければ False

    Raises:
        HTTPException(401): ヘッダーはあるがトークンが無効な場合
    """
    if not authorization:
        return False
    _verify_bearer(authorization)
    return True
