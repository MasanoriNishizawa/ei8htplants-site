from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/pot-artists', tags=['pot_artists'])


class PotArtistBody(BaseModel):
    name: str


# 鉢作家の一覧を登録順で取得する
@router.get('')
def list_pot_artists():
    try:
        return supabase.table('pot_artists').select('*').order('created_at').execute().data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 鉢作家を追加する（管理者のみ）
@router.post('')
def add_pot_artist(body: PotArtistBody, _=Depends(require_auth)):
    try:
        return admin_supabase.table('pot_artists').insert(body.model_dump()).execute().data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 鉢作家を削除する（管理者のみ）
@router.delete('/{artist_id}')
def delete_pot_artist(artist_id: str, _=Depends(require_auth)):
    try:
        admin_supabase.table('pot_artists').delete().eq('id', artist_id).execute()
        return {'ok': True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
