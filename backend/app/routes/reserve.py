import resend
import secrets
import string
import threading
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from ..db import admin_supabase, supabase
from ..config import RESEND_API_KEY, CONTACT_FROM_EMAIL, SENDER, NO_REPLY_NOTE
from ..auth import require_auth

_session_locks: dict[str, threading.Lock] = {}
_session_locks_mu = threading.Lock()

def _session_lock(session_id: str) -> threading.Lock:
    with _session_locks_mu:
        if session_id not in _session_locks:
            _session_locks[session_id] = threading.Lock()
        return _session_locks[session_id]

router = APIRouter(prefix='/reserve', tags=['reserve'])


class ReserveBody(BaseModel):
    event_id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    participants: int = 1
    note: Optional[str] = None
    session_id: Optional[str] = None
    bring_plant: bool = False
    bring_pot: bool = False
    preferred_date: Optional[str] = None
    preferred_time: Optional[str] = None


class ReserveStatusPatch(BaseModel):
    status: str


class CancelBody(BaseModel):
    token: str


def _generate_cancel_token() -> str:
    return ''.join(secrets.choice(string.digits) for _ in range(8))


def _sync_reserved_count(session_id: str):
    # ws_sessions.reserved_count はデノーマライズ値。get_sessions はライブ計算で上書きするが、
    # 管理画面など DB を直接参照するケース向けに変更のたびに同期する
    result = admin_supabase.table('workshop_reservations') \
        .select('participants') \
        .eq('session_id', session_id) \
        .neq('status', 'cancelled') \
        .execute()
    total = sum(r['participants'] for r in (result.data or []))
    admin_supabase.table('ws_sessions').update({'reserved_count': total}).eq('id', session_id).execute()


@router.post('')
def create_reservation(body: ReserveBody):
    if body.session_id:
        with _session_lock(body.session_id):
            session = admin_supabase.table('ws_sessions').select('max_participants, time_label').eq('id', body.session_id).single().execute().data
            if session:
                by_sid = admin_supabase.table('workshop_reservations') \
                    .select('participants') \
                    .eq('session_id', body.session_id) \
                    .neq('status', 'cancelled') \
                    .execute()
                used = sum(r['participants'] for r in (by_sid.data or []))
                q = admin_supabase.table('workshop_reservations') \
                    .select('participants') \
                    .eq('event_id', body.event_id) \
                    .eq('preferred_time', session['time_label']) \
                    .is_('session_id', 'null') \
                    .neq('status', 'cancelled')
                if body.preferred_date:
                    q = q.eq('preferred_date', body.preferred_date)
                by_time = q.execute()
                used += sum(r['participants'] for r in (by_time.data or []))
                if used + body.participants > session['max_participants']:
                    raise HTTPException(409, 'このセッションは満席です')
            row = admin_supabase.table('workshop_reservations').insert(body.model_dump()).execute().data[0]
    else:
        row = admin_supabase.table('workshop_reservations').insert(body.model_dump()).execute().data[0]
    if body.session_id:
        try:
            _sync_reserved_count(body.session_id)
        except Exception as e:
            print(f'[reserve] sync reserved_count failed: {e}')
    _send_confirmation(body)
    return row


@router.post('/cancel')
def cancel_by_token(body: CancelBody):
    # トークンが存在するかをまず確認し、済みキャンセルと未登録を区別して返す
    all_rows = admin_supabase.table('workshop_reservations') \
        .select('id, status, session_id, created_at') \
        .eq('cancel_token', body.token) \
        .order('created_at', desc=True) \
        .execute()
    if not all_rows.data:
        raise HTTPException(404, 'キャンセルIDが見つかりません')
    # 同トークンは過去イベントで再利用される可能性があるため、最新の未キャンセル行を対象にする
    row = next((r for r in all_rows.data if r['status'] != 'cancelled'), None)
    if not row:
        raise HTTPException(400, 'この予約はすでにキャンセル済みです')
    updated = admin_supabase.table('workshop_reservations') \
        .update({'status': 'cancelled'}) \
        .eq('id', row['id']) \
        .execute().data[0]
    if row.get('session_id'):
        try:
            _sync_reserved_count(row['session_id'])
        except Exception as e:
            print(f'[reserve] sync after cancel failed: {e}')
    return updated


def _send_confirmation(body: ReserveBody):
    if not RESEND_API_KEY or not CONTACT_FROM_EMAIL:
        return
    event = supabase.table('events').select('name, start_date, location').eq('id', body.event_id).single().execute().data
    if not event:
        return
    time_line = ''
    if body.session_id:
        session = admin_supabase.table('ws_sessions').select('time_label').eq('id', body.session_id).single().execute().data
        if session:
            time_line = f'\n予約時間: {session["time_label"]}'
    elif body.preferred_time:
        time_line = f'\n予約時間: {body.preferred_time}'
    date_line = f'\n予約日: {body.preferred_date}' if body.preferred_date else ''
    bring_lines = ''
    if body.bring_plant:
        bring_lines += '\n植物持ち込み: あり'
    if body.bring_pot:
        bring_lines += '\n鉢持ち込み: あり'
    note_line = f'\n備考: {body.note}' if body.note else ''
    resend.api_key = RESEND_API_KEY
    resend.Emails.send({
        'from': SENDER,
        'to': [body.email],
        'subject': f'[Habitat Oides] ワークショップ予約を受け付けました: {event["name"]}',
        'text': (
            f'{body.name} 様\n\n'
            f'ワークショップへのお申し込みありがとうございます。\n'
            f'以下の内容で予約を受け付けました。\n\n'
            f'イベント名: {event["name"]}\n'
            f'開催日: {event["start_date"]}\n'
            f'会場: {event["location"]}{date_line}{time_line}\n'
            f'参加人数: {body.participants} 名{bring_lines}{note_line}\n\n'
            f'Habitat Oides\n'
            f'https://ei8htplants.com'
            + NO_REPLY_NOTE
        ),
    })


def _send_cancel_link_email(reservation: dict, event: dict, cancel_token: str):
    if not RESEND_API_KEY or not CONTACT_FROM_EMAIL:
        return
    cancel_url = f'https://ei8htplants.com/cancel?id={cancel_token}'
    resend.api_key = RESEND_API_KEY
    resend.Emails.send({
        'from': SENDER,
        'to': [reservation['email']],
        'subject': f'[Habitat Oides] ワークショップ予約が確定しました: {event["name"]}',
        'text': (
            f'{reservation["name"]} 様\n\n'
            f'ワークショップのご予約が確定いたしました。\n'
            f'当日のご参加をお待ちしております。\n\n'
            f'─────────────────\n'
            f'キャンセルID: {cancel_token}\n\n'
            f'ご都合によりキャンセルされる場合は、以下のリンクよりお手続きください。\n'
            f'{cancel_url}\n'
            f'─────────────────\n\n'
            f'Habitat Oides\n'
            f'https://ei8htplants.com'
            + NO_REPLY_NOTE
        ),
    })


@router.get('s')
def list_reservations(event_id: Optional[str] = None, _=Depends(require_auth)):
    q = admin_supabase.table('workshop_reservations').select('*').order('created_at', desc=True)
    if event_id:
        q = q.eq('event_id', event_id)
    return q.execute().data


@router.patch('s/{reservation_id}')
def update_reservation_status(reservation_id: str, body: ReserveStatusPatch, _=Depends(require_auth)):
    row = admin_supabase.table('workshop_reservations') \
        .select('*') \
        .eq('id', reservation_id) \
        .single().execute().data
    if not row:
        raise HTTPException(404, 'Not found')

    update_data: dict = {'status': body.status}
    cancel_token = None
    # 再確定時にトークンが変わるとメール済みのリンクが無効になるため、初回のみ生成する
    if body.status == 'confirmed' and not row.get('cancel_token'):
        cancel_token = _generate_cancel_token()
        update_data['cancel_token'] = cancel_token

    updated = admin_supabase.table('workshop_reservations').update(update_data).eq('id', reservation_id).execute().data[0]

    if row.get('session_id'):
        try:
            _sync_reserved_count(row['session_id'])
        except Exception as e:
            print(f'[reserve] sync reserved_count failed: {e}')

    if cancel_token:
        try:
            event = supabase.table('events').select('name, start_date, location').eq('id', row['event_id']).single().execute().data
            if event:
                _send_cancel_link_email(row, event, cancel_token)
        except Exception as e:
            print(f'[reserve] cancel link email failed: {e}')

    return updated
