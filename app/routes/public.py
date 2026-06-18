"""
app/routes/public.py
====================
公開サイトのルーター。

全エンドポイントは Google API の結果をキャッシュしているため、
2 回目以降のアクセスは API を叩かずに高速応答できる。
エラー時は 500 レスポンスとしてエラー内容を返す（開発中の視認性優先）。
"""

import asyncio
import re
from datetime import timedelta

# asyncio.create_task で生成したタスクの参照を保持するセット。
# 参照がなくなるとGCに回収されて実行中でも消えるため、完了まで保持する。
_task_refs: set = set()


def _fire(coro) -> None:
    task = asyncio.create_task(coro)
    _task_refs.add(task)
    task.add_done_callback(_task_refs.discard)

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from ..config import SPREADSHEET_ID
from ..drive import get_gallery_images, get_home_gallery_images
from ..google_client import get_gc
from ..email import (
    send_cancellation_confirmation,
    send_contact_confirmation,
    send_contact_notification,
    send_reservation_notification,
)
from ..sheets import (
    WS_MAX_PARTICIPANTS,
    _enrich_event,
    create_contact,
    get_display_url,
    get_event_row,
    get_events_data,
    get_ws_reservation_count,
    parse_date,
)
from ..templates import templates

router = APIRouter()


# ================================================================
# ユーティリティ
# ================================================================

_DAYS_JA = ["月", "火", "水", "木", "金", "土", "日"]


def _generate_time_map(start_str: str, end_str: str, time_str: str) -> dict:
    """
    各日付 → 時間スロットリスト の辞書を返す。

    開催時間のフォーマット:
      "10:00〜17:00"                 → 全日同じ時間帯
      "10:00〜17:00 / 11:00〜18:00" → スラッシュ区切りで日ごとに異なる（日付順）
      "10:00〜17:00\\n11:00〜18:00" → 改行区切り（同上）

    日数より時間帯の指定数が少ない場合は最後の時間帯を繰り返す。

    Returns:
        {"2026-06-14": ["11:00-12:00", ...], "2026-06-15": ["12:00-13:00", ...]}
    """
    start = parse_date(start_str)
    end = parse_date(end_str) or start
    if not start:
        return {}

    raw = str(time_str).strip()
    # 改行 → スラッシュ → 単一 の優先順で分割
    if "\n" in raw:
        parts = [p.strip() for p in raw.split("\n") if p.strip()]
    elif "/" in raw:
        parts = [p.strip() for p in raw.split("/") if p.strip()]
    else:
        parts = [raw] if raw else []

    dates = []
    current = start
    while current <= end:
        dates.append(current)
        current += timedelta(days=1)

    result = {}
    for i, date in enumerate(dates):
        part = parts[min(i, len(parts) - 1)] if parts else ""
        result[date.strftime("%Y-%m-%d")] = _generate_ws_slots(part)

    return result


def _generate_date_options(start_str: str, end_str: str) -> list:
    """
    開始日〜終了日の各日を選択肢リストで返す。

    Returns:
        [{"value": "2026-06-15", "label": "2026年6月15日（日）"}, ...]
    """
    start = parse_date(start_str)
    end = parse_date(end_str) or start
    if not start:
        return []
    options = []
    current = start
    while current <= end:
        dow = _DAYS_JA[current.weekday()]
        options.append({
            "value": current.strftime("%Y-%m-%d"),
            "label": f"{current.year}年{current.month}月{current.day}日（{dow}）",
        })
        current += timedelta(days=1)
    return options


def _generate_ws_slots(time_str: str) -> list:
    """
    開催時間文字列（例: "10:00〜17:00"）から 1 時間単位の時間スロットリストを生成する。

    GAS の doPost に渡す time フィールドの選択肢を生成するために使用。
    パースに失敗した場合は空リストを返し、テンプレート側でフリーテキスト入力にフォールバックする。
    """
    if not time_str:
        return []
    # 全角チルダ・半角チルダ・ハイフン・ダッシュ類で分割
    parts = re.split(r"[〜~\-–−]", str(time_str).strip())
    if len(parts) < 2:
        return []
    try:
        start_h = int(parts[0].strip().split(":")[0])
        end_h = int(parts[1].strip().split(":")[0])
        # 開始の1時間後〜終了の1時間前まで（WS中に搬入・搬出の余裕を確保）
        return [f"{h:02d}:00-{h+1:02d}:00" for h in range(start_h + 1, end_h - 1)]
    except Exception:
        return []


# ================================================================
# ホーム（/）
# ================================================================

@router.get("/", response_class=HTMLResponse)
async def read_home(request: Request):
    """
    トップページ。

    - NEXT EVENT: 直近の開催予定イベントを 1 件表示
    - GALLERY: 全ブランドから最大 8 枚ずつランダムに並べたマーキー
    """
    try:
        active_events = get_events_data(is_past=False)
    except Exception:
        active_events = []
    try:
        gallery_images = get_home_gallery_images()
    except Exception:
        gallery_images = []

    # イベントが 1 件以上あれば先頭（最も近い日付）を NEXT EVENT として表示
    next_event = active_events[0] if active_events else None
    return templates.TemplateResponse(
        request=request,
        name="home.html",
        context={
            "request": request,
            "next_event": next_event,
            "gallery_images": gallery_images,
        },
    )


# ================================================================
# イベント一覧（/events）
# ================================================================

@router.get("/events", response_class=HTMLResponse)
async def read_events(request: Request, page: str = None):
    """
    イベント一覧ページ。

    ?page=past を付けると過去のイベント一覧に切り替わる。
    デフォルト（クエリなし）は開催予定イベント。

    直近イベント（pinned_event）を先頭に大きく表示し、
    それ以降（scheduled_events）をグリッドレイアウトで表示する。
    """
    try:
        is_past = page == "past"
        events_list = get_events_data(is_past=is_past)

        # 過去イベントは全件をグリッドに表示（ピン留めなし）
        # 将来イベントは先頭を「NEXT EVENT」としてピン留め
        pinned_event = events_list[0] if not is_past and events_list else None
        scheduled_events = (
            events_list[1:] if not is_past and len(events_list) > 1 else events_list
        )
        return templates.TemplateResponse(
            request=request,
            name="events.html",
            context={
                "request": request,
                "pinned_event": pinned_event,
                "scheduled_events": scheduled_events,
                "is_past": is_past,
            },
        )
    except Exception as e:
        return HTMLResponse(content=f"Events Error: {str(e)}", status_code=500)


# ================================================================
# コンセプトページ（/concept）
# ================================================================

@router.get("/concept", response_class=HTMLResponse)
async def read_concept(request: Request):
    """コンセプトページ。静的コンテンツなので API 呼び出しなし。"""
    return templates.TemplateResponse(
        request=request, name="concept.html", context={"request": request}
    )


# ================================================================
# コラボレーション（/collaborations）
# ================================================================

@router.get("/collaborations", response_class=HTMLResponse)
async def read_collaborations(request: Request):
    """
    コラボレーション・プロジェクト一覧。
    スプレッドシートの "PROJECTS" シートからデータを取得する。
    画像列（カンマ区切りの Drive URL）をリストに変換してテンプレートに渡す。
    """
    try:
        sh = get_gc().open_by_key(SPREADSHEET_ID)
        worksheet = sh.worksheet("PROJECTS")
        projects_data = worksheet.get_all_records()
        for item in projects_data:
            images_str = str(item.get("画像", "")).strip()
            item["image_urls"] = (
                [get_display_url(u) for u in images_str.split(",") if u.strip()]
                if images_str
                else []
            )
        return templates.TemplateResponse(
            request=request,
            name="collaborations.html",
            context={"request": request, "projects": projects_data},
        )
    except Exception as e:
        return HTMLResponse(content=f"Collaborations Error: {str(e)}", status_code=500)


# ================================================================
# ギャラリー（/gallery）
# ================================================================

@router.get("/gallery", response_class=HTMLResponse)
async def read_gallery(request: Request, brand: str = "ei8ht_plants"):
    """
    ギャラリーページ。

    ?brand= クエリでブランドを切り替え可能。
    指定なし（デフォルト）は ei8ht_plants のフォルダを表示。
    """
    try:
        gallery_images = get_gallery_images(brand=brand)
        return templates.TemplateResponse(
            request=request,
            name="gallery.html",
            context={
                "request": request,
                "images": gallery_images,
                "current_brand": brand,
            },
        )
    except Exception as e:
        return HTMLResponse(content=f"Gallery Error: {str(e)}", status_code=500)


# ================================================================
# Specimen（/specimen）
# ================================================================

@router.get("/reserve", response_class=HTMLResponse)
async def reserve_form(request: Request, row: int = None):
    """
    ワークショップ予約フォームページ。

    ?row=N でスプレッドシートの行番号を指定する。
    WSフラグが TRUE の行のみ有効。フォームは POST /reserve に送信する。
    """
    if row is None:
        return RedirectResponse(url="/events")
    try:
        _, event = get_event_row(row)
        if str(event.get("WSフラグ", "")).upper() != "TRUE":
            return RedirectResponse(url="/events")
        _enrich_event(event)
        date_options = _generate_date_options(event.get("開始日", ""), event.get("終了日", ""))
        time_map = _generate_time_map(
            event.get("開始日", ""), event.get("終了日", ""), event.get("開催時間", "")
        )
        import json as _json
        time_map_json = _json.dumps(time_map, ensure_ascii=False)
        has_time_slots = any(slots for slots in time_map.values())
        flash = request.session.pop("reserve_flash", None) if hasattr(request, "session") else None
        return templates.TemplateResponse(
            request=request,
            name="reserve.html",
            context={
                "request": request,
                "event": event,
                "row": row,
                "date_options": date_options,
                "time_map_json": time_map_json,
                "has_time_slots": has_time_slots,
                "flash": flash,
            },
        )
    except Exception as e:
        return HTMLResponse(content=f"Reserve Error: {str(e)}", status_code=500)


@router.post("/reserve", response_class=HTMLResponse)
async def reserve_submit(request: Request):
    """
    ワークショップ予約フォームの送信を受け取り、WS予約シートに書き込んで確認メールを送る。
    メール送信が失敗しても予約自体は成立する（email.py 内でエラーをログ記録して握りつぶす）。
    """
    try:
        form = await request.form()
        row = int(form.get("row", 0))
        from ..sheets import create_ws_reservation
        from ..email import send_reservation_confirmation

        reservation_data = {
            "イベント名":   str(form.get("event_name", "")),
            "お名前":       str(form.get("name", "")),
            "メール":       str(form.get("email", "")),
            "希望日":       str(form.get("date", "")),
            "希望時間帯":   str(form.get("time", "")),
            "参加人数":     str(form.get("participants", "")),
            "お持ち込み":   ", ".join(filter(None, [
                "植木鉢" if form.get("bring-pot") else "",
                "植物"   if form.get("bring-plant") else "",
            ])),
            "備考":         str(form.get("message", "")),
        }

        await asyncio.to_thread(create_ws_reservation, reservation_data)
        _fire(asyncio.to_thread(send_reservation_confirmation, reservation_data))
        _fire(asyncio.to_thread(send_reservation_notification, reservation_data))

        if hasattr(request, "session"):
            request.session["reserve_flash"] = "ご予約を受け付けました。確認メールをお送りしましたのでご確認ください。<br>メールが届かない場合は迷惑メールフォルダをご確認ください。"
        return RedirectResponse(url=f"/reserve?row={row}", status_code=303)
    except Exception as e:
        return HTMLResponse(content=f"Reserve Error: {str(e)}", status_code=500)


# ================================================================
# ワークショップ残席確認 API（/api/reserve/availability）
# ================================================================

@router.get("/api/reserve/availability")
async def ws_availability(event_name: str = "", date: str = "", time: str = ""):
    """
    指定イベント×日付×時間帯の残席数を JSON で返す。

    フロントエンド JS がこのエンドポイントを呼び出して参加人数の
    選択肢をリアルタイムで生成する。

    Returns:
        {"available": 3, "max": 4}
    """
    try:
        current = get_ws_reservation_count(event_name, date, time)
        available = max(0, WS_MAX_PARTICIPANTS - current)
        return JSONResponse({"available": available, "max": WS_MAX_PARTICIPANTS})
    except Exception as e:
        return JSONResponse({"available": WS_MAX_PARTICIPANTS, "max": WS_MAX_PARTICIPANTS, "error": str(e)})


# ================================================================
# Specimen（/specimen）
# ================================================================

def _brand_events(brand_name: str) -> list:
    """販売ブランド列に brand_name を含む開催予定イベントを返す。"""
    all_events = get_events_data(is_past=False)
    return [e for e in all_events if brand_name in e.get("販売ブランド", "")]


@router.get("/ei8htplants", response_class=HTMLResponse)
async def read_ei8htplants(request: Request):
    """ei8ht plants ブランドページ。"""
    try:
        gallery_images = get_gallery_images(brand="ei8ht_plants")
        sh = get_gc().open_by_key(SPREADSHEET_ID)
        worksheet = sh.worksheet("Specimen")
        data = worksheet.get_all_records()
        specimen_preview = []
        for item in data[:6]:
            name = item.get("品種名", "Untitled")
            raw_urls = [str(item.get(f"画像{i}", "")).strip() for i in range(1, 4)]
            image_urls = [get_display_url(r) for r in raw_urls if r]
            if image_urls:
                specimen_preview.append({"name": name, "image": image_urls[0]})
        return templates.TemplateResponse(
            request=request,
            name="ei8htplants.html",
            context={
                "request": request,
                "specimen_preview": specimen_preview,
                "gallery_preview": gallery_images[:8],
            },
        )
    except Exception as e:
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)


@router.get("/habitatoides", response_class=HTMLResponse)
async def read_habitatoides(request: Request):
    """Habitat Oides ブランドページ。"""
    try:
        gallery_images = get_gallery_images(brand="habitat_oides")
        return templates.TemplateResponse(
            request=request,
            name="habitatoides.html",
            context={
                "request": request,
                "gallery_preview": gallery_images[:8],
            },
        )
    except Exception as e:
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)


@router.get("/habitatoides/workshop", response_class=HTMLResponse)
async def read_habitatoides_workshop(request: Request):
    """Habitat Oides ワークショップページ。"""
    try:
        events = _brand_events("Habitat Oides")
        ws_events = [e for e in events if str(e.get("WSフラグ", "")).upper() == "TRUE"]
        return templates.TemplateResponse(
            request=request,
            name="habitatoides_workshop.html",
            context={"request": request, "ws_events": ws_events},
        )
    except Exception as e:
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)


@router.get("/hue", response_class=HTMLResponse)
async def read_hue(request: Request):
    """HUE by ei8ht plants ブランドページ。"""
    try:
        gallery_images = get_gallery_images(brand="hue")
        return templates.TemplateResponse(
            request=request,
            name="hue.html",
            context={
                "request": request,
                "gallery_preview": gallery_images[:8],
            },
        )
    except Exception as e:
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)


@router.get("/specimen", response_class=HTMLResponse)
async def read_specimen(request: Request):
    """
    植物標本（Specimen）ページ。
    スプレッドシートの "Specimen" シートから品種名と画像を取得する。

    画像は 1 品種につき最大 3 枚（画像1・画像2・画像3 列）。
    画像が 1 枚もない品種はリストに含めない。
    """
    try:
        sh = get_gc().open_by_key(SPREADSHEET_ID)
        worksheet = sh.worksheet("Specimen")
        data = worksheet.get_all_records()
        specimen_list = []
        for item in data:
            name = item.get("品種名", "Untitled")
            # 画像列を 1 〜 3 の順に取得してリスト化
            raw_urls = [
                str(item.get("画像1", "")).strip(),
                str(item.get("画像2", "")).strip(),
                str(item.get("画像3", "")).strip(),
            ]
            # 空文字や None を除外してから URL を生成
            image_urls = [get_display_url(r) for r in raw_urls if r]
            if image_urls:
                specimen_list.append({"name": name, "all_images": image_urls})
        return templates.TemplateResponse(
            request=request,
            name="specimen.html",
            context={"request": request, "specimens": specimen_list},
        )
    except Exception as e:
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)


@router.get("/contact", response_class=HTMLResponse)
async def contact_form(request: Request, sent: str = None):
    return templates.TemplateResponse("contact.html", {
        "request": request,
        "sent": sent == "1",
    })


@router.post("/contact", response_class=HTMLResponse)
async def contact_submit(request: Request):
    form = await request.form()
    data = {
        "name":    str(form.get("name", "")).strip(),
        "email":   str(form.get("email", "")).strip(),
        "subject": str(form.get("subject", "")).strip(),
        "message": str(form.get("message", "")).strip(),
    }
    try:
        await asyncio.to_thread(create_contact, data)
        _fire(asyncio.to_thread(send_contact_notification, data))
        _fire(asyncio.to_thread(send_contact_confirmation, data))
    except Exception as e:
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)
    return RedirectResponse("/contact?sent=1", status_code=303)


@router.get("/cancel", response_class=HTMLResponse)
async def cancel_form(request: Request, token: str = "", done: str = ""):
    from ..sheets import get_reservation_by_token
    reservation = await asyncio.to_thread(get_reservation_by_token, token) if token else None
    return templates.TemplateResponse("cancel.html", {
        "request": request,
        "reservation": reservation,
        "token": token,
        "done": done == "1",
    })


@router.post("/cancel", response_class=HTMLResponse)
async def cancel_submit(request: Request):
    from ..sheets import cancel_reservation, get_reservation_by_token
    from ..email import send_cancellation_notification
    form = await request.form()
    token = str(form.get("token", "")).strip()
    reason = str(form.get("reason", "")).strip()
    if token:
        reservation = await asyncio.to_thread(get_reservation_by_token, token)
        await asyncio.to_thread(cancel_reservation, token, reason)
        if reservation:
            _fire(asyncio.to_thread(send_cancellation_confirmation, reservation, reason))
            _fire(asyncio.to_thread(send_cancellation_notification, reservation, reason))
    return RedirectResponse(f"/cancel?token={token}&done=1", status_code=303)
