"""Supabase（PostgREST）の読み書きの結果を扱う共通部品。

存在しない id を指定されたときに 500（サーバーエラー）ではなく 404 を返すために使う。
- `.single()` は 0 件のとき例外（コード PGRST116）を投げる
- uuid 型の列を UUID でない文字列で検索すると例外（コード 22P02）を投げる
- update の結果 `.data` は 0 件のとき空のリストになり、`.data[0]` が IndexError になる
"""
import logging
from typing import Any

from fastapi import HTTPException

# 変数の内容: logger: モジュール名を使って記録するロガー。
logger = logging.getLogger(__name__)

# 「該当する行が無い」とみなす PostgREST / PostgreSQL のエラーコード
# PGRST116: single() で 0 件（または複数件）だった / 22P02: uuid 列に UUID でない文字列を渡した
_NOT_FOUND_CODES = frozenset({'PGRST116', '22P02'})
# 「入力の id が正しくない」とみなす PostgreSQL のエラーコード（保存の入力に含まれる id 用）
# 22P02: uuid 列に UUID でない文字列を渡した / 23503: 外部キー違反（参照先の行が無い）
_INVALID_REFERENCE_CODES = frozenset({'22P02', '23503'})


def is_not_found_error(e: BaseException) -> bool:
    """例外が「該当する行が無い」（0 件・id の形が違う）を表すかどうかを返す。

    Args:
        e: Supabase の呼び出しで起きた例外

    Returns:
        PGRST116・22P02 なら True
    """
    # 1. 例外が「該当する行が無い」（0 件・id の形が違う）を表すかどうかを返す。
    return getattr(e, 'code', None) in _NOT_FOUND_CODES


def execute_or_404(query: Any, detail: str = 'Not found') -> Any:
    """クエリを実行する。id の形が違うなど「見つからない」エラーのときは 404 を返す。

    update・delete・in_ のように `.single()` を付けないクエリで、URL や入力の id が
    UUID の形でないときに 500 ではなく 404 にするために使う。

    Args:
        query: execute() を呼ぶ前の Supabase のクエリ
        detail: 404 のときに返す文言

    Returns:
        execute() の戻り値

    Raises:
        HTTPException(404): id の形が違う・single() で 0 件の場合
        Exception: 接続の失敗など「見つからない」以外のエラー（そのまま投げ直す）
    """
    # 1. クエリを実行し、PostgREST の「見つからない」コードだけを 404 に変換する。
    try:
        return query.execute()
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        if is_not_found_error(e):
            raise HTTPException(status_code=404, detail=detail)
        raise


def execute_or_400(query: Any, detail: str = 'Invalid id') -> Any:
    """保存のクエリを実行する。入力の id の形が違う・参照先が無いときは 400 を返す。

    insert の入力（body）に含まれる event_id・session_id などが正しくないときに、
    500 ではなく 400 にするために使う。

    Args:
        query: execute() を呼ぶ前の Supabase のクエリ
        detail: 400 のときに返す文言

    Returns:
        execute() の戻り値

    Raises:
        HTTPException(400): id の形が違う（22P02）・外部キー違反（23503）の場合
        Exception: そのほかのエラー（そのまま投げ直す）
    """
    # 1. 保存クエリを実行し、入力 ID の形式または参照先のエラーだけを 400 に変換する。
    try:
        return query.execute()
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        if getattr(e, 'code', None) in _INVALID_REFERENCE_CODES:
            raise HTTPException(status_code=400, detail=detail)
        raise


def fetch_one_or_none(query: Any) -> dict | None:
    """クエリに `.single()` を付けて 1 件読む。見つからなければ None を返す。

    Args:
        query: `.single()` を付ける前の Supabase のクエリ（例 `table('x').select('*').eq('id', i)`）

    Returns:
        行の dict。0 件・id の形が違うときは None

    Raises:
        Exception: 接続の失敗など「見つからない」以外のエラー（そのまま投げ直す）
    """
    # 1. 単一行を読み、存在しない場合だけ None にして、それ以外の障害は呼び出し元へ返す。
    try:
        # 変数の内容: data: DB応答から取得した単一レコードまたは未取得を示す値。
        data = query.single().execute().data
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        if is_not_found_error(e):
            return None
        raise
    return data or None


def fetch_one_or_404(query: Any, detail: str = 'Not found') -> dict:
    """クエリに `.single()` を付けて 1 件読む。見つからなければ 404 を返す。

    Args:
        query: `.single()` を付ける前の Supabase のクエリ
        detail: 404 のときに返す文言

    Returns:
        行の dict

    Raises:
        HTTPException(404): 0 件・id の形が違う場合
        Exception: 接続の失敗など「見つからない」以外のエラー
    """
    # 1. 共通の単一行取得を呼び、未取得なら指定された 404 を返す。
    # 変数の内容: data: DB応答から取得した単一レコード。
    data = fetch_one_or_none(query)
    if data is None:
        raise HTTPException(status_code=404, detail=detail)
    return data


def first_or_404(result: Any, detail: str = 'Not found') -> dict:
    """execute() の結果の先頭の行を返す。0 件なら 404 を返す。

    update・delete の対象が見つからなかったとき（`.data` が空のリスト）に使う。

    Args:
        result: Supabase のクエリの execute() の戻り値
        detail: 404 のときに返す文言

    Returns:
        先頭の行の dict

    Raises:
        HTTPException(404): 結果が 0 件の場合
    """
    # 1. execute() 結果の data が空でないリストかを確かめる。
    # 変数の内容: data: DB応答の先頭レコード。
    data = getattr(result, 'data', None)
    if not isinstance(data, list) or not data:
        raise HTTPException(status_code=404, detail=detail)
    return data[0]


def next_display_order(client: Any, table: str) -> int:
    """表の display_order の最大値 + 1（末尾に追加するときの表示順）を返す。

    件数を表示順にすると、途中の行を消したあとに追加したとき既存の行と同じ番号になるため、
    最大値の次の番号にする。

    Args:
        client: 読み取りに使う Supabase のクライアント（呼び出し元のモジュールのもの）
        table: 表の名前

    Returns:
        次の表示順。行が無ければ 0
    """
    # 1. 表示順の最大値を降順で1件読み、次に使う値を求める。
    # 変数の内容: rows: DB から取得した行の一覧。
    rows = client.table(table).select('display_order').order('display_order', desc=True).limit(1).execute().data
    if isinstance(rows, list) and rows and isinstance(rows[0].get('display_order'), int):
        return rows[0]['display_order'] + 1
    return 0
