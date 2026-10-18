"""予測・シミュレーション画面：今期の売上の着地見込み、売上を左右する要因、出店判断シミュレーター。"""

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.analysis import (
    MIN_ROWS_FOR_ANALYSIS,
    SERIES_PRIOR_K,
    displayed_median,
    fit_linear,
    forecast_fiscal_year,
    season_weight,
    series_weight,
    simulate_event,
)
from lib.charts import INK_SECONDARY, SERIES, style, yen
from lib.context import get_context, not_enough
from lib.finance import break_even_sales

# 要因分析で選べる項目：表示名 → (列名, 単位)
FACTORS = {
    "片道の移動距離": ("distance", "km"),
    "開催日数": ("days", "日"),
    "出店料": ("booth_fee", "円"),
    "出店ブランド数": ("brand_count", "ブランド"),
    "WS 参加人数": ("ws_participants", "人"),
}


def render() -> None:
    """予測・シミュレーション画面を表示する。"""
    ctx = get_context()
    st.title("予測・シミュレーション")
    st.caption("イベントの実績をもとにした統計的な見込みです。実績の回数が少ないうちは幅を持って見てください。")

    # 予測には会計年度の絞り込みを使わず、すべての実績を使う
    fin = ctx.fin_all
    done = fin[fin["has_result"]] if not fin.empty else fin
    if len(done) < MIN_ROWS_FOR_ANALYSIS:
        not_enough("売上の入力されたイベント", len(done), MIN_ROWS_FOR_ANALYSIS)
        return

    _forecast(ctx, fin)
    _factors(done)
    _simulator(done)


def _forecast(ctx, fin) -> None:
    """今期のイベント売上の着地見込みを表示する。

    Args:
        ctx: get_context の結果
        fin: イベント収支の表（全期間）
    """
    st.header("今期のイベント売上の着地見込み")
    fc = forecast_fiscal_year(fin, ctx.raw["events"], ctx.today)
    if fc is None:
        return
    st.caption(
        f"{fc['fiscal_year']}年度の実績に、まだ売上が入っていない {fc['remaining']} 回（今後の予定と入力待ち）の売上を"
        "無作為に引いて足す計算を 5,000 回くり返しました（ブートストラップ法）。"
        "1回分の売上は、次の2つのどちらかから引きます。"
        "(1) 同じイベント（「vol.5」「第3回」「2026」などの回の番号を除いた名前が同じもの）の過去の売上。"
        "年に複数回あるイベントは時期によって売上が違うため、この中では開催月が近い回ほど引かれやすくします"
        f"（同じ月を 1 として、1か月差 {season_weight(1):.2f}、2か月差 {season_weight(2):.2f}、"
        f"3か月差 {season_weight(3):.2f}、半年差はほぼ 0）。"
        "(2) 全イベントの1回あたり売上（時期は考慮しません）。"
        "(1) の重みの合計を「時期を考慮した実質の回数」n とし、(1) から引く割合を "
        f"n ÷ (n + {SERIES_PRIOR_K})、残りを (2) から引きます"
        f"（1回で{series_weight(1):.0%}、2回で{series_weight(2):.0%}、4回で{series_weight(4):.0%}）。"
        "回数が少ないうちに、たまたまの1回に引っぱられないためです。"
        "同じイベントの実績が無いときは全イベントの実績だけで、"
        "時期の離れた回しか無いときは主に全イベントの実績で見込みます。"
    )
    # 1. 実績と見込みを数字で並べる
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("ここまでの実績", yen(fc["actual"]))
    c2.metric("控えめな見込み（下位10%）", yen(fc["p10"]))
    c3.metric("ふつうの見込み（中央値）", yen(fc["p50"]))
    c4.metric("良い見込み（上位10%）", yen(fc["p90"]))
    # 2. シミュレーション結果の分布
    fig = go.Figure(go.Histogram(x=fc["samples"], nbinsx=40, marker_color=SERIES[0],
                                 hovertemplate="%{x:,.0f}円前後<br>%{y}回<extra></extra>"))
    for key, label in (("p10", "下位10%"), ("p50", "中央値"), ("p90", "上位10%")):
        fig.add_vline(x=fc[key], line=dict(color=INK_SECONDARY, width=1, dash="dot"),
                      annotation_text=label, annotation_position="top")
    fig.update_layout(title="今期の売上合計の分布（5,000回のシミュレーション）", showlegend=False)
    fig.update_yaxes(title_text="回数")
    st.plotly_chart(style(fig, height=300, yen_axis="x"), width="stretch")
    # 3. 残りのイベントごとに、参考にした同じイベントの過去の実績を表で見せる
    _forecast_details(fc["details"])


def _forecast_details(details: pd.DataFrame) -> None:
    """着地見込みで、残りのイベントごとに参考にした同じイベントの過去の実績を表で表示する。

    Args:
        details: forecast_fiscal_year の戻り値の details（series_references の結果）
    """
    st.subheader("残りのイベントと参考にした実績")
    if details.empty:
        st.caption("今期の残りのイベントはありません。")
        return
    # 1. 画面で読みやすい列名と表示形式にそろえる
    table = pd.DataFrame({
        "イベント名": details["name"].fillna("（名前なし）"),
        "開催日": pd.to_datetime(details["start_date"]).dt.strftime("%Y-%m-%d"),
        "同じイベントの過去の回数": details["n_past"].astype(int),
        # 開催月の近さで重み付けした回数（小数1桁で表示）
        "時期を考慮した実質の回数": [f"{float(n):.1f}" for n in details["n_eff"]],
        # 中央値は時期の重み付き。同じイベントの重みが小さく見込みにほとんど効いていない行は出さない
        "過去の売上の中央値": [
            yen(shown) if (shown := displayed_median(m, w)) is not None else "なし（全体の実績で見込み）"
            for m, w in zip(details["median_past"], details["weight"])
        ],
        "同じイベントの重み": [f"{w:.0%}" for w in details["weight"]],
        # どの過去の回とまとめたかを、開催時期と時期の重みつきで開催日順に並べる
        "まとめた過去の回": [
            _past_label(names, dates, weights)
            for names, dates, weights in zip(details["past_names"], details["past_dates"],
                                             details["past_season_weights"])
        ],
    })
    # 2. 表を表示する
    st.dataframe(table, hide_index=True, width="stretch")
    st.caption(
        "「同じイベントの重み」は、そのイベントの見込みを同じイベントの過去の売上から引く割合です。"
        "残りは全イベントの実績から引きます。「まとめた過去の回」の重みは開催月の近さによるもので、"
        "同じイベントの過去の売上から引くときは、この重みに比例して選ばれやすくなります。"
    )


def _past_label(names: list, dates: list, weights: list) -> str:
    """まとめた過去の回を「名前（YYYY年M月・重み80%）」の形で「 / 」区切りにつなげる。

    Args:
        names: 過去の回のイベント名のリスト
        dates: 過去の回の開催日のリスト（names と同じ順）
        weights: 過去の回の時期の重みのリスト（names と同じ順）

    Returns:
        表示用の文字列。過去の回が無ければ空文字
    """
    parts = []
    for name, date, w in zip(names, dates, weights):
        # 開催日が分からない回は時期を「時期不明」と出す
        when = f"{date.year}年{date.month}月" if pd.notna(date) else "時期不明"
        parts.append(f"{name}（{when}・重み{w:.0%}）")
    return " / ".join(parts)


def _factors(done) -> None:
    """売上と、距離・日数などの関係を散布図と回帰直線で表示する。

    Args:
        done: 売上の実績があるイベントの表
    """
    st.header("売上を左右する要因")
    label = st.selectbox("売上と比べる項目", list(FACTORS), key="factor")
    col, unit = FACTORS[label]
    # 1. 実績を点で打ち、直線を当てはめる
    fit = fit_linear(done[col], done["sales"])
    fig = go.Figure(go.Scatter(
        x=done[col], y=done["sales"], mode="markers", name="イベント",
        marker=dict(size=10, color=SERIES[0], line=dict(color="white", width=2)),
        customdata=done[["name"]], hovertemplate=f"%{{customdata[0]}}<br>{label} %{{x:,}}{unit}<br>売上 %{{y:,.0f}}円<extra></extra>",
    ))
    if fit:
        xs = np.linspace(done[col].min(), done[col].max(), 50)
        fig.add_scatter(x=xs, y=fit["slope"] * xs + fit["intercept"], mode="lines", name="傾向の直線",
                        line=dict(color=SERIES[1], width=2), hoverinfo="skip")
    fig.update_layout(title=f"{label} と 売上")
    fig.update_xaxes(title_text=f"{label}（{unit}）")
    st.plotly_chart(style(fig, height=340), width="stretch")
    # 2. 読み方を文章で添える
    if not fit:
        st.caption("この項目は値がほぼ同じなので、関係を調べられません。")
        return
    strength = "強い" if fit["r2"] >= 0.5 else "ある程度の" if fit["r2"] >= 0.2 else "ほとんど"
    st.caption(
        f"{label}が 1{unit} 増えると、売上は平均で {yen(fit['slope'])} 変わる傾向です。"
        f"決定係数 R² = {fit['r2']:.2f}（{strength}関係{'がありません' if strength == 'ほとんど' else 'があります'}）。"
        f"実績 {len(done)} 回からの推定なので、目安として見てください。"
    )


def _simulator(done) -> None:
    """出店を考えているイベントの条件を入れると、収支の見込みと黒字になる確率を出す。

    Args:
        done: 売上の実績があるイベントの表
    """
    st.header("出店判断シミュレーター")
    st.caption("条件を入れると、管理画面と同じ式で収支を計算します。見込み売上には WS の参加費も含めてください。")
    # 1. 条件の入力（初期値は過去の実績の中央値）
    c1, c2, c3 = st.columns(3)
    sales = c1.number_input("見込み売上（円）", 0, step=5000, value=int(done["sales"].median()))
    booth = c1.number_input("出店料（円）", 0, step=1000, value=int(done["booth_fee"].median()))
    distance = c2.number_input("片道の距離（km）", 0, step=10, value=int(done["distance"].median()))
    gas = c2.number_input("ガソリン単価（円/L）", 0, step=5, value=170)
    toll = c2.number_input("高速代（円）", 0, step=500, value=0)
    hotel = c3.number_input("宿泊費（円）", 0, step=1000, value=0)
    other = c3.number_input("その他支出（円）", 0, step=1000, value=0)
    ws = c3.number_input("WS 参加見込み（人）", 0, step=1, value=0)
    helper = st.toggle("手伝い支払いあり", value=True)

    # 2. 収支と損益分岐点を計算する
    result = simulate_event(sales, booth, distance, gas, toll, hotel, other, ws, helper)
    fin = {"sales": sales, "booth_fee": booth, "distance": distance, "gas_price": gas, "expressway_toll": toll,
           "accommodation": hotel, "other_expenses": other, "ws_participants": ws, "payment_flag": helper}
    be = break_even_sales(fin, has_workshop=ws > 0)
    # 3. 過去の売上のうち、損益分岐を超えていた回の割合 ＝ 同じ条件なら黒字になった確率の目安
    p_win = float((done["sales"] >= be).mean())

    c1, c2, c3 = st.columns(3)
    c1.metric("収支の見込み", yen(result["net"]), help="見込み売上を入れたときの収支")
    c2.metric("損益分岐の売上", yen(be), help="これを超えれば黒字")
    c3.metric("黒字になる確率の目安", f"{p_win:.0%}", help=f"過去 {len(done)} 回の売上のうち、損益分岐を超えていた回の割合")
    st.caption(
        f"支出 {yen(result['total_expense'])}（うち移動費 {yen(result['transport'])}）・WS資材費 {yen(result['ws_cost'])}"
        f"・手伝い支払い {yen(result['payment'])}"
    )
