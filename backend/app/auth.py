from fastapi import HTTPException, Header
from typing import Optional
from .db import supabase


def require_auth(authorization: Optional[str] = Header(None)):
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
        raise HTTPException(status_code=401, detail='Unauthorized')
