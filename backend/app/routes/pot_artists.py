from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/pot-artists', tags=['pot_artists'])


class PotArtistBody(BaseModel):
    name: str


@router.get('')
def list_pot_artists():
    return supabase.table('pot_artists').select('*').order('created_at').execute().data


@router.post('')
def add_pot_artist(body: PotArtistBody, _=Depends(require_auth)):
    return admin_supabase.table('pot_artists').insert(body.model_dump()).execute().data[0]


@router.delete('/{artist_id}')
def delete_pot_artist(artist_id: str, _=Depends(require_auth)):
    admin_supabase.table('pot_artists').delete().eq('id', artist_id).execute()
    return {'ok': True}
