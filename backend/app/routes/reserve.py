"""ワークショップ予約の API。

公開: 予約の作成（POST /api/reserve）・キャンセル（POST /api/reserve/cancel）・Resend の配信失敗の通知の受け口
管理者: 予約一覧・ステータスの変更・当日参加の登録

予約者には Habitat Oides 名義（HABITAT_RESEND_API_KEY）で受付・キャンセルのメールを送る。
メールの送信に失敗しても予約・キャンセルそのものは成立させる。
"""
import logging
import secrets
import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Iterator, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr, Field

from ..auth import require_auth
from ..config import HABITAT_ADMIN_EMAIL, HABITAT_RESEND_API_KEY, HABITAT_SENDER, SITE_ORIGIN
from ..db import admin_supabase, supabase
from ..db_utils import execute_or_400, execute_or_404, fetch_one_or_404, fetch_one_or_none, first_or_404
from ..mail import esc, send_mail
from ..rate_limit import cancel_limiter, client_ip, reserve_limiter
from ..utils.dates import event_end_date, today_jst
from ..utils.errors import error_summary

# 変数の内容: logger: モジュール名を使って記録するロガー、router: この API 群のルーター。
logger = logging.getLogger(__name__)

router = APIRouter(prefix='/reserve', tags=['reserve'])

# 1 件の予約で申し込める最大人数
MAX_PARTICIPANTS = 10
# 新しく作るキャンセルトークンのバイト数（token_urlsafe で約 22 文字になる。推測されないよう十分に長くする）
CANCEL_TOKEN_BYTES = 16
# キャンセルトークンとして受け付ける最大の長さ（以前の 8 桁の数字のトークンも受け付ける）
CANCEL_TOKEN_MAX_LEN = 64
# 予約のステータス。pending=受付済・confirmed=確定（受付済と同じ扱いの古い値）・cancelled=キャンセル
ReservationStatus = Literal['pending', 'confirmed', 'cancelled']
# 日付の形（YYYY-MM-DD）
_DATE_PATTERN = r'^\d{4}-\d{2}-\d{2}$'

@dataclass
class _LockEntry:
    """時間枠 1 つ分のロックと、そのロックを今使っている（待っている）処理の数。"""

    # 同じ時間枠への同時の予約を 1 つずつ通すロック
    lock: threading.Lock = field(default_factory=threading.Lock)
    # このロックを取っている・取ろうとしている処理の数。0 になったら辞書から消す
    users: int = 0


# 時間枠の ID → ロック。使っている処理があるあいだだけ置き、使い終わったら消す
# （任意の session_id でロックが作られて残り続け、メモリが増え続けるのを防ぐ）
_session_locks: dict[str, _LockEntry] = {}
# _session_locks を読み書きするときに取るロック
_session_locks_mu = threading.Lock()


@contextmanager
def _session_lock(session_id: str) -> Iterator[None]:
    """時間枠ごとのロックを取る。with の中では同じ時間枠の満席確認と保存が 1 つずつ行われる。

    ロックは使う処理の数を数え、最後の処理が抜けたら辞書から消す。
    使用中のロックは消さないので、同じ時間枠の処理が別々のロックを取ることはない。

    Args:
        session_id: ワークショップの時間枠の ID（呼び出し元で存在を確かめておく）

    Yields:
        なし（with の中がロックを取った状態）

    Returns:
        注釈に示した形式の応答（Iterator[None]）。
    """
    # 1. ロックを取り出し（無ければ作り）、使う数を 1 増やす
    with _session_locks_mu:
        # 変数の内容: entry: 処理対象の一覧項目。
        entry = _session_locks.get(session_id)
        if entry is None:
            # 変数の内容: entry: 処理対象の一覧項目。
            entry = _session_locks[session_id] = _LockEntry()
        entry.users += 1
    try:
        # 2. ロックを取って with の中を実行する
        with entry.lock:
            yield
    finally:
        # 3. 使う数を 1 減らし、誰も使っていなければ辞書から消す
        with _session_locks_mu:
            entry.users -= 1
            if entry.users == 0:
                _session_locks.pop(session_id, None)


class ReserveBody(BaseModel):
    """予約フォームから送られる予約の内容。"""

    # 予約するイベントの ID（UUID）
    event_id: str = Field(max_length=64)
    # 予約者の名前
    name: str = Field(min_length=1, max_length=100)
    # 予約者のメールアドレス（受付・キャンセルのメールの宛先）
    email: EmailStr
    # 電話番号（任意）
    phone: Optional[str] = Field(default=None, max_length=30)
    # 参加人数（1〜MAX_PARTICIPANTS）
    participants: int = Field(default=1, ge=1, le=MAX_PARTICIPANTS)
    # 備考（任意）
    note: Optional[str] = Field(default=None, max_length=2000)
    # 予約する時間枠（ws_sessions の ID）。時間枠の無いイベントでは None
    session_id: Optional[str] = Field(default=None, max_length=64)
    # 植物を持ち込むか
    bring_plant: bool = False
    # 鉢を持ち込むか
    bring_pot: bool = False
    # 予約する日（YYYY-MM-DD）。複数日のイベントで使う
    preferred_date: Optional[str] = Field(default=None, pattern=_DATE_PATTERN)
    # 希望の時間（時間枠を使わない古い形式の予約で使う文字列）
    preferred_time: Optional[str] = Field(default=None, max_length=100)
    # メールの言語。'en' なら英語、それ以外は日本語
    lang: Optional[str] = Field(default=None, max_length=10)


class ReserveStatusPatch(BaseModel):
    """管理画面から予約のステータスを変えるときの入力。"""

    # 新しいステータス
    status: ReservationStatus


class CancelBody(BaseModel):
    """キャンセル画面から送られるキャンセルトークン。"""

    # 受付メールに書いたキャンセル ID（新しい形式は英数字と - _ の約 22 文字、古い形式は 8 桁の数字）
    token: str = Field(min_length=1, max_length=CANCEL_TOKEN_MAX_LEN)


class WalkInBody(BaseModel):
    """管理画面から当日参加を登録するときの入力。"""

    # 参加するイベントの ID
    event_id: str = Field(max_length=64)
    # 参加人数（1〜MAX_PARTICIPANTS）
    participants: int = Field(default=1, ge=1, le=MAX_PARTICIPANTS)
    # 参加する時間枠（ws_sessions の ID）
    session_id: Optional[str] = Field(default=None, max_length=64)
    # 時間（時間枠を使わない場合の文字列）
    preferred_time: Optional[str] = Field(default=None, max_length=100)
    # 参加する日（YYYY-MM-DD）
    preferred_date: Optional[str] = Field(default=None, pattern=_DATE_PATTERN)


def _generate_cancel_token() -> str:
    """推測されにくいキャンセルトークン（URL に入れられる英数字と - _ の約 22 文字）を作る。

    以前は 8 桁の数字だった。古いトークンもキャンセル API ではそのまま使える。

    Returns:
        キャンセルトークンの文字列
    """
    return secrets.token_urlsafe(CANCEL_TOKEN_BYTES)


def _sync_reserved_count(session_id: str) -> None:
    """ws_sessions.reserved_count をキャンセル除外の実予約合計で上書き同期する。

    ws_sessions.reserved_count はデノーマライズ値のため、予約の追加・変更・キャンセルのたびに
    呼び出して整合性を保つ（空き状況の API は毎回数え直すが、DB を直接見る場合のため）。

    Args:
        session_id: 同期対象のワークショップセッションID

    Returns:
        なし。
    """
    # 1. キャンセル以外の予約から、対象セッションの参加人数を取得する。
    # 変数の内容: result: セッションに紐づく予約レコードの DB 応答、total: キャンセル以外の予約人数の合計。
    result = admin_supabase.table('workshop_reservations') \
        .select('participants') \
        .eq('session_id', session_id) \
        .neq('status', 'cancelled') \
        .execute()
    # 2. 参加人数を合計し、セッションの集計値を上書きする。
    total = sum(r['participants'] for r in (result.data or []))
    admin_supabase.table('ws_sessions').update({'reserved_count': total}).eq('id', session_id).execute()


def _sync_reserved_count_safely(session_id: Optional[str]) -> None:
    """_sync_reserved_count を呼び、失敗してもログだけ残して続ける。

    Args:
        session_id: 同期するセッション ID。None なら何もしない

    Returns:
        なし。
    """
    # 1. 同期対象がある場合だけ件数を更新し、失敗はログに残して予約処理を継続する。
    if not session_id:
        return
    try:
        _sync_reserved_count(session_id)
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('reserved_count の同期に失敗しました: %s', error_summary(e))


def _session_used_count(event_id: str, session: dict, preferred_date: Optional[str]) -> int:
    """時間枠にすでに入っている人数（キャンセルを除く）を数える。

    空き状況の API（events.get_sessions）と同じく、session_id が無い古い予約は
    preferred_time が時間枠の表示名と同じものを数える（二重に数えないため）。

    Args:
        event_id: イベントの ID
        session: ws_sessions の行（id・time_label を含む）
        preferred_date: 予約日（YYYY-MM-DD）。指定するとその日の予約だけ数える

    Returns:
        入っている人数の合計
    """
    # 1. キャンセル以外の予約を対象イベントで検索し、必要なら予約日も絞る。
    # 変数の内容: query: 対象イベント・予約日を指定する予約検索。
    query = admin_supabase.table('workshop_reservations') \
        .select('session_id, participants, preferred_time') \
        .eq('event_id', event_id) \
        .neq('status', 'cancelled')
    if preferred_date:
        # 変数の内容: query: DB へ渡す検索条件。
        query = query.eq('preferred_date', preferred_date)
    # 2. セッション ID を優先し、古い予約は希望時刻で照合して人数を合計する。
    # 変数の内容: used: 対象の時間枠に予約済みの参加人数。
    used = 0
    # 変数の内容: r: 使用人数を加算するキャンセル以外の予約レコード。
    for r in query.execute().data or []:
        # 変数の内容: sid: 照合対象の時間枠 ID。
        sid = r.get('session_id')
        if sid == session['id'] or (not sid and r.get('preferred_time') == session['time_label']):
            used += r.get('participants') or 1
    return used


def _load_session_for_event(session_id: str, event_id: str) -> dict:
    """時間枠を読み、そのイベントの時間枠であることを確かめて返す。

    Args:
        session_id: ws_sessions の ID
        event_id: 予約するイベントの ID

    Returns:
        ws_sessions の行（id・event_id・max_participants・time_label）

    Raises:
        HTTPException(400): 時間枠が無い、または別のイベントの時間枠の場合
    """
    # 変数の内容: session: 処理対象の予約時間枠。
    session = fetch_one_or_none(
        admin_supabase.table('ws_sessions')
        .select('id, event_id, max_participants, time_label')
        .eq('id', session_id)
    )
    # 1. 取得した時間枠が指定イベントに属するかを検証する。
    if not session or session.get('event_id') != event_id:
        raise HTTPException(400, 'ワークショップの時間枠が正しくありません')
    # 2. 旧レコードに id が含まれない場合は検索に使った ID を補って返す。
    # 古いデータで id が返らない場合に備え、検索に使った ID を入れておく
    session.setdefault('id', session_id)
    return session


def _check_reservable(event: dict, preferred_date: Optional[str]) -> None:
    """イベントの予約受付期間と、予約日が開催期間内かを確かめる。

    Args:
        event: events の行（start_date・end_date）
        preferred_date: 予約日（YYYY-MM-DD）。None なら日付の確認はしない

    Raises:
        HTTPException(400): イベントが終わっている・予約日が開催期間外・予約日が過ぎている場合

    Returns:
        なし。
    """
    # 変数の内容: end: 解析対象の終了位置、today: 日付比較の基準となる今日。
    today = today_jst()
    # 1. イベントの最終日が日本時間の今日より前なら受付終了
    end = event_end_date(event)
    if end < today:
        raise HTTPException(400, 'このイベントの予約受付は終了しています')
    if not preferred_date:
        return
    # 2. 予約日が開催期間（開始日〜最終日）の中にあるか
    # 変数の内容: start: イベントの開始日。
    start = event.get('start_date') or ''
    if not (start <= preferred_date <= end):
        raise HTTPException(400, '予約日がイベントの開催期間外です')
    # 3. 予約日が過ぎていないか
    if preferred_date < today:
        raise HTTPException(400, 'この日の予約受付は終了しています')


@router.post('')
def create_reservation(body: ReserveBody, request: Request) -> dict:
    """ワークショップ予約を作成し、受付確認メールと管理者通知を送信する。

    session_id が指定されている場合はセッションロックを取得して満席チェックと
    DB挿入をアトミックに行う。メール送信失敗は予約成立を妨げない。

    Args:
        body: 予約情報（名前・メール・セッションID・参加人数・言語など）
        request: 回数制限に使う送り元の IP を読むためのリクエスト

    Returns:
        作成した予約レコード（cancel_token・resend_email_id などを含む）

    Raises:
        HTTPException(400): 受付終了・予約日が開催期間外・時間枠が別のイベントのものの場合
        HTTPException(404): イベントが見つからない場合
        HTTPException(409): セッションが満席の場合
        HTTPException(429): 同じ IP から短時間に送りすぎた場合
    """
    # 1. 回数制限
    reserve_limiter.check(client_ip(request))
    # 2. イベントがあり、予約を受け付けている期間か確かめる
    # 変数の内容: event_row: 予約期間の検証に使うイベント行、data: DB に保存する予約項目とキャンセルトークン。
    event_row = fetch_one_or_404(
        supabase.table('events').select('start_date, end_date').eq('id', body.event_id),
        'イベントが見つかりません',
    )
    _check_reservable(event_row, body.preferred_date)
    data = body.model_dump()
    data['cancel_token'] = _generate_cancel_token()
    # 3. 時間枠があれば、先に時間枠があることを確かめてから（無い id でロックを作らないため）、
    #    ロックの中で満席を確かめて保存する
    if body.session_id:
        # 変数の内容: session: 処理対象の予約時間枠。
        session = _load_session_for_event(body.session_id, body.event_id)
        with _session_lock(body.session_id):
            # 変数の内容: used: 予約済みの参加人数。
            used = _session_used_count(body.event_id, session, body.preferred_date)
            if used + body.participants > session['max_participants']:
                raise HTTPException(409, 'このセッションは満席です')
            # 変数の内容: row: DB から取得した単一レコード。
            row = admin_supabase.table('workshop_reservations').insert(data).execute().data[0]
    else:
        # 変数の内容: row: DB から取得した単一レコード。
        row = admin_supabase.table('workshop_reservations').insert(data).execute().data[0]
    _sync_reserved_count_safely(body.session_id)
    # 4. 予約者への受付メール。失敗したら email_failed を立てて管理画面で気づけるようにする
    # 変数の内容: mail_event: メール本文用のイベント情報、time_label: 表示する時間、update: 送信結果として予約行へ保存する変更。
    mail_event, time_label = _load_mail_context(body.event_id, body.session_id, body.preferred_time)
    update: dict = {}
    try:
        if HABITAT_RESEND_API_KEY and not mail_event:
            # イベント情報を読めず受付メールを送れなかった
            raise RuntimeError('mail context unavailable')
        # 変数の内容: resend_email_id: Resend が返すメール ID。
        resend_email_id = _send_confirmation(body, data['cancel_token'], mail_event, time_label)
        if resend_email_id:
            update['resend_email_id'] = resend_email_id
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('予約の受付メールの送信に失敗しました: %s', error_summary(e))
        update['email_failed'] = True
    if update:
        try:
            admin_supabase.table('workshop_reservations').update(update).eq('id', row['id']).execute()
            row.update(update)
        # 変数の内容: e: except で捕捉した処理例外。
        except Exception as e:
            logger.error('予約のメール送信結果の保存に失敗しました: %s', error_summary(e))
    # 5. 管理者への通知
    try:
        _send_admin_notification(body, mail_event, time_label)
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('予約の管理者通知の送信に失敗しました: %s', error_summary(e))
    return row


@router.post('/cancel')
def cancel_by_token(body: CancelBody, request: Request) -> dict:
    """キャンセルトークンで予約を取り消し、キャンセル確認メールを送信する。

    応答には予約者の情報（名前・メールなど）を含めない（トークンを知っているだけの第三者に見せないため）。
    同一トークンが複数イベントで再利用される可能性があるため（古い 8 桁のトークン）、
    最新の未キャンセル行を対象にする。

    Args:
        body: キャンセルトークンを含むリクエストボディ
        request: 回数制限に使う送り元の IP を読むためのリクエスト

    Returns:
        {"ok": True}

    Raises:
        HTTPException(404): トークンが存在しない場合
        HTTPException(400): 予約がすでにキャンセル済みの場合
        HTTPException(429): 同じ IP から短時間に送りすぎた場合（トークンの総当たり対策）
    """
    # 1. 回数制限
    cancel_limiter.check(client_ip(request))
    # 2. トークンの行を新しい順に読み、未登録とキャンセル済みを区別して返す
    # 変数の内容: all_rows: キャンセルトークンに一致する予約を作成日時の降順で読んだ DB 応答。
    all_rows = admin_supabase.table('workshop_reservations') \
        .select('id, status, session_id, event_id, name, email, created_at') \
        .eq('cancel_token', body.token) \
        .order('created_at', desc=True) \
        .execute()
    if not all_rows.data:
        raise HTTPException(404, 'キャンセルIDが見つかりません')
    # 変数の内容: row: DB から取得した単一レコード。
    row = next((r for r in all_rows.data if r['status'] != 'cancelled'), None)
    if not row:
        raise HTTPException(400, 'この予約はすでにキャンセル済みです')
    # 3. キャンセルにして、時間枠の人数を数え直す
    first_or_404(
        admin_supabase.table('workshop_reservations').update({'status': 'cancelled'}).eq('id', row['id']).execute(),
        'キャンセルIDが見つかりません',
    )
    _sync_reserved_count_safely(row.get('session_id'))
    # 4. キャンセルのメール（失敗してもキャンセルは成立）
    try:
        _send_cancel_confirmation(row)
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('キャンセルのメールの送信に失敗しました: %s', error_summary(e))
    return {'ok': True}


def _html_wrap(body_html: str) -> str:
    """メール本文をHabitat Oidesブランドのレイアウトで包んだHTML文字列を返す。

    Args:
        body_html: メイン本文のHTML断片（利用者の入力はエスケープ済みであること）

    Returns:
        完全なHTMLメール文字列
    """
    return f'''<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f2;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f2;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr><td style="background:#2d3a24;padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:18px;letter-spacing:3px;">Habitat Oides</p>
        </td></tr>
        <tr><td style="padding:32px;">
          {body_html}
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #eeeeee;">
          <p style="margin:0;font-size:12px;color:#999999;line-height:1.8;">
            ※ このメールは送信専用です。このメールへの返信はお受けできません。<br>
            ご不明な点は<a href="{SITE_ORIGIN}/official/contact" style="color:#4a6741;">公式HPお問い合わせ</a>または
            <a href="mailto:{esc(HABITAT_ADMIN_EMAIL)}" style="color:#4a6741;">{esc(HABITAT_ADMIN_EMAIL)}</a> までご連絡ください。
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>'''


def _row(label: str, value: object, raw_html: bool = False) -> str:
    """メール内の2カラム項目テーブルの1行分のHTMLを生成して返す。

    Args:
        label: 左カラムに表示するラベル文字列（固定の文言）
        value: 右カラムに表示する値。既定ではエスケープしてから入れる
        raw_html: True のとき value を HTML としてそのまま入れる（自分で組み立てたリンクなど）

    Returns:
        <tr>...</tr> 形式のHTML文字列
    """
    # 変数の内容: cell: 対象時間枠のロック管理情報。
    cell = str(value) if raw_html else esc(value)
    return (
        f'<tr>'
        f'<td style="padding:8px 0;font-size:13px;color:#888888;width:120px;vertical-align:top;">{esc(label)}</td>'
        f'<td style="padding:8px 0;font-size:14px;color:#333333;vertical-align:top;">{cell}</td>'
        f'</tr>'
    )


def _rows_table(rows_html: str) -> str:
    """項目の行（_row の結果をつないだもの）を表で包む。

    Args:
        rows_html: _row で作った行の HTML

    Returns:
        <table> の HTML
    """
    return (
        '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eeeeee;">'
        f'{rows_html}</table>'
    )


def _load_mail_context(event_id: str, session_id: Optional[str], preferred_time: Optional[str]) -> tuple[Optional[dict], str]:
    """メールに書くイベントの情報と時間を読む（受付メールと管理者通知で 1 回だけ読む）。

    読み取りに失敗してもメールの送信を試せるよう、例外は投げずにログだけ残す。

    Args:
        event_id: イベントの ID
        session_id: 時間枠の ID（あれば時間枠の表示名を使う）
        preferred_time: 時間枠が無いときに使う希望の時間

    Returns:
        (events の行（name・start_date・location）または None, 時間の表示名（無ければ ''）)
    """
    if not HABITAT_RESEND_API_KEY:
        return None, ''
    try:
        # 1. イベント情報を読み、時間枠 ID がある場合は表示名を優先する。
        # 変数の内容: event: メールに使うイベント情報、time_label: 希望または時間枠から選んだ表示時刻。
        event = fetch_one_or_none(supabase.table('events').select('name, start_date, location').eq('id', event_id))
        time_label = preferred_time or ''
        if session_id:
            # 変数の内容: session: 処理対象の予約時間枠、time_label: 画面やメールに表示する時間枠名。
            session = fetch_one_or_none(admin_supabase.table('ws_sessions').select('time_label').eq('id', session_id))
            time_label = session['time_label'] if session else ''
        # 2. 読めたイベント情報と選んだ時間表示を返す。
        return event, time_label
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        # 3. 読み取り失敗はログに残し、メール本文なしで処理を続ける。
        logger.error('予約メール用のイベント情報の読み取りに失敗しました: %s', error_summary(e))
        return None, ''


# 受付メールの言語ごとの文言（ja: 日本語・en: 英語）
_CONFIRM_TEXTS: dict[str, dict[str, str]] = {
    'ja': {
        'event': 'イベント名', 'date': '開催日', 'venue': '会場', 'reserved_date': '予約日',
        'time': '予約時間', 'participants': '参加人数', 'participants_unit': ' 名',
        'bring_plant': '植物持ち込み', 'bring_pot': '鉢持ち込み', 'yes': 'あり', 'note': '備考',
        'greeting': '{name} 様',
        'lead': 'ワークショップへのお申し込みありがとうございます。<br>\n            以下の内容で予約を受け付けました。',
        'lead_text': 'ワークショップへのお申し込みありがとうございます。',
        'cancel_lead': 'ご都合によりキャンセルされる場合は、以下のボタンよりお手続きください。',
        'cancel_button': '予約をキャンセルする', 'cancel_id': 'キャンセルID',
        'cancel_text': 'キャンセルはこちら',
        'subject': '[Habitat Oides] ワークショップ予約を受け付けました: {event}',
    },
    'en': {
        'event': 'Event', 'date': 'Date', 'venue': 'Venue', 'reserved_date': 'Reserved date',
        'time': 'Time slot', 'participants': 'Participants', 'participants_unit': '',
        'bring_plant': 'Bring plant', 'bring_pot': 'Bring pot', 'yes': 'Yes', 'note': 'Notes',
        'greeting': 'Dear {name},',
        'lead': 'Thank you for signing up for our workshop.<br>\n            Your reservation has been received with the following details.',
        'lead_text': 'Thank you for signing up for our workshop.',
        'cancel_lead': 'If you need to cancel, please use the button below.',
        'cancel_button': 'Cancel reservation', 'cancel_id': 'Cancellation ID',
        'cancel_text': 'Cancel here',
        'subject': '[Habitat Oides] Workshop reservation received: {event}',
    },
}


def _send_confirmation(body: ReserveBody, cancel_token: str, event: Optional[dict], time_label: str) -> str | None:
    """予約者に受付確認メールを送信し、ResendのメールIDを返す。

    body.lang が 'en' の場合は英語メール、それ以外は日本語メールを送る。
    HABITAT_RESEND_API_KEY が未設定、またはイベント情報が無い場合は何もせず None を返す。
    HTML に入れる値（利用者の入力・イベント情報）はすべてエスケープする。

    Args:
        body: 予約情報（言語・人数・備考などを含む）
        cancel_token: メール本文に埋め込むキャンセル用トークン
        event: events の行（name・start_date・location）。None なら送らない
        time_label: 予約した時間の表示名（無ければ ''）

    Returns:
        送信成功時は Resend が発行したメールID、未設定時は None

    Raises:
        Exception: Resend の送信に失敗した場合
    """
    if not HABITAT_RESEND_API_KEY or not event:
        return None
    # 1. 言語を決め、その言語の文言を使う
    # 変数の内容: lang: メール本文の言語、t: 言語別の文言一覧、cancel_url: 予約を取り消すための公開 URL。
    lang = 'en' if body.lang == 'en' else 'ja'
    t = _CONFIRM_TEXTS[lang]
    cancel_url = f'{SITE_ORIGIN}/official/cancel?id={cancel_token}'
    # 2. 予約内容の表を作る（値はすべて _row の中でエスケープされる）
    # 変数の内容: rows_html: 予約内容をメールの HTML 表にする行。
    rows_html = _row(t['event'], event['name'])
    rows_html += _row(t['date'], event['start_date'])
    rows_html += _row(t['venue'], event['location'])
    if body.preferred_date:
        rows_html += _row(t['reserved_date'], body.preferred_date)
    if time_label:
        rows_html += _row(t['time'], time_label)
    rows_html += _row(t['participants'], f'{body.participants}{t["participants_unit"]}')
    if body.bring_plant:
        rows_html += _row(t['bring_plant'], t['yes'])
    if body.bring_pot:
        rows_html += _row(t['bring_pot'], t['yes'])
    if body.note:
        rows_html += _row(t['note'], body.note)
    # 3. 本文（HTML とテキスト）を組み立てる
    # 変数の内容: content: 予約者へ送る HTML 本文、text: 同じ内容のテキスト本文。
    content = f'''
          <p style="margin:0 0 8px;font-size:16px;color:#333333;">{t['greeting'].format(name=esc(body.name))}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.8;">
            {t['lead']}
          </p>
          {_rows_table(rows_html)}
          <div style="margin-top:28px;padding:20px 24px;background:#f8f8f4;border-radius:4px;border:1px solid #e8e8e0;">
            <p style="margin:0 0 12px;font-size:13px;color:#555555;line-height:1.8;">
              {t['cancel_lead']}
            </p>
            <a href="{esc(cancel_url)}" style="display:inline-block;padding:12px 28px;background:#2d3a24;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;">
              {t['cancel_button']}
            </a>
            <p style="margin:12px 0 0;font-size:11px;color:#aaaaaa;">
              {t['cancel_id']}: {esc(cancel_token)}
            </p>
          </div>
        '''
    text = (
        f'{t["greeting"].format(name=body.name)}\n\n{t["lead_text"]}\n'
        f'{t["event"]}: {event["name"]}\n{t["date"]}: {event["start_date"]}\n{t["venue"]}: {event["location"]}\n'
        f'{t["participants"]}: {body.participants}{t["participants_unit"]}\n\n'
        f'{t["cancel_text"]}: {cancel_url}\n\nHabitat Oides\n{SITE_ORIGIN}'
    )
    # 4. 送る
    # 変数の内容: email_id: Resend が発行した送信メール ID。
    email_id = send_mail(HABITAT_RESEND_API_KEY, {
        'from': HABITAT_SENDER,
        'to': [body.email],
        'subject': t['subject'].format(event=event['name']),
        'html': _html_wrap(content),
        'text': text,
    })
    logger.info('予約の受付メールを送信しました（resend id: %s）', email_id)
    return email_id


def _send_admin_notification(body: ReserveBody, event: Optional[dict], time_label: str) -> None:
    """新規予約の内容を管理者（HABITAT_ADMIN_EMAIL）に通知メールとして送信する。

    HABITAT_RESEND_API_KEY が未設定、またはイベント情報が無い場合は何もしない。

    Args:
        body: 予約情報（名前・メール・電話・参加人数・持ち込み情報などを含む）
        event: events の行（name・start_date・location）
        time_label: 予約した時間の表示名（無ければ ''）

    Raises:
        Exception: Resend の送信に失敗した場合

    Returns:
        なし。
    """
    if not HABITAT_RESEND_API_KEY or not event:
        return
    # 1. 予約内容の表を作る（メールアドレスのリンクだけは自分で組み立ててエスケープする）
    # 変数の内容: email_link: エスケープ済みメールリンク、rows_html: 管理者通知に載せる予約情報の表。
    email_link = f'<a href="mailto:{esc(body.email)}" style="color:#4a6741;">{esc(body.email)}</a>'
    rows_html = _row('イベント名', event['name'])
    rows_html += _row('開催日', event['start_date'])
    rows_html += _row('会場', event['location'])
    if body.preferred_date:
        rows_html += _row('予約日', body.preferred_date)
    if time_label:
        rows_html += _row('予約時間', time_label)
    rows_html += _row('お名前', body.name)
    rows_html += _row('メール', email_link, raw_html=True)
    rows_html += _row('電話番号', body.phone or '未記入')
    rows_html += _row('参加人数', f'{body.participants} 名')
    if body.bring_plant:
        rows_html += _row('植物持ち込み', 'あり')
    if body.bring_pot:
        rows_html += _row('鉢持ち込み', 'あり')
    if body.note:
        rows_html += _row('備考', body.note)
    # 2. 本文を組み立てて送る
    # 変数の内容: content: 管理者向け HTML 本文、text: 管理者向けテキスト本文。
    content = f'''
      <p style="margin:0 0 24px;font-size:14px;color:#555555;">新しいワークショップ予約が入りました。</p>
      {_rows_table(rows_html)}
    '''
    text = (
        f'新しいワークショップ予約が入りました。\n'
        f'イベント名: {event["name"]}\nお名前: {body.name}\nメール: {body.email}\n参加人数: {body.participants} 名\n'
    )
    send_mail(HABITAT_RESEND_API_KEY, {
        'from': HABITAT_SENDER,
        'to': [HABITAT_ADMIN_EMAIL],
        'subject': f'[予約通知] {event["name"]} に新しい予約が入りました',
        'html': _html_wrap(content),
        'text': text,
    })


def _send_cancel_confirmation(reservation: dict) -> None:
    """予約キャンセル完了を予約者にメールで通知する。

    HABITAT_RESEND_API_KEY が未設定、またはメールアドレスが取得できない場合は何もしない。

    Args:
        reservation: キャンセル対象の予約レコード（name・email・event_id などを含む辞書）

    Raises:
        Exception: Resend の送信に失敗した場合

    Returns:
        なし。
    """
    if not HABITAT_RESEND_API_KEY:
        return
    # 変数の内容: email: 送信先または利用者のメールアドレス、name: 画面やログに表示する名前。
    name = reservation.get('name', '')
    email = reservation.get('email', '')
    if not email:
        return
    # 1. イベントの情報を読む（無くてもメールは送る）
    # 変数の内容: event_id: 予約に記録されたイベント ID、event: メールに載せるイベント情報。
    event_id = reservation.get('event_id')
    event = None
    if event_id:
        # 変数の内容: event: 処理対象のイベント。
        event = fetch_one_or_none(supabase.table('events').select('name, start_date, location').eq('id', event_id))
    # 変数の内容: event_name: イベント名、rows_html: メール本文に挿入する表の行。
    event_name = event['name'] if event else ''
    rows_html = ''
    if event:
        # 変数の内容: rows_html: メール本文に挿入する表の行。
        rows_html = _row('イベント名', event['name']) + _row('開催日', event['start_date']) + _row('会場', event['location'])
    # 2. 本文を組み立てて送る
    # 変数の内容: content: 予約者へ送るキャンセル通知の HTML 本文。
    content = f'''
      <p style="margin:0 0 8px;font-size:16px;color:#333333;">{esc(name)} 様</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.8;">
        ワークショップのご予約をキャンセルしました。<br>
        またのご参加をお待ちしております。
      </p>
      {_rows_table(rows_html) if rows_html else ''}
    '''
    # 変数の内容: text: 同じキャンセル通知のテキスト本文。
    text = f'{name} 様\n\nワークショップのご予約をキャンセルしました。\nまたのご参加をお待ちしております。\n\nHabitat Oides\n{SITE_ORIGIN}'
    send_mail(HABITAT_RESEND_API_KEY, {
        'from': HABITAT_SENDER,
        'to': [email],
        'subject': f'[Habitat Oides] ワークショップ予約をキャンセルしました{": " + event_name if event_name else ""}',
        'html': _html_wrap(content),
        'text': text,
    })


def _mark_email_failed(email_id: str) -> None:
    """Resend のメール ID が一致する予約に email_failed を立てる（スレッドプールで呼ぶ）。

    Args:
        email_id: Resend のメール ID

    Returns:
        なし。
    """
    admin_supabase.table('workshop_reservations') \
        .update({'email_failed': True}) \
        .eq('resend_email_id', email_id).execute()


@router.post('/webhook/resend')
async def resend_webhook(request: Request) -> dict:
    """Resendのメール配信失敗Webhookを処理し、該当予約レコードにemail_failedフラグを設定する。

    email.bounced または email.failed イベントの場合、resend_email_id で予約を特定して更新する。
    JSONパース失敗など予期しないエラーはログに残し、常に {"ok": True} を返す
    （Resend が再送を繰り返さないようにするため）。
    署名の検証は本番の設定（Webhook の秘密の値）の確認待ちのため、まだ行っていない。

    Args:
        request: WebhookリクエストのRawボディ（Resend形式のJSON）

    Returns:
        {"ok": True} の固定レスポンス
    """
    # 1. JSON を読む（読めなければ何もしない）
    try:
        # 変数の内容: payload: DB に保存する値。
        payload = await request.json()
    except Exception:
        logger.warning('Resend の Webhook の本文を JSON として読めませんでした')
        return {'ok': True}
    if not isinstance(payload, dict):
        return {'ok': True}
    # 2. 配信失敗のイベントなら、該当する予約に印を付ける（同期の DB 呼び出しはスレッドプールで行う）
    # 変数の内容: event_type: Resend が通知したメール配信イベントの種別。
    event_type = payload.get('type', '')
    if event_type in ('email.bounced', 'email.failed'):
        # 変数の内容: data: Resend Webhook の受信データ。、email_id: Resend メール ID。
        data = payload.get('data') if isinstance(payload.get('data'), dict) else {}
        email_id = data.get('email_id') or data.get('id')
        if email_id:
            try:
                await run_in_threadpool(_mark_email_failed, str(email_id))
            # 変数の内容: e: except で捕捉した処理例外。
            except Exception as e:
                logger.error('email_failed の保存に失敗しました: %s', error_summary(e))
    return {'ok': True}


@router.post('/walkin', dependencies=[Depends(require_auth)])
def add_walkin(body: WalkInBody) -> dict:
    """管理者が当日参加を登録する。確認メールは送らず、ステータスは即時 confirmed。

    当日の受付で人数を記録するためのもので、満席の確認はしない（会場で調整するため）。

    Args:
        body: イベント・人数・時間枠・日付

    Returns:
        作成した予約レコード

    Raises:
        HTTPException(400): event_id・session_id が UUID の形でない、または存在しない場合
    """
    # 1. 必須のメール欄には配信されないダミー値を設定する（.invalid は実在しないドメイン）。
    # 変数の内容: dummy_email: 当日参加レコードに必要な配信用途の無いメール値、data: DB に登録する予約情報。
    dummy_email = f'walkin-{uuid.uuid4().hex[:12]}@nomail.invalid'
    data = {
        'event_id': body.event_id,
        'name': '当日参加',
        'email': dummy_email,
        'participants': body.participants,
        'session_id': body.session_id,
        'preferred_time': body.preferred_time,
        'preferred_date': body.preferred_date,
        'status': 'confirmed',
        'cancel_token': _generate_cancel_token(),
    }
    # 2. 予約を確定状態で登録し、3. 時間枠の予約人数を同期して登録行を返す。
    # 変数の内容: row: 新規登録された当日参加予約行。
    row = execute_or_400(
        admin_supabase.table('workshop_reservations').insert(data), 'イベントまたは時間枠が正しくありません'
    ).data[0]
    _sync_reserved_count_safely(body.session_id)
    return row


@router.get('s')
def list_reservations(event_id: Optional[str] = None, _=Depends(require_auth)) -> list[dict]:
    """予約一覧を新着順で返す（管理者のみ）。

    Args:
        event_id: 指定するとそのイベントの予約だけにする

    Returns:
        予約レコードのリスト

    Raises:
        HTTPException(404): event_id が UUID の形でない場合
    """
    # 1. 新着順の予約一覧クエリを作り、イベント指定があれば絞り込む。
    # 変数の内容: q: DB テーブルに対するクエリ。
    q = admin_supabase.table('workshop_reservations').select('*').order('created_at', desc=True)
    if event_id:
        # 変数の内容: q: DB テーブルに対するクエリ。
        q = q.eq('event_id', event_id)
    # 2. クエリを実行し、予約一覧を返す。
    return execute_or_404(q, 'イベントが見つかりません').data


@router.patch('s/{reservation_id}')
def update_reservation_status(reservation_id: str, body: ReserveStatusPatch, _=Depends(require_auth)) -> dict:
    """予約ステータスを更新し、キャンセルに変更した場合はキャンセル確認メールを送信する（管理者のみ）。

    1. ステータスが変わらないときは何もせず今の行を返す（メールも送らない）
    2. キャンセルから受付に戻すときは、時間枠が満席でないかロックの中で確かめる
    3. キャンセルに変えたときだけ予約者にメールを送る
    session_id が存在する場合は reserved_count も同期する。

    Args:
        reservation_id: 更新対象の予約ID
        body: 新しいステータス値を含むリクエストボディ

    Returns:
        更新後の予約レコード

    Raises:
        HTTPException(404): 予約が存在しない場合
        HTTPException(409): キャンセルから戻すときに時間枠が満席の場合
    """
    # 変数の内容: row: DB から取得した単一レコード。
    row = fetch_one_or_404(admin_supabase.table('workshop_reservations').select('*').eq('id', reservation_id))
    # 1. 変わらなければ何もしない
    if row.get('status') == body.status:
        return row
    # 変数の内容: session_id: 対象の予約時間枠 ID。
    session_id = row.get('session_id')

    def _update() -> dict:
        """ステータスを書き換えて更新後の行を返す。

        Returns:
            注釈に示した形式の応答（dict）。
        """
        return first_or_404(
            admin_supabase.table('workshop_reservations').update({'status': body.status}).eq('id', reservation_id).execute()
        )

    # 2. キャンセルから戻すときは満席を確かめる（新規予約と同じロックを使う）
    # 変数の内容: reinstating: 既存のキャンセル済み予約を復帰させるかどうか。
    reinstating = row.get('status') == 'cancelled'
    if reinstating and session_id:
        with _session_lock(session_id):
            # 変数の内容: session: 処理対象の予約時間枠。
            session = fetch_one_or_none(
                admin_supabase.table('ws_sessions').select('id, max_participants, time_label').eq('id', session_id)
            )
            if session:
                session.setdefault('id', session_id)
                # 変数の内容: used: 予約済みの参加人数。
                used = _session_used_count(row['event_id'], session, row.get('preferred_date'))
                if used + (row.get('participants') or 1) > session['max_participants']:
                    raise HTTPException(409, 'この時間枠は満席のため、キャンセルを取り消せません')
            # 変数の内容: updated: 更新後の DB レコード。
            updated = _update()
    else:
        # 変数の内容: updated: 更新後の DB レコード。
        updated = _update()
    _sync_reserved_count_safely(session_id)
    # 3. キャンセルに変えたときだけメールを送る
    if body.status == 'cancelled':
        try:
            _send_cancel_confirmation(row)
        # 変数の内容: e: except で捕捉した処理例外。
        except Exception as e:
            logger.error('キャンセルのメールの送信に失敗しました: %s', error_summary(e))
    return updated
