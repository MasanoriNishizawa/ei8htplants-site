"""全画面で共通に使うデータの準備（読み込み・計算・会計年度での絞り込み）。"""

from __future__ import annotations

import hashlib
import pickle
from dataclasses import dataclass

import pandas as pd
import streamlit as st

from .analysis import reservation_table
from .data import CACHE_TTL, load_all
from .finance import build_event_finance_table, fiscal_years

# 絞り込みで「すべての期」を表す選択肢の表示名
ALL_YEARS = "すべての期"

# サイドバーの会計年度の選択欄の key
YEAR_KEY = "fiscal_year"
# 選んだ会計年度を覚えておく session_state の key。年度の選択欄を出さない画面（予測・アクセス解析）を開くと、
# Streamlit は描かれなかった選択欄の値を消してしまうので、別の key に控えておき、戻ったときに選び直す
YEAR_MEMORY_KEY = "fiscal_year_memory"


def frame_digest(df: pd.DataFrame) -> str:
    """st.cache_data のキーにする、DataFrame の中身の要約（SHA-256）を作る。

    ブランド・タグなどリストの入った列があると Streamlit の既定のハッシュが使えず、
    毎回「pickle に切り替えた」という警告がログに出るため、最初から pickle した中身で要約する。

    Args:
        df: 対象の表

    Returns:
        中身が同じなら同じになる16進の文字列
    """
    return hashlib.sha256(pickle.dumps(df, protocol=pickle.HIGHEST_PROTOCOL)).hexdigest()


# st.cache_data の hash_funcs に渡す設定（DataFrame は frame_digest で要約する）
FRAME_HASH_FUNCS = {pd.DataFrame: frame_digest}


@dataclass
class Context:
    """画面に渡すデータ一式。

    Attributes:
        raw: テーブル名 → 取得したままの DataFrame
        fin: イベント収支の分析用の表（会計年度で絞り込み済み）
        fin_all: イベント収支の分析用の表（絞り込み前。予測で使う）
        done: fin のうち売上の実績がある回（has_result が True）
        done_all: fin_all のうち売上の実績がある回
        res: WS 予約の分析用の表（会計年度で絞り込み済み）
        today: 今日（日本時間、時刻なし）
        year_label: 選んでいる会計年度の表示名（年度で絞り込まない画面では ALL_YEARS）
    """

    raw: dict[str, pd.DataFrame]
    fin: pd.DataFrame
    fin_all: pd.DataFrame
    done: pd.DataFrame
    done_all: pd.DataFrame
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


@st.cache_data(ttl=CACHE_TTL, show_spinner=False, hash_funcs=FRAME_HASH_FUNCS)
def _finance_table(events: pd.DataFrame, finances: pd.DataFrame) -> pd.DataFrame:
    """build_event_finance_table の結果をキャッシュする（画面を操作するたびに計算し直さないため）。

    Args:
        events: events テーブル
        finances: event_finances テーブル

    Returns:
        build_event_finance_table の結果
    """
    return build_event_finance_table(events, finances)


@st.cache_data(ttl=CACHE_TTL, show_spinner=False, hash_funcs=FRAME_HASH_FUNCS)
def _reservation_table(reservations: pd.DataFrame, sessions: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    """reservation_table の結果をキャッシュする（画面を操作するたびに計算し直さないため）。

    Args:
        reservations: workshop_reservations テーブル
        sessions: ws_sessions テーブル
        events: events テーブル

    Returns:
        reservation_table の結果
    """
    return reservation_table(reservations, sessions, events)


def _select_year(years: list[int]) -> str:
    """サイドバーに会計年度の選択欄を出し、選ばれた表示名を返す。

    Args:
        years: データにある会計年度（新しい順）

    Returns:
        選ばれた表示名（ALL_YEARS または _year_name の結果）
    """
    options = [ALL_YEARS] + [_year_name(y) for y in years]
    # 1. 年度の選択欄の無い画面から戻ってきたとき（選択欄の値が消えている）は、控えておいた年度を選び直す
    remembered = st.session_state.get(YEAR_MEMORY_KEY)
    if YEAR_KEY not in st.session_state and remembered in options:
        st.session_state[YEAR_KEY] = remembered
    # 2. 選択欄を出し、選んだ値を控えておく
    label = st.sidebar.selectbox("会計年度", options, key=YEAR_KEY)
    st.session_state[YEAR_MEMORY_KEY] = label
    return label


def get_context(use_year_filter: bool = True) -> Context:
    """データを読み込み、サイドバーで選んだ会計年度で絞り込んだ Context を返す。

    Args:
        use_year_filter: True ならサイドバーに会計年度の選択欄を出して絞り込む。
            年度で絞り込まない画面（予測・アクセス解析）では False にし、選択欄を出さない
            （fin・res は絞り込み前と同じになる）

    Returns:
        画面で使うデータ一式
    """
    # 1. 本番データを読み込む（キャッシュあり）。読めなければ画面にエラーを出して止める
    try:
        raw = load_all()
    except Exception as e:  # 接続・設定エラーをまとめて受けて画面で知らせる
        st.error(f"データを読み込めませんでした：{type(e).__name__}")
        st.caption(
            "接続の設定（ローカルはリポジトリ直下の .env、公開版は Streamlit の Secrets）と、"
            "ネットワークの接続を確認してください。"
        )
        st.stop()
    today = pd.Timestamp.now(tz="Asia/Tokyo").tz_localize(None).normalize()

    # 2. 収支と予約の分析用の表を作る（計算結果はキャッシュする）
    fin_all = _finance_table(raw["events"], raw["event_finances"])
    res_all = _reservation_table(raw["workshop_reservations"], raw["ws_sessions"], raw["events"])
    fin, res, label = fin_all, res_all, ALL_YEARS

    # 3. サイドバーで会計年度を選び、選んだ年度で絞り込む（データにある年度だけを選択肢にする）
    if use_year_filter:
        years = sorted(set(fiscal_years(pd.to_datetime(raw["events"]["start_date"])).dropna().astype(int)),
                       reverse=True)
        label = _select_year(years)
        if label != ALL_YEARS:
            fy = years[[_year_name(y) for y in years].index(label)]
            fin = fin_all[fin_all["fiscal_year"] == fy]
            res = res_all[fiscal_years(pd.to_datetime(res_all["start_date"])) == fy]

    # 4. 売上の実績がある回だけの表も作っておく（多くの画面で使う）
    return Context(
        raw=raw,
        fin=fin,
        fin_all=fin_all,
        done=fin[fin["has_result"]],
        done_all=fin_all[fin_all["has_result"]],
        res=res,
        today=today,
        year_label=label,
    )


def no_data(what: str) -> None:
    """データがまだ無いことを画面に知らせる。

    Args:
        what: 何のデータか（例: "イベント収支"）
    """
    st.info(f"{what}のデータはまだありません。")


def not_enough(what: str, n: int, need: int) -> None:
    """データが足りないことを画面に知らせる。

    Args:
        what: 何のデータか（例: "注文"）
        n: 今ある件数
        need: 分析に必要な件数
    """
    st.info(f"{what}のデータがまだ {n} 件なので、この分析は {need} 件以上たまってから表示します。")
