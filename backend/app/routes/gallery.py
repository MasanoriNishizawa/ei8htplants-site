from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/gallery', tags=['gallery'])


class GalleryBody(BaseModel):
    url: str
    alt: Optional[str] = None
    brand: Optional[str] = None


class GalleryOrderPatch(BaseModel):
    display_order: int


# ギャラリー画像一覧を表示順で取得する。brand クエリで絞り込み可能
@router.get('')
def list_gallery(brand: Optional[str] = None):
    q = supabase.table('gallery_images').select('*').order('display_order')
    if brand:
        q = q.eq('brand', brand)
    return q.execute().data


# ギャラリーに画像を追加する。display_order は既存件数を末尾として設定する
@router.post('')
def add_image(body: GalleryBody, _=Depends(require_auth)):
    count = supabase.table('gallery_images').select('id', count='exact').execute().count or 0
    return admin_supabase.table('gallery_images').insert({**body.model_dump(), 'display_order': count}).execute().data[0]


# ギャラリー画像の表示順を更新する（ドラッグ並び替え用）
@router.patch('/{image_id}')
def update_image(image_id: str, body: GalleryOrderPatch, _=Depends(require_auth)):
    return admin_supabase.table('gallery_images').update(body.model_dump()).eq('id', image_id).execute().data[0]


# ギャラリー画像を削除する（管理者のみ）
@router.delete('/{image_id}')
def delete_image(image_id: str, _=Depends(require_auth)):
    admin_supabase.table('gallery_images').delete().eq('id', image_id).execute()
    return {'ok': True}
