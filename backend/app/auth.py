from fastapi import HTTPException, Header
from typing import Optional
from .db import supabase


# Authorizationヘッダーのトークンを検証し、未認証の場合は401を返す依存関数
def require_auth(authorization: Optional[str] = Header(None)):
    """Authorization ヘッダーの Bearer トークンを検証する FastAPI 依存関数。

    Supabase の get_user でトークンの有効性を確認し、無効な場合は 401 を返す。
    Supabase SDK が投げる例外はすべて 401 に統一して返す。

    Args:
        authorization: Authorization リクエストヘッダーの値

    Raises:
        HTTPException(401): トークンがない、形式が不正、または無効な場合
    """
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Unauthorized')
    token = authorization.removeprefix('Bearer ')
    try:
        result = supabase.auth.get_user(token)
        if not result.user:
            raise HTTPException(status_code=401, detail='Unauthorized')
    except HTTPException:
        raise
    except Exception:
        # Supabase SDK が投げる例外も401に統一して返す
        raise HTTPException(status_code=401, detail='Unauthorized')
