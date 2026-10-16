"""イベント収支の計算。管理画面（frontend/src/lib/api.ts の computeFinances）と同じ式で計算する。

式を変えるときは管理画面側と必ず揃えること。
"""

from __future__ import annotations

import math

import pandas as pd

# 燃費（km/L）。管理画面の「往復 ○km, 10km/L」と同じ
FUEL_EFFICIENCY_KM_PER_L = 10
# WS の参加費（1人あたりの売上、円）
WS_FEE_PER_PERSON = 1000
# WS の資材費（1人あたり、円）
WS_COST_PER_PERSON = 700
# 手伝い支払い：物販の利益に掛ける割合
HELPER_SALES_RATE = 0.2
# 手伝い支払い：WS 売上に掛ける割合
HELPER_WS_RATE = 0.7


def compute_finances(fin: dict, has_workshop: bool) -> dict[str, float]:
    """1イベント分の収支を計算する。

    Args:
        fin: event_finances の1行（sales, booth_fee, distance, gas_price, expressway_toll,
             accommodation, other_expenses, ws_participants, payment_flag）
        has_workshop: そのイベントで WS を開催したか

    Returns:
        transport（移動費）, total_expense（支出合計）, ws_sales（WS売上）, ws_cost（WS資材費）,
        payment（手伝い支払い額）, net（収支）の辞書
    """
    # 1. 移動費 = 往復距離 ÷ 燃費 × ガソリン単価（円未満は四捨五入。JS の Math.round と同じく .5 は切り上げ）
    transport = _js_round(fin["distance"] * 2 / FUEL_EFFICIENCY_KM_PER_L * fin["gas_price"])
    # 2. 支出合計 = 出店料 + 移動費 + 高速代 + 宿泊費 + その他
    total_expense = (
        fin["booth_fee"] + transport + fin["expressway_toll"] + fin["accommodation"] + fin["other_expenses"]
    )
    # 3. WS の売上と資材費（WS を開催したときだけ）
    ws_sales = fin["ws_participants"] * WS_FEE_PER_PERSON if has_workshop else 0
    ws_cost = fin["ws_participants"] * WS_COST_PER_PERSON if has_workshop else 0
    net = fin["sales"] - total_expense - ws_cost
    # 4. 手伝い支払いがあるときは、物販利益の20% と WS 売上の70% を収支から引く
    payment = 0
    if fin["payment_flag"]:
        payment = _js_round((fin["sales"] - ws_sales - total_expense) * HELPER_SALES_RATE) + _js_round(
            ws_sales * HELPER_WS_RATE
        )
        net -= payment
    return {
        "transport": transport,
        "total_expense": total_expense,
        "ws_sales": ws_sales,
        "ws_cost": ws_cost,
        "payment": payment,
        "net": net,
    }


def _js_round(x: float) -> int:
    """JavaScript の Math.round と同じ丸め（.5 は正の方向へ）をする。

    Python の round は偶数丸めなので、管理画面と1円ずれないようにこちらを使う。

    Args:
        x: 丸める値

    Returns:
        丸めた整数
    """
    return math.floor(x + 0.5)


def break_even_sales(fin: dict, has_workshop: bool) -> float:
    """収支がちょうど 0 円になる売上（損益分岐点）を求める。

    収支は売上に対して一次式なので、売上 0 円と 1 円のときの収支から直線を引いて 0 になる点を求める。
    （手伝い支払いの丸めによる1円未満の誤差は無視する）

    Args:
        fin: event_finances の1行
        has_workshop: WS を開催したか

    Returns:
        損益分岐となる売上（円）
    """
    # 1. 売上を 0 円・10万円にしたときの収支を計算する（丸め誤差を小さくするため差を大きく取る）
    step = 100_000
    net0 = compute_finances({**fin, "sales": 0}, has_workshop)["net"]
    net1 = compute_finances({**fin, "sales": step}, has_workshop)["net"]
    # 2. 売上1円あたりの収支の増え方（傾き）から 0 になる売上を出す
    slope = (net1 - net0) / step
    return -net0 / slope


def fiscal_year(ts: pd.Timestamp) -> int:
    """日付から会計年度（4月始まり）を返す。例: 2026-02-01 → 2025。

    Args:
        ts: 日付

    Returns:
        会計年度（西暦）
    """
    return ts.year if ts.month >= 4 else ts.year - 1


def build_event_finance_table(events: pd.DataFrame, finances: pd.DataFrame) -> pd.DataFrame:
    """イベントと収支を結合し、計算済みの列を足した分析用の表を作る。

    Args:
        events: events テーブル
        finances: event_finances テーブル

    Returns:
        1イベント1行の表。収支を入力していないイベントは含まない。
        has_result 列は売上が入っている（＝実績がある）かどうか
    """
    if finances.empty:
        return pd.DataFrame()
    # 1. 収支のあるイベントだけを結合する
    df = finances.merge(events, left_on="event_id", right_on="id", how="inner")
    # 2. 1行ずつ管理画面と同じ式で計算する
    computed = df.apply(
        lambda r: pd.Series(
            {
                **compute_finances(r.to_dict(), bool(r["has_workshop"])),
                "break_even": break_even_sales(r.to_dict(), bool(r["has_workshop"])),
            }
        ),
        axis=1,
    )
    df = pd.concat([df, computed], axis=1)
    # 3. 分析で使う補助列を足す
    end = df["end_date"].fillna(df["start_date"])
    df["days"] = (end - df["start_date"]).dt.days + 1  # 開催日数
    df["month"] = df["start_date"].dt.to_period("M").dt.to_timestamp()  # 開催月
    df["fiscal_year"] = df["start_date"].map(fiscal_year)
    df["brand_count"] = df["brands"].map(lambda b: len(b) if isinstance(b, list) else 0)
    df["has_result"] = df["sales"] > 0  # 売上 0 円は未開催（入力前）とみなす
    df["sales_per_day"] = df["sales"] / df["days"]
    df["margin"] = df["net"] / df["sales"].where(df["sales"] > 0)  # 収支 ÷ 売上
    return df.sort_values("start_date").reset_index(drop=True)
