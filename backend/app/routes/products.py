from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/products', tags=['products'])


class ProductBody(BaseModel):
    name: str
    description: Optional[str] = None
    price: int
    stock: int = 0
    image_urls: list[str] = []
    tags: list[str] = []
    is_published: bool = False
    display_order: int = 0


class StockPatch(BaseModel):
    stock: int


@router.get('')
def list_products(all: bool = False):
    q = admin_supabase.table('products').select('*').order('display_order')
    if not all:
        # anon クライアントでは RLS により is_published=true の行しか返らないが、
        # admin クライアントを使いつつ ?all=false の場合はアプリ層でフィルタする
        q = q.eq('is_published', True)
    return q.execute().data


@router.get('/{product_id}')
def get_product(product_id: str):
    data = admin_supabase.table('products').select('*').eq('id', product_id).single().execute().data
    if not data:
        raise HTTPException(404, 'Not found')
    return data


@router.post('')
def create_product(body: ProductBody, _=Depends(require_auth)):
    return admin_supabase.table('products').insert(body.model_dump()).execute().data[0]


@router.put('/{product_id}')
def update_product(product_id: str, body: ProductBody, _=Depends(require_auth)):
    return admin_supabase.table('products').update(body.model_dump()).eq('id', product_id).execute().data[0]


@router.delete('/{product_id}')
def delete_product(product_id: str, _=Depends(require_auth)):
    admin_supabase.table('products').delete().eq('id', product_id).execute()
    return {'ok': True}


@router.patch('/{product_id}/stock')
def update_stock(product_id: str, body: StockPatch, _=Depends(require_auth)):
    return admin_supabase.table('products').update({'stock': body.stock}).eq('id', product_id).execute().data[0]
