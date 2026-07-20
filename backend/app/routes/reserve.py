from fastapi import APIRouter
from pydantic import BaseModel, EmailStr
from typing import Optional
from ..db import admin_supabase

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
    return admin_supabase.table('workshop_reservations').insert(body.model_dump()).execute().data[0]


@router.get('s')
def list_reservations():
    return admin_supabase.table('workshop_reservations').select('*').order('created_at', desc=True).execute().data


@router.patch('s/{reservation_id}')
def update_reservation_status(reservation_id: str, body: ReserveStatusPatch):
    return admin_supabase.table('workshop_reservations').update(body.model_dump()).eq('id', reservation_id).execute().data[0]
