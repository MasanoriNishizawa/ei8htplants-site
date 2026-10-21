import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date, datetime, timezone, timedelta

logger = logging.getLogger(__name__)

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
    ws_payment_done: bool = False  # WSの手伝い支払い済みフラグ
    other_expenses: int = 0
    other_expenses_note: Optional[str] = None
    notes: Optional[str] = None


_FINANCE_DEFAULTS = {
    'sales': 0, 'booth_fee': 0, 'distance': 0, 'gas_price': 170,
    'expressway_toll': 0, 'accommodation': 0, 'ws_participants': 0,
    'payment_flag': False, 'ws_payment_done': False,
    'other_expenses': 0, 'other_expenses_note': None, 'notes': None,
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
        # 管理者専用の管理情報（搬入・宿泊・出店料・出店要項など）は公開 API の応答に含めない。
        # 管理情報は event_admin_info テーブルに移したが、migrations/017 で events.admin_info 列を
        # 削除するまでは古い列が残っているため、応答から取り除いておく
        e.pop('admin_info', None)
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


# ダッシュボードに出す管理情報の項目（event_admin_info.info の中のキー）。値が無いイベントは null になる
_DASHBOARD_INFO_KEYS = (
    'carry_in_time', 'carry_out_time', 'hotel_name',
    'booth_fee', 'booth_fee_pay_method', 'booth_fee_due',
)


# 管理画面ダッシュボード用に、今後のイベントと出店料が未払いのイベントの管理情報をまとめて返す（管理者のみ）
# /{event_id}/... より前に置く（静的なパスを先に登録する）
@router.get('/admin-info/dashboard')
def get_admin_info_dashboard(_=Depends(require_auth)):
    """管理画面ダッシュボード用に、イベントごとの管理情報（搬入・ホテル・出店料）を一覧で返す。

    対象:
    - 終了日（無ければ開始日）が今日（JST）以降のイベント全部
    - 終了済みでも、出店料が未払い（booth_fee_paid が false）で、出店料（0 より大きい）か
      支払い期限が入っているイベント
    管理情報が無いイベントは各値 null・booth_fee_paid false にする。並びは開始日の昇順。

    Returns:
        {"items": [{event_id, name, start_date, end_date, location, carry_in_time, carry_out_time,
                    hotel_name, booth_fee, booth_fee_pay_method, booth_fee_due, booth_fee_paid}, ...]}

    Raises:
        HTTPException(500): 読み取りに失敗した場合
    """
    try:
        # 1. イベントを開始日の昇順で読む（必要な列だけ）
        events = admin_supabase.table('events') \
            .select('id, name, start_date, end_date, location') \
            .order('start_date').execute().data or []
        # 2. 管理情報を全件読み、event_id → info の dict にする（イベントごとに読まず 1 回で済ませる）
        info_rows = admin_supabase.table('event_admin_info').select('event_id, info').execute().data or []
        info_map = {
            r.get('event_id'): r.get('info') if isinstance(r.get('info'), dict) else {}
            for r in info_rows
        }
        # 3. 対象のイベントだけ残して、返す形にする
        today = _today_jst()
        items = []
        for e in events:
            info = info_map.get(e.get('id')) or {}
            paid = bool(info.get('booth_fee_paid'))
            effective_end = e.get('end_date') or e.get('start_date') or ''
            is_upcoming = effective_end >= today
            has_unpaid_fee = not paid and (bool(info.get('booth_fee')) or bool(info.get('booth_fee_due')))
            if not (is_upcoming or has_unpaid_fee):
                continue
            item = {
                'event_id': e.get('id'),
                'name': e.get('name'),
                'start_date': e.get('start_date'),
                'end_date': e.get('end_date'),
                'location': e.get('location'),
            }
            item.update({k: info.get(k) for k in _DASHBOARD_INFO_KEYS})
            item['booth_fee_paid'] = paid
            items.append(item)
        # 4. 開始日の昇順にそろえる（DB の並びに頼らず、念のためここでも並べる）
        items.sort(key=lambda i: i.get('start_date') or '')
        return {'items': items}
    except Exception as e:
        logger.error('get_admin_info_dashboard 取得エラー: %s', e)
        raise HTTPException(status_code=500, detail='ダッシュボードの管理情報の取得に失敗しました')


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


# 指定イベントの管理情報（搬入時間・ホテル・ブース費用等）を取得する（管理者のみ）
@router.get('/{event_id}/admin-info')
async def get_admin_info(event_id: str, _=Depends(require_auth)):
    """指定イベントの管理情報を返す。未登録の場合は空の dict を返す。

    管理情報は未ログインでは読めない専用テーブル event_admin_info に保存している。

    Args:
        event_id: 対象イベントのUUID

    Returns:
        管理情報の dict。未登録の場合は {}
    """
    try:
        # 1. 専用テーブルから対象イベントの行を取得する（行が無ければ空のリスト）
        result = admin_supabase.table('event_admin_info').select('info').eq('event_id', event_id).execute()
        # 2. 行があれば中身を返し、無ければ（または中身が null なら）空の dict を返す
        info = result.data[0].get('info') if result.data else None
        return info if info is not None else {}
    except Exception as e:
        logger.error('get_admin_info 取得エラー: %s', e)
        raise HTTPException(status_code=500, detail='管理情報の取得に失敗しました')


class AdminInfoBody(BaseModel):
    """イベント管理情報の入力スキーマ。全フィールド任意。"""

    carry_in_time: Optional[str] = None       # 搬入日時（例: "2026-10-24T09:00"）
    carry_out_time: Optional[str] = None      # 搬出日時
    hotel_name: Optional[str] = None          # 宿泊ホテル名
    hotel_fee: Optional[int] = None           # 宿泊料金（円）
    booth_fee: Optional[int] = None           # 出店料（円）
    booth_fee_pay_method: Optional[str] = None  # 支払い方法（当日現金/事前振込/その他）
    booth_fee_due: Optional[str] = None       # 支払い期限（例: "2026-10-01"）
    booth_fee_paid: bool = False              # 支払い済みフラグ
    notes: Optional[str] = None              # 備考・メモ
    guidelines_text: Optional[str] = None     # 出店要項の本文（主催者から届いた要項の文章を貼り付ける）
    guidelines_image_urls: list[str] = Field(default_factory=list)  # 出店要項の画像 URL 一覧（アップロード順・複数枚）


# 指定イベントの管理情報を保存する（管理者のみ）
@router.put('/{event_id}/admin-info')
async def save_admin_info(event_id: str, body: AdminInfoBody, _=Depends(require_auth)):
    """指定イベントの管理情報を保存する。

    管理情報は未ログインでは読めない専用テーブル event_admin_info に、1イベント1行で保存する
    （既に行があれば上書き、無ければ新規作成）。

    Args:
        event_id: 対象イベントのUUID
        body: 保存する管理情報（AdminInfoBody スキーマで型を保証）

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): イベントが存在しない場合
        HTTPException(500): 保存に失敗した場合
    """
    try:
        # 1. 対象イベントが存在するか確かめる。無ければ 404 を返す
        exists = admin_supabase.table('events').select('id').eq('id', event_id).execute()
        if not exists.data:
            raise HTTPException(status_code=404, detail='イベントが見つかりません')
        # 2. 管理情報を専用テーブルに upsert する（event_id が同じ行があれば上書き）
        admin_supabase.table('event_admin_info').upsert(
            {'event_id': event_id, 'info': body.model_dump(), 'updated_at': datetime.now(timezone.utc).isoformat()},
            on_conflict='event_id',
        ).execute()
        return {'ok': True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error('save_admin_info 保存エラー: %s', e)
        raise HTTPException(status_code=500, detail='管理情報の保存に失敗しました')


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
