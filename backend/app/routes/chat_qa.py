"""AI チャットの「よくある質問と回答」（Q&A）の API。

公開: 有効な Q&A の一覧
管理者: 無効を含む一覧（?all=true）・追加・更新・削除
有効な Q&A はチャット（routes/chat.py）のシステムプロンプトに入る。
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import optional_auth, require_auth
from ..db import admin_supabase
from ..db_utils import execute_or_404, first_or_404

# 変数の内容: router: この API 群のルーター。
# main.py から登録する、このモジュールの FastAPI エンドポイントをまとめるルーター。
router = APIRouter(prefix='/chat-qa', tags=['chat_qa'])


class ChatQABody(BaseModel):
    """Q&A 1件分のリクエストボディ。"""

    # ユーザーが尋ねる想定の質問文
    question: str = Field(min_length=1)
    # その質問に対するあらかじめ用意した回答文
    answer: str = Field(min_length=1)
    # 表示順（小さい順に並ぶ）
    sort_order: Optional[int] = 0
    # False にするとシステムプロンプトから除外し、公開の一覧にも出さない
    enabled: Optional[bool] = True


@router.get('')
def list_chat_qa(all: bool = False, is_admin: bool = Depends(optional_auth)) -> list[dict]:
    """Q&A 一覧を表示順で返す。未ログインでは有効なものだけ返す。

    Args:
        all: True なら無効なものも含む全件（管理者のみ。管理画面の一覧用）
        is_admin: 管理者としてログインしているか

    Returns:
        Q&A の行のリスト

    Raises:
        HTTPException(401): all=True なのにログインしていない場合
    """
    if all and not is_admin:
        raise HTTPException(status_code=401, detail='Unauthorized')
    # 1. 表示順で並べた Q&A の一覧クエリを作る。
    # 変数の内容: q: DB テーブルに対するクエリ。
    q = admin_supabase.table('chat_qa').select('*').order('sort_order')
    if not all:
        # 変数の内容: q: DB テーブルに対するクエリ。
        q = q.eq('enabled', True)
    # 2. 管理者の全件指定が無ければ有効な回答に絞り、一覧を返す。
    return q.execute().data


@router.post('')
def add_chat_qa(body: ChatQABody, _=Depends(require_auth)) -> dict:
    """Q&A を追加する（管理者のみ）。

    Args:
        body: Q&A の内容
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        作成した行
    """
    # 1. 入力内容を登録し、作成した Q&A の行を返す。
    return admin_supabase.table('chat_qa').insert(body.model_dump()).execute().data[0]


@router.patch('/{qa_id}')
def update_chat_qa(qa_id: str, body: ChatQABody, _=Depends(require_auth)) -> dict:
    """Q&A を更新する（管理者のみ）。

    Args:
        qa_id: Q&A の ID
        body: Q&A の内容
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        更新後の行

    Raises:
        HTTPException(404): Q&A が存在しない場合
    """
    # 1. 指定 ID の Q&A を更新し、対象が無ければ 404 にする。
    return first_or_404(execute_or_404(admin_supabase.table('chat_qa').update(body.model_dump()).eq('id', qa_id)))


@router.delete('/{qa_id}')
def delete_chat_qa(qa_id: str, _=Depends(require_auth)) -> dict:
    """Q&A を削除する（管理者のみ）。

    Args:
        qa_id: Q&A の ID
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    # 1. 指定 ID の削除を実行し、ID 形式が不正なら 404 にする（対象行が無くても成功応答を返す）。
    execute_or_404(admin_supabase.table('chat_qa').delete().eq('id', qa_id))
    return {'ok': True}
