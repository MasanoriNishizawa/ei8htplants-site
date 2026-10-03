from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/chat-qa', tags=['chat_qa'])


class ChatQABody(BaseModel):
    """Q&A 1件分のリクエストボディ。

    Args:
        question: ユーザーが尋ねる想定の質問文
        answer: その質問に対するあらかじめ用意した回答文
        sort_order: 表示順（小さい順に並ぶ）
        enabled: False にするとシステムプロンプトから除外する
    """
    question: str
    answer: str
    sort_order: Optional[int] = 0
    enabled: Optional[bool] = True


@router.get('')
def list_chat_qa():
    """Q&A 一覧を表示順で返す。"""
    try:
        return admin_supabase.table('chat_qa').select('*').order('sort_order').execute().data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post('')
def add_chat_qa(body: ChatQABody, _=Depends(require_auth)):
    """Q&A を追加する（管理者のみ）。"""
    return admin_supabase.table('chat_qa').insert(body.model_dump()).execute().data[0]


@router.patch('/{qa_id}')
def update_chat_qa(qa_id: str, body: ChatQABody, _=Depends(require_auth)):
    """Q&A を更新する（管理者のみ）。"""
    return admin_supabase.table('chat_qa').update(body.model_dump()).eq('id', qa_id).execute().data[0]


@router.delete('/{qa_id}')
def delete_chat_qa(qa_id: str, _=Depends(require_auth)):
    """Q&A を削除する（管理者のみ）。"""
    admin_supabase.table('chat_qa').delete().eq('id', qa_id).execute()
    return {'ok': True}
