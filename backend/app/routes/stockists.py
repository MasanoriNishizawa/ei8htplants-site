"""取扱店の API。

公開: 一覧
管理者: 追加・更新・削除
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_auth
from ..db import admin_supabase, supabase
from ..db_utils import execute_or_404, first_or_404, next_display_order

# 変数の内容: router: この API 群のルーター。
router = APIRouter(prefix='/stockists', tags=['stockists'])


class StockistBody(BaseModel):
    """取扱店の追加・更新の入力。"""

    # 店名
    name: str = Field(min_length=1)
    # 地域（例 '東京'・任意）
    area: Optional[str] = None
    # 住所（任意）
    address: Optional[str] = None
    # 店のサイトの URL（任意）
    url: Optional[str] = None
    # 取り扱っているブランド名の一覧
    brands: list[str] = Field(default_factory=list)


@router.get('')
def list_stockists() -> list[dict]:
    """取扱店の一覧を表示順で返す。

    Returns:
        取扱店の行のリスト
    """
    # 1. 表示順で並べた取扱店一覧を取得して返す。
    return supabase.table('stockists').select('*').order('display_order').execute().data


@router.post('')
def add_stockist(body: StockistBody, _=Depends(require_auth)) -> dict:
    """取扱店を末尾（表示順の最大 + 1）に追加する（管理者のみ）。

    Args:
        body: 取扱店の内容

    Returns:
        作成した行
    """
    # 1. 表示順の最大値から、新しい取扱店の末尾位置を決める。
    # 変数の内容: order: 新しい取扱店に割り当てる末尾の表示順。
    order = next_display_order(admin_supabase, 'stockists')
    # 2. 入力内容と表示順を登録し、作成した行を返す。
    return admin_supabase.table('stockists').insert({**body.model_dump(), 'display_order': order}).execute().data[0]


@router.patch('/{stockist_id}')
def update_stockist(stockist_id: str, body: StockistBody, _=Depends(require_auth)) -> dict:
    """取扱店の情報を更新する（管理者のみ）。

    Args:
        stockist_id: 取扱店の ID
        body: 取扱店の内容

    Returns:
        更新後の行

    Raises:
        HTTPException(404): 取扱店が存在しない場合
    """
    # 1. 指定 ID の取扱店を更新し、対象が無ければ 404 にする。
    return first_or_404(execute_or_404(admin_supabase.table('stockists').update(body.model_dump()).eq('id', stockist_id)))


@router.delete('/{stockist_id}')
def delete_stockist(stockist_id: str, _=Depends(require_auth)) -> dict:
    """取扱店を削除する（管理者のみ）。

    Args:
        stockist_id: 取扱店の ID

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    # 1. 指定 ID の削除を実行し、ID 形式が不正なら 404 にする（対象行が無くても成功応答を返す）。
    execute_or_404(admin_supabase.table('stockists').delete().eq('id', stockist_id))
    return {'ok': True}
