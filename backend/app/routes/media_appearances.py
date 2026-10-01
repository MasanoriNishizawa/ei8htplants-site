from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/media-appearances', tags=['media_appearances'])


class MediaAppearanceBody(BaseModel):
    title: str
    youtube_url: str
    description: Optional[str] = None
    published_at: Optional[str] = None
    display_order: int = 0


# メディア出演情報を公開日の新しい順で取得する
@router.get('')
def list_media_appearances():
    try:
        return supabase.table('media_appearances').select('*').order('published_at', desc=True).execute().data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# メディア出演情報を追加する（管理者のみ）
@router.post('')
def add_media_appearance(body: MediaAppearanceBody, _=Depends(require_auth)):
    try:
        return admin_supabase.table('media_appearances').insert(body.model_dump()).execute().data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# メディア出演情報を削除する（管理者のみ）
@router.delete('/{item_id}')
def delete_media_appearance(item_id: str, _=Depends(require_auth)):
    try:
        admin_supabase.table('media_appearances').delete().eq('id', item_id).execute()
        return {'ok': True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
