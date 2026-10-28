"""価格計算の記録の API（管理者のみ）。

予期しない例外は main.py のミドルウェアが一般的な文言の 500 にする。
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_auth
from ..db import admin_supabase
from ..db_utils import execute_or_404

# 変数の内容: router: この API 群のルーター。
# main.py から登録する、このモジュールの FastAPI エンドポイントをまとめるルーター。
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
    # 種類（production = 生産、purchase = 仕入れ、seedling = 実生。021 で足した列で、seedling は 022 で許した。省略時は NULL）
    mode: Optional[Literal['production', 'purchase', 'seedling']] = None


@router.get('')
def list_entries(_=Depends(require_auth)) -> list[dict]:
    """価格計算の記録の一覧を新しい順で返す（管理者のみ）。

    Returns:
        記録の行のリスト

    Args:
        _: 認証依存として注入される値（この関数では使用しません）。
    """
    return admin_supabase.table('price_calc_entries').select('*').order('created_at', desc=True).execute().data


@router.post('')
def add_entry(body: EntryBody, _=Depends(require_auth)) -> dict:
    """価格計算の記録を追加する（管理者のみ）。

    Args:
        body: 記録の内容
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        作成した行
    """
    # 1. 値の無い項目（None）は送らない。DB の既定（NULL）で入るので結果は同じで、
    #    mode の列を足す 021 マイグレーションを実行していない DB でも、mode を省いた登録が通る
    # 変数の内容: row: DB に挿入する価格計算記録。
    row = body.model_dump(exclude_none=True)
    # 2. 追加して、作成した行を返す
    return admin_supabase.table('price_calc_entries').insert(row).execute().data[0]


@router.delete('/{entry_id}')
def delete_entry(entry_id: str, _=Depends(require_auth)) -> dict:
    """価格計算の記録を削除する（管理者のみ）。

    Args:
        entry_id: 記録の ID
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    # 1. 指定 ID の削除を実行し、ID 形式が不正なら 404 にする（対象行が無くても成功応答を返す）。
    execute_or_404(admin_supabase.table('price_calc_entries').delete().eq('id', entry_id))
    return {'ok': True}
