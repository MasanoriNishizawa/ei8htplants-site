"""ギャラリーの画像の API。

公開: 一覧（ブランドで絞り込み可）
管理者: 追加・表示順の変更・削除
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_auth
from ..db import admin_supabase, supabase
from ..db_utils import execute_or_404, first_or_404, next_display_order

router = APIRouter(prefix='/gallery', tags=['gallery'])


class GalleryBody(BaseModel):
    """ギャラリーに画像を追加するときの入力。"""

    # 画像の URL
    url: str = Field(min_length=1)
    # 代替テキスト（任意）
    alt: Optional[str] = None
    # ブランド名（'ei8ht plants'・'Habitat Oides'・'HUE' など。任意）
    brand: Optional[str] = None


class GalleryOrderPatch(BaseModel):
    """表示順の変更の入力。"""

    # 新しい表示順（小さい順）
    display_order: int


@router.get('')
def list_gallery(brand: Optional[str] = None) -> list[dict]:
    """ギャラリーの画像の一覧を表示順で返す。

    Args:
        brand: 指定するとそのブランドの画像だけにする

    Returns:
        画像の行のリスト
    """
    q = supabase.table('gallery_images').select('*').order('display_order')
    if brand:
        q = q.eq('brand', brand)
    return q.execute().data


@router.post('')
def add_image(body: GalleryBody, _=Depends(require_auth)) -> dict:
    """ギャラリーの末尾（表示順の最大 + 1）に画像を追加する（管理者のみ）。

    Args:
        body: 画像の URL・代替テキスト・ブランド

    Returns:
        作成した行
    """
    order = next_display_order(admin_supabase, 'gallery_images')
    return admin_supabase.table('gallery_images').insert({**body.model_dump(), 'display_order': order}).execute().data[0]


@router.patch('/{image_id}')
def update_image(image_id: str, body: GalleryOrderPatch, _=Depends(require_auth)) -> dict:
    """ギャラリーの画像の表示順を更新する（ドラッグでの並び替え用・管理者のみ）。

    Args:
        image_id: 画像の ID
        body: 新しい表示順

    Returns:
        更新後の行

    Raises:
        HTTPException(404): 画像が存在しない場合
    """
    return first_or_404(execute_or_404(admin_supabase.table('gallery_images').update(body.model_dump()).eq('id', image_id)))


@router.delete('/{image_id}')
def delete_image(image_id: str, _=Depends(require_auth)) -> dict:
    """ギャラリーの画像を削除する（管理者のみ）。

    Args:
        image_id: 画像の ID

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    execute_or_404(admin_supabase.table('gallery_images').delete().eq('id', image_id))
    return {'ok': True}
