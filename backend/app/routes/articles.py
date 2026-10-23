"""ジャーナル（記事）の API。

公開: 公開済みの記事の一覧・1 件
管理者: 非公開を含む一覧（?all=true）・非公開の記事の 1 件・作成・更新・削除
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_auth, require_auth
from ..db import admin_supabase
from ..db_utils import execute_or_404, fetch_one_or_404, fetch_one_or_none, first_or_404

router = APIRouter(prefix='/articles', tags=['articles'])


class ArticleBody(BaseModel):
    """記事の作成・更新の入力。"""

    # タイトル
    title: str = Field(min_length=1)
    # 本文（ブロックの配列を JSON にした文字列。古い記事は見出しと本文の行が並んだテキスト）
    content: Optional[str] = None
    # 画像の URL の一覧
    image_urls: list[str] = Field(default_factory=list)
    # タグの一覧
    tags: list[str] = Field(default_factory=list)
    # 関連する商品の ID の一覧
    product_ids: list[str] = Field(default_factory=list)
    # 公開するなら True
    is_published: bool = False
    # 表示順（小さい順）
    display_order: int = 0


def _now_iso() -> str:
    """今の時刻（UTC）を ISO 8601 の文字列で返す。published_at に入れる。

    Returns:
        例 '2026-10-22T01:23:45.678901+00:00'
    """
    return datetime.now(timezone.utc).isoformat()


@router.get('')
def list_articles(all: bool = False, is_admin: bool = Depends(optional_auth)) -> list[dict]:
    """記事の一覧を表示順・新しい順で返す。

    Args:
        all: True なら非公開も含む全件（管理者のみ）
        is_admin: 管理者としてログインしているか（optional_auth が決める）

    Returns:
        記事の行のリスト

    Raises:
        HTTPException(401): all=True なのにログインしていない場合
    """
    if all and not is_admin:
        raise HTTPException(status_code=401, detail='Unauthorized')
    q = admin_supabase.table('articles').select('*').order('display_order').order('created_at', desc=True)
    if not all:
        q = q.eq('is_published', True)
    return q.execute().data


@router.get('/{article_id}')
def get_article(article_id: str, is_admin: bool = Depends(optional_auth)) -> dict:
    """記事を ID で 1 件返す。未ログインなら公開済みの記事だけ返す。

    Args:
        article_id: 記事の ID
        is_admin: 管理者としてログインしているか

    Returns:
        記事の行

    Raises:
        HTTPException(404): 記事が無い・未ログインで非公開の記事を指定した場合
    """
    q = admin_supabase.table('articles').select('*').eq('id', article_id)
    if not is_admin:
        q = q.eq('is_published', True)
    return fetch_one_or_404(q)


@router.post('')
def create_article(body: ArticleBody, _=Depends(require_auth)) -> dict:
    """記事を新規作成する（管理者のみ）。公開として作る場合は published_at を今にする。

    Args:
        body: 記事の内容

    Returns:
        作成した記事の行
    """
    payload = body.model_dump()
    if payload['is_published']:
        payload['published_at'] = _now_iso()
    return admin_supabase.table('articles').insert(payload).execute().data[0]


@router.put('/{article_id}')
def update_article(article_id: str, body: ArticleBody, _=Depends(require_auth)) -> dict:
    """記事を更新する（管理者のみ）。初めて公開する場合だけ published_at を今にする。

    Args:
        article_id: 記事の ID
        body: 記事の内容

    Returns:
        更新後の記事の行

    Raises:
        HTTPException(404): 記事が存在しない場合
    """
    payload = body.model_dump()
    existing = fetch_one_or_none(admin_supabase.table('articles').select('is_published, published_at').eq('id', article_id))
    if payload['is_published'] and existing and not existing.get('published_at'):
        payload['published_at'] = _now_iso()
    return first_or_404(execute_or_404(admin_supabase.table('articles').update(payload).eq('id', article_id)))


@router.delete('/{article_id}')
def delete_article(article_id: str, _=Depends(require_auth)) -> dict:
    """記事を削除する（管理者のみ）。

    Args:
        article_id: 記事の ID

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    execute_or_404(admin_supabase.table('articles').delete().eq('id', article_id))
    return {'ok': True}
