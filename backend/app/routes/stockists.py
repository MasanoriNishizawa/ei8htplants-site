from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/stockists', tags=['stockists'])


class StockistBody(BaseModel):
    name: str
    area: Optional[str] = None
    address: Optional[str] = None
    url: Optional[str] = None
    brands: List[str] = []


@router.get('')
def list_stockists():
    return supabase.table('stockists').select('*').order('display_order').execute().data


@router.post('')
def add_stockist(body: StockistBody, _=Depends(require_auth)):
    count = supabase.table('stockists').select('id', count='exact').execute().count or 0
    return admin_supabase.table('stockists').insert({**body.model_dump(), 'display_order': count}).execute().data[0]


@router.patch('/{stockist_id}')
def update_stockist(stockist_id: str, body: StockistBody, _=Depends(require_auth)):
    return admin_supabase.table('stockists').update(body.model_dump()).eq('id', stockist_id).execute().data[0]


@router.delete('/{stockist_id}')
def delete_stockist(stockist_id: str, _=Depends(require_auth)):
    admin_supabase.table('stockists').delete().eq('id', stockist_id).execute()
    return {'ok': True}
