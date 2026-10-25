"""価格計算の記録の API（管理者のみ）。

予期しない例外は main.py のミドルウェアが一般的な文言の 500 にする。
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_auth
from ..db import admin_supabase
from ..db_utils import execute_or_404

router = APIRouter(prefix='/price-calc-entries', tags=['price_calc_entries'])


class EntryBody(BaseModel):
    """価格計算の記録 1 件の入力。"""

    # ブランド名
    brand: str = Field(min_length=1)
    # 植物の名前
    plant_name: str = Field(min_length=1)
    # 鉢作家の名前（任意）
    pot_artist_name: Optional[str] = None
    # 原価（円）
    cost: float
    # 売値（円）
    selling_price: float
    # 種類（production = 生産、purchase = 仕入れ。021 マイグレーションで足した列。省略時は NULL）
    mode: Optional[Literal['production', 'purchase']] = None


@router.get('')
def list_entries(_=Depends(require_auth)) -> list[dict]:
    """価格計算の記録の一覧を新しい順で返す（管理者のみ）。

    Returns:
        記録の行のリスト
    """
    return admin_supabase.table('price_calc_entries').select('*').order('created_at', desc=True).execute().data


@router.post('')
def add_entry(body: EntryBody, _=Depends(require_auth)) -> dict:
    """価格計算の記録を追加する（管理者のみ）。

    Args:
        body: 記録の内容

    Returns:
        作成した行
    """
    # 1. 値の無い項目（None）は送らない。DB の既定（NULL）で入るので結果は同じで、
    #    mode の列を足す 021 マイグレーションを実行していない DB でも、mode を省いた登録が通る
    row = body.model_dump(exclude_none=True)
    # 2. 追加して、作成した行を返す
    return admin_supabase.table('price_calc_entries').insert(row).execute().data[0]


@router.delete('/{entry_id}')
def delete_entry(entry_id: str, _=Depends(require_auth)) -> dict:
    """価格計算の記録を削除する（管理者のみ）。

    Args:
        entry_id: 記録の ID

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    execute_or_404(admin_supabase.table('price_calc_entries').delete().eq('id', entry_id))
    return {'ok': True}
