from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from ..db import admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/articles', tags=['articles'])


class ArticleBody(BaseModel):
    title: str
    content: Optional[str] = None
    image_urls: list[str] = []
    tags: list[str] = []
    product_ids: list[str] = []
    is_published: bool = False
    display_order: int = 0


# 記事一覧を取得する。?all=true で非公開含む全件、デフォルトは公開済みのみ
@router.get('')
def list_articles(all: bool = False):
    q = admin_supabase.table('articles').select('*').order('display_order').order('created_at', desc=True)
    if not all:
        q = q.eq('is_published', True)
    return q.execute().data


# 記事をIDで取得する。存在しない場合は404を返す
@router.get('/{article_id}')
def get_article(article_id: str):
    data = admin_supabase.table('articles').select('*').eq('id', article_id).single().execute().data
    if not data:
        raise HTTPException(404, 'Not found')
    return data


# 記事を新規作成する。公開フラグがtrueの場合は published_at を自動セットする
@router.post('')
def create_article(body: ArticleBody, _=Depends(require_auth)):
    payload = body.model_dump()
    if payload['is_published'] and not payload.get('published_at'):
        payload['published_at'] = datetime.now(timezone.utc).isoformat()
    return admin_supabase.table('articles').insert(payload).execute().data[0]


# 記事を更新する。初めて公開する場合のみ published_at を自動セットする
@router.put('/{article_id}')
def update_article(article_id: str, body: ArticleBody, _=Depends(require_auth)):
    payload = body.model_dump()
    # 初めて公開する際に published_at を自動セット
    existing = admin_supabase.table('articles').select('is_published, published_at').eq('id', article_id).single().execute().data
    if payload['is_published'] and existing and not existing.get('published_at'):
        payload['published_at'] = datetime.now(timezone.utc).isoformat()
    return admin_supabase.table('articles').update(payload).eq('id', article_id).execute().data[0]


# 記事を削除する（管理者のみ）
@router.delete('/{article_id}')
def delete_article(article_id: str, _=Depends(require_auth)):
    admin_supabase.table('articles').delete().eq('id', article_id).execute()
    return {'ok': True}
