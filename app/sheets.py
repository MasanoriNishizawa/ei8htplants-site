"""
app/sheets.py
=============
Google Sheets との読み書きを担うモジュール。

スプレッドシートの構成:
  - シート0 (最初のシート) : イベント情報
      列: 開始日, 終了日, イベント名, 販売ブランド, 開催時間,
          場所, ブース番号, 住所, 公式サイトURL, WSフラグ, WS予約URL, 画像
  - シート "Specimen"    : 植物標本データ
  - シート "PROJECTS"    : コラボレーション案件

公開向けの読み取り関数はキャッシュを通す。
管理画面向けの関数はキャッシュをバイパスして常に最新データを返す。
書き込み後はキャッシュを無効化して表示が即反映されるようにする。
"""

import uuid
from datetime import datetime, timezone, timedelta

_JST = timezone(timedelta(hours=9))
from urllib.parse import quote

from .cache import cache
from .config import SPREADSHEET_ID
from .google_client import get_gc


# ================================================================
# ユーティリティ関数
# ================================================================

def get_display_url(drive_url_or_id: str) -> str:
    """
    Google Drive のさまざまな URL 形式・ファイル ID から
    サムネイル表示用 URL（thumbnail API）を生成して返す。

    対応フォーマット:
      - 共有リンク: https://drive.google.com/file/d/<ID>/view
      - 直接 URL:   https://drive.google.com/open?id=<ID>
      - クエリ形式: https://drive.google.com/...?id=<ID>
      - ファイル ID のみ: <ID>

    thumbnail API（sz=w1000）は公開設定の Drive ファイルに対して
    リダイレクトなしで画像を返すため、 uc?export=view より高速。
    """
    if not drive_url_or_id:
        return ""
    s = str(drive_url_or_id).strip()

    # URL からファイル ID を抽出する（複数形式に対応）
    if "id=" in s:
        file_id = s.split("id=")[1].split("&")[0]
    elif "/d/" in s:
        # /file/d/<ID>/view 形式
        file_id = s.split("/d/")[1].split("/")[0]
    elif "open?id=" in s:
        file_id = s.split("id=")[1]
    else:
        # そのままファイル ID とみなす
        file_id = s

    return f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"


def parse_date(date_val) -> "datetime.date | None":
    """
    スプレッドシートの日付セル値を Python の date オブジェクトに変換する。

    Google Sheets は地域設定によって区切り文字が "/" になることがあるため、
    ハイフンとスラッシュの両方を受け付けるようにしている。
    パース失敗時は None を返す（ログに出さずに呼び出し元がスキップ）。
    """
    if not date_val:
        return None
    # スラッシュをハイフンに統一してから strptime でパース
    date_str = str(date_val).strip().replace("/", "-")
    try:
        # スプレッドシートが "2026-06-15 00:00:00" 形式で返すことがあるため
        # 日付部分だけを取り出してパース
        return datetime.strptime(date_str.split(" ")[0], "%Y-%m-%d").date()
    except Exception:
        return None


# ================================================================
# イベントデータ処理（内部ヘルパー）
# ================================================================

def _enrich_event(item: dict) -> dict:
    """
    スプレッドシートの生データに、テンプレート表示用の計算済みフィールドを追加する。

    追加するフィールド:
      - display_date : 表示用日付文字列（"2026年6月15日" または "〜" 範囲形式）
      - map_url      : Google マップ検索 URL（住所から生成）
      - start_obj    : ソート用の date オブジェクト
      - image_urls   : Drive サムネイル URL のリスト（カンマ区切り → リスト）
    """
    start_date = parse_date(item.get("開始日"))
    end_date = parse_date(item.get("終了日")) or start_date

    # 開始日と終了日が異なる場合は範囲表示（例: 6月14日 〜 15日）
    if end_date > start_date:
        item["display_date"] = (
            f"{start_date.year}年{start_date.month}月{start_date.day}日"
            f" 〜 {end_date.month}月{end_date.day}日"
        )
    else:
        item["display_date"] = (
            f"{start_date.year}年{start_date.month}月{start_date.day}日"
        )

    # 住所が未入力の場合は会場名でマップ検索できるようにフォールバック
    addr = item.get("住所") or item.get("場所") or ""
    item["map_url"] = f"https://www.google.com/maps/search/?api=1&query={quote(addr)}"

    # ソート・期間判定に使う date オブジェクトを保持
    item["start_obj"] = start_date
    item["is_past"] = end_date < datetime.today().date()

    # 画像列はカンマ区切りで複数の Drive URL/ID が入っている
    images_str = str(item.get("画像", "")).strip()
    item["image_urls"] = (
        [get_display_url(u) for u in images_str.split(",") if u.strip()]
        if images_str
        else []
    )
    return item


# ================================================================
# 公開ページ向け読み取り関数（キャッシュあり）
# ================================================================

def get_events_data(is_past: bool = False) -> list[dict]:
    """
    現在または過去のイベント一覧を返す。

    キャッシュキー:
      - "events:current" : 終了日が今日以降のイベント（開催予定）
      - "events:past"    : 終了日が今日より前のイベント（過去）

    イベントの書き込みが発生すると cache.clear_prefix("events:") で
    両方のキャッシュが無効化され、次のアクセス時に最新データが取得される。

    get_all_values() を使うことで各行の実際の行番号（_row）を保持できる。
    これは /reserve?row=X による予約フォームへのリンク生成に使用する。

    Args:
        is_past: True のとき過去イベントを返す
    """
    cache_key = f"events:{'past' if is_past else 'current'}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached  # キャッシュヒット：API 呼び出しをスキップ

    try:
        # キャッシュミス：Sheets API から取得
        sh = get_gc().open_by_key(SPREADSHEET_ID)
        worksheet = sh.get_worksheet(0)
        # get_all_values() で取得することで行番号を確定できる
        # (get_all_records() は行番号を返さないため)
        all_values = worksheet.get_all_values()
        if not all_values:
            return []

        headers = all_values[0]
        today = datetime.now(_JST).date()
        result = []

        for i, row in enumerate(all_values[1:], start=2):  # データ行は row=2 から
            # 列数がヘッダーより少ない行は空文字でパディング
            padded = row + [""] * (len(headers) - len(row))
            item = dict(zip(headers, padded))
            # 予約フォームリンク（/reserve?row=X）の生成に使うシート行番号を埋め込む
            item["_row"] = i

            start_date = parse_date(item.get("開始日"))
            if not start_date:
                # 開始日が空欄または不正な形式の行はスキップ
                continue
            end_date = parse_date(item.get("終了日")) or start_date

            if is_past:
                # 過去イベント: 終了日が今日より前のもの
                if end_date >= today:
                    continue
            else:
                # 現在・将来イベント: 終了日が今日以降のもの
                if end_date < today:
                    continue

            result.append(_enrich_event(item))

        # 過去は新しい順、将来は古い順（直近が先頭）
        result.sort(key=lambda x: x["start_obj"], reverse=is_past)
        cache.set(cache_key, result)
        return result
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Sheets API error in get_events_data: %s", e)
        # 503 などの一時的エラー時は stale キャッシュを返す（なければ空リスト）
        return cache.get_stale(cache_key) or []


# ================================================================
# 管理画面向け読み取り関数（キャッシュなし・常に最新）
# ================================================================

def get_all_events_for_admin() -> tuple[list[str], list[dict]]:
    """
    管理画面のイベント一覧に使う全イベントデータを返す。

    キャッシュを使わず常に Sheets から直接取得する（管理操作の直後も最新状態を見せるため）。

    Returns:
        (headers, events): ヘッダー行と、_row フィールド付きのイベント辞書のリスト
                            _row はスプレッドシートの実際の行番号（1-indexed、ヘッダー=1）
    """
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    worksheet = sh.get_worksheet(0)
    all_values = worksheet.get_all_values()  # ヘッダー含む全セル値を 2D リストで取得
    if not all_values:
        return [], []

    headers = all_values[0]
    events = []
    for i, row in enumerate(all_values[1:], start=2):  # ヘッダー行が row=1 なのでデータは row=2 から
        # 列数がヘッダーより少ない行は空文字でパディング
        padded = row + [""] * (len(headers) - len(row))
        d = dict(zip(headers, padded))
        d["_row"] = i  # 編集・削除時に使うシート行番号を埋め込む
        events.append(d)

    # 管理画面では開始日の降順（新しいものが上）で表示
    events.sort(key=lambda x: str(x.get("開始日", "")), reverse=True)
    return headers, events


def get_event_row(row_index: int) -> tuple[list[str], dict]:
    """
    指定行のイベントデータを返す。管理画面の編集フォームの初期値に使用。

    Args:
        row_index: スプレッドシートの行番号（1-indexed、ヘッダー=1、最初のデータ=2）

    Returns:
        (headers, event_dict): ヘッダーとセル値の辞書
    """
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    worksheet = sh.get_worksheet(0)
    headers = worksheet.row_values(1)
    row_values = worksheet.row_values(row_index)
    # 行末の空セルは row_values() に含まれないことがあるため、ヘッダー長に合わせてパディング
    row_values = row_values + [""] * (len(headers) - len(row_values))
    return headers, dict(zip(headers, row_values))


# ================================================================
# 管理画面向け書き込み関数（書き込み後にキャッシュを無効化）
# ================================================================

def create_event(data: dict) -> None:
    """
    スプレッドシートの末尾に新しいイベント行を追加する。

    ヘッダー行を取得して列順を確定してから値を並べることで、
    スプレッドシートの列順序が変わっても正しく書き込める。

    value_input_option="RAW" を指定して、Sheets が日付文字列を
    自動変換しないようにしている（変換されると元の形式と変わる場合があるため）。
    """
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    worksheet = sh.get_worksheet(0)
    headers = worksheet.row_values(1)
    # ヘッダーに対応する値を順番通りに並べる（存在しないキーは空文字）
    row = [str(data.get(h, "")) for h in headers]
    worksheet.append_row(row, value_input_option="RAW")
    # 公開ページのキャッシュを無効化して次のアクセス時に最新データを返すようにする
    cache.clear_prefix("events:")


def update_event(row_index: int, data: dict) -> None:
    """
    指定行のイベントデータを上書き更新する。

    行全体を一括で上書きする方法（update range）を使うことで、
    1 つの API リクエストで完結させている（列ごとに update_cell を呼ぶより効率的）。

    Args:
        row_index: スプレッドシートの行番号（1-indexed）
        data:      フォームから渡されたフィールド名 → 値の辞書
    """
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    worksheet = sh.get_worksheet(0)
    headers = worksheet.row_values(1)
    row = [str(data.get(h, "")) for h in headers]
    # A 列から最終列まで一括更新（例: A5:L5）
    end_col = _col_letter(len(headers))
    worksheet.update(
        values=[row],
        range_name=f"A{row_index}:{end_col}{row_index}",
        value_input_option="RAW",
    )
    cache.clear_prefix("events:")


def delete_event(row_index: int) -> None:
    """
    指定行をスプレッドシートから完全に削除する。
    delete_rows() は指定行を削除して後続行を上に詰める。

    Args:
        row_index: スプレッドシートの行番号（1-indexed）
    """
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    worksheet = sh.get_worksheet(0)
    worksheet.delete_rows(row_index)
    cache.clear_prefix("events:")


# ================================================================
# ワークショップ予約（WS予約シート）
# ================================================================

WS_SHEET_NAME = "WS予約"
WS_MAX_PARTICIPANTS = 4  # gas/workshop_reservation.gs の MAX_PARTICIPANTS と合わせる


def get_all_ws_reservations_for_admin() -> list[dict]:
    """
    「WS予約」シートの全予約データを返す。

    シートが存在しない場合は空リストを返す。
    新しい順（タイムスタンプ降順）でソートして返す。
    """
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(WS_SHEET_NAME)
    except Exception:
        return []
    rows = ws.get_all_values()
    if len(rows) < 2:
        return []
    headers = rows[0]
    result = []
    for sheet_row, row in enumerate(rows[1:], start=2):
        padded = row + [""] * (len(headers) - len(row))
        d = dict(zip(headers, padded))
        d["_row"] = sheet_row
        result.append(d)
    result.sort(key=lambda x: x.get("タイムスタンプ", ""), reverse=True)
    return result


_WS_CANCEL_COLS = ["キャンセルトークン", "キャンセル済み", "キャンセル理由", "キャンセル日時", "メモ"]


def _ensure_cancel_columns(ws) -> None:
    headers = ws.row_values(1)
    missing = [c for c in _WS_CANCEL_COLS if c not in headers]
    if missing:
        needed_cols = len(headers) + len(missing)
        if ws.col_count < needed_cols:
            ws.resize(rows=ws.row_count, cols=needed_cols)
        start = len(headers) + 1
        for i, name in enumerate(missing):
            ws.update_cell(1, start + i, name)


def create_ws_reservation(data: dict) -> None:
    """
    「WS予約」シートに予約データを 1 行追記する。

    data にキャンセルトークンを書き込むことでメール送信側がリンクを生成できる。
    列順: タイムスタンプ, イベント名, お名前, メール,
          希望日, 希望時間帯, 参加人数, お持ち込み, 備考,
          キャンセルトークン, キャンセル済み, キャンセル理由, キャンセル日時, メモ
    """
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(WS_SHEET_NAME)
    except Exception:
        ws = sh.add_worksheet(title=WS_SHEET_NAME, rows=1000, cols=14)
        ws.append_row(
            ["タイムスタンプ", "イベント名", "お名前", "メール",
             "希望日", "希望時間帯", "参加人数", "お持ち込み", "備考",
             "キャンセルトークン", "キャンセル済み", "キャンセル理由", "キャンセル日時", "メモ"],
            value_input_option="RAW",
        )
    _ensure_cancel_columns(ws)

    token = str(uuid.uuid4())
    data["キャンセルトークン"] = token  # メール送信側で参照する

    timestamp = datetime.now(_JST).strftime("%Y-%m-%d %H:%M:%S")
    ws.append_row(
        [
            timestamp,
            data.get("イベント名", ""),
            data.get("お名前", ""),
            data.get("メール", ""),
            data.get("希望日", ""),
            data.get("希望時間帯", ""),
            data.get("参加人数", ""),
            data.get("お持ち込み", ""),
            data.get("備考", ""),
            token, "", "", "", "",
        ],
        value_input_option="RAW",
    )


def get_ws_reservation_count(event_name: str, date: str, time_slot: str) -> int:
    """
    「WS予約」シートから指定イベント×日付×時間帯の予約済み参加人数合計を返す。

    列順:
      0: タイムスタンプ, 1: イベント名, 2: お名前, 3: メール,
      4: 希望日, 5: 希望時間帯, 6: 参加人数

    Sheets が日付を自動フォーマットして "/" 区切りになる場合があるため
    どちらの形式も正規化して比較する。

    シートが存在しない場合（まだ誰も予約していない）は 0 を返す。
    """
    import gspread.exceptions
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(WS_SHEET_NAME)
    except Exception:
        return 0  # シートがまだ存在しない = 予約 0 件

    rows = ws.get_all_values()
    if len(rows) < 2:
        return 0

    headers = rows[0]
    cancel_col = headers.index("キャンセル済み") if "キャンセル済み" in headers else None

    # 比較用に日付を YYYY-MM-DD に正規化
    norm_date = str(date).replace("/", "-").split(" ")[0]

    count = 0
    for row in rows[1:]:  # ヘッダー行をスキップ
        if len(row) < 7:
            continue
        if cancel_col is not None and len(row) > cancel_col and row[cancel_col] == "TRUE":
            continue
        row_date = str(row[4]).replace("/", "-").split(" ")[0]
        if (str(row[1]) == str(event_name)
                and row_date == norm_date
                and str(row[5]) == str(time_slot)):
            try:
                count += int(row[6])
            except (ValueError, TypeError):
                pass
    return count


def get_reservation_by_token(token: str) -> dict | None:
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(WS_SHEET_NAME)
    except Exception:
        return None
    for r in ws.get_all_records():
        if r.get("キャンセルトークン") == token:
            return r
    return None


def update_reservation_memo(row_num: int, memo: str) -> None:
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    ws = sh.worksheet(WS_SHEET_NAME)
    headers = ws.row_values(1)
    if "メモ" not in headers:
        _ensure_cancel_columns(ws)
        headers = ws.row_values(1)
    memo_col = headers.index("メモ") + 1
    ws.update_cell(row_num, memo_col, memo)


def cancel_reservation(token: str, reason: str = "") -> bool:
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(WS_SHEET_NAME)
    except Exception:
        return False

    headers = ws.row_values(1)
    try:
        token_col  = headers.index("キャンセルトークン") + 1
        done_col   = headers.index("キャンセル済み") + 1
        reason_col = headers.index("キャンセル理由") + 1
        dt_col     = headers.index("キャンセル日時") + 1
    except ValueError:
        return False

    col_vals = ws.col_values(token_col)
    for i, val in enumerate(col_vals[1:], start=2):  # skip header, row is i
        if val == token:
            ts = datetime.now(_JST).strftime("%Y-%m-%d %H:%M:%S")
            ws.update_cell(i, done_col, "TRUE")
            ws.update_cell(i, reason_col, reason)
            ws.update_cell(i, dt_col, ts)
            return True
    return False


# ================================================================
# お問い合わせ（お問い合わせシート）
# ================================================================

CONTACT_SHEET_NAME = "お問い合わせ"


def create_contact(data: dict) -> None:
    """
    「お問い合わせ」シートに問い合わせデータを 1 行追記する。
    シートが存在しない場合は自動作成してヘッダー行を挿入する。
    """
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(CONTACT_SHEET_NAME)
    except Exception:
        ws = sh.add_worksheet(title=CONTACT_SHEET_NAME, rows=1000, cols=5)
        ws.append_row(
            ["タイムスタンプ", "お名前", "メール", "件名", "内容"],
            value_input_option="RAW",
        )

    timestamp = datetime.now(_JST).strftime("%Y-%m-%d %H:%M:%S")
    ws.append_row(
        [
            timestamp,
            data.get("name", ""),
            data.get("email", ""),
            data.get("subject", ""),
            data.get("message", ""),
        ],
        value_input_option="RAW",
    )


def get_all_contacts_for_admin() -> list[dict]:
    sh = get_gc().open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(CONTACT_SHEET_NAME)
    except Exception:
        return []
    rows = ws.get_all_records()
    return list(reversed(rows))


# ================================================================
# 内部ヘルパー
# ================================================================

def _col_letter(n: int) -> str:
    """
    1-based の列番号を Excel スタイルの列文字に変換する。
    例: 1 → "A", 26 → "Z", 27 → "AA", 52 → "AZ"

    スプレッドシートの update() に渡す A1 記法の範囲文字列を構築するために使用。
    """
    result = ""
    while n:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result
