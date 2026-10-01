from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..db import admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/price-calc-entries', tags=['price_calc_entries'])


class EntryBody(BaseModel):
    brand: str
    plant_name: str
    pot_artist_name: Optional[str] = None
    cost: float
    selling_price: float


# 価格計算エントリの一覧を新着順で取得する（管理者のみ）
@router.get('')
def list_entries(_=Depends(require_auth)):
    try:
        return admin_supabase.table('price_calc_entries').select('*').order('created_at', desc=True).execute().data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 価格計算エントリを追加する（管理者のみ）
@router.post('')
def add_entry(body: EntryBody, _=Depends(require_auth)):
    try:
        return admin_supabase.table('price_calc_entries').insert(body.model_dump()).execute().data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 価格計算エントリを削除する（管理者のみ）
@router.delete('/{entry_id}')
def delete_entry(entry_id: str, _=Depends(require_auth)):
    try:
        admin_supabase.table('price_calc_entries').delete().eq('id', entry_id).execute()
        return {'ok': True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
