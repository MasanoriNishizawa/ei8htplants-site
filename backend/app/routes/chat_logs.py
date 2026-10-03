from fastapi import APIRouter, Depends
from ..db import admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/chat-logs', tags=['chat_logs'])


@router.get('')
def list_chat_logs(_=Depends(require_auth)):
    """チャット履歴を新しい順で返す（管理者のみ）。

    Returns:
        list: 最新200件のチャットログ
    """
    return admin_supabase.table('chat_logs').select('*').order('created_at', desc=True).limit(200).execute().data
