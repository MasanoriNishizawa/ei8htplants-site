import resend
import secrets
import string
import threading
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from typing import Optional
from ..db import admin_supabase, supabase
from ..config import RESEND_API_KEY, HABITAT_RESEND_API_KEY, CONTACT_FROM_EMAIL, HABITAT_SENDER
from ..auth import require_auth

# セッションIDごとのロックを管理する辞書。同一セッションへの同時予約を防ぐ
_session_locks: dict[str, threading.Lock] = {}
_session_locks_mu = threading.Lock()

# セッションIDに対応するロックを取得（なければ新規作成）
def _session_lock(session_id: str) -> threading.Lock:
    """セッションIDに対応するスレッドロックを返す。存在しなければ新規作成する。

    Args:
        session_id: ワークショップセッションの一意識別子

    Returns:
        セッションIDに紐づいた threading.Lock インスタンス
    """
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
    lang: Optional[str] = None


class ReserveStatusPatch(BaseModel):
    status: str


class CancelBody(BaseModel):
    token: str


# 8桁の数字でキャンセルトークンを生成（メールURLに埋め込む）
def _generate_cancel_token() -> str:
    """8桁のランダム数字列からなるキャンセルトークンを生成して返す。"""
    return ''.join(secrets.choice(string.digits) for _ in range(8))


def _sync_reserved_count(session_id: str):
    """ws_sessions.reserved_count をキャンセル除外の実予約合計で上書き同期する。

    ws_sessions.reserved_count はデノーマライズ値のため、予約の追加・変更・キャンセルのたびに
    呼び出して整合性を保つ。

    Args:
        session_id: 同期対象のワークショップセッションID
    """
    # ws_sessions.reserved_count はデノーマライズ値。get_sessions はライブ計算で上書きするが、
    # 管理画面など DB を直接参照するケース向けに変更のたびに同期する
    result = admin_supabase.table('workshop_reservations') \
        .select('participants') \
        .eq('session_id', session_id) \
        .neq('status', 'cancelled') \
        .execute()
    total = sum(r['participants'] for r in (result.data or []))
    admin_supabase.table('ws_sessions').update({'reserved_count': total}).eq('id', session_id).execute()


# ワークショップ予約を作成し、確認メールと管理者通知を送信する
@router.post('')
def create_reservation(body: ReserveBody):
    """ワークショップ予約を作成し、受付確認メールと管理者通知を送信する。

    session_id が指定されている場合はセッションロックを取得して満席チェックと
    DB挿入をアトミックに行う。メール送信失敗は予約成立を妨げない。

    Args:
        body: 予約情報（名前・メール・セッションID・参加人数・言語など）

    Returns:
        作成した予約レコード（cancel_token・resend_email_id などを含む）

    Raises:
        HTTPException(409): セッションが満席の場合
    """
    cancel_token = _generate_cancel_token()
    if body.session_id:
        # セッションロックを取得して満席チェックと挿入をアトミックに行う
        with _session_lock(body.session_id):
            session = admin_supabase.table('ws_sessions').select('max_participants, time_label').eq('id', body.session_id).single().execute().data
            if session:
                # get_sessions と同じロジックで集計（二重カウント防止）
                res_q = admin_supabase.table('workshop_reservations') \
                    .select('session_id, participants, preferred_time') \
                    .eq('event_id', body.event_id) \
                    .neq('status', 'cancelled')
                if body.preferred_date:
                    res_q = res_q.eq('preferred_date', body.preferred_date)
                existing = res_q.execute().data or []
                used = 0
                for r in existing:
                    sid = r.get('session_id')
                    if sid == body.session_id:
                        used += r.get('participants') or 1
                    elif not sid and r.get('preferred_time') == session['time_label']:
                        used += r.get('participants') or 1
                if used + body.participants > session['max_participants']:
                    raise HTTPException(409, 'このセッションは満席です')
            data = body.model_dump()
            data['cancel_token'] = cancel_token
            row = admin_supabase.table('workshop_reservations').insert(data).execute().data[0]
    else:
        data = body.model_dump()
        data['cancel_token'] = cancel_token
        row = admin_supabase.table('workshop_reservations').insert(data).execute().data[0]
    if body.session_id:
        try:
            _sync_reserved_count(body.session_id)
        except Exception as e:
            print(f'[reserve] sync reserved_count failed: {e}')
    resend_email_id = None
    email_ok = True
    try:
        resend_email_id = _send_confirmation(body, cancel_token)
    except Exception as e:
        print(f'[reserve] confirmation email failed: {e}')
        email_ok = False

    update: dict = {}
    if resend_email_id:
        update['resend_email_id'] = resend_email_id
    if not email_ok:
        update['email_failed'] = True
    if update:
        try:
            admin_supabase.table('workshop_reservations').update(update).eq('id', row['id']).execute()
            row.update(update)
        except Exception as e:
            print(f'[reserve] failed to update email fields: {e}')

    try:
        _send_admin_notification(body)
    except Exception as e:
        print(f'[reserve] admin notification failed: {e}')
    return row


# キャンセルトークンで予約を取り消し、キャンセル確認メールを送信する
@router.post('/cancel')
def cancel_by_token(body: CancelBody):
    """キャンセルトークンで予約を取り消し、キャンセル確認メールを送信する。

    同一トークンが複数イベントで再利用される可能性があるため、最新の未キャンセル行を対象にする。

    Args:
        body: キャンセルトークンを含むリクエストボディ

    Returns:
        キャンセル後の予約レコード

    Raises:
        HTTPException(404): トークンが存在しない場合
        HTTPException(400): 予約がすでにキャンセル済みの場合
    """
    # トークンが存在するかをまず確認し、済みキャンセルと未登録を区別して返す
    all_rows = admin_supabase.table('workshop_reservations') \
        .select('id, status, session_id, event_id, name, email, created_at') \
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
    try:
        _send_cancel_confirmation(row)
    except Exception as e:
        print(f'[reserve] cancel confirmation email failed: {e}')
    return updated


# メール本文をHabitat Oidesブランドのレイアウトで包むHTMLテンプレート
def _html_wrap(body_html: str) -> str:
    """メール本文をHabitat Oidesブランドのレイアウトで包んだHTML文字列を返す。

    Args:
        body_html: メイン本文のHTML断片

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
            ご不明な点は<a href="https://ei8htplants.com/contact" style="color:#4a6741;">公式HPお問い合わせ</a>または
            <a href="mailto:info@habitatoides.com" style="color:#4a6741;">info@habitatoides.com</a> までご連絡ください。
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>'''


# メール内の項目テーブルの1行HTMLを生成するヘルパー
def _row(label: str, value: str) -> str:
    """メール内の2カラム項目テーブルの1行分のHTMLを生成して返す。

    Args:
        label: 左カラムに表示するラベル文字列
        value: 右カラムに表示する値文字列（HTMLを含む可能性あり）

    Returns:
        <tr>...</tr> 形式のHTML文字列
    """
    return (
        f'<tr>'
        f'<td style="padding:8px 0;font-size:13px;color:#888888;width:120px;vertical-align:top;">{label}</td>'
        f'<td style="padding:8px 0;font-size:14px;color:#333333;vertical-align:top;">{value}</td>'
        f'</tr>'
    )


# 予約者に確認メール（日/英対応）を送信し、Resendのメールidを返す
def _send_confirmation(body: ReserveBody, cancel_token: str) -> str | None:
    """予約者に受付確認メールを送信し、ResendのメールIDを返す。

    body.lang が 'en' の場合は英語メール、それ以外は日本語メールを送る。
    HABITAT_RESEND_API_KEY が未設定の場合は何もせず None を返す。

    Args:
        body: 予約情報（言語・イベントID・セッションIDなどを含む）
        cancel_token: メール本文に埋め込むキャンセル用トークン

    Returns:
        送信成功時は Resend が発行したメールID、失敗または未設定時は None
    """
    if not HABITAT_RESEND_API_KEY:
        return None
    event = supabase.table('events').select('name, start_date, location').eq('id', body.event_id).single().execute().data
    if not event:
        return None
    time_label = ''
    if body.session_id:
        session = admin_supabase.table('ws_sessions').select('time_label').eq('id', body.session_id).single().execute().data
        if session:
            time_label = session['time_label']
    elif body.preferred_time:
        time_label = body.preferred_time

    cancel_url = f'https://ei8htplants.com/cancel?id={cancel_token}'
    is_en = body.lang == 'en'

    if is_en:
        rows_html = _row('Event', event['name'])
        rows_html += _row('Date', event['start_date'])
        rows_html += _row('Venue', event['location'])
        if body.preferred_date:
            rows_html += _row('Reserved date', body.preferred_date)
        if time_label:
            rows_html += _row('Time slot', time_label)
        rows_html += _row('Participants', f'{body.participants}')
        if body.bring_plant:
            rows_html += _row('Bring plant', 'Yes')
        if body.bring_pot:
            rows_html += _row('Bring pot', 'Yes')
        if body.note:
            rows_html += _row('Notes', body.note)
        content = f'''
          <p style="margin:0 0 8px;font-size:16px;color:#333333;">Dear {body.name},</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.8;">
            Thank you for signing up for our workshop.<br>
            Your reservation has been received with the following details.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eeeeee;">
            {rows_html}
          </table>
          <div style="margin-top:28px;padding:20px 24px;background:#f8f8f4;border-radius:4px;border:1px solid #e8e8e0;">
            <p style="margin:0 0 12px;font-size:13px;color:#555555;line-height:1.8;">
              If you need to cancel, please use the button below.
            </p>
            <a href="{cancel_url}" style="display:inline-block;padding:12px 28px;background:#2d3a24;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;">
              Cancel reservation
            </a>
            <p style="margin:12px 0 0;font-size:11px;color:#aaaaaa;">
              Cancellation ID: {cancel_token}
            </p>
          </div>
        '''
        text = (
            f'Dear {body.name},\n\nThank you for signing up for our workshop.\n'
            f'Event: {event["name"]}\nDate: {event["start_date"]}\nVenue: {event["location"]}\n'
            f'Participants: {body.participants}\n\nCancel here: {cancel_url}\n\nHabitat Oides\nhttps://ei8htplants.com'
        )
        subject = f'[Habitat Oides] Workshop reservation received: {event["name"]}'
    else:
        rows_html = _row('イベント名', event['name'])
        rows_html += _row('開催日', event['start_date'])
        rows_html += _row('会場', event['location'])
        if body.preferred_date:
            rows_html += _row('予約日', body.preferred_date)
        if time_label:
            rows_html += _row('予約時間', time_label)
        rows_html += _row('参加人数', f'{body.participants} 名')
        if body.bring_plant:
            rows_html += _row('植物持ち込み', 'あり')
        if body.bring_pot:
            rows_html += _row('鉢持ち込み', 'あり')
        if body.note:
            rows_html += _row('備考', body.note)
        content = f'''
          <p style="margin:0 0 8px;font-size:16px;color:#333333;">{body.name} 様</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.8;">
            ワークショップへのお申し込みありがとうございます。<br>
            以下の内容で予約を受け付けました。
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eeeeee;">
            {rows_html}
          </table>
          <div style="margin-top:28px;padding:20px 24px;background:#f8f8f4;border-radius:4px;border:1px solid #e8e8e0;">
            <p style="margin:0 0 12px;font-size:13px;color:#555555;line-height:1.8;">
              ご都合によりキャンセルされる場合は、以下のボタンよりお手続きください。
            </p>
            <a href="{cancel_url}" style="display:inline-block;padding:12px 28px;background:#2d3a24;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;">
              予約をキャンセルする
            </a>
            <p style="margin:12px 0 0;font-size:11px;color:#aaaaaa;">
              キャンセルID: {cancel_token}
            </p>
          </div>
        '''
        text = (
            f'{body.name} 様\n\nワークショップへのお申し込みありがとうございます。\n'
            f'イベント名: {event["name"]}\n開催日: {event["start_date"]}\n会場: {event["location"]}\n'
            f'参加人数: {body.participants} 名\n\nキャンセルはこちら: {cancel_url}\n\nHabitat Oides\nhttps://ei8htplants.com'
        )
        subject = f'[Habitat Oides] ワークショップ予約を受け付けました: {event["name"]}'
    resend.api_key = HABITAT_RESEND_API_KEY
    result = resend.Emails.send({
        'from': HABITAT_SENDER,
        'to': [body.email],
        'subject': subject,
        'html': _html_wrap(content),
        'text': text,
    })
    email_id = None
    if isinstance(result, dict):
        email_id = result.get('id')
    else:
        email_id = getattr(result, 'id', None)
    print(f'[reserve] confirmation sent, resend id: {email_id}')
    return email_id


# 新規予約をinfo@habitatoides.comへ管理者通知として送信する
def _send_admin_notification(body: ReserveBody):
    """新規予約の内容を管理者メールアドレスに通知メールとして送信する。

    HABITAT_RESEND_API_KEY が未設定、またはイベント情報が取得できない場合は何もしない。

    Args:
        body: 予約情報（名前・メール・電話・参加人数・持ち込み情報などを含む）
    """
    if not HABITAT_RESEND_API_KEY:
        return
    event = supabase.table('events').select('name, start_date, location').eq('id', body.event_id).single().execute().data
    if not event:
        return
    time_label = ''
    if body.session_id:
        session = admin_supabase.table('ws_sessions').select('time_label').eq('id', body.session_id).single().execute().data
        if session:
            time_label = session['time_label']
    elif body.preferred_time:
        time_label = body.preferred_time

    rows_html = _row('イベント名', event['name'])
    rows_html += _row('開催日', event['start_date'])
    rows_html += _row('会場', event['location'])
    if body.preferred_date:
        rows_html += _row('予約日', body.preferred_date)
    if time_label:
        rows_html += _row('予約時間', time_label)
    rows_html += _row('お名前', body.name)
    rows_html += _row('メール', f'<a href="mailto:{body.email}" style="color:#4a6741;">{body.email}</a>')
    rows_html += _row('電話番号', body.phone or '未記入')
    rows_html += _row('参加人数', f'{body.participants} 名')
    if body.bring_plant:
        rows_html += _row('植物持ち込み', 'あり')
    if body.bring_pot:
        rows_html += _row('鉢持ち込み', 'あり')
    if body.note:
        rows_html += _row('備考', body.note)

    content = f'''
      <p style="margin:0 0 24px;font-size:14px;color:#555555;">新しいワークショップ予約が入りました。</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eeeeee;">
        {rows_html}
      </table>
    '''
    text = (
        f'新しいワークショップ予約が入りました。\n'
        f'イベント名: {event["name"]}\nお名前: {body.name}\nメール: {body.email}\n参加人数: {body.participants} 名\n'
    )
    resend.api_key = HABITAT_RESEND_API_KEY
    resend.Emails.send({
        'from': HABITAT_SENDER,
        'to': ['info@habitatoides.com'],
        'subject': f'[予約通知] {event["name"]} に新しい予約が入りました',
        'html': _html_wrap(content),
        'text': text,
    })


# キャンセル完了を予約者に通知するメールを送信する
def _send_cancel_confirmation(reservation: dict):
    """予約キャンセル完了を予約者にメールで通知する。

    HABITAT_RESEND_API_KEY が未設定、またはメールアドレスが取得できない場合は何もしない。

    Args:
        reservation: キャンセル対象の予約レコード（name・email・event_id などを含む辞書）
    """
    if not HABITAT_RESEND_API_KEY:
        return
    name = reservation.get('name', '')
    email = reservation.get('email', '')
    if not email:
        return
    event_id = reservation.get('event_id')
    event = None
    if event_id:
        event = supabase.table('events').select('name, start_date, location').eq('id', event_id).single().execute().data
    event_name = event['name'] if event else ''
    rows_html = ''
    if event:
        rows_html = _row('イベント名', event['name']) + _row('開催日', event['start_date']) + _row('会場', event['location'])
    content = f'''
      <p style="margin:0 0 8px;font-size:16px;color:#333333;">{name} 様</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.8;">
        ワークショップのご予約をキャンセルしました。<br>
        またのご参加をお待ちしております。
      </p>
      {'<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eeeeee;">' + rows_html + '</table>' if rows_html else ''}
    '''
    text = f'{name} 様\n\nワークショップのご予約をキャンセルしました。\nまたのご参加をお待ちしております。\n\nHabitat Oides\nhttps://ei8htplants.com'
    resend.api_key = HABITAT_RESEND_API_KEY
    resend.Emails.send({
        'from': HABITAT_SENDER,
        'to': [email],
        'subject': f'[Habitat Oides] ワークショップ予約をキャンセルしました{": " + event_name if event_name else ""}',
        'html': _html_wrap(content),
        'text': text,
    })


# Resendからのメール配信失敗イベントを受け取り、予約レコードにemail_failedフラグを立てる
@router.post('/webhook/resend')
async def resend_webhook(request: Request):
    """Resendのメール配信失敗Webhookを処理し、該当予約レコードにemail_failedフラグを設定する。

    email.bounced または email.failed イベントの場合、resend_email_id で予約を特定して更新する。
    JSONパース失敗など予期しないエラーは無視して常に {"ok": True} を返す。

    Args:
        request: WebhookリクエストのRawボディ（Resend形式のJSON）

    Returns:
        {"ok": True} の固定レスポンス
    """
    try:
        payload = await request.json()
    except Exception:
        return {'ok': True}
    event_type = payload.get('type', '')
    if event_type in ('email.bounced', 'email.failed'):
        email_id = payload.get('data', {}).get('email_id') or payload.get('data', {}).get('id')
        if email_id:
            try:
                admin_supabase.table('workshop_reservations') \
                    .update({'email_failed': True}) \
                    .eq('resend_email_id', email_id).execute()
            except Exception as e:
                print(f'[webhook] failed to set email_failed: {e}')
    return {'ok': True}


# 予約一覧を取得する（管理者のみ）。event_id で絞り込み可能
@router.get('s')
def list_reservations(event_id: Optional[str] = None, _=Depends(require_auth)):
    """予約一覧を新着順で返す。event_id を指定するとそのイベントの予約のみに絞り込む。"""
    q = admin_supabase.table('workshop_reservations').select('*').order('created_at', desc=True)
    if event_id:
        q = q.eq('event_id', event_id)
    return q.execute().data


# 予約ステータスを更新する（管理者のみ）。キャンセル時はキャンセル確認メールも送る
@router.patch('s/{reservation_id}')
def update_reservation_status(reservation_id: str, body: ReserveStatusPatch, _=Depends(require_auth)):
    """予約ステータスを更新し、キャンセルに変更した場合はキャンセル確認メールを送信する。

    session_id が存在する場合は reserved_count も同期する。

    Args:
        reservation_id: 更新対象の予約ID
        body: 新しいステータス値を含むリクエストボディ

    Returns:
        更新後の予約レコード

    Raises:
        HTTPException(404): 予約が存在しない場合
    """
    row = admin_supabase.table('workshop_reservations') \
        .select('*') \
        .eq('id', reservation_id) \
        .single().execute().data
    if not row:
        raise HTTPException(404, 'Not found')

    updated = admin_supabase.table('workshop_reservations').update({'status': body.status}).eq('id', reservation_id).execute().data[0]

    if row.get('session_id'):
        try:
            _sync_reserved_count(row['session_id'])
        except Exception as e:
            print(f'[reserve] sync reserved_count failed: {e}')

    if body.status == 'cancelled':
        try:
            _send_cancel_confirmation(row)
        except Exception as e:
            print(f'[reserve] cancel confirmation email failed: {e}')

    return updated
