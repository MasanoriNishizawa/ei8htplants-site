"""コラボレーション（Habitat Oides の共同制作・活動記録）の API。

公開: 一覧
管理者: 追加・削除
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_auth
from ..db import admin_supabase, supabase
from ..db_utils import execute_or_404, next_display_order

router = APIRouter(prefix='/collaborations', tags=['collaborations'])


class CollaborationBody(BaseModel):
    """コラボレーションの追加の入力。"""

    # タイトル
    title: str = Field(min_length=1)
    # 相手の名前（任意）
    partner_name: Optional[str] = None
    # 説明（任意）
    description: Optional[str] = None
    # 動画の URL（任意）
    video_url: Optional[str] = None
    # 画像の URL（任意）
    image_url: Optional[str] = None
    # 実施日（YYYY-MM-DD・任意）
    event_date: Optional[str] = None


@router.get('')
def list_collaborations() -> list[dict]:
    """コラボレーション一覧を表示順で返す。

    Returns:
        コラボレーションの行のリスト
    """
    return supabase.table('collaborations').select('*').order('display_order').execute().data


@router.post('')
def add_collaboration(body: CollaborationBody, _=Depends(require_auth)) -> dict:
    """コラボレーションを末尾（表示順の最大 + 1）に追加する（管理者のみ）。

    Args:
        body: コラボレーションの内容

    Returns:
        作成した行
    """
    order = next_display_order(admin_supabase, 'collaborations')
    return admin_supabase.table('collaborations').insert({**body.model_dump(), 'display_order': order}).execute().data[0]


@router.delete('/{collab_id}')
def delete_collaboration(collab_id: str, _=Depends(require_auth)) -> dict:
    """コラボレーションを削除する（管理者のみ）。

    Args:
        collab_id: コラボレーションの ID

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    execute_or_404(admin_supabase.table('collaborations').delete().eq('id', collab_id))
    return {'ok': True}
