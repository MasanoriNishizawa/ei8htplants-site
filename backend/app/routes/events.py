from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime, timezone, timedelta

_JST = timezone(timedelta(hours=9))

# is_past 判定をJST基準で行うため、現在日付をJSTで取得する
def _today_jst() -> str:
    """現在のJST日付を ISO 8601 形式の文字列（YYYY-MM-DD）で返す。"""
    return datetime.now(_JST).date().isoformat()
from ..db import supabase, admin_supabase
from ..auth import require_auth

router = APIRouter(prefix='/events', tags=['events'])


class EventBody(BaseModel):
    name: str
    slug: Optional[str] = None
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

    @field_validator('slug', 'end_date', 'time', 'booth_number', 'address', 'official_url', mode='before')
    @classmethod
    def empty_str_to_none(cls, v: object) -> object:
        return None if v == '' else v


# end_date があればそちらで、なければ start_date で過去イベント判定する
def _calc_is_past(start_date: str, end_date: Optional[str] = None) -> bool:
    """イベントが過去かどうかをJST基準で判定して返す。

    Args:
        start_date: イベント開始日（YYYY-MM-DD）
        end_date: イベント終了日（YYYY-MM-DD）。指定した場合はこちらで判定する

    Returns:
        過去のイベントであれば True、そうでなければ False
    """
    try:
        return date.fromisoformat(end_date or start_date).isoformat() < _today_jst()
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
    'sales': 0, 'booth_fee': 0, 'distance': 0, 'gas_price': 160,
    'expressway_toll': 0, 'accommodation': 0, 'ws_participants': 0,
    'payment_flag': False, 'other_expenses': 0, 'other_expenses_note': None, 'notes': None,
}


# event_images テーブルから画像をバッチ取得してイベントリストに付加する（N+1を避ける）
def _attach_images(events: list[dict]) -> list[dict]:
    """イベントリストに画像情報を一括で付加して返す。

    event_images テーブルからバッチ取得することで N+1 クエリを回避する。
    各イベントに 'images' キーとして画像レコードのリストを追加する。

    Args:
        events: イベントレコードのリスト

    Returns:
        各要素に 'images' リストが追加されたイベントレコードのリスト
    """
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


# イベント一覧を取得する。?past=true で過去イベント、デフォルトは今後のイベントのみ
@router.get('')
def list_events(past: bool = False):
    """イベント一覧を返す。past=True で過去イベント、デフォルトは今後のイベントのみ。"""
    today = _today_jst()
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
# 全イベントの収支情報を一覧取得する（管理者のみ）
@router.get('/finances')
def list_all_finances(_=Depends(require_auth)):
    """全イベントの収支情報一覧を返す。"""
    return admin_supabase.table('event_finances').select('*').execute().data


class WsSessionInput(BaseModel):
    id: Optional[str] = None
    time_label: str
    max_participants: int = 10


class WsSessionsBody(BaseModel):
    sessions: list[WsSessionInput]


# ワークショップセッション一覧を取得し、各セッションの予約済み人数を計算して付加する
@router.get('/{event_id}/sessions')
def get_sessions(event_id: str, date: Optional[str] = None):
    """ワークショップセッション一覧を取得し、各セッションの予約済み人数を付加して返す。

    session_id が古くなった予約も preferred_time による照合で漏れなく集計する。

    Args:
        event_id: 対象イベントのID
        date: 絞り込む日付（YYYY-MM-DD）。指定しない場合は全日程を対象にする

    Returns:
        reserved_count が付加されたセッションレコードのリスト
    """
    sessions = admin_supabase.table('ws_sessions').select('*').eq('event_id', event_id).order('display_order').execute().data
    if not sessions:
        return []

    session_id_set = {s['id'] for s in sessions}
    # time_label → session_id のマップ（session_id が無効な予約をフォールバックで照合するため）
    time_to_sid = {s['time_label']: s['id'] for s in sessions}

    # event_id 単位で全予約を取得（session_id が古くなった予約も漏れなく拾う）
    query = admin_supabase.table('workshop_reservations') \
        .select('session_id, participants, preferred_time') \
        .eq('event_id', event_id) \
        .neq('status', 'cancelled')
    if date:
        query = query.eq('preferred_date', date)
    reservations = query.execute().data

    count_map: dict[str, int] = {}
    for r in reservations:
        sid = r.get('session_id')
        # session_id が存在しないか、セッション再作成で無効化された場合は preferred_time で照合
        if not sid or sid not in session_id_set:
            sid = time_to_sid.get(r.get('preferred_time') or '')
        if sid:
            count_map[sid] = count_map.get(sid, 0) + (r.get('participants') or 1)

    for s in sessions:
        s['reserved_count'] = count_map.get(s['id'], 0)
    return sessions


# セッション一覧をupsert形式で保存し、送られてこなかった既存セッションは削除する
@router.put('/{event_id}/sessions')
def save_sessions(event_id: str, body: WsSessionsBody, _=Depends(require_auth)):
    """セッション一覧を upsert 形式で保存し、リクエストに含まれないセッションを削除する。

    id が送られた場合はそれを優先してマッチし、なければ time_label でフォールバック照合する。

    Args:
        event_id: 対象イベントのID
        body: 保存するセッションリスト（id・time_label・max_participants を含む）

    Returns:
        保存後の最新セッションリスト（reserved_count 付き）
    """
    existing = admin_supabase.table('ws_sessions').select('id, time_label').eq('event_id', event_id).execute().data or []
    existing_by_id = {s['id']: s for s in existing}
    existing_by_label = {s['time_label']: s['id'] for s in existing}

    incoming_ids: set[str] = set()
    for i, s in enumerate(body.sessions):
        # id が送られてきた場合はそれを優先、なければ time_label で照合
        sid = s.id if s.id and s.id in existing_by_id else existing_by_label.get(s.time_label)
        if sid:
            incoming_ids.add(sid)
            admin_supabase.table('ws_sessions').update({
                'time_label': s.time_label,
                'max_participants': s.max_participants,
                'display_order': i,
            }).eq('id', sid).execute()
        else:
            result = admin_supabase.table('ws_sessions').insert({
                'event_id': event_id,
                'time_label': s.time_label,
                'max_participants': s.max_participants,
                'display_order': i,
            }).execute()
            if result.data:
                incoming_ids.add(result.data[0]['id'])

    # 送られてこなかった既存セッションを削除
    for s in existing:
        if s['id'] not in incoming_ids:
            admin_supabase.table('ws_sessions').delete().eq('id', s['id']).execute()

    return get_sessions(event_id)


class PageContentBody(BaseModel):
    page_content: dict


# イベントページのJSONコンテンツを更新する（管理者のみ）
@router.patch('/{event_id}/page')
def save_page_content(event_id: str, body: PageContentBody, _=Depends(require_auth)):
    """イベントの page_content フィールドを更新して最新のイベントレコードを返す。"""
    admin_supabase.table('events').update({'page_content': body.page_content}).eq('id', event_id).execute()
    return get_event(event_id)


# イベントをslugまたはUUIDで取得する
@router.get('/{event_id}')
def get_event(event_id: str):
    """イベントを slug または UUID で取得し、is_past フラグと画像情報を付加して返す。

    slug で先に検索し、見つからなければ UUID でフォールバック検索する。

    Args:
        event_id: イベントのスラッグまたはUUID

    Returns:
        is_past・images が付加されたイベントレコード

    Raises:
        HTTPException(404): イベントが存在しない場合
    """
    # slug で検索、なければ UUID にフォールバック
    result = supabase.table('events').select('*').eq('slug', event_id).execute()
    data = result.data[0] if result.data else None
    if not data:
        result = supabase.table('events').select('*').eq('id', event_id).execute()
        data = result.data[0] if result.data else None
    if not data:
        raise HTTPException(404)
    today = _today_jst()
    data['is_past'] = (data.get('end_date') or data.get('start_date', '')) < today
    return _attach_images([data])[0]


# 新規イベントを作成し、画像URLを紐付ける
@router.post('')
def create_event(body: EventBody, _=Depends(require_auth)):
    """新規イベントを作成し、画像URLを event_images テーブルに紐付けて返す。"""
    row = body.model_dump(exclude={'image_urls'})
    row['is_past'] = _calc_is_past(body.start_date, body.end_date)
    result = admin_supabase.table('events').insert(row).execute().data[0]
    _save_images(result['id'], body.image_urls)
    return get_event(result['id'])


# イベントを更新する。画像は全削除後に再挿入する（順序変更に対応するため）
@router.put('/{event_id}')
def update_event(event_id: str, body: EventBody, _=Depends(require_auth)):
    """イベントを更新する。画像は全削除後に再挿入して順序変更に対応する。"""
    row = body.model_dump(exclude={'image_urls'})
    row['is_past'] = _calc_is_past(body.start_date, body.end_date)
    admin_supabase.table('events').update(row).eq('id', event_id).execute()
    admin_supabase.table('event_images').delete().eq('event_id', event_id).execute()
    _save_images(event_id, body.image_urls)
    return get_event(event_id)


# イベントを削除する（管理者のみ）
@router.delete('/{event_id}')
def delete_event(event_id: str, _=Depends(require_auth)):
    """指定IDのイベントを削除する。"""
    admin_supabase.table('events').delete().eq('id', event_id).execute()
    return {'ok': True}


# 指定イベントの収支情報を取得する。未登録の場合はデフォルト値を返す
@router.get('/{event_id}/finances')
def get_finances(event_id: str, _=Depends(require_auth)):
    """指定イベントの収支情報を返す。未登録の場合はデフォルト値のオブジェクトを返す。"""
    result = admin_supabase.table('event_finances').select('*').eq('event_id', event_id).execute()
    if result.data:
        return result.data[0]
    return {'event_id': event_id, **_FINANCE_DEFAULTS}


# 収支情報をupsertで保存する（存在すればupdate、なければinsert）
@router.put('/{event_id}/finances')
def save_finances(event_id: str, body: FinanceBody, _=Depends(require_auth)):
    """収支情報を upsert で保存して返す。既存レコードがあれば更新、なければ新規作成する。"""
    data = {**body.model_dump(), 'event_id': event_id, 'updated_at': 'now()'}
    existing = admin_supabase.table('event_finances').select('id').eq('event_id', event_id).execute()
    if existing.data:
        return admin_supabase.table('event_finances').update(data).eq('event_id', event_id).execute().data[0]
    return admin_supabase.table('event_finances').insert(data).execute().data[0]


# 画像URLをevent_imagesテーブルに表示順を付けて一括挿入する
def _save_images(event_id: str, urls: list[str]):
    """画像URLリストを display_order 付きで event_images テーブルに一括挿入する。

    Args:
        event_id: 画像を紐付けるイベントのID
        urls: 挿入する画像URLのリスト（順序がそのまま display_order になる）
    """
    if not urls:
        return
    rows = [{'event_id': event_id, 'url': url, 'display_order': i} for i, url in enumerate(urls)]
    admin_supabase.table('event_images').insert(rows).execute()
