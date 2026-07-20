from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
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
    is_past: bool = False
    image_urls: list[str] = []


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
    data = supabase.table('events').select('*').eq('is_past', past).order('start_date').execute().data
    return _attach_images(data)


@router.get('/{event_id}')
def get_event(event_id: str):
    data = supabase.table('events').select('*').eq('id', event_id).single().execute().data
    if not data:
        raise HTTPException(404)
    return _attach_images([data])[0]


@router.post('')
def create_event(body: EventBody, _=Depends(require_auth)):
    row = body.model_dump(exclude={'image_urls'})
    result = admin_supabase.table('events').insert(row).execute().data[0]
    _save_images(result['id'], body.image_urls)
    return get_event(result['id'])


@router.put('/{event_id}')
def update_event(event_id: str, body: EventBody, _=Depends(require_auth)):
    row = body.model_dump(exclude={'image_urls'})
    admin_supabase.table('events').update(row).eq('id', event_id).execute()
    admin_supabase.table('event_images').delete().eq('event_id', event_id).execute()
    _save_images(event_id, body.image_urls)
    return get_event(event_id)


@router.delete('/{event_id}')
def delete_event(event_id: str, _=Depends(require_auth)):
    admin_supabase.table('events').delete().eq('id', event_id).execute()
    return {'ok': True}


def _save_images(event_id: str, urls: list[str]):
    if not urls:
        return
    rows = [{'event_id': event_id, 'url': url, 'display_order': i} for i, url in enumerate(urls)]
    admin_supabase.table('event_images').insert(rows).execute()
