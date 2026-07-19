import resend
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from ..config import RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL

router = APIRouter(prefix='/contact', tags=['contact'])


class ContactBody(BaseModel):
    name: str
    email: EmailStr
    message: str


@router.post('')
def send_contact(body: ContactBody):
    if not RESEND_API_KEY or not CONTACT_TO_EMAIL:
        raise HTTPException(500, 'Mail not configured')
    resend.api_key = RESEND_API_KEY
    resend.Emails.send({
        'from': CONTACT_FROM_EMAIL,
        'to': [CONTACT_TO_EMAIL],
        'reply_to': body.email,
        'subject': f'[ei8ht plants] お問い合わせ: {body.name}',
        'text': f'お名前: {body.name}\nメール: {body.email}\n\n{body.message}',
    })
    return {'ok': True}
