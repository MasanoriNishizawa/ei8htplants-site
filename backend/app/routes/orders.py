import uuid
import requests as http
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from ..db import admin_supabase
from ..config import SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT
from ..auth import require_auth
from .shipping import RATES

router = APIRouter(prefix='/orders', tags=['orders'])

_SQUARE_BASE = (
    'https://connect.squareup.com'
    if SQUARE_ENVIRONMENT == 'production'
    else 'https://connect.squareupsandbox.com'
)


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
    source_id: str  # Square Web Payments SDK が発行したトークン


class OrderStatusPatch(BaseModel):
    status: str


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

    for item in body.items:
        p = product_map.get(item.product_id)
        if not p:
            raise HTTPException(404, '商品が見つかりません')
        if not p['is_published']:
            raise HTTPException(400, f'この商品は現在購入できません: {p["name"]}')

    # 在庫をアトミックに確保（decrement_stock RPC）
    # いずれかが失敗したら確保済み分をロールバックして 409 を返す
    reserved: list[tuple[str, int]] = []
    try:
        for item in body.items:
            ok = admin_supabase.rpc('decrement_stock', {
                'p_product_id': item.product_id,
                'p_quantity': item.quantity,
            }).execute().data
            if not ok:
                p = product_map[item.product_id]
                raise HTTPException(409, f'在庫が不足しています: {p["name"]}')
            reserved.append((item.product_id, item.quantity))
    except HTTPException:
        # 確保済みの在庫を戻す
        for pid, qty in reserved:
            admin_supabase.table('products').update(
                {'stock': product_map[pid]['stock']}  # 元の値に戻す
            ).eq('id', pid).execute()
        raise

    subtotal = sum(product_map[item.product_id]['price'] * item.quantity for item in body.items)
    total = subtotal + shipping_fee

    # Square 決済（失敗したら在庫を戻す）
    try:
        payment_id = _charge_square(body.source_id, total)
    except HTTPException:
        for pid, qty in reserved:
            admin_supabase.table('products').update(
                {'stock': product_map[pid]['stock']}
            ).eq('id', pid).execute()
        raise

    # 注文レコード作成
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


@router.patch('/{order_id}')
def update_order_status(order_id: str, body: OrderStatusPatch, _=Depends(require_auth)):
    return admin_supabase.table('orders').update({'status': body.status}).eq('id', order_id).execute().data[0]
