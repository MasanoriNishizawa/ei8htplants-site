import uuid
import resend
import requests as http
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from ..db import admin_supabase
from ..config import (
    SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT,
    RESEND_API_KEY, CONTACT_TO_EMAIL, SENDER, NO_REPLY_NOTE,
)
from ..auth import require_auth
from .shipping import RATES

router = APIRouter(prefix='/orders', tags=['orders'])

_SQUARE_BASE = (
    'https://connect.squareup.com'
    if SQUARE_ENVIRONMENT == 'production'
    else 'https://connect.squareupsandbox.com'
)

_FMT = lambda n: f'¥{n:,}'


class CartItem(BaseModel):
    product_id: str
    quantity: int


class OrderBody(BaseModel):
    customer_name: str
    customer_email: EmailStr
    customer_phone: Optional[str] = None
    postal_code: str
    prefecture: str
    city: str
    address_line1: str
    address_line2: Optional[str] = None
    note: Optional[str] = None
    items: list[CartItem]
    source_id: str


class OrderStatusPatch(BaseModel):
    status: str
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None


def _charge_square(source_id: str, amount_yen: int) -> str:
    res = http.post(
        f'{_SQUARE_BASE}/v2/payments',
        json={
            'idempotency_key': str(uuid.uuid4()),
            'source_id': source_id,
            'amount_money': {'amount': amount_yen, 'currency': 'JPY'},
            'location_id': SQUARE_LOCATION_ID,
        },
        headers={
            'Authorization': f'Bearer {SQUARE_ACCESS_TOKEN}',
            'Content-Type': 'application/json',
            'Square-Version': '2024-01-17',
        },
        timeout=30,
    )
    data = res.json()
    if not res.ok or 'errors' in data:
        errors = data.get('errors', [])
        detail = errors[0].get('detail', '決済に失敗しました') if errors else '決済に失敗しました'
        raise HTTPException(402, detail)
    return data['payment']['id']


def _rollback_stock(reserved: list[tuple[str, int]]) -> None:
    for pid, qty in reserved:
        try:
            admin_supabase.rpc('increment_stock', {
                'p_product_id': pid,
                'p_quantity': qty,
            }).execute()
        except Exception as e:
            print(f'[orders] CRITICAL: rollback failed for product {pid} qty {qty}: {e}')


def _send_confirmation(order: dict, body: OrderBody, product_map: dict, payment_id: str) -> None:
    if not RESEND_API_KEY:
        return
    try:
        order_no = order['id'].split('-')[0].upper()
        items_lines = '\n'.join(
            f'  {product_map[item.product_id]["name"]} × {item.quantity}  '
            f'{_FMT(product_map[item.product_id]["price"] * item.quantity)}'
            for item in body.items
            if item.product_id in product_map
        )
        address_parts = [
            f'〒{body.postal_code}',
            f'{body.prefecture}{body.city}{body.address_line1}',
        ]
        if body.address_line2:
            address_parts.append(body.address_line2)
        address_text = '\n'.join(address_parts)

        text = (
            f'{body.customer_name} 様\n\n'
            'この度はei8ht plantsにてご注文いただきありがとうございます。\n'
            '以下の内容でご注文を承りました。\n\n'
            '─────────────────\n'
            f'【注文番号】  {order_no}\n'
            f'【取引番号】  {payment_id}\n\n'
            '【ご注文内容】\n'
            f'{items_lines}\n\n'
            f'  小計    {_FMT(order["subtotal"])}\n'
            f'  送料    {_FMT(order["shipping_fee"])}\n'
            f'  合計    {_FMT(order["total"])}（税込）\n\n'
            '【お届け先】\n'
            f'{address_text}\n'
            '─────────────────\n\n'
            '■ キャンセルについて\n'
            '決済完了後のキャンセル・返品はお承りしておりません。\n'
            '商品の不良・破損があった場合のみ、到着後7日以内にお問い合わせください。\n\n'
            '■ お問い合わせ\n'
            'https://ei8htplants.com/contact\n'
            + NO_REPLY_NOTE
        )

        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            'from': SENDER,
            'to': [body.customer_email],
            'subject': f'ご注文ありがとうございます（注文番号: {order_no}）| ei8ht plants',
            'text': text,
        })
    except Exception as e:
        print(f'[orders] confirmation email failed: {e}')


def _notify_admin(order: dict, body: OrderBody, product_map: dict) -> None:
    if not RESEND_API_KEY or not CONTACT_TO_EMAIL:
        return
    try:
        order_no = order['id'].split('-')[0].upper()
        items_lines = '\n'.join(
            f'  {product_map[item.product_id]["name"]} × {item.quantity}'
            for item in body.items
            if item.product_id in product_map
        )
        text = (
            f'新しい注文が入りました。\n\n'
            f'注文番号: {order_no}\n'
            f'合計: {_FMT(order["total"])}\n\n'
            f'お客様: {body.customer_name}（{body.customer_email}）\n'
            f'お届け先: {body.prefecture}{body.city}{body.address_line1}\n\n'
            f'【商品】\n{items_lines}\n\n'
            f'管理画面で確認してください: https://ei8htplants.com/admin'
        )
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            'from': SENDER,
            'to': [CONTACT_TO_EMAIL],
            'subject': f'[ei8ht plants] 新規注文 {order_no}',
            'text': text,
        })
    except Exception as e:
        print(f'[orders] admin notify failed: {e}')


@router.post('')
def create_order(body: OrderBody):
    if not SQUARE_ACCESS_TOKEN:
        raise HTTPException(500, 'Square が設定されていません')

    shipping_fee = RATES.get(body.prefecture)
    if shipping_fee is None:
        raise HTTPException(400, f'未対応の都道府県です: {body.prefecture}')

    # 商品情報取得
    product_ids = [item.product_id for item in body.items]
    rows = admin_supabase.table('products').select('id, name, price, stock, is_published') \
        .in_('id', product_ids).execute().data or []
    product_map = {p['id']: p for p in rows}

    # 購入不可チェック
    for item in body.items:
        p = product_map.get(item.product_id)
        if not p:
            raise HTTPException(404, '商品が見つかりません')
        if not p['is_published']:
            raise HTTPException(400, f'この商品は現在購入できません: {p["name"]}')

    # 在庫不足チェック（全商品を一括確認し、不足商品を全て列挙）
    insufficient = [
        product_map[item.product_id]['name']
        for item in body.items
        if product_map.get(item.product_id, {}).get('stock', 0) < item.quantity
    ]
    if insufficient:
        raise HTTPException(409, '在庫が不足しています: ' + '、'.join(insufficient))

    # 在庫をアトミックに確保（他の注文と競合した場合はRPCが false を返す）
    reserved: list[tuple[str, int]] = []
    try:
        for item in body.items:
            ok = admin_supabase.rpc('decrement_stock', {
                'p_product_id': item.product_id,
                'p_quantity': item.quantity,
            }).execute().data
            if not ok:
                p = product_map[item.product_id]
                raise HTTPException(409, f'在庫が不足しています: {p["name"]}（他の注文と競合しました）')
            reserved.append((item.product_id, item.quantity))
    except HTTPException:
        _rollback_stock(reserved)
        raise

    subtotal = sum(product_map[item.product_id]['price'] * item.quantity for item in body.items)
    total = subtotal + shipping_fee

    # Square 決済（失敗したら在庫をロールバック）
    try:
        payment_id = _charge_square(body.source_id, total)
    except HTTPException:
        _rollback_stock(reserved)
        raise

    # 注文レコード作成（失敗したらアドミンに通知）
    try:
        order = admin_supabase.table('orders').insert({
            'customer_name': body.customer_name,
            'customer_email': body.customer_email,
            'customer_phone': body.customer_phone,
            'postal_code': body.postal_code,
            'prefecture': body.prefecture,
            'city': body.city,
            'address_line1': body.address_line1,
            'address_line2': body.address_line2,
            'note': body.note,
            'subtotal': subtotal,
            'shipping_fee': shipping_fee,
            'total': total,
            'status': 'paid',
            'square_payment_id': payment_id,
        }).execute().data[0]

        admin_supabase.table('order_items').insert([
            {
                'order_id': order['id'],
                'product_id': item.product_id,
                'product_name': product_map[item.product_id]['name'],
                'price': product_map[item.product_id]['price'],
                'quantity': item.quantity,
            }
            for item in body.items
        ]).execute()
    except Exception as e:
        # 課金済みだがDB書き込み失敗: アドミン通知して手動対応を促す
        print(f'[orders] CRITICAL: payment succeeded ({payment_id}) but order record failed: {e}')
        if RESEND_API_KEY and CONTACT_TO_EMAIL:
            try:
                resend.api_key = RESEND_API_KEY
                resend.Emails.send({
                    'from': SENDER,
                    'to': [CONTACT_TO_EMAIL],
                    'subject': '[ei8ht plants] CRITICAL: 課金済み注文レコード作成失敗',
                    'text': (
                        f'課金が完了しましたが注文レコードの作成に失敗しました。\n\n'
                        f'Square Payment ID: {payment_id}\n'
                        f'顧客: {body.customer_name} <{body.customer_email}>\n'
                        f'金額: {_FMT(total)}\n\n'
                        f'Squareダッシュボードで確認し、手動で注文を処理してください。\n'
                        f'エラー: {e}'
                    ),
                })
            except Exception as mail_err:
                print(f'[orders] CRITICAL notify failed: {mail_err}')
        raise HTTPException(500, '注文処理中にエラーが発生しました。お支払いは完了しています。お問い合わせページよりご連絡ください。')

    # 購入確認メール送信（失敗しても注文は成立）
    _send_confirmation(order, body, product_map, payment_id)
    _notify_admin(order, body, product_map)

    return {'order_id': order['id']}


@router.get('')
def list_orders(_=Depends(require_auth)):
    return admin_supabase.table('orders').select('*').order('created_at', desc=True).execute().data


@router.get('/{order_id}')
def get_order(order_id: str, _=Depends(require_auth)):
    order = admin_supabase.table('orders').select('*').eq('id', order_id).single().execute().data
    if not order:
        raise HTTPException(404, 'Not found')
    items = admin_supabase.table('order_items').select('*').eq('order_id', order_id).execute().data
    return {**order, 'items': items}


_CARRIER_TRACKING_URL = {
    'ヤマト運輸': 'https://jizen.kuronekoyamato.co.jp/jizen/servlet/crjz.b.CRJZ00?id={}',
    '佐川急便': 'https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo={}',
    '日本郵便（ゆうパック）': 'https://trackings.post.japanpost.jp/services/srv/search/direct?searchNum={}&locale=ja',
    'その他': None,
}


def _send_shipping_notification(order: dict) -> None:
    if not RESEND_API_KEY:
        return
    try:
        order_no = order['id'].split('-')[0].upper()
        address = f"〒{order['postal_code']} {order['prefecture']}{order['city']}{order['address_line1']}"
        if order.get('address_line2'):
            address += f" {order['address_line2']}"

        tracking_lines = ''
        carrier = order.get('carrier')
        tracking_number = order.get('tracking_number')
        if carrier or tracking_number:
            tracking_lines += '\n【配送情報】\n'
            if carrier:
                tracking_lines += f'  配送会社: {carrier}\n'
            if tracking_number:
                tracking_lines += f'  お問い合わせ番号: {tracking_number}\n'
                url_template = _CARRIER_TRACKING_URL.get(carrier or '')
                if url_template:
                    tracking_lines += f'  追跡URL: {url_template.format(tracking_number)}\n'

        text = (
            f"{order['customer_name']} 様\n\n"
            'ご注文の商品を発送いたしました。\n\n'
            '─────────────────\n'
            f'【注文番号】  {order_no}\n'
            f'【お届け先】\n{address}\n'
            f'【合計金額】  {_FMT(order["total"])}（税込・送料込）'
            f'{tracking_lines}'
            '─────────────────\n\n'
            '商品のお届けまでしばらくお待ちください。\n'
            'ご不明な点は下記よりお問い合わせください。\n\n'
            '■ お問い合わせ\n'
            'https://ei8htplants.com/contact\n'
            + NO_REPLY_NOTE
        )
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            'from': SENDER,
            'to': [order['customer_email']],
            'subject': f'発送のお知らせ（注文番号: {order_no}）| ei8ht plants',
            'text': text,
        })
    except Exception as e:
        print(f'[orders] shipping notification failed: {e}')


@router.patch('/{order_id}')
def update_order_status(order_id: str, body: OrderStatusPatch, _=Depends(require_auth)):
    patch: dict = {'status': body.status}
    if body.status == 'shipped':
        if body.carrier is not None:
            patch['carrier'] = body.carrier
        if body.tracking_number is not None:
            patch['tracking_number'] = body.tracking_number
    updated = admin_supabase.table('orders').update(patch).eq('id', order_id).execute().data[0]
    if body.status == 'shipped':
        _send_shipping_notification(updated)
    return updated
