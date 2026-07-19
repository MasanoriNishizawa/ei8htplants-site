from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from ..db import supabase, admin_supabase

router = APIRouter(prefix='/stockists', tags=['stockists'])


class StockistBody(BaseModel):
    name: str
    area: Optional[str] = None
    address: Optional[str] = None
    url: Optional[str] = None


@router.get('')
def list_stockists():
    return supabase.table('stockists').select('*').order('display_order').execute().data


@router.post('')
def add_stockist(body: StockistBody):
    count = supabase.table('stockists').select('id', count='exact').execute().count or 0
    return admin_supabase.table('stockists').insert({**body.model_dump(), 'display_order': count}).execute().data[0]


@router.delete('/{stockist_id}')
def delete_stockist(stockist_id: str):
    admin_supabase.table('stockists').delete().eq('id', stockist_id).execute()
    return {'ok': True}
