from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/collaborations', tags=['collaborations'])


class CollaborationBody(BaseModel):
    title: str
    partner_name: Optional[str] = None
    description: Optional[str] = None
    video_url: Optional[str] = None
    image_url: Optional[str] = None
    event_date: Optional[str] = None


@router.get('')
def list_collaborations():
    return supabase.table('collaborations').select('*').order('display_order').execute().data


@router.post('')
def add_collaboration(body: CollaborationBody, _=Depends(require_auth)):
    count = supabase.table('collaborations').select('id', count='exact').execute().count or 0
    return admin_supabase.table('collaborations').insert({**body.model_dump(), 'display_order': count}).execute().data[0]


@router.delete('/{collab_id}')
def delete_collaboration(collab_id: str, _=Depends(require_auth)):
    admin_supabase.table('collaborations').delete().eq('id', collab_id).execute()
    return {'ok': True}
