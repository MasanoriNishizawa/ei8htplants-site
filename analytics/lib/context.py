"""全画面で共通に使うデータの準備（読み込み・計算・会計年度での絞り込み）。"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
import streamlit as st

from .analysis import reservation_table
from .data import load_all
from .finance import build_event_finance_table, fiscal_year

# 絞り込みで「すべての期」を表す選択肢の表示名
ALL_YEARS = "すべての期"


@dataclass
class Context:
    """画面に渡すデータ一式。

    Attributes:
        raw: テーブル名 → 取得したままの DataFrame
        fin: イベント収支の分析用の表（会計年度で絞り込み済み）
        fin_all: イベント収支の分析用の表（絞り込み前。予測で使う）
        res: WS 予約の分析用の表（会計年度で絞り込み済み）
        today: 今日（日本時間、時刻なし）
        year_label: 選んでいる会計年度の表示名
    """

    raw: dict[str, pd.DataFrame]
    fin: pd.DataFrame
    fin_all: pd.DataFrame
    res: pd.DataFrame
    today: pd.Timestamp
    year_label: str


def _year_name(fy: int) -> str:
    """会計年度を「2026年度（2026/4〜2027/3）」の形にする。

    Args:
        fy: 会計年度（西暦）

    Returns:
        表示名
    """
    return f"{fy}年度（{fy}/4〜{fy + 1}/3）"


def get_context() -> Context:
    """データを読み込み、サイドバーで選んだ会計年度で絞り込んだ Context を返す。

    Returns:
        画面で使うデータ一式
    """
    # 1. 本番データを読み込む（キャッシュあり）。読めなければ画面にエラーを出して止める
    try:
        raw = load_all()
    except Exception as e:  # 接続・設定エラーをまとめて受けて画面で知らせる
        st.error(f"データを読み込めませんでした：{type(e).__name__}")
        st.caption("リポジトリ直下の .env と、ネットワークの接続を確認してください。")
        st.stop()
    today = pd.Timestamp.now(tz="Asia/Tokyo").tz_localize(None).normalize()

    # 2. 収支と予約の分析用の表を作る
    fin_all = build_event_finance_table(raw["events"], raw["event_finances"])
    res_all = reservation_table(raw["workshop_reservations"], raw["ws_sessions"], raw["events"])

    # 3. サイドバーで会計年度を選ぶ（データにある年度だけを選択肢にする）
    years = sorted({fiscal_year(d) for d in raw["events"]["start_date"].dropna()}, reverse=True)
    options = [ALL_YEARS] + [_year_name(y) for y in years]
    label = st.sidebar.selectbox("会計年度", options, key="fiscal_year")

    # 4. 選んだ年度で絞り込む
    fin, res = fin_all, res_all
    if label != ALL_YEARS:
        fy = years[options.index(label) - 1]
        if not fin.empty:
            fin = fin[fin["fiscal_year"] == fy]
        if not res.empty:
            res = res[res["start_date"].map(lambda d: fiscal_year(d) if pd.notna(d) else None) == fy]
    return Context(raw=raw, fin=fin, fin_all=fin_all, res=res, today=today, year_label=label)


def not_enough(what: str, n: int, need: int) -> None:
    """データが足りないことを画面に知らせる。

    Args:
        what: 何のデータか（例: "注文"）
        n: 今ある件数
        need: 分析に必要な件数
    """
    st.info(f"{what}のデータがまだ {n} 件なので、この分析は {need} 件以上たまってから表示します。")
