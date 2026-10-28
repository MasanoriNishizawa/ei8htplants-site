"""鉢作家の API（価格計算の画面で選ぶ作家の一覧）。

公開: 一覧
管理者: 追加・削除
予期しない例外は main.py のミドルウェアが一般的な文言の 500 にする。
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_auth
from ..db import admin_supabase, supabase
from ..db_utils import execute_or_404

# 変数の内容: router: この API 群のルーター。
router = APIRouter(prefix='/pot-artists', tags=['pot_artists'])


class PotArtistBody(BaseModel):
    """鉢作家の追加の入力。"""

    # 作家の名前
    name: str = Field(min_length=1)


@router.get('')
def list_pot_artists() -> list[dict]:
    """鉢作家の一覧を登録順で返す。

    Returns:
        鉢作家の行のリスト
    """
    return supabase.table('pot_artists').select('*').order('created_at').execute().data


@router.post('')
def add_pot_artist(body: PotArtistBody, _=Depends(require_auth)) -> dict:
    """鉢作家を追加する（管理者のみ）。

    Args:
        body: 作家の名前

    Returns:
        作成した行
    """
    return admin_supabase.table('pot_artists').insert(body.model_dump()).execute().data[0]


@router.delete('/{artist_id}')
def delete_pot_artist(artist_id: str, _=Depends(require_auth)) -> dict:
    """鉢作家を削除する（管理者のみ）。

    Args:
        artist_id: 作家の ID

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    execute_or_404(admin_supabase.table('pot_artists').delete().eq('id', artist_id))
    return {'ok': True}
