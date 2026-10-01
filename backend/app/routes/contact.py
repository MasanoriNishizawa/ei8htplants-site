import resend
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from ..config import RESEND_API_KEY, CONTACT_TO_EMAIL, SENDER, NO_REPLY_NOTE
from ..db import admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/contact', tags=['contact'])


class ContactBody(BaseModel):
    name: str
    email: EmailStr
    message: str


class ContactPatch(BaseModel):
    is_read: bool


class ContactReply(BaseModel):
    subject: str
    body: str


# お問い合わせをDBに保存し、管理者通知メールと送信者への自動返信メールを送る
@router.post('')
def send_contact(body: ContactBody):
    """お問い合わせをDBに保存し、管理者通知と送信者への自動返信メールを送る。

    メール送信失敗は保存成功を妨げない。RESEND_API_KEY が未設定の場合はメールを送らない。

    Args:
        body: お問い合わせ情報（名前・メールアドレス・本文）

    Returns:
        {"ok": True} の固定レスポンス
    """
    admin_supabase.table('contacts').insert(body.model_dump()).execute()
    if RESEND_API_KEY and CONTACT_TO_EMAIL:
        try:
            resend.api_key = RESEND_API_KEY
            resend.Emails.send({
                'from': SENDER,
                'to': [CONTACT_TO_EMAIL],
                'reply_to': body.email,
                'subject': f'[ei8ht plants] お問い合わせ: {body.name}',
                'text': f'お名前: {body.name}\nメール: {body.email}\n\n{body.message}',
            })
        except Exception as e:
            print(f'[contact] admin notify failed: {e}')
    if RESEND_API_KEY:
        try:
            resend.api_key = RESEND_API_KEY
            resend.Emails.send({
                'from': SENDER,
                'to': [body.email],
                'subject': 'お問い合わせを受け付けました | ei8ht plants',
                'text': (
                    f'{body.name} 様\n\n'
                    'この度はお問い合わせいただきありがとうございます。\n'
                    '内容を確認次第、2〜3営業日以内にご連絡いたします。\n\n'
                    '─────────────────\n'
                    '【お問い合わせ内容】\n'
                    f'お名前: {body.name}\n'
                    f'メール: {body.email}\n\n'
                    f'{body.message}\n'
                    '─────────────────\n\n'
                    'ei8ht plants\n'
                    'https://ei8htplants.com'
                    + NO_REPLY_NOTE
                ),
            })
        except Exception as e:
            print(f'[contact] auto-reply failed: {e}')
    return {'ok': True}


# お問い合わせ一覧を新着順で取得する（管理者のみ）
@router.get('s')
def list_contacts(_=Depends(require_auth)):
    """お問い合わせ一覧を新着順で返す。"""
    return admin_supabase.table('contacts').select('*').order('created_at', desc=True).execute().data


# お問い合わせの既読状態を更新する（管理者のみ）
@router.patch('s/{contact_id}')
def update_contact(contact_id: str, body: ContactPatch, _=Depends(require_auth)):
    """お問い合わせの既読状態を更新して更新後のレコードを返す。"""
    return admin_supabase.table('contacts').update(body.model_dump()).eq('id', contact_id).execute().data[0]


# お問い合わせに返信メールを送り、自動的に既読にする（管理者のみ）
@router.post('s/{contact_id}/reply')
def reply_contact(contact_id: str, body: ContactReply, _=Depends(require_auth)):
    """お問い合わせに返信メールを送り、送信後に既読フラグを立てる。

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
    row = admin_supabase.table('contacts').select('email, name').eq('id', contact_id).single().execute().data
    if not row:
        raise HTTPException(404, 'Not found')
    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            'from': SENDER,
            'to': [row['email']],
            'subject': body.subject,
            'text': body.body + NO_REPLY_NOTE,
        })
    except Exception as e:
        print(f'[contact] reply send failed: {e}')
        raise HTTPException(500, f'メール送信に失敗しました: {e}')
    admin_supabase.table('contacts').update({'is_read': True}).eq('id', contact_id).execute()
    return {'ok': True}
