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

# asyncio.create_task で生成したタスクの参照を保持するセット。
# 参照がなくなると GC に回収されて実行中でも消えるため、完了まで保持する。
_task_refs: set = set()


def _fire(coro) -> None:
    """
    コルーチンをバックグラウンドタスクとして起動する（fire-and-forget）。

    メール送信のようにレスポンスを返した後でよい処理に使用。
    タスク参照を _task_refs に保持して GC による早期回収を防ぎ、
    完了時に done_callback で自動的に解放する。
    """
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
async def admin_reservations(request: Request, event: str = "", exclude_cancelled: str = "", tab: str = "current"):
    """WS予約シートの予約一覧を表示する。event・exclude_cancelled・tab クエリで絞り込み可能。"""
    redir = _check_auth(request)
    if redir:
        return redir
    try:
        from datetime import date as _date
        reservations = get_all_ws_reservations_for_admin()
        # 予約日昇順 → 希望時間帯昇順でソート
        reservations.sort(key=lambda r: (r.get("希望日", ""), r.get("希望時間帯", "")))
        today = _date.today()
        # タブごとのイベント名選択肢（重複除去・順序保持）
        current_event_names = list(dict.fromkeys(
            r.get("イベント名", "") for r in reservations
            if r.get("イベント名") and not (parse_date(r.get("希望日", "")) and parse_date(r.get("希望日", "")) < today)
        ))
        past_event_names = list(dict.fromkeys(
            r.get("イベント名", "") for r in reservations
            if r.get("イベント名") and parse_date(r.get("希望日", "")) and parse_date(r.get("希望日", "")) < today
        ))
        # 絞り込み
        filtered = reservations
        if event:
            filtered = [r for r in filtered if r.get("イベント名") == event]
        if exclude_cancelled == "1":
            filtered = [r for r in filtered if r.get("キャンセル済み") != "TRUE"]
        # 予約日（希望日）を基準に現在・過去に分割
        current_reservations = []
        past_reservations = []
        for r in filtered:
            d = parse_date(r.get("希望日", ""))
            if d and d < today:
                past_reservations.append(r)
            else:
                current_reservations.append(r)
        # イベント別合計参加人数（キャンセル済み除外・現在の予約のみ）
        totals: dict[str, int] = {}
        for r in current_reservations:
            if r.get("キャンセル済み") == "TRUE":
                continue
            name = r.get("イベント名", "")
            try:
                totals[name] = totals.get(name, 0) + int(r.get("参加人数", 0))
            except (ValueError, TypeError):
                pass
        active_totals = dict(sorted(totals.items()))
        return templates.TemplateResponse(
            "admin/admin_reservations.html",
            {
                "request": request,
                "current_reservations": current_reservations,
                "past_reservations": past_reservations,
                "current_event_names": current_event_names,
                "past_event_names": past_event_names,
                "selected_event": event,
                "exclude_cancelled": exclude_cancelled == "1",
                "active_totals": active_totals,
                "active_tab": tab,
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
    イベントをカレント（終了日 >= 今日）と過去（終了日 < 今日）に分けて表示する。
    カレント: 開始日昇順（今日に近い順）
    過去: 終了日降順（最近終わったものが上）
    """
    redir = _check_auth(request)
    if redir:
        return redir
    flash = request.session.pop("flash", None)
    try:
        from datetime import date as _date
        _, events = get_all_events_for_admin()
        today = _date.today()
        current_events = []
        past_events = []
        for ev in events:
            end = parse_date(ev.get("終了日") or ev.get("開始日", ""))
            if end and end < today:
                past_events.append(ev)
            else:
                current_events.append(ev)
        current_events.sort(key=lambda e: parse_date(e.get("開始日", "")) or _date.max)
        past_events.sort(
            key=lambda e: parse_date(e.get("終了日") or e.get("開始日", "")) or _date.min,
            reverse=True,
        )
        return templates.TemplateResponse(
            "admin/admin_events.html",
            {
                "request": request,
                "current_events": current_events,
                "past_events": past_events,
                "flash": flash,
            },
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
    """お問い合わせ一覧を表示する（新しい順）。"""
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
    """
    指定イベントの予約表（時間帯別グループ）を表示する。

    ?event=イベント名 で絞り込み。キャンセル済みは除外する。
    時間帯（HH:MM-HH:MM 形式）の文字列昇順でグループをソートするため、
    時間帯が "09:..." < "10:..." のように自然な順序になる。
    """
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
    """
    ?name=xxx で指定した顧客名の予約履歴を一覧表示する。

    名前での完全一致フィルター。予約送信時（POST /reserve）にスペースを除去しているため、
    表記ゆれが抑えられており名前での突合精度が高い。
    """
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
    """
    管理画面から Ajax で呼ばれるメモ保存エンドポイント。

    Sheets API 呼び出しは同期ブロッキングのため asyncio.to_thread() でスレッドに委譲する。
    エラーが発生しても {"ok": True} を返す（サイレント失敗）。
    フロントエンドはエラー判定を行わないため一貫してレスポンスを返す方が安定する。
    row_num が 0 の場合（form.get 失敗）は書き込みをスキップする。
    """
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
    """
    管理者による予約キャンセル処理。

    cancel_reservation() は Sheets 書き込みを確実に行う必要があるため await で待つ。
    メール送信（confirmation / notification）はレスポンス後でよいため _fire() でバックグラウンド実行。

    reservation を先に取得してから cancel する順序にしているのは、
    cancel 後に get_reservation_by_token() を呼ぶと「キャンセル済みフラグ」で
    フィルターされてデータが取れなくなる可能性があるため。
    """
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
