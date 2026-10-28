"""AI チャットの履歴を管理画面で見るための API（管理者のみ）。"""
from fastapi import APIRouter, Depends

from ..auth import require_auth
from ..db import admin_supabase

# 変数の内容: router: この API 群のルーター。
# main.py から登録する、このモジュールの FastAPI エンドポイントをまとめるルーター。
router = APIRouter(prefix='/chat-logs', tags=['chat_logs'])

# 一度に返すチャット履歴の最大件数
MAX_CHAT_LOGS = 200


@router.get('')
def list_chat_logs(_=Depends(require_auth)) -> list[dict]:
    """チャット履歴を新しい順で返す（管理者のみ）。

    Returns:
        最新 MAX_CHAT_LOGS 件のチャットログ

    Args:
        _: 認証依存として注入される値（この関数では使用しません）。
    """
    return admin_supabase.table('chat_logs').select('*').order('created_at', desc=True).limit(MAX_CHAT_LOGS).execute().data
