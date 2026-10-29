"""イベントの API。

公開: イベント一覧（今後・過去）・1 件（slug または UUID）・ワークショップの時間枠と空き状況
管理者: イベントの作成・更新・削除、時間枠の保存、イベントページの内容、収支、管理情報（搬入・宿泊・出店料など）

過去のイベントかどうかは日本時間（JST）の今日で判定する（app/utils/dates.py）。
"""
import logging
import re
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..auth import require_auth
from ..db import admin_supabase, supabase
from ..db_utils import execute_or_404, fetch_one_or_none
from ..utils.dates import is_past_event, today_jst
from ..utils.errors import error_summary
from ..utils.ids import is_uuid

# 変数の内容: logger: モジュール名を使って記録するロガー、router: この API 群のルーター。
logger = logging.getLogger(__name__)

# main.py から登録する、このモジュールの FastAPI エンドポイントをまとめるルーター。
router = APIRouter(prefix='/events', tags=['events'])


class EventBody(BaseModel):
    """イベントの作成・更新の入力。"""

    # イベント名
    name: str
    # URL に使う短い名前（任意。/events/{slug}）
    slug: Optional[str] = None
    # 開始日（YYYY-MM-DD）
    start_date: str
    # 終了日（YYYY-MM-DD・1 日だけのイベントは None）
    end_date: Optional[str] = None
    # 開催時間の文字列（例 '10:00〜17:00'）
    time: Optional[str] = None
    # 会場名
    location: str
    # ブース番号（任意）
    booth_number: Optional[str] = None
    # 会場の住所（任意。構造化データに使う）
    address: Optional[str] = None
    # 主催者の公式サイトの URL（任意）
    official_url: Optional[str] = None
    # 出店するブランド名の一覧
    brands: list[str] = Field(default_factory=list)
    # ワークショップがあるか
    has_workshop: bool = False
    # ワークショップに予約が要るか
    ws_requires_reservation: bool = True
    # 日ごとの開催時間（キーは 'YYYY-MM-DD'、値は時間の文字列）
    daily_times: Optional[dict] = None
    # 画像の URL の一覧（並び順がそのまま表示順になる。event_images に保存する）
    image_urls: list[str] = Field(default_factory=list)

    @field_validator('slug', 'end_date', 'time', 'booth_number', 'address', 'official_url', mode='before')
    @classmethod
    def empty_str_to_none(cls, v: object) -> object:
        """画面から空文字で送られた任意の項目を None（未設定）にする。

        Args:
            v: 送られてきた値

        Returns:
            空文字なら None、それ以外はそのまま
        """
        # 1. 画面から空文字で送られた任意の項目を None（未設定）にする。
        return None if v == '' else v


def _calc_is_past(start_date: str, end_date: Optional[str] = None) -> bool:
    """イベントが過去かどうかをJST基準で判定して返す（保存するときの is_past 列の値）。

    Args:
        start_date: イベント開始日（YYYY-MM-DD）
        end_date: イベント終了日（YYYY-MM-DD）。指定した場合はこちらで判定する

    Returns:
        過去のイベントであれば True。日付として読めないときは False
    """
    # 1. 終了日（なければ開始日）を ISO 日付として読み、形式不正なら過去扱いしない。
    try:
        # 変数の内容: last_day: イベント開催期間の最終日。
        last_day = date.fromisoformat(end_date or start_date).isoformat()
    except (TypeError, ValueError):
        return False
    # 2. 開催最終日を日本時間の今日と比較して判定する。
    return last_day < today_jst()


# 日付の形（YYYY-MM-DD）。時間枠の空き状況の date で、日付でない文字列を DB に渡さないために使う
_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
# イベントが見つからないときの文言
_EVENT_NOT_FOUND = 'イベントが見つかりません'


def _ensure_event_exists(event_id: str) -> None:
    """id のイベントがあるか確かめる。無ければ 404 にする（管理者の保存の前に使う）。

    存在しない id のまま保存すると外部キー違反（23503）、UUID でない id だと 22P02 で 500 になるため、
    先にイベントを読んで 404 にする。

    Args:
        event_id: イベントの ID

    Raises:
        HTTPException(404): イベントが無い・id が UUID の形でない場合

    Returns:
        なし。
    """
    # 1. 管理用 DB でイベントを確認し、未登録なら後続の保存に進ませない。
    if fetch_one_or_none(admin_supabase.table('events').select('id').eq('id', event_id)) is None:
        raise HTTPException(404, _EVENT_NOT_FOUND)


# ガソリン代の既定の単価（円/リットル）
DEFAULT_GAS_PRICE = 170


class FinanceBody(BaseModel):
    """イベントの収支の入力（金額はすべて円）。"""

    # 売上
    sales: int = 0
    # 出店料
    booth_fee: int = 0
    # 片道の距離（km）
    distance: int = 0
    # ガソリンの単価（円/リットル）
    gas_price: int = DEFAULT_GAS_PRICE
    # 高速道路の料金
    expressway_toll: int = 0
    # 宿泊費
    accommodation: int = 0
    # ワークショップの参加人数
    ws_participants: int = 0
    # 支払い済みフラグ
    payment_flag: bool = False
    # WSの手伝い支払い済みフラグ
    ws_payment_done: bool = False
    # その他の経費
    other_expenses: int = 0
    # その他の経費のメモ
    other_expenses_note: Optional[str] = None
    # 備考
    notes: Optional[str] = None


# 収支が未登録のイベントで返す既定値（FinanceBody の既定値から作るので、項目を足しても手で直さなくてよい）
_FINANCE_DEFAULTS = FinanceBody().model_dump()


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
    # 変数の内容: ids: 検索に使う ID の一覧、img_map: イベント ID ごとの画像一覧、imgs: DB から取得した画像行の一覧。
    ids = [e['id'] for e in events]
    # 1. 全イベントの画像を一括取得し、イベント ID ごとの辞書にまとめる。
    imgs = supabase.table('event_images').select('*').in_('event_id', ids).order('display_order').execute().data
    img_map: dict[str, list] = {}
    # 変数の内容: img: event_images テーブルから取得した画像レコード。
    for img in imgs:
        img_map.setdefault(img['event_id'], []).append(img)
    # 2. 画像を付け、公開してはいけない管理情報を応答から除く。
    for e in events:
        e['images'] = img_map.get(e['id'], [])
        # 管理者専用の管理情報（搬入・宿泊・出店料・出店要項など）は公開 API の応答に含めない。
        # 管理情報は event_admin_info テーブルに移したが、migrations/017 で events.admin_info 列を
        # 削除するまでは古い列が残っているため、応答から取り除いておく
        e.pop('admin_info', None)
    return events


@router.get('')
def list_events(past: bool = False) -> list[dict]:
    """イベント一覧を開始日の順で返す。

    Args:
        past: True なら終わったイベント、False（既定）なら今後・開催中のイベント

    Returns:
        is_past・images を付けたイベントの行のリスト
    """
    # 変数の内容: data: イベント一覧の DB 応答データ、result: 過去条件に一致したイベント行の一覧。、today: 過去イベント判定の基準となる日本時間の日付。
    today = today_jst()
    # 1. 開始日順にイベントを取得し、過去かどうかで指定条件に合う行を選ぶ。
    # 変数の内容: data: 開始日順で取得したイベント行、result: past 条件に一致したイベント行。
    data = supabase.table('events').select('*').order('start_date').execute().data
    result = []
    # 変数の内容: e: 過去条件を判定するイベント行。
    for e in data:
        e['is_past'] = is_past_event(e, today)
        if e['is_past'] == past:
            result.append(e)
    # 2. 選んだイベントに画像情報を加えて返す。
    return _attach_images(result)


# 注意: 固定のパス（/finances・/admin-info/dashboard）は /{event_id} より前に登録する。
# 後にすると、FastAPI が 'finances' などを event_id の値として扱ってしまう
@router.get('/finances')
def list_all_finances(_=Depends(require_auth)) -> list[dict]:
    """全イベントの収支情報一覧を返す（管理者のみ）。

    Returns:
        event_finances の行のリスト

    Args:
        _: 認証依存として注入される値（この関数では使用しません）。
    """
    # 1. 全イベントの収支情報一覧を返す（管理者のみ）。
    return admin_supabase.table('event_finances').select('*').execute().data


# ダッシュボードに出す管理情報の項目（event_admin_info.info の中のキー）。値が無いイベントは null になる
_DASHBOARD_INFO_KEYS = (
    'carry_in_time', 'carry_out_time', 'hotel_name',
    'booth_fee', 'booth_fee_pay_method', 'booth_fee_due',
)


# /{event_id}/... より前に置く（静的なパスを先に登録する）
@router.get('/admin-info/dashboard')
def get_admin_info_dashboard(_=Depends(require_auth)) -> dict:
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

    Args:
        _: 認証依存として注入される値（この関数では使用しません）。
    """
    try:
        # 1. イベントを開始日の昇順で読む（必要な列だけ）
        # 変数の内容: events: 管理画面の一覧に使うイベント行。
        events = admin_supabase.table('events') \
            .select('id, name, start_date, end_date, location') \
            .order('start_date').execute().data or []
        # 2. 管理情報を全件読み、event_id → info の dict にする（イベントごとに読まず 1 回で済ませる）
        # 変数の内容: info_rows: event_admin_info から取得した管理情報行。
        info_rows = admin_supabase.table('event_admin_info').select('event_id, info').execute().data or []
        # 変数の内容: info_map: event_id をキーにしたイベント別管理情報。
        info_map = {
            r.get('event_id'): r.get('info') if isinstance(r.get('info'), dict) else {}
            for r in info_rows
        }
        # 3. 対象のイベントだけ残して、返す形にする
        # 変数の内容: today: 過去イベントを判定する日本時間の日付、items: API 応答にまとめるイベント一覧。
        today = today_jst()
        items = []
        # 変数の内容: e: 過去条件を判定するイベント行。
        for e in events:
            # 変数の内容: has_unpaid_fee: 未払いの出店料があるかの判定、info: イベントに紐づく管理情報、is_upcoming: 開催中または今後のイベントかの判定、paid: 出店料が支払済みかの判定。
            info = info_map.get(e.get('id')) or {}
            paid = bool(info.get('booth_fee_paid'))
            is_upcoming = not is_past_event(e, today)
            has_unpaid_fee = not paid and (bool(info.get('booth_fee')) or bool(info.get('booth_fee_due')))
            if not (is_upcoming or has_unpaid_fee):
                continue
            # 変数の内容: item: 一覧から処理する単一項目。
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
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('get_admin_info_dashboard 取得エラー: %s', error_summary(e))
        raise HTTPException(status_code=500, detail='ダッシュボードの管理情報の取得に失敗しました')


# 時間枠の定員の既定値
DEFAULT_MAX_PARTICIPANTS = 10


class WsSessionInput(BaseModel):
    """ワークショップの時間枠 1 つ分の入力。"""

    # 既存の時間枠の ID（新しく作る枠は None）
    id: Optional[str] = None
    # 時間枠の表示名（例 '10:00〜11:00'）
    time_label: str = Field(min_length=1)
    # 定員（1 以上）
    max_participants: int = Field(default=DEFAULT_MAX_PARTICIPANTS, ge=1)


class WsSessionsBody(BaseModel):
    """イベントの時間枠の一覧（この並びが表示順になる）。"""

    # 時間枠のリスト
    sessions: list[WsSessionInput]


@router.get('/{event_id}/sessions')
def get_sessions(event_id: str, date: Optional[str] = None) -> list[dict]:
    """ワークショップの時間枠の一覧を、各枠の予約済みの人数を付けて返す（公開）。

    Args:
        event_id: 対象イベントの ID（UUID）
        date: 絞り込む日付（YYYY-MM-DD）。指定しない場合は全日程を対象にする

    Returns:
        reserved_count が付加されたセッションレコードのリスト（UUID の形の存在しない id では空のリスト）

    Raises:
        HTTPException(404): event_id が UUID の形でない場合（DB に渡すと 22P02 で 500 になるため）
        HTTPException(400): date が YYYY-MM-DD の形でない場合
    """
    # 1. event_id と任意の日付を検証してから、予約人数付きの時間枠を返す。
    if not is_uuid(event_id):
        raise HTTPException(404, _EVENT_NOT_FOUND)
    if date and not _DATE_RE.match(date):
        raise HTTPException(400, '日付の形が正しくありません')
    return _sessions_with_counts(event_id, date)


def _sessions_with_counts(event_id: str, date: Optional[str] = None) -> list[dict]:
    """時間枠の一覧を読み、各枠の予約済みの人数（reserved_count）を付けて返す。

    session_id が古くなった予約も preferred_time による照合で漏れなく集計する。
    id の形は呼び出し元で確かめておく。

    Args:
        event_id: 対象イベントの ID
        date: 絞り込む日付（YYYY-MM-DD）。None なら全日程

    Returns:
        reserved_count が付加されたセッションレコードのリスト
    """
    # 1. 対象イベントの時間枠を取得し、枠が無ければ空一覧を返す。
    # 変数の内容: sessions: 表示順で取得した対象イベントの時間枠。
    sessions = admin_supabase.table('ws_sessions').select('*').eq('event_id', event_id).order('display_order').execute().data
    if not sessions:
        return []

    # 変数の内容: session_id_set: 有効な時間枠 ID の集合、time_to_sid: 表示時刻から時間枠 ID への対応表。
    session_id_set = {s['id'] for s in sessions}
    # time_label → session_id のマップ（session_id が無効な予約をフォールバックで照合するため）
    time_to_sid = {s['time_label']: s['id'] for s in sessions}

    # 2. event_id 単位で予約を取得し、必要なら日付で絞る。
    # 変数の内容: query: 取消済みを除いた対象イベントの予約検索。
    query = admin_supabase.table('workshop_reservations') \
        .select('session_id, participants, preferred_time') \
        .eq('event_id', event_id) \
        .neq('status', 'cancelled')
    if date:
        # 変数の内容: query: DB へ渡す検索条件。
        query = query.eq('preferred_date', date)
    # 変数の内容: reservations: 取得した予約の一覧。
    reservations = query.execute().data or []

    # 3. session_id または旧予約の preferred_time で照合して人数を集計する。
    # 変数の内容: count_map: 時間枠 ID ごとの予約済み参加人数。
    count_map: dict[str, int] = {}
    # 変数の内容: r: 参加人数を集計するワークショップ予約レコード。
    for r in reservations:
        # 変数の内容: sid: 照合対象の時間枠 ID。
        sid = r.get('session_id')
        # session_id が存在しないか、セッション再作成で無効化された場合は preferred_time で照合
        if not sid or sid not in session_id_set:
            # 変数の内容: sid: 照合対象の時間枠 ID。
            sid = time_to_sid.get(r.get('preferred_time') or '')
        if sid:
            count_map[sid] = count_map.get(sid, 0) + (r.get('participants') or 1)

    # 4. 集計人数を各時間枠に付けて返す。
    for s in sessions:
        s['reserved_count'] = count_map.get(s['id'], 0)
    return sessions


@router.put('/{event_id}/sessions')
def save_sessions(event_id: str, body: WsSessionsBody, _=Depends(require_auth)) -> list[dict]:
    """セッション一覧を upsert 形式で保存し、リクエストに含まれないセッションを削除する（管理者のみ）。

    id が送られた場合はそれを優先してマッチし、なければ time_label でフォールバック照合する。

    Args:
        event_id: 対象イベントのID
        body: 保存するセッションリスト（id・time_label・max_participants を含む）
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        保存後の最新セッションリスト（reserved_count 付き）

    Raises:
        HTTPException(404): イベントが存在しない場合
    """
    # 0. イベントがあるか確かめる（無い id で時間枠を作ると外部キー違反で 500 になるため）
    _ensure_event_exists(event_id)
    # 1. 既存の時間枠を読む
    # 変数の内容: existing: 現在保存済みの時間枠、existing_by_id/label: 既存枠を照合する辞書。
    existing = admin_supabase.table('ws_sessions').select('id, time_label').eq('event_id', event_id).execute().data or []
    existing_by_id = {s['id']: s for s in existing}
    existing_by_label = {s['time_label']: s['id'] for s in existing}

    # 2. 送られた順に、既存の枠は更新・新しい枠は作成する
    # 変数の内容: incoming_ids: 今回の入力に含まれる既存時間枠 ID。
    incoming_ids: set[str] = set()
    # 変数の内容: i: 保存順として使うセッション番号、s: リクエスト内のセッション内容。
    for i, s in enumerate(body.sessions):
        # id が送られてきた場合はそれを優先、なければ time_label で照合
        # 変数の内容: sid: 入力セッションに対応する既存 ID。対応する枠が無ければ None。
        sid = s.id if s.id and s.id in existing_by_id else existing_by_label.get(s.time_label)
        if sid:
            incoming_ids.add(sid)
            admin_supabase.table('ws_sessions').update({
                'time_label': s.time_label,
                'max_participants': s.max_participants,
                'display_order': i,
            }).eq('id', sid).execute()
        else:
            # 変数の内容: result: 新規セッションの INSERT 応答。
            result = admin_supabase.table('ws_sessions').insert({
                'event_id': event_id,
                'time_label': s.time_label,
                'max_participants': s.max_participants,
                'display_order': i,
            }).execute()
            if result.data:
                incoming_ids.add(result.data[0]['id'])

    # 3. 送られてこなかった既存セッションを削除
    for s in existing:
        if s['id'] not in incoming_ids:
            admin_supabase.table('ws_sessions').delete().eq('id', s['id']).execute()

    return _sessions_with_counts(event_id)


class PageContentBody(BaseModel):
    """イベント専用ページの内容（hero・venue・lineup などの JSON）。"""

    # ページの内容
    page_content: dict


@router.patch('/{event_id}/page')
def save_page_content(event_id: str, body: PageContentBody, _=Depends(require_auth)) -> dict:
    """イベントの page_content フィールドを更新して最新のイベントレコードを返す（管理者のみ）。

    Args:
        event_id: イベントの ID
        body: ページの内容
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        更新後のイベント（get_event と同じ形）

    Raises:
        HTTPException(404): イベントが存在しない場合
    """
    # 1. 更新対象のイベントが存在することを確かめる。
    _ensure_event_exists(event_id)
    # 2. 専用ページの内容を保存し、最新のイベント行を読み直して返す。
    admin_supabase.table('events').update({'page_content': body.page_content}).eq('id', event_id).execute()
    return get_event(event_id)


@router.get('/{event_id}')
def get_event(event_id: str) -> dict:
    """イベントを slug または UUID で取得し、is_past フラグと画像情報を付加して返す。

    slug で先に検索し、見つからなければ UUID の形のときだけ id で検索する
    （UUID でない文字列で id 列を検索すると DB がエラーを返すため）。

    Args:
        event_id: イベントのスラッグまたはUUID

    Returns:
        is_past・images が付加されたイベントレコード

    Raises:
        HTTPException(404): イベントが存在しない場合
    """
    # 1. slug で探す
    # 変数の内容: result: slug 検索の Supabase 応答、data: 応答に含まれるイベント行または未取得を表す値。
    result = supabase.table('events').select('*').eq('slug', event_id).execute()
    data = result.data[0] if result.data else None
    # 2. 無ければ、UUID の形のときだけ id で探す
    if not data and is_uuid(event_id):
        # 変数の内容: data: 対象イベントの DB 応答データ、result: イベント ID を指定した検索の Supabase 応答。
        result = supabase.table('events').select('*').eq('id', event_id).execute()
        data = result.data[0] if result.data else None
    if not data:
        raise HTTPException(404, 'イベントが見つかりません')
    # 3. 過去かどうかと画像を付ける
    data['is_past'] = is_past_event(data)
    return _attach_images([data])[0]


@router.post('')
def create_event(body: EventBody, _=Depends(require_auth)) -> dict:
    """新規イベントを作成し、画像URLを event_images テーブルに紐付けて返す（管理者のみ）。

    Args:
        body: イベントの内容
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        作成したイベント（get_event と同じ形）
    """
    # 変数の内容: row: INSERT 前に整形するイベント列、result: INSERT で作成されたイベントレコード。
    # 1. イベント本体を登録し、2. 画像を紐付けて完全なイベントを返す。
    row = body.model_dump(exclude={'image_urls'})
    row['is_past'] = _calc_is_past(body.start_date, body.end_date)
    result = admin_supabase.table('events').insert(row).execute().data[0]
    _save_images(result['id'], body.image_urls)
    return get_event(result['id'])


@router.put('/{event_id}')
def update_event(event_id: str, body: EventBody, _=Depends(require_auth)) -> dict:
    """イベントを更新する。画像は全削除後に再挿入して順序変更に対応する（管理者のみ）。

    Args:
        event_id: イベントの ID
        body: イベントの内容
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        更新後のイベント（get_event と同じ形）

    Raises:
        HTTPException(404): イベントが存在しない場合
    """
    # 1. イベントがあるか確かめる（無い id のまま画像を入れると外部キー違反で 500 になるため）
    _ensure_event_exists(event_id)
    # 2. イベントを更新し、画像は全部消してから送られた順に入れ直す
    # 変数の内容: row: image_urls を除いたイベント更新項目。
    row = body.model_dump(exclude={'image_urls'})
    row['is_past'] = _calc_is_past(body.start_date, body.end_date)
    admin_supabase.table('events').update(row).eq('id', event_id).execute()
    admin_supabase.table('event_images').delete().eq('event_id', event_id).execute()
    _save_images(event_id, body.image_urls)
    return get_event(event_id)


@router.delete('/{event_id}')
def delete_event(event_id: str, _=Depends(require_auth)) -> dict:
    """指定IDのイベントを削除する（管理者のみ）。

    Args:
        event_id: イベントの ID
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        {"ok": True}（UUID の形の存在しない id でも同じ。消す対象が無いだけなので成功とする）

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    # 1. 指定 ID の削除を実行し、ID 形式が不正なら 404 にする（対象行が無くても成功応答を返す）。
    execute_or_404(admin_supabase.table('events').delete().eq('id', event_id), _EVENT_NOT_FOUND)
    return {'ok': True}


@router.get('/{event_id}/finances')
def get_finances(event_id: str, _=Depends(require_auth)) -> dict:
    """指定イベントの収支情報を返す。未登録の場合はデフォルト値のオブジェクトを返す（管理者のみ）。

    Args:
        event_id: イベントの ID
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        event_finances の行、または {event_id, ...既定値}

    Raises:
        HTTPException(404): id が UUID の形でない場合
    """
    # 1. 対象イベントの収支を検索する。
    # 変数の内容: result: 収支レコード検索の Supabase 応答。
    result = execute_or_404(admin_supabase.table('event_finances').select('*').eq('event_id', event_id), _EVENT_NOT_FOUND)
    if result.data:
        # 2. 登録済みの収支があれば、その行を返す。
        return result.data[0]
    # 3. 未登録なら既定値をイベント ID と組み合わせて返す。
    return {'event_id': event_id, **_FINANCE_DEFAULTS}


@router.put('/{event_id}/finances')
def save_finances(event_id: str, body: FinanceBody, _=Depends(require_auth)) -> dict:
    """収支情報を upsert で保存して返す（管理者のみ）。

    event_finances は event_id が一意なので、同じイベントの行があれば上書き、無ければ作成する
    （読んでから書く 2 回の呼び出しをやめ、同時に保存しても行が 2 つにならないようにした）。

    Args:
        event_id: イベントの ID
        body: 収支の内容
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        保存した event_finances の行

    Raises:
        HTTPException(404): イベントが存在しない場合（無い id で保存すると外部キー違反で 500 になるため先に確かめる）
    """
    # 1. 収支をひも付けるイベントの存在を確認する。
    _ensure_event_exists(event_id)
    # 変数の内容: data: 保存処理へ渡すイベント収支のリクエストデータ。
    data = {**body.model_dump(), 'event_id': event_id, 'updated_at': datetime.now(timezone.utc).isoformat()}
    # 2. event_id を競合キーにして作成または更新し、保存行を返す。
    return admin_supabase.table('event_finances').upsert(data, on_conflict='event_id').execute().data[0]


@router.get('/{event_id}/admin-info')
def get_admin_info(event_id: str, _=Depends(require_auth)) -> dict:
    """指定イベントの管理情報（搬入時間・ホテル・ブース費用等）を返す。未登録の場合は空の dict を返す（管理者のみ）。

    同期の関数にして、Supabase の同期の呼び出しを FastAPI のスレッドプールで行う（イベントループを止めない）。
    管理情報は未ログインでは読めない専用テーブル event_admin_info に保存している。

    Args:
        event_id: 対象イベントのUUID
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        管理情報の dict。未登録の場合は {}

    Raises:
        HTTPException(404): id が UUID の形でない場合
        HTTPException(500): 読み取りに失敗した場合
    """
    try:
        # 1. 専用テーブルから対象イベントの行を取得する（行が無ければ空のリスト）
        # 変数の内容: result: event_admin_info の検索結果。
        result = execute_or_404(
            admin_supabase.table('event_admin_info').select('info').eq('event_id', event_id), _EVENT_NOT_FOUND
        )
        # 2. 行があれば中身を返し、無ければ（または中身が null なら）空の dict を返す
        # 変数の内容: info: DB 応答から取り出したイベント管理情報。
        info = result.data[0].get('info') if result.data else None
        return info if info is not None else {}
    except HTTPException:
        raise
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('get_admin_info 取得エラー: %s', error_summary(e))
        raise HTTPException(status_code=500, detail='管理情報の取得に失敗しました')


class AdminInfoBody(BaseModel):
    """イベント管理情報の入力スキーマ。全フィールド任意。"""

    # 変数の内容: booth_fee: イベント出店料、booth_fee_due: 出店料の支払期限、booth_fee_paid: 出店料の支払済み状態、booth_fee_pay_method: 出店料の支払方法、carry_in_time: イベントの搬入時刻、carry_out_time: イベントの搬出時刻、guidelines_image_urls: 出店要項に添付する画像 URL 一覧、guidelines_text: イベントの出店要項本文、hotel_fee: イベント宿泊費、hotel_name: イベント宿泊先名、notes: イベント管理用の備考。
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


@router.put('/{event_id}/admin-info')
def save_admin_info(event_id: str, body: AdminInfoBody, _=Depends(require_auth)) -> dict:
    """指定イベントの管理情報を保存する（管理者のみ）。

    管理情報は未ログインでは読めない専用テーブル event_admin_info に、1イベント1行で保存する
    （既に行があれば上書き、無ければ新規作成）。

    Args:
        event_id: 対象イベントのUUID
        body: 保存する管理情報（AdminInfoBody スキーマで型を保証）
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): イベントが存在しない場合
        HTTPException(500): 保存に失敗した場合
    """
    try:
        # 1. 対象イベントが存在するか確かめる。無ければ 404 を返す
        # 変数の内容: exists: 指定されたイベント ID の検索結果。
        exists = execute_or_404(admin_supabase.table('events').select('id').eq('id', event_id), _EVENT_NOT_FOUND)
        if not exists.data:
            raise HTTPException(status_code=404, detail=_EVENT_NOT_FOUND)
        # 2. 管理情報を専用テーブルに upsert する（event_id が同じ行があれば上書き）
        admin_supabase.table('event_admin_info').upsert(
            {'event_id': event_id, 'info': body.model_dump(), 'updated_at': datetime.now(timezone.utc).isoformat()},
            on_conflict='event_id',
        ).execute()
        return {'ok': True}
    except HTTPException:
        raise
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        # 例外の文字列には保存しようとした管理情報が入りうるので、型名とコードだけを出す
        logger.error('save_admin_info 保存エラー: %s', error_summary(e))
        raise HTTPException(status_code=500, detail='管理情報の保存に失敗しました')


def _save_images(event_id: str, urls: list[str]) -> None:
    """画像URLリストを display_order 付きで event_images テーブルに一括挿入する。

    Args:
        event_id: 画像を紐付けるイベントのID
        urls: 挿入する画像URLのリスト（順序がそのまま display_order になる）

    Returns:
        なし。
    """
    # 1. 空の画像一覧は書き込みを省略し、それ以外は入力順で表示順を付けて一括保存する。
    if not urls:
        return
    # 変数の内容: rows: DB から取得した行の一覧。
    rows = [{'event_id': event_id, 'url': url, 'display_order': i} for i, url in enumerate(urls)]
    admin_supabase.table('event_images').insert(rows).execute()
