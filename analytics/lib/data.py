"""本番 Supabase からデータを「読み取り専用」で取得するモジュール。

- 通信は PostgREST への GET だけで行い、書き込み系（POST / PATCH / DELETE / RPC）は一切使わない
- 取得する列はテーブルごとに明示し、氏名・電話番号・住所・問い合わせ本文などの個人情報は取らない
- メールアドレスはリピート分析のためだけに取得し、取得直後にハッシュ化して元の値は捨てる
- 接続情報は環境変数から読む。ローカルではリポジトリ直下の .env を読み込み、
  Streamlit Community Cloud では Secrets のトップレベルの値が環境変数に入る（lib/secrets_env.py）。
  .env が無ければ load_dotenv は何もしない。値は画面にもログにも出さない
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import pandas as pd
import requests
import streamlit as st
from dotenv import load_dotenv

# リポジトリ直下の .env の場所（analytics/lib/data.py から2つ上）。無ければ読み込みは何もしない
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_PATH)

# 1回のリクエストで頼む最大行数（PostgREST の既定上限 1000 に合わせる）。
# Supabase 側の上限（max rows）がこれより小さくても、空のページが返るまで続けて取るので途中で切れない
PAGE_SIZE = 1000

# 1回のリクエストの待ち時間の上限（秒）。これを過ぎたら失敗として画面にエラーを出す
FETCH_TIMEOUT = 20

# HTTP 416（Range Not Satisfiable）。取得範囲の開始位置が全件数を超えたとき PostgREST が返すことがあり、
# その場合は「もう行が無い」とみなして取得を終える
HTTP_RANGE_NOT_SATISFIABLE = 416

# データを再取得するまでのキャッシュ時間（秒）。画面の「再読み込み」ボタンで即時クリアもできる
CACHE_TTL = 600

# テーブルごとに取得する列。個人情報の列はここに書かない
COLUMNS: dict[str, str] = {
    "events": "id,slug,name,start_date,end_date,location,brands,has_workshop,is_past",
    "event_finances": (
        "event_id,sales,booth_fee,distance,gas_price,expressway_toll,"
        "accommodation,ws_participants,payment_flag,other_expenses"
    ),
    "ws_sessions": "id,event_id,time_label,max_participants",
    # email はハッシュ化用にだけ取得する（_hash_emails で即座に置き換える）
    "workshop_reservations": (
        "id,event_id,session_id,participants,status,bring_plant,bring_pot,"
        "preferred_date,created_at,email"
    ),
    "products": "id,name,price,stock,category,tags,is_published,created_at",
    # 注文は金額・都道府県・日時だけ。氏名・住所・電話は取らない。email はハッシュ化用
    "orders": "id,subtotal,shipping_fee,total,status,prefecture,created_at,customer_email",
    "order_items": "order_id,product_id,product_name,price,quantity",
    # 問い合わせは件数と既読状態だけ。本文・氏名・メールは取らない
    "contacts": "id,is_read,created_at",
    "articles": "id,title,tags,is_published,published_at,created_at",
}

# テーブルごとのページ送りの並び順（PostgREST の order の書き方）。
# 順序を決めずにページ送りすると、ページの境目で行が重複したり抜けたりすることがあるため、必ず一意な列で並べる。
# id の無い event_finances は主キーの event_id で並べる（order_items は id が主キーなので既定の id で並べる。
# id は取得する列に入れていないが、並び順には使える）
ORDER: dict[str, str] = {
    "event_finances": "event_id.asc",
}
# ORDER に無いテーブルの並び順
DEFAULT_ORDER = "id.asc"


def _credentials() -> tuple[str, str]:
    """接続先 URL とキーを環境変数（ローカルでは .env）から読み出す。

    Returns:
        (Supabase の URL, service_role キー) の組

    Raises:
        RuntimeError: 必要な値がないとき
    """
    # 変数の内容: url: Supabase 接続先 URL を環境変数から取得する。
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    # 変数の内容: key: データ取得に使う Supabase サービスキーを環境変数から取得する。
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("環境変数（ローカルでは .env）に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY がありません")
    return url.rstrip("/"), key


def hash_email(email: str | None) -> str | None:
    """メールアドレスを、元に戻せない短い識別子に変換する。

    同じ人の予約・注文を数えるためだけに使う。大文字小文字と前後の空白は揃えてからハッシュ化する。

    Args:
        email: メールアドレス（空なら None を返す）

    Returns:
        SHA-256 の先頭12文字、または None
    """
    if not email:
        return None
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:12]


def _hash_emails(df: pd.DataFrame, column: str) -> pd.DataFrame:
    """指定した列のメールアドレスを customer_key（ハッシュ）に置き換え、元の列を削除する。

    Args:
        df: 取得したデータ
        column: メールアドレスが入っている列名

    Returns:
        customer_key 列を持ち、メールアドレス列を持たないデータ
    """
    if column in df.columns:
        # 変数の内容: customer_key: 元メールアドレスを復元できない顧客識別ハッシュ。
        df["customer_key"] = df[column].map(hash_email)
        # 変数の内容: df: メール列を匿名化キーへ置き換えた分析用データフレーム。
        df = df.drop(columns=[column])
    return df


def _fetch_all(table: str) -> list[dict]:
    """1つのテーブルを GET で全件取得する（一意な列で並べて、PAGE_SIZE 行ずつページ送り）。

    Supabase の最大行数の設定が PAGE_SIZE より小さいと、1ページの行数が PAGE_SIZE に満たなくても
    続きがあることがある。そのため「空のページが返るまで」続け、次の開始位置は実際に返った行数だけ進める。

    Args:
        table: テーブル名（COLUMNS のキー）

    Returns:
        行の辞書のリスト

    Raises:
        requests.HTTPError: 416 以外のエラーの応答が返ったとき
    """
    # 変数の内容: url, key: 全件取得リクエストの送信先となる Supabase URL。
    url, key = _credentials()
    # 変数の内容: headers: Supabase REST API に必要な API キーと Bearer 認証ヘッダー。
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    # 変数の内容: params: テーブルごとの取得列・並び順を指定する REST API パラメーター。
    params = {"select": COLUMNS[table], "order": ORDER.get(table, DEFAULT_ORDER)}
    # 変数の内容: rows: ページングしながら取得したレコードを蓄積するリスト。
    rows: list[dict] = []
    # 変数の内容: offset: 次に取得するページの開始位置。
    offset = 0
    while True:
        # 1. Range ヘッダーで取得範囲を指定して1ページ分を GET する（並び順は毎回同じ）
        res = requests.get(
            f"{url}/rest/v1/{table}",
            params=params,
            headers={**headers, "Range": f"{offset}-{offset + PAGE_SIZE - 1}"},
            timeout=FETCH_TIMEOUT,
        )
        # 2. 開始位置が全件数を超えた（416）ときは、もう行が無いので終える
        if res.status_code == HTTP_RANGE_NOT_SATISFIABLE:
            return rows
        res.raise_for_status()
        page = res.json()
        # 3. 空のページが返ったら最後まで取り終えた
        if not page:
            return rows
        rows.extend(page)
        # 変数の内容: offset: 次に取得するページの開始位置。
        offset += len(page)


@st.cache_data(ttl=CACHE_TTL, show_spinner="本番データを読み込んでいます…")
def load_table(table: str) -> pd.DataFrame:
    """テーブルを DataFrame で返す（日時列は日本時間に変換、メールはハッシュ化済み）。

    Args:
        table: テーブル名（COLUMNS のキー）

    Returns:
        取得したデータ。0件のときも列名だけは揃えた空の DataFrame
    """
    # 1. 全件を取得する。0件でも後続の処理が列名で動けるように列だけ作っておく
    rows = _fetch_all(table)
    df = pd.DataFrame(rows, columns=COLUMNS[table].split(","))
    # 2. メールアドレスはハッシュに置き換えて捨てる
    if table == "workshop_reservations":
        df = _hash_emails(df, "email")
    if table == "orders":
        df = _hash_emails(df, "customer_email")
    # 3. タイムスタンプ列は日本時間、日付列は日付型にする
    for col in ("created_at", "published_at"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], utc=True, errors="coerce").dt.tz_convert("Asia/Tokyo")
    for col in ("start_date", "end_date", "preferred_date"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
    return df


def load_all() -> dict[str, pd.DataFrame]:
    """分析で使う全テーブルをまとめて読み込む。

    Returns:
        テーブル名 → DataFrame の辞書
    """
    return {table: load_table(table) for table in COLUMNS}
