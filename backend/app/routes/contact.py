import resend
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from ..config import RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL
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


@router.post('')
def send_contact(body: ContactBody):
    if not RESEND_API_KEY or not CONTACT_TO_EMAIL:
        raise HTTPException(500, 'Mail not configured')
    admin_supabase.table('contacts').insert(body.model_dump()).execute()
    resend.api_key = RESEND_API_KEY
    resend.Emails.send({
        'from': CONTACT_FROM_EMAIL,
        'to': [CONTACT_TO_EMAIL],
        'reply_to': body.email,
        'subject': f'[ei8ht plants] お問い合わせ: {body.name}',
        'text': f'お名前: {body.name}\nメール: {body.email}\n\n{body.message}',
    })
    return {'ok': True}


@router.get('s')
def list_contacts(_=Depends(require_auth)):
    return admin_supabase.table('contacts').select('*').order('created_at', desc=True).execute().data


@router.patch('s/{contact_id}')
def update_contact(contact_id: str, body: ContactPatch, _=Depends(require_auth)):
    return admin_supabase.table('contacts').update(body.model_dump()).eq('id', contact_id).execute().data[0]


@router.post('s/{contact_id}/reply')
def reply_contact(contact_id: str, body: ContactReply, _=Depends(require_auth)):
    if not RESEND_API_KEY or not CONTACT_FROM_EMAIL:
        raise HTTPException(500, 'Mail not configured')
    row = admin_supabase.table('contacts').select('email, name').eq('id', contact_id).single().execute().data
    if not row:
        raise HTTPException(404, 'Not found')
    resend.api_key = RESEND_API_KEY
    resend.Emails.send({
        'from': CONTACT_FROM_EMAIL,
        'to': [row['email']],
        'subject': body.subject,
        'text': body.body,
    })
    admin_supabase.table('contacts').update({'is_read': True}).eq('id', contact_id).execute()
    return {'ok': True}
