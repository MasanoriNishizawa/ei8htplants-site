"""イベント収支の計算。管理画面（frontend/src/lib/api.ts の computeFinances）と同じ式で計算する。

式を変えるときは管理画面側と必ず揃えること。
"""

from __future__ import annotations

import math
from typing import TypedDict

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
# 損益分岐点を求めるときに比べる2つの売上の差（円）。差を大きく取るほど手伝い支払いの丸め誤差の影響が小さくなる
BREAK_EVEN_STEP = 100_000
# 会計年度の始まりの月（4月始まり）
FISCAL_YEAR_START_MONTH = 4

# compute_finances が返す列（build_event_finance_table で1行ずつ足す）
FINANCE_RESULT_COLUMNS = ("transport", "total_expense", "ws_sales", "ws_cost", "payment", "net")
# build_event_finance_table が足す補助の列（損益分岐・開催日数・開催月・会計年度・ブランド数・実績の有無・
# 1日あたり売上・収支率）
FINANCE_DERIVED_COLUMNS = (
    "break_even", "days", "month", "fiscal_year", "brand_count", "has_result", "sales_per_day", "margin",
)
# 空の表を作るときに、型をそろえておく列（真偽値・日付）。ここに無い列は object 型にする
_EMPTY_DTYPES = {
    "has_result": bool,
    "has_workshop": bool,
    "payment_flag": bool,
    "is_past": bool,
    "start_date": "datetime64[ns]",
    "end_date": "datetime64[ns]",
    "month": "datetime64[ns]",
}


class FinanceResult(TypedDict):
    """compute_finances の戻り値（金額はすべて円）。"""

    transport: float  # 移動費
    total_expense: float  # 支出合計（出店料・移動費・高速代・宿泊費・その他）
    ws_sales: float  # WS 売上
    ws_cost: float  # WS 資材費
    payment: float  # 手伝い支払い額（物販が赤字のときはマイナスになることがある）
    net: float  # 収支


def finance_row(
    sales: float,
    booth_fee: float,
    distance: float,
    gas_price: float,
    expressway_toll: float,
    accommodation: float,
    other_expenses: float,
    ws_participants: int,
    payment_flag: bool,
) -> dict:
    """compute_finances・break_even_sales に渡す「event_finances の1行」の形の辞書を作る。

    Args:
        sales: 売上（円）
        booth_fee: 出店料
        distance: 片道距離（km）
        gas_price: ガソリン単価（円/L）
        expressway_toll: 高速代
        accommodation: 宿泊費
        other_expenses: その他支出
        ws_participants: WS 参加人数
        payment_flag: 手伝い支払いがあるか

    Returns:
        event_finances の1行と同じキーを持つ辞書
    """
    return {
        "sales": sales,
        "booth_fee": booth_fee,
        "distance": distance,
        "gas_price": gas_price,
        "expressway_toll": expressway_toll,
        "accommodation": accommodation,
        "other_expenses": other_expenses,
        "ws_participants": ws_participants,
        "payment_flag": payment_flag,
    }


def compute_finances(fin: dict, has_workshop: bool) -> FinanceResult:
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
    # 変数の内容: ws_cost: ワークショップ資材費。
    ws_cost = fin["ws_participants"] * WS_COST_PER_PERSON if has_workshop else 0
    # 変数の内容: net: 売上から通常支出とWS資材費を差し引いた仮収支。
    net = fin["sales"] - total_expense - ws_cost
    # 4. 手伝い支払いがあるときは、物販利益の20% と WS 売上の70% を収支から引く
    # payment: 手伝い支払いがない場合の既定額。支払い対象なら次の式で計算する。
    payment = 0
    if fin["payment_flag"]:
        # 変数の内容: payment: 手伝い支払い額。
        payment = _js_round((fin["sales"] - ws_sales - total_expense) * HELPER_SALES_RATE) + _js_round(
            ws_sales * HELPER_WS_RATE
        )
        # 変数の内容: net: 費用と手伝い支払いを反映した収支。
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

    収支は売上に対して一次式なので、売上 0 円と BREAK_EVEN_STEP 円（10万円）のときの収支から
    直線を引いて 0 になる点を求める。（手伝い支払いの丸めによる1円未満の誤差は無視する）

    Args:
        fin: event_finances の1行
        has_workshop: WS を開催したか

    Returns:
        損益分岐となる売上（円）
    """
    # 1. 売上を 0 円・10万円にしたときの収支を計算する（丸め誤差を小さくするため差を大きく取る）
    # net0 / net1: 売上0円と基準売上時の収支。差から損益分岐点の傾きを求める。
    net0 = compute_finances({**fin, "sales": 0}, has_workshop)["net"]
    # 変数の内容: net1: 基準額の売上を設定した場合の収支。
    net1 = compute_finances({**fin, "sales": BREAK_EVEN_STEP}, has_workshop)["net"]
    # 2. 売上1円あたりの収支の増え方（傾き）から 0 になる売上を出す
    # slope: 売上が1円増えたときの収支の増加額。
    slope = (net1 - net0) / BREAK_EVEN_STEP
    return -net0 / slope


def fiscal_year(ts: pd.Timestamp) -> int:
    """日付から会計年度（4月始まり）を返す。例: 2026-02-01 → 2025。

    Args:
        ts: 日付

    Returns:
        会計年度（西暦）
    """
    return ts.year if ts.month >= FISCAL_YEAR_START_MONTH else ts.year - 1


def fiscal_years(dates: pd.Series) -> pd.Series:
    """日付の列から会計年度（4月始まり）の列をまとめて求める（fiscal_year を1行ずつ呼ぶのと同じ結果）。

    Args:
        dates: 日付の列（日付型）

    Returns:
        会計年度（西暦）の列。日付が無い行は NaN
    """
    return dates.dt.year - (dates.dt.month < FISCAL_YEAR_START_MONTH).astype(int)


def _row_results(row: pd.Series) -> pd.Series:
    """build_event_finance_table の1行から、収支の計算結果と損益分岐の売上を求める。

    Args:
        row: event_finances と events を結合した表の1行

    Returns:
        FINANCE_RESULT_COLUMNS と break_even を持つ Series
    """
    # 1. 行データを計算用辞書へ変換し、ワークショップ開催の有無を取り出す。
    # 変数の内容: fin: 売上行を辞書にし、後続の項目別計算へ渡す。
    fin = row.to_dict()
    # 変数の内容: has_workshop: 対象行がワークショップ開催ありかを示す真偽値。
    has_workshop = bool(fin["has_workshop"])
    # 2. 収支と損益分岐売上を共通計算し、列名付きの行として返す。
    return pd.Series({**compute_finances(fin, has_workshop), "break_even": break_even_sales(fin, has_workshop)})


def _empty_finance_table(events: pd.DataFrame, finances: pd.DataFrame) -> pd.DataFrame:
    """収支のあるイベントが無いときに返す、列名だけをそろえた空の表を作る。

    Args:
        events: events テーブル
        finances: event_finances テーブル

    Returns:
        build_event_finance_table と同じ列を持つ0行の表（真偽値・日付の列は型もそろえる）
    """
    # 1. 入力テーブルの列を重複なく統合し、計算結果の列を加える。
    # 変数の内容: base: 売上表とイベント表の列名を重複なくまとめた基礎列。
    base = list(dict.fromkeys([*finances.columns, *events.columns]))
    # 変数の内容: columns: 空結果にも保持する基礎列と計算結果列の一覧。
    columns = base + [c for c in (*FINANCE_RESULT_COLUMNS, *FINANCE_DERIVED_COLUMNS) if c not in base]
    # 2. 数値・真偽値・日付の型を保った0行の表を返す。
    return pd.DataFrame({c: pd.Series(dtype=_EMPTY_DTYPES.get(c, object)) for c in columns})


def build_event_finance_table(events: pd.DataFrame, finances: pd.DataFrame) -> pd.DataFrame:
    """イベントと収支を結合し、計算済みの列を足した分析用の表を作る。

    Args:
        events: events テーブル
        finances: event_finances テーブル

    Returns:
        1イベント1行の表。収支を入力していないイベントは含まない。
        has_result 列は売上が入っている（＝実績がある）かどうか。
        収支のあるイベントが無いときも、列名だけはそろえた空の表を返す
    """
    # 1. 収支のあるイベントだけを結合する（1件も無ければ列だけの表を返す）
    # df: 収支とイベント情報を結合し、分析用の列を足していく表。
    df = finances.merge(events, left_on="event_id", right_on="id", how="inner") if not finances.empty else finances
    if df.empty:
        return _empty_finance_table(events, finances)
    # 2. 1行ずつ管理画面と同じ式で計算する
    # df: 各イベントの計算済み収支結果を列として追加した表。
    df = pd.concat([df, df.apply(_row_results, axis=1)], axis=1)
    # 3. 分析で使う補助列を足す
    # end: 終了日が未入力なら開始日を使うイベントごとの最終日。
    end = df["end_date"].fillna(df["start_date"])
    df["days"] = (end - df["start_date"]).dt.days + 1  # 開催日数
    df["month"] = df["start_date"].dt.to_period("M").dt.to_timestamp()  # 開催月
    df["fiscal_year"] = fiscal_years(df["start_date"])
    df["brand_count"] = df["brands"].map(lambda b: len(b) if isinstance(b, list) else 0)
    df["has_result"] = df["sales"] > 0  # 売上 0 円は未開催（入力前）とみなす
    df["sales_per_day"] = df["sales"] / df["days"]
    df["margin"] = df["net"] / df["sales"].where(df["sales"] > 0)  # 収支 ÷ 売上
    return df.sort_values("start_date").reset_index(drop=True)
