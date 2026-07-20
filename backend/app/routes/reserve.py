import resend
from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from ..db import admin_supabase, supabase
from ..config import RESEND_API_KEY, CONTACT_FROM_EMAIL
from ..auth import require_auth

router = APIRouter(prefix='/reserve', tags=['reserve'])


class ReserveBody(BaseModel):
    event_id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    participants: int = 1
    note: Optional[str] = None


class ReserveStatusPatch(BaseModel):
    status: str


@router.post('')
def create_reservation(body: ReserveBody):
    row = admin_supabase.table('workshop_reservations').insert(body.model_dump()).execute().data[0]
    _send_confirmation(body)
    return row


def _send_confirmation(body: ReserveBody):
    if not RESEND_API_KEY or not CONTACT_FROM_EMAIL:
        return
    event = supabase.table('events').select('name, start_date, location').eq('id', body.event_id).single().execute().data
    if not event:
        return
    resend.api_key = RESEND_API_KEY
    note_line = f'\n備考: {body.note}' if body.note else ''
    resend.Emails.send({
        'from': CONTACT_FROM_EMAIL,
        'to': [body.email],
        'subject': f'[ei8ht plants] ワークショップ予約を受け付けました: {event["name"]}',
        'text': (
            f'{body.name} 様\n\n'
            f'ワークショップへのお申し込みありがとうございます。\n'
            f'以下の内容で予約を受け付けました。\n\n'
            f'イベント名: {event["name"]}\n'
            f'開催日: {event["start_date"]}\n'
            f'会場: {event["location"]}\n'
            f'参加人数: {body.participants} 名{note_line}\n\n'
            f'ご不明な点がございましたら、このメールに返信するか、\n'
            f'お問い合わせフォームからご連絡ください。\n\n'
            f'ei8ht plants'
        ),
    })


@router.get('s')
def list_reservations(_=Depends(require_auth)):
    return admin_supabase.table('workshop_reservations').select('*').order('created_at', desc=True).execute().data


@router.patch('s/{reservation_id}')
def update_reservation_status(reservation_id: str, body: ReserveStatusPatch, _=Depends(require_auth)):
    return admin_supabase.table('workshop_reservations').update(body.model_dump()).eq('id', reservation_id).execute().data[0]
