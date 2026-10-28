"""お問い合わせの API。

公開: お問い合わせの送信（DB に保存し、管理者に通知、送信者に自動返信）
管理者: 一覧・既読の変更・返信メールの送信
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from ..auth import require_auth
from ..config import CONTACT_TO_EMAIL, NO_REPLY_NOTE, RESEND_API_KEY, SENDER, SITE_ORIGIN
from ..db import admin_supabase
from ..db_utils import execute_or_404, fetch_one_or_404, first_or_404
from ..mail import send_mail
from ..rate_limit import client_ip, contact_limiter
from ..utils.errors import error_summary

# 変数の内容: logger: モジュール名を使って記録するロガー、router: この API 群のルーター。
logger = logging.getLogger(__name__)

router = APIRouter(prefix='/contact', tags=['contact'])

# 名前の最大文字数
MAX_NAME_LEN = 100
# 本文の最大文字数
MAX_MESSAGE_LEN = 5000
# 返信メールの件名の最大文字数
MAX_SUBJECT_LEN = 200
# 返信メールの本文の最大文字数
MAX_REPLY_LEN = 20000


class ContactBody(BaseModel):
    """お問い合わせフォームの入力。"""

    # 送信者の名前
    name: str = Field(min_length=1, max_length=MAX_NAME_LEN)
    # 送信者のメールアドレス（返信先。EmailStr が長さ 254 文字までを確かめる）
    email: EmailStr
    # お問い合わせの本文
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LEN)


class ContactPatch(BaseModel):
    """お問い合わせの既読の切り替え。"""

    # 既読にするなら True
    is_read: bool


class ContactReply(BaseModel):
    """管理画面から送る返信メールの内容。"""

    # 件名
    subject: str = Field(min_length=1, max_length=MAX_SUBJECT_LEN)
    # 本文（末尾に「返信不可」の注記を付けて送る）
    body: str = Field(min_length=1, max_length=MAX_REPLY_LEN)


@router.post('')
def send_contact(body: ContactBody, request: Request) -> dict:
    """お問い合わせをDBに保存し、管理者通知と送信者への自動返信メールを送る。

    自動返信には本文を含めない（他人のアドレスを入れて送られたとき、任意の文章を
    第三者に届ける踏み台にされないようにするため）。
    メール送信失敗は保存成功を妨げない。RESEND_API_KEY が未設定の場合はメールを送らない。

    Args:
        body: お問い合わせ情報（名前・メールアドレス・本文）
        request: 回数制限に使う送り元の IP を読むためのリクエスト

    Returns:
        {"ok": True} の固定レスポンス

    Raises:
        HTTPException(429): 同じ IP から短時間に送りすぎた場合
    """
    # 1. 回数制限と保存
    contact_limiter.check(client_ip(request))
    admin_supabase.table('contacts').insert(body.model_dump()).execute()
    # 2. 管理者への通知（返信先は送信者）
    if RESEND_API_KEY and CONTACT_TO_EMAIL:
        try:
            send_mail(RESEND_API_KEY, {
                'from': SENDER,
                'to': [CONTACT_TO_EMAIL],
                'reply_to': body.email,
                'subject': f'[ei8ht plants] お問い合わせ: {body.name}',
                'text': f'お名前: {body.name}\nメール: {body.email}\n\n{body.message}',
            })
        # 変数の内容: e: except で捕捉した処理例外。
        except Exception as e:
            logger.error('お問い合わせの管理者通知の送信に失敗しました: %s', error_summary(e))
    # 3. 送信者への自動返信（本文は入れない）
    if RESEND_API_KEY:
        try:
            send_mail(RESEND_API_KEY, {
                'from': SENDER,
                'to': [body.email],
                'subject': 'お問い合わせを受け付けました | ei8ht plants',
                'text': (
                    f'{body.name} 様\n\n'
                    'この度はお問い合わせいただきありがとうございます。\n'
                    '内容を確認次第、2〜3営業日以内にご連絡いたします。\n\n'
                    'ei8ht plants\n'
                    f'{SITE_ORIGIN}'
                    + NO_REPLY_NOTE
                ),
            })
        # 変数の内容: e: except で捕捉した処理例外。
        except Exception as e:
            logger.error('お問い合わせの自動返信の送信に失敗しました: %s', error_summary(e))
    return {'ok': True}


@router.get('s')
def list_contacts(_=Depends(require_auth)) -> list[dict]:
    """お問い合わせ一覧を新着順で返す（管理者のみ）。

    Returns:
        お問い合わせの行のリスト

    Args:
        _: 認証依存として注入される値（この関数では使用しません）。
    """
    return admin_supabase.table('contacts').select('*').order('created_at', desc=True).execute().data


@router.patch('s/{contact_id}')
def update_contact(contact_id: str, body: ContactPatch, _=Depends(require_auth)) -> dict:
    """お問い合わせの既読状態を更新して更新後のレコードを返す（管理者のみ）。

    Args:
        contact_id: お問い合わせの ID
        body: 既読かどうか

    Returns:
        更新後の行

    Raises:
        HTTPException(404): お問い合わせが存在しない場合
    """
    return first_or_404(execute_or_404(admin_supabase.table('contacts').update(body.model_dump()).eq('id', contact_id)))


@router.post('s/{contact_id}/reply')
def reply_contact(contact_id: str, body: ContactReply, _=Depends(require_auth)) -> dict:
    """お問い合わせに返信メールを送り、送信後に既読フラグを立てる（管理者のみ）。

    Args:
        contact_id: 返信対象のお問い合わせID
        body: 件名と本文を含む返信内容

    Returns:
        {"ok": True} の固定レスポンス

    Raises:
        HTTPException(404): お問い合わせが存在しない場合
        HTTPException(500): RESEND_API_KEY 未設定またはメール送信失敗の場合
    """
    if not RESEND_API_KEY:
        raise HTTPException(500, 'RESEND_API_KEY が設定されていません')
    # 1. 対象のお問い合わせを取得し、返信先のメールアドレスを確かめる。
    row = fetch_one_or_404(admin_supabase.table('contacts').select('email, name').eq('id', contact_id))
    # 2. 返信メールを送る。失敗した場合は既読状態を変更せず 500 を返す。
    try:
        send_mail(RESEND_API_KEY, {
            'from': SENDER,
            'to': [row['email']],
            'subject': body.subject,
            'text': body.body + NO_REPLY_NOTE,
        })
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('お問い合わせへの返信メールの送信に失敗しました: %s', error_summary(e))
        raise HTTPException(500, 'メール送信に失敗しました。時間をおいて再度お試しください。')
    # 3. 送信成功後に既読へ更新し、成功レスポンスを返す。
    admin_supabase.table('contacts').update({'is_read': True}).eq('id', contact_id).execute()
    return {'ok': True}
