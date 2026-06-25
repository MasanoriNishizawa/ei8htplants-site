"""
app/routes/admin.py
===================
管理画面のルーター。

URL 構成（/admin プレフィックスは app/__init__.py で付与）:
  GET  /admin/login          ログインページ表示
  POST /admin/login          ログイン処理
  GET  /admin/logout         ログアウト
  GET  /admin/               → /admin/events にリダイレクト
  GET  /admin/events         イベント一覧
  GET  /admin/events/new     新規イベント作成フォーム
  POST /admin/events/new     新規イベント保存
  GET  /admin/events/{row}   編集フォーム
  POST /admin/events/{row}   イベント更新
  POST /admin/events/{row}/delete  イベント削除

アクセス制御:
  _check_auth() で未認証リクエストをログインページにリダイレクトする。
  各エンドポイントの先頭で必ず呼ぶこと。

フラッシュメッセージ:
  書き込み成功・失敗の結果を session["flash"] に一時保存し、
  一覧ページで 1 度だけ表示して削除（session.pop）する。

管理画面はサイトのナビには表示されない隠しページ。
直接 /admin/login にアクセスするか、URL を知っている人のみ使用可能。
"""

import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from ..auth import is_authenticated, login, logout
from ..email import send_cancellation_confirmation, send_cancellation_notification
from ..sheets import (
    cancel_reservation,
    create_event,
    delete_event,
    get_all_contacts_for_admin,
    get_all_events_for_admin,
    get_all_ws_reservations_for_admin,
    get_event_row,
    get_reservation_by_token,
    parse_date,
    update_event,
    update_reservation_memo,
)
from ..templates import templates

_task_refs: set = set()


def _fire(coro) -> None:
    task = asyncio.create_task(coro)
    _task_refs.add(task)
    task.add_done_callback(_task_refs.discard)

router = APIRouter()

# 販売ブランドの選択肢（フォームのチェックボックスに使用）
# スプレッドシートの「販売ブランド」列と一致させること
BRAND_OPTIONS = ["ei8ht plants", "Habitat Oides", "HUE by ei8ht plants"]


def _check_auth(request: Request):
    """
    セッションの認証状態を確認するヘルパー。

    未認証の場合: ログインページへの RedirectResponse を返す
    認証済みの場合: None を返す（呼び出し元は None チェックで処理継続）
    """
    if not is_authenticated(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    return None


async def _parse_event_form(request: Request) -> dict:
    """
    イベントフォームの POST データを解析して辞書を返す。

    チェックボックスの特殊処理:
      「販売ブランド」は複数選択チェックボックスのため、
      同じ name で複数の値が送信される。form[key] では最後の 1 つしか取れないため
      form.getlist() で全選択値を取得してカンマ区切りの文字列に結合する。

      「WSフラグ」「予約フラグ」は未チェック時に POST データに含まれないため、
      存在確認してから "TRUE" / "FALSE" を明示的に設定する。
    """
    form = await request.form()

    # 「販売ブランド」チェックボックスの全選択値を取得
    brands = form.getlist("販売ブランド")

    # 特殊処理が必要なキーを除いて通常のフィールドを辞書化
    # dict.fromkeys() で重複キーを排除してから処理する
    skip = {"販売ブランド", "WSフラグ", "予約フラグ"}
    data = {k: form[k] for k in dict.fromkeys(form.keys()) if k not in skip}

    # ブランドをカンマ区切りに結合（例: "ei8ht plants, Habitat Oides"）
    data["販売ブランド"] = ", ".join(brands)

    # チェックボックスは未チェック時に送信されないため、存在確認して明示的に設定
    data["WSフラグ"] = "TRUE" if form.get("WSフラグ") else "FALSE"
    data["予約フラグ"] = "TRUE" if form.get("予約フラグ") else "FALSE"

    return data


# ================================================================
# 認証エンドポイント
# ================================================================

@router.get("/login", response_class=HTMLResponse)
async def admin_login_get(request: Request):
    """ログインページを表示する。既にログイン済みならイベント一覧へリダイレクト。"""
    if is_authenticated(request):
        return RedirectResponse(url="/admin/events", status_code=302)
    return templates.TemplateResponse(
        "admin/admin_login.html", {"request": request, "error": None}
    )


@router.post("/login")
async def admin_login_post(request: Request):
    """
    ログイン処理。
    認証成功: イベント一覧へリダイレクト
    認証失敗: エラーメッセージ付きでログインページを再表示
    """
    form = await request.form()
    if login(request, str(form.get("username", "")), str(form.get("password", ""))):
        return RedirectResponse(url="/admin/events", status_code=302)
    return templates.TemplateResponse(
        "admin/admin_login.html",
        {"request": request, "error": "IDまたはパスワードが違います"},
    )


@router.get("/logout")
async def admin_logout(request: Request):
    """セッションをクリアしてログインページへリダイレクト。"""
    logout(request)
    return RedirectResponse(url="/admin/login", status_code=302)


@router.get("/", response_class=HTMLResponse)
async def admin_root(request: Request):
    """/admin/ へのアクセスをイベント一覧に転送する。"""
    redir = _check_auth(request)
    return redir or RedirectResponse(url="/admin/events", status_code=302)


# ================================================================
# WS 予約一覧
# ================================================================

@router.get("/reservations", response_class=HTMLResponse)
async def admin_reservations(request: Request, event: str = "", exclude_cancelled: str = ""):
    """WS予約シートの予約一覧を表示する。event・exclude_cancelled クエリで絞り込み可能。"""
    redir = _check_auth(request)
    if redir:
        return redir
    try:
        from datetime import date as _date
        reservations = get_all_ws_reservations_for_admin()
        # イベント名の選択肢（重複除去・順序保持）
        event_names = list(dict.fromkeys(r.get("イベント名", "") for r in reservations if r.get("イベント名")))
        # 絞り込み
        filtered = reservations
        if event:
            filtered = [r for r in filtered if r.get("イベント名") == event]
        if exclude_cancelled == "1":
            filtered = [r for r in filtered if r.get("キャンセル済み") != "TRUE"]
        # イベント別合計参加人数（キャンセル済み除外）
        totals: dict[str, int] = {}
        for r in reservations:
            if r.get("キャンセル済み") == "TRUE":
                continue
            name = r.get("イベント名", "")
            try:
                totals[name] = totals.get(name, 0) + int(r.get("参加人数", 0))
            except (ValueError, TypeError):
                pass
        # イベントの終了日マップを作成し、現在・過去を分類
        _, all_events = get_all_events_for_admin()
        event_end_dates: dict[str, _date] = {}
        for e in all_events:
            name = e.get("イベント名", "")
            end = parse_date(e.get("終了日") or e.get("開始日", ""))
            if name and end:
                event_end_dates[name] = end
        today = _date.today()
        active_totals = {}
        past_ws_events: list[dict] = []
        for name, total in totals.items():
            end = event_end_dates.get(name)
            if end is None or end >= today:
                active_totals[name] = {"total": total, "end": end}
            else:
                past_ws_events.append({"name": name, "end": end, "total": total})
        # 終了日昇順（近い順に左）でソート
        active_totals = dict(
            sorted(active_totals.items(), key=lambda kv: kv[1]["end"] or _date.max)
        )
        # 過去イベントは終了日降順（新しい順）
        past_ws_events.sort(key=lambda x: x["end"], reverse=True)
        return templates.TemplateResponse(
            "admin/admin_reservations.html",
            {
                "request": request,
                "reservations": filtered,
                "event_names": event_names,
                "selected_event": event,
                "exclude_cancelled": exclude_cancelled == "1",
                "active_totals": active_totals,
                "past_ws_events": past_ws_events,
            },
        )
    except Exception as e:
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)


# ================================================================
# イベント一覧
# ================================================================

@router.get("/events", response_class=HTMLResponse)
async def admin_events_list(request: Request):
    """
    全イベントを開始日の降順で一覧表示する。
    書き込み操作後にリダイレクトされてくる際にフラッシュメッセージを表示する。

    session.pop() で取得することで 1 度だけ表示してセッションから削除する。
    """
    redir = _check_auth(request)
    if redir:
        return redir
    # フラッシュメッセージを取得（存在すればセッションから削除）
    flash = request.session.pop("flash", None)
    try:
        _, events = get_all_events_for_admin()
        return templates.TemplateResponse(
            "admin/admin_events.html",
            {"request": request, "events": events, "flash": flash},
        )
    except Exception as e:
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)


# ================================================================
# イベント新規作成
# ================================================================

@router.get("/events/new", response_class=HTMLResponse)
async def admin_events_new(request: Request):
    """
    新規イベント作成フォームを表示する。
    event={} を渡すことでテンプレート側の event.get() が空文字を返す。
    row=None でフォームの action が /admin/events/new になる。
    """
    redir = _check_auth(request)
    if redir:
        return redir
    return templates.TemplateResponse(
        "admin/admin_event_form.html",
        {
            "request": request,
            "event": {},       # 全フィールドを空で表示
            "row": None,       # None → フォームの POST 先が /admin/events/new になる
            "title": "新規イベント追加",
            "brand_options": BRAND_OPTIONS,
        },
    )


@router.post("/events/new")
async def admin_events_create(request: Request):
    """
    新規イベントをスプレッドシートに追加する。
    成功・失敗どちらでもフラッシュメッセージを設定してイベント一覧へリダイレクト。
    """
    redir = _check_auth(request)
    if redir:
        return redir
    data = await _parse_event_form(request)
    try:
        create_event(data)
        request.session["flash"] = "イベントを作成しました"
    except Exception as e:
        request.session["flash"] = f"エラー: {e}"
    return RedirectResponse(url="/admin/events", status_code=302)


# ================================================================
# イベント編集
# ================================================================

@router.get("/events/{row}", response_class=HTMLResponse)
async def admin_events_edit(request: Request, row: int):
    """
    編集フォームを表示する。

    {row} が int 型であることで、/events/new との衝突を防いでいる。
    FastAPI はパス変数の型変換に失敗した場合（"new" → int）そのルートをスキップし、
    先に定義された /events/new ルートにマッチさせる。

    Args:
        row: スプレッドシートの行番号（1-indexed、ヘッダー=1、データ開始=2）
    """
    redir = _check_auth(request)
    if redir:
        return redir
    try:
        _, event = get_event_row(row)
        return templates.TemplateResponse(
            "admin/admin_event_form.html",
            {
                "request": request,
                "event": event,
                "row": row,    # テンプレートの form action="/admin/events/{{ row }}" に使用
                "title": "イベント編集",
                "brand_options": BRAND_OPTIONS,
            },
        )
    except Exception as e:
        return HTMLResponse(content=f"Error: {str(e)}", status_code=500)


@router.post("/events/{row}")
async def admin_events_update(request: Request, row: int):
    """指定行のイベントデータをフォームの内容で上書きする。"""
    redir = _check_auth(request)
    if redir:
        return redir
    data = await _parse_event_form(request)
    try:
        update_event(row, data)
        request.session["flash"] = "イベントを更新しました"
    except Exception as e:
        request.session["flash"] = f"エラー: {e}"
    return RedirectResponse(url="/admin/events", status_code=302)


# ================================================================
# イベント削除
# ================================================================

@router.post("/events/{row}/delete")
async def admin_events_delete(request: Request, row: int):
    """
    指定行をスプレッドシートから削除する。

    GET ではなく POST にしている理由:
      GET リクエストはブラウザの先読みや誤クリックで意図せず実行される可能性があるため、
      データ変更操作は必ず POST にするのが Web の慣習。
      テンプレート側でも JavaScript の confirm() で二重確認を行っている。
    """
    redir = _check_auth(request)
    if redir:
        return redir
    try:
        delete_event(row)
        request.session["flash"] = "イベントを削除しました"
    except Exception as e:
        request.session["flash"] = f"エラー: {e}"
    return RedirectResponse(url="/admin/events", status_code=302)


@router.get("/contacts", response_class=HTMLResponse)
async def admin_contacts(request: Request):
    redir = _check_auth(request)
    if redir:
        return redir
    contacts = get_all_contacts_for_admin()
    return templates.TemplateResponse(
        request,
        "admin/admin_contacts.html",
        {"contacts": contacts},
    )


@router.get("/reservations/schedule", response_class=HTMLResponse)
async def admin_reservations_schedule(request: Request, event: str = ""):
    redir = _check_auth(request)
    if redir:
        return redir
    all_reservations = get_all_ws_reservations_for_admin()
    active = [
        r for r in all_reservations
        if r.get("イベント名") == event and r.get("キャンセル済み") != "TRUE"
    ]
    # 時間帯でグループ化し、昇順ソート
    from collections import defaultdict
    groups: dict[str, list] = defaultdict(list)
    for r in active:
        groups[r.get("希望時間帯", "未定")].append(r)
    sorted_groups = dict(sorted(groups.items()))
    return templates.TemplateResponse(
        "admin/admin_reservation_schedule.html",
        {"request": request, "event": event, "groups": sorted_groups},
    )


@router.get("/reservations/history", response_class=HTMLResponse)
async def admin_reservation_history(request: Request, name: str = ""):
    redir = _check_auth(request)
    if redir:
        return redir
    all_reservations = get_all_ws_reservations_for_admin()
    history = [r for r in all_reservations if r.get("お名前") == name]
    return templates.TemplateResponse(
        "admin/admin_reservation_history.html",
        {"request": request, "name": name, "history": history},
    )


@router.post("/reservations/memo")
async def admin_reservations_memo(request: Request):
    redir = _check_auth(request)
    if redir:
        return redir
    form = await request.form()
    try:
        row_num = int(form.get("row", 0))
        memo = str(form.get("memo", "")).strip()
        if row_num:
            await asyncio.to_thread(update_reservation_memo, row_num, memo)
    except Exception:
        pass
    from fastapi.responses import JSONResponse
    return JSONResponse({"ok": True})


@router.post("/reservations/cancel")
async def admin_reservations_cancel(request: Request):
    redir = _check_auth(request)
    if redir:
        return redir
    form = await request.form()
    token = str(form.get("token", "")).strip()
    if token:
        reservation = await asyncio.to_thread(get_reservation_by_token, token)
        await asyncio.to_thread(cancel_reservation, token, reason="管理者によるキャンセル処理")
        if reservation:
            _fire(asyncio.to_thread(send_cancellation_confirmation, reservation, "管理者によるキャンセル処理"))
            _fire(asyncio.to_thread(send_cancellation_notification, reservation, "管理者によるキャンセル処理"))
    return RedirectResponse(url="/admin/reservations", status_code=302)
