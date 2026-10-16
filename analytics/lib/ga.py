"""Google アナリティクス 4（GA4）のデータを Data API で読み出すモジュール（読み取り専用）。

- 接続には Google Cloud のサービスアカウントの鍵（JSON ファイル）を使う
- 設定はリポジトリ直下の .env に書く
    GA_PROPERTY_ID=123456789                       … GA4 の「プロパティ ID」（数字。測定 ID の G-… ではない）
    GA_CREDENTIALS=/Users/…/ga-service-account.json … 鍵ファイルの場所（リポジトリの外に置くこと）
- 鍵ファイルの中身は画面にもログにも出さない
- 権限は読み取り専用（analytics.readonly）だけを要求する
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import streamlit as st

from .data import CACHE_TTL  # noqa: F401  （.env の読み込みを先に済ませるため import する）

# 読み取り専用の権限
SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]


@dataclass
class GaConfig:
    """GA への接続設定。

    Attributes:
        property_id: GA4 のプロパティ ID（数字）
        credentials_path: サービスアカウントの鍵ファイルの場所
    """

    property_id: str
    credentials_path: Path


def ga_config() -> tuple[GaConfig | None, str | None]:
    """.env から GA の接続設定を読み、足りないものがあれば理由を返す。

    Returns:
        (設定, None) または (None, 足りないものの説明)
    """
    # 1. プロパティ ID は数字だけ（測定 ID「G-…」と取り違えやすいので確認する）
    pid = os.getenv("GA_PROPERTY_ID", "").strip()
    cred = os.getenv("GA_CREDENTIALS", "").strip()
    if not pid:
        return None, "GA_PROPERTY_ID が .env にありません。"
    if pid.upper().startswith("G-"):
        return None, "GA_PROPERTY_ID に測定 ID（G-…）が入っています。数字の「プロパティ ID」を入れてください。"
    if not pid.isdigit():
        return None, "GA_PROPERTY_ID は数字だけで入れてください。"
    # 2. 鍵ファイルがあるか
    if not cred:
        return None, "GA_CREDENTIALS（鍵ファイルの場所）が .env にありません。"
    path = Path(cred).expanduser()
    if not path.is_file():
        return None, "GA_CREDENTIALS に書いた場所に鍵ファイルが見つかりません。"
    return GaConfig(property_id=pid, credentials_path=path), None


def _client(cfg: GaConfig):
    """Data API のクライアントを作る（読み取り専用の権限で）。

    Args:
        cfg: 接続設定

    Returns:
        BetaAnalyticsDataClient
    """
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.oauth2 import service_account

    creds = service_account.Credentials.from_service_account_file(str(cfg.credentials_path), scopes=SCOPES)
    return BetaAnalyticsDataClient(credentials=creds)


def response_to_frame(response, dimensions: list[str], metrics: list[str]) -> pd.DataFrame:
    """Data API の応答を DataFrame にする。

    Args:
        response: RunReportResponse（rows[].dimension_values / metric_values を持つもの）
        dimensions: 取得したディメンション名（列名になる）
        metrics: 取得した指標名（列名になる。数値に変換する）

    Returns:
        1行1組み合わせの表。date ディメンションは日付型にする
    """
    # 1. 行ごとにディメンションと指標の値を取り出す
    rows = [
        [d.value for d in r.dimension_values] + [m.value for m in r.metric_values]
        for r in response.rows
    ]
    df = pd.DataFrame(rows, columns=dimensions + metrics)
    # 2. 指標は数値、日付は日付型にする
    for m in metrics:
        df[m] = pd.to_numeric(df[m], errors="coerce").fillna(0)
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], format="%Y%m%d", errors="coerce")
    return df


@st.cache_data(ttl=CACHE_TTL, show_spinner="Google アナリティクスのデータを読み込んでいます…")
def run_report(
    property_id: str,
    credentials_path: str,
    dimensions: tuple[str, ...],
    metrics: tuple[str, ...],
    start: str,
    end: str = "today",
    order_by_metric: str | None = None,
    limit: int = 1000,
) -> pd.DataFrame:
    """GA4 のレポートを1つ取得する（キャッシュあり）。

    Args:
        property_id: プロパティ ID
        credentials_path: 鍵ファイルの場所
        dimensions: ディメンション名（例: ("pagePath",)）
        metrics: 指標名（例: ("screenPageViews",)）
        start: 開始日（"28daysAgo" や "2026-10-01"）
        end: 終了日
        order_by_metric: 多い順に並べる指標名（None なら並べ替えない）
        limit: 最大行数

    Returns:
        response_to_frame の結果
    """
    from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, OrderBy, RunReportRequest

    cfg = GaConfig(property_id=property_id, credentials_path=Path(credentials_path))
    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[Dimension(name=d) for d in dimensions],
        metrics=[Metric(name=m) for m in metrics],
        date_ranges=[DateRange(start_date=start, end_date=end)],
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name=order_by_metric), desc=True)]
        if order_by_metric
        else [],
        limit=limit,
    )
    response = _client(cfg).run_report(request)
    return response_to_frame(response, list(dimensions), list(metrics))


def label_paths(paths: pd.Series, events: pd.DataFrame, products: pd.DataFrame) -> pd.Series:
    """URL のパスを、わかりやすい名前に置き換える（イベント・商品の詳細ページは名前にする）。

    Args:
        paths: pagePath の列（例: "/events/xxxx"）
        events: events テーブル（id, name）
        products: products テーブル（id, name）

    Returns:
        表示用の名前の列（置き換えられないパスはそのまま）
    """
    # 1. よく見られる固定ページの名前
    fixed = {
        "/": "トップ", "/events": "イベント一覧", "/gallery": "ギャラリー", "/concept": "コンセプト",
        "/contact": "お問い合わせ", "/stockists": "取扱店", "/collaborations": "コラボ", "/media": "メディア",
        "/ei8htplants": "ei8ht plants", "/habitatoides": "Habitat Oides", "/habitatoides/workshop": "WS（Habitat Oides）",
        "/hue": "HUE", "/reserve": "WS 予約", "/cancel": "予約キャンセル", "/shop": "ショップ", "/journal": "ジャーナル",
        "/checkout": "購入手続き", "/order/complete": "注文完了", "/chat": "AI チャット", "/legal": "特定商取引法",
        "/privacy": "プライバシーポリシー",
    }
    # イベント詳細の URL は slug があれば slug、なければ ID なので両方で引けるようにする
    event_names: dict[str, str] = {}
    if not events.empty:
        event_names.update(zip(events["id"].astype(str), events["name"]))
        if "slug" in events.columns:
            event_names.update({str(k): v for k, v in zip(events["slug"], events["name"]) if isinstance(k, str) and k})
    product_names = dict(zip(products["id"].astype(str), products["name"])) if not products.empty else {}

    def one(path: str) -> str:
        # 2. クエリは外して判定する
        p = path.split("?")[0].rstrip("/") or "/"
        if p in fixed:
            return fixed[p]
        # 3. 詳細ページは ID から名前を引く
        for prefix, names, kind in (("/events/", event_names, "イベント"), ("/shop/", product_names, "商品")):
            if p.startswith(prefix):
                key = p[len(prefix):]
                return f"{kind}：{names[key].strip()}" if key in names else p
        return p

    return paths.map(one)
