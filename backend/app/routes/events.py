from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/events', tags=['events'])


class EventBody(BaseModel):
    name: str
    start_date: str
    end_date: Optional[str] = None
    time: Optional[str] = None
    location: str
    booth_number: Optional[str] = None
    address: Optional[str] = None
    official_url: Optional[str] = None
    brands: list[str] = []
    has_workshop: bool = False
    ws_requires_reservation: bool = True
    daily_times: Optional[dict] = None
    image_urls: list[str] = []

    @field_validator('end_date', 'time', 'booth_number', 'address', 'official_url', mode='before')
    @classmethod
    def empty_str_to_none(cls, v: object) -> object:
        return None if v == '' else v


def _calc_is_past(start_date: str, end_date: Optional[str] = None) -> bool:
    try:
        return date.fromisoformat(end_date or start_date) < date.today()
    except Exception:
        return False


class FinanceBody(BaseModel):
    sales: int = 0
    booth_fee: int = 0
    distance: int = 0
    gas_price: int = 170
    expressway_toll: int = 0
    accommodation: int = 0
    ws_participants: int = 0
    payment_flag: bool = False
    other_expenses: int = 0
    other_expenses_note: Optional[str] = None
    notes: Optional[str] = None


_FINANCE_DEFAULTS = {
    'sales': 0, 'booth_fee': 0, 'distance': 0, 'gas_price': 170,
    'expressway_toll': 0, 'accommodation': 0, 'ws_participants': 0,
    'payment_flag': False, 'other_expenses': 0, 'other_expenses_note': None, 'notes': None,
}


def _attach_images(events: list[dict]) -> list[dict]:
    if not events:
        return events
    ids = [e['id'] for e in events]
    imgs = supabase.table('event_images').select('*').in_('event_id', ids).order('display_order').execute().data
    img_map: dict[str, list] = {}
    for img in imgs:
        img_map.setdefault(img['event_id'], []).append(img)
    for e in events:
        e['images'] = img_map.get(e['id'], [])
    return events


@router.get('')
def list_events(past: bool = False):
    today = date.today().isoformat()
    data = supabase.table('events').select('*').order('start_date').execute().data
    result = []
    for e in data:
        effective_end = e.get('end_date') or e.get('start_date', '')
        e['is_past'] = effective_end < today
        if e['is_past'] == past:
            result.append(e)
    return _attach_images(result)


# IMPORTANT: static routes must be declared before /{event_id} to avoid
# FastAPI matching the literal segment as a path parameter value.
@router.get('/finances')
def list_all_finances(_=Depends(require_auth)):
    return admin_supabase.table('event_finances').select('*').execute().data


class WsSessionInput(BaseModel):
    time_label: str
    max_participants: int = 10


class WsSessionsBody(BaseModel):
    sessions: list[WsSessionInput]


@router.get('/{event_id}/sessions')
def get_sessions(event_id: str):
    sessions = admin_supabase.table('ws_sessions').select('*').eq('event_id', event_id).order('display_order').execute().data
    if not sessions:
        return []
    session_ids = [s['id'] for s in sessions]
    # reserved_count は ws_sessions にも保存されているが、ステータス変更直後のズレを防ぐため
    # 毎回 workshop_reservations からライブ計算した値で上書きする
    reservations = admin_supabase.table('workshop_reservations').select('session_id, participants').in_('session_id', session_ids).neq('status', 'cancelled').execute().data
    count_map: dict[str, int] = {}
    for r in reservations:
        sid = r.get('session_id')
        if sid:
            # 行数ではなく participants を合計する（複数人予約でも正しく残席を計算するため）
            count_map[sid] = count_map.get(sid, 0) + (r.get('participants') or 1)
    for s in sessions:
        s['reserved_count'] = count_map.get(s['id'], 0)
    return sessions


@router.put('/{event_id}/sessions')
def save_sessions(event_id: str, body: WsSessionsBody, _=Depends(require_auth)):
    admin_supabase.table('ws_sessions').delete().eq('event_id', event_id).execute()
    if body.sessions:
        rows = [
            {'event_id': event_id, 'time_label': s.time_label, 'max_participants': s.max_participants, 'display_order': i}
            for i, s in enumerate(body.sessions)
        ]
        admin_supabase.table('ws_sessions').insert(rows).execute()
    return get_sessions(event_id)


class PageContentBody(BaseModel):
    page_content: dict


@router.patch('/{event_id}/page')
def save_page_content(event_id: str, body: PageContentBody, _=Depends(require_auth)):
    admin_supabase.table('events').update({'page_content': body.page_content}).eq('id', event_id).execute()
    return get_event(event_id)


@router.get('/{event_id}')
def get_event(event_id: str):
    data = supabase.table('events').select('*').eq('id', event_id).single().execute().data
    if not data:
        raise HTTPException(404)
    today = date.today().isoformat()
    data['is_past'] = (data.get('end_date') or data.get('start_date', '')) < today
    return _attach_images([data])[0]


@router.post('')
def create_event(body: EventBody, _=Depends(require_auth)):
    row = body.model_dump(exclude={'image_urls'})
    row['is_past'] = _calc_is_past(body.start_date, body.end_date)
    result = admin_supabase.table('events').insert(row).execute().data[0]
    _save_images(result['id'], body.image_urls)
    return get_event(result['id'])


@router.put('/{event_id}')
def update_event(event_id: str, body: EventBody, _=Depends(require_auth)):
    row = body.model_dump(exclude={'image_urls'})
    row['is_past'] = _calc_is_past(body.start_date, body.end_date)
    admin_supabase.table('events').update(row).eq('id', event_id).execute()
    admin_supabase.table('event_images').delete().eq('event_id', event_id).execute()
    _save_images(event_id, body.image_urls)
    return get_event(event_id)


@router.delete('/{event_id}')
def delete_event(event_id: str, _=Depends(require_auth)):
    admin_supabase.table('events').delete().eq('id', event_id).execute()
    return {'ok': True}


@router.get('/{event_id}/finances')
def get_finances(event_id: str, _=Depends(require_auth)):
    result = admin_supabase.table('event_finances').select('*').eq('event_id', event_id).execute()
    if result.data:
        return result.data[0]
    return {'event_id': event_id, **_FINANCE_DEFAULTS}


@router.put('/{event_id}/finances')
def save_finances(event_id: str, body: FinanceBody, _=Depends(require_auth)):
    data = {**body.model_dump(), 'event_id': event_id, 'updated_at': 'now()'}
    existing = admin_supabase.table('event_finances').select('id').eq('event_id', event_id).execute()
    if existing.data:
        return admin_supabase.table('event_finances').update(data).eq('event_id', event_id).execute().data[0]
    return admin_supabase.table('event_finances').insert(data).execute().data[0]


def _save_images(event_id: str, urls: list[str]):
    if not urls:
        return
    rows = [{'event_id': event_id, 'url': url, 'display_order': i} for i, url in enumerate(urls)]
    admin_supabase.table('event_images').insert(rows).execute()
