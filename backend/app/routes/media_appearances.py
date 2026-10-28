"""メディア出演情報の API。

公開: 一覧
管理者: 追加・削除
予期しない例外は main.py のミドルウェアが一般的な文言の 500 にする。
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_auth
from ..db import admin_supabase, supabase
from ..db_utils import execute_or_404

# 変数の内容: router: この API 群のルーター。
router = APIRouter(prefix='/media-appearances', tags=['media_appearances'])


class MediaAppearanceBody(BaseModel):
    """メディア出演情報の追加の入力。"""

    # 番組・記事のタイトル
    title: str = Field(min_length=1)
    # YouTube の URL
    youtube_url: str = Field(min_length=1)
    # 説明（任意）
    description: Optional[str] = None
    # 公開日（YYYY-MM-DD・任意）
    published_at: Optional[str] = None
    # 表示順（小さい順）
    display_order: int = 0


@router.get('')
def list_media_appearances() -> list[dict]:
    """メディア出演情報を公開日の新しい順で返す。

    Returns:
        出演情報の行のリスト
    """
    return supabase.table('media_appearances').select('*').order('published_at', desc=True).execute().data


@router.post('')
def add_media_appearance(body: MediaAppearanceBody, _=Depends(require_auth)) -> dict:
    """メディア出演情報を追加する（管理者のみ）。

    Args:
        body: 出演情報の内容

    Returns:
        作成した行
    """
    return admin_supabase.table('media_appearances').insert(body.model_dump()).execute().data[0]


@router.delete('/{item_id}')
def delete_media_appearance(item_id: str, _=Depends(require_auth)) -> dict:
    """メディア出演情報を削除する（管理者のみ）。

    Args:
        item_id: 出演情報の ID

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    # 1. 指定 ID の削除を実行し、ID 形式が不正なら 404 にする（対象行が無くても成功応答を返す）。
    execute_or_404(admin_supabase.table('media_appearances').delete().eq('id', item_id))
    return {'ok': True}
