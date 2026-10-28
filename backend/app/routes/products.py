"""オンラインショップの商品の API。

公開: 公開中の商品の一覧・1 件
管理者: 非公開を含む一覧（?all=true）・非公開の商品の 1 件・作成・更新・削除・在庫数の変更
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..auth import optional_auth, require_auth
from ..db import admin_supabase
from ..db_utils import execute_or_404, fetch_one_or_404, first_or_404

# 変数の内容: router: この API 群のルーター。
router = APIRouter(prefix='/products', tags=['products'])

# 商品のカテゴリーとして選べる値（管理画面の選択肢と同じ）
VALID_CATEGORIES = {
    'アガベ', '塊根植物', '灌木', 'サボテン',
    '観葉植物', 'ハビタットスタイル', 'ハビタットスタイル資材', '園芸資材', '鉢',
}


class ProductBody(BaseModel):
    """商品の作成・更新の入力。"""

    # 商品名
    name: str = Field(min_length=1)
    # 説明（ブロックの配列を JSON にした文字列、または古いテキスト）
    description: Optional[str] = None
    # 価格（円・税込）。0 以上
    price: int = Field(ge=0)
    # 在庫数。0 以上
    stock: int = Field(default=0, ge=0)
    # 画像の URL の一覧（1 枚目が一覧・OGP に使われる）
    image_urls: list[str] = Field(default_factory=list)
    # タグの一覧
    tags: list[str] = Field(default_factory=list)
    # 公開するなら True
    is_published: bool = False
    # 表示順（小さい順）
    display_order: int = 0
    # カテゴリー（VALID_CATEGORIES のどれか。未設定は None）
    category: Optional[str] = None

    @field_validator('category')
    @classmethod
    def _check_category(cls, v: Optional[str]) -> Optional[str]:
        """カテゴリーが選べる値（VALID_CATEGORIES）か確かめる。空文字は未設定（None）にする。

        Args:
            v: 送られてきたカテゴリー

        Returns:
            カテゴリー、または None

        Raises:
            ValueError: 選べる値でない場合（FastAPI が 422 にする）
        """
        if v is None or v == '':
            return None
        if v not in VALID_CATEGORIES:
            raise ValueError('category is not valid')
        return v


class StockPatch(BaseModel):
    """在庫数だけを変える入力。"""

    # 新しい在庫数。0 以上
    stock: int = Field(ge=0)


@router.get('')
def list_products(all: bool = False, is_admin: bool = Depends(optional_auth)) -> list[dict]:
    """商品の一覧を表示順で返す。

    Args:
        all: True なら非公開も含む全件（管理者のみ）
        is_admin: 管理者としてログインしているか（optional_auth が決める）

    Returns:
        商品の行のリスト

    Raises:
        HTTPException(401): all=True なのにログインしていない場合
    """
    if all and not is_admin:
        raise HTTPException(status_code=401, detail='Unauthorized')
    # 1. 管理者用クライアントで一覧クエリを作る。
    # 変数の内容: q: DB テーブルに対するクエリ。
    q = admin_supabase.table('products').select('*').order('display_order')
    if not all:
        # 管理用クライアントは RLS を通らないので、公開中だけの条件をアプリで付ける
        q = q.eq('is_published', True)
    # 2. 公開条件または全件条件に合う商品を取得して返す。
    return q.execute().data


@router.get('/{product_id}')
def get_product(product_id: str, is_admin: bool = Depends(optional_auth)) -> dict:
    """商品を ID で 1 件返す。未ログインなら公開中の商品だけ返す。

    Args:
        product_id: 商品の ID
        is_admin: 管理者としてログインしているか

    Returns:
        商品の行

    Raises:
        HTTPException(404): 商品が無い・未ログインで非公開の商品を指定した場合
    """
    # 1. ID で商品を検索し、未ログイン時は公開中の商品に限定する。
    # 変数の内容: q: DB テーブルに対するクエリ。
    q = admin_supabase.table('products').select('*').eq('id', product_id)
    if not is_admin:
        # 変数の内容: q: DB テーブルに対するクエリ。
        q = q.eq('is_published', True)
    # 2. 該当商品を返し、見つからない場合は 404 にする。
    return fetch_one_or_404(q)


@router.post('')
def create_product(body: ProductBody, _=Depends(require_auth)) -> dict:
    """商品を新規作成する（管理者のみ）。

    Args:
        body: 商品の内容

    Returns:
        作成した商品の行
    """
    # 1. 入力内容を商品テーブルに登録し、作成行を返す。
    return admin_supabase.table('products').insert(body.model_dump()).execute().data[0]


@router.put('/{product_id}')
def update_product(product_id: str, body: ProductBody, _=Depends(require_auth)) -> dict:
    """商品情報を更新する（管理者のみ）。

    Args:
        product_id: 商品の ID
        body: 商品の内容

    Returns:
        更新後の商品の行

    Raises:
        HTTPException(404): 商品が存在しない場合
    """
    # 1. ID に一致する商品を更新し、更新行が無ければ 404 にする。
    return first_or_404(execute_or_404(admin_supabase.table('products').update(body.model_dump()).eq('id', product_id)))


@router.delete('/{product_id}')
def delete_product(product_id: str, _=Depends(require_auth)) -> dict:
    """商品を削除する（管理者のみ）。

    Args:
        product_id: 商品の ID

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    # 1. ID に一致する商品を削除し、ID の形式が不正なら 404 にする。
    execute_or_404(admin_supabase.table('products').delete().eq('id', product_id))
    # 2. 削除対象の有無にかかわらず成功応答を返す。
    return {'ok': True}


@router.patch('/{product_id}/stock')
def update_stock(product_id: str, body: StockPatch, _=Depends(require_auth)) -> dict:
    """商品の在庫数だけを更新する（管理者のみ）。

    Args:
        product_id: 商品の ID
        body: 新しい在庫数

    Returns:
        更新後の商品の行

    Raises:
        HTTPException(404): 商品が存在しない場合
    """
    return first_or_404(execute_or_404(admin_supabase.table('products').update({'stock': body.stock}).eq('id', product_id)))
