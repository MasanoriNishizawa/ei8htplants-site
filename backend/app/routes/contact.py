import smtplib
from email.mime.text import MIMEText
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from ..config import GMAIL_SENDER, GMAIL_APP_PASSWORD

router = APIRouter(prefix='/contact', tags=['contact'])


class ContactBody(BaseModel):
    name: str
    email: EmailStr
    message: str


@router.post('')
def send_contact(body: ContactBody):
    if not GMAIL_SENDER or not GMAIL_APP_PASSWORD:
        raise HTTPException(500, 'Mail not configured')
    msg = MIMEText(f"お名前: {body.name}\nメール: {body.email}\n\n{body.message}", 'plain', 'utf-8')
    msg['Subject'] = f'[ei8ht plants] お問い合わせ: {body.name}'
    msg['From'] = GMAIL_SENDER
    msg['To'] = GMAIL_SENDER
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(GMAIL_SENDER, GMAIL_APP_PASSWORD)
            smtp.send_message(msg)
    except Exception as e:
        raise HTTPException(500, str(e))
    return {'ok': True}
