"""イベント収支画面：イベントごとの収支ランキング、支出の内訳、ブランド・会場別の比較。"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.charts import BRAND_COLORS, EXPENSE_COLORS, NEGATIVE, POSITIVE, SERIES, style, yen
from lib.context import get_context, not_enough

# 支出の内訳：表示名 → 列名
EXPENSE_COLUMNS = {
    "出店料": "booth_fee",
    "移動費": "transport",
    "高速代": "expressway_toll",
    "宿泊費": "accommodation",
    "その他": "other_expenses",
    "WS資材費": "ws_cost",
    "手伝い支払い": "payment",
}


def _short(name: str, n: int = 18) -> str:
    """長いイベント名をグラフの軸に収まる長さに切る。

    Args:
        name: イベント名
        n: 最大文字数

    Returns:
        切り詰めた名前（切ったときは末尾に「…」）
    """
    name = name.strip()
    return name if len(name) <= n else name[: n - 1] + "…"


def render() -> None:
    """イベント収支画面を表示する。"""
    ctx = get_context()
    st.title("イベント収支")
    st.caption(f"{ctx.year_label}・計算式は管理画面の収支ページと同じです（移動費は往復距離 ÷ 10km/L × ガソリン単価）")

    if ctx.fin.empty:
        not_enough("イベント収支", 0, 1)
        return
    done = ctx.fin[ctx.fin["has_result"]].copy()
    pending = len(ctx.fin) - len(done)
    if pending:
        st.caption(f"売上が 0 円のイベント {pending} 件は、未開催または入力前として集計から外しています。")
    if done.empty:
        not_enough("売上の入力されたイベント", 0, 1)
        return
    done["label"] = done["start_date"].dt.strftime("%-m/%-d ") + done["name"].map(_short)

    # 1. まとめの数字
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("1回あたりの売上（中央値）", yen(done["sales"].median()))
    c2.metric("1回あたりの収支（中央値）", yen(done["net"].median()))
    c3.metric("黒字の回", f"{int((done['net'] > 0).sum())} / {len(done)}回")
    c4.metric("収支率（収支合計 ÷ 売上合計）", f"{done['net'].sum() / done['sales'].sum():.0%}")

    # 2. 収支ランキング（黒字は青・赤字は赤。色だけに頼らず数値も表示する）
    ranked = done.sort_values("net")
    fig = go.Figure(go.Bar(
        x=ranked["net"], y=ranked["label"], orientation="h",
        marker_color=[POSITIVE if v >= 0 else NEGATIVE for v in ranked["net"]],
        text=[yen(v) for v in ranked["net"]], textposition="outside", cliponaxis=False,
        customdata=ranked[["sales", "total_expense", "break_even"]],
        hovertemplate="%{y}<br>収支 %{x:,.0f}円<br>売上 %{customdata[0]:,.0f}円<br>"
                      "支出 %{customdata[1]:,.0f}円<br>損益分岐の売上 %{customdata[2]:,.0f}円<extra></extra>",
    ))
    fig.update_layout(title="イベントごとの収支（青＝黒字、赤＝赤字）", showlegend=False)
    # 棒の外に出す金額ラベルが軸の名前や右端にかからないよう、左右に余白を取る
    lo, hi = min(0, ranked["net"].min()), max(0, ranked["net"].max())
    span = hi - lo
    fig.update_xaxes(range=[lo - span * (0.18 if lo < 0 else 0), hi + span * 0.15])
    st.plotly_chart(style(fig, height=max(320, 28 * len(ranked)), yen_axis="x"), width="stretch")

    # 3. 売上と損益分岐点。売上が損益分岐を超えた分が利益になる
    st.subheader("売上と損益分岐点")
    st.caption("◆ は収支が 0 円になる売上。棒がこれより右にあれば黒字です。")
    order = done.sort_values("sales")
    fig = go.Figure()
    fig.add_bar(x=order["sales"], y=order["label"], orientation="h", name="売上", marker_color=SERIES[0],
                hovertemplate="%{y}<br>売上 %{x:,.0f}円<extra></extra>")
    fig.add_scatter(x=order["break_even"], y=order["label"], mode="markers", name="損益分岐の売上",
                    marker=dict(symbol="diamond", size=11, color=SERIES[1], line=dict(color="white", width=2)),
                    hovertemplate="%{y}<br>損益分岐 %{x:,.0f}円<extra></extra>")
    st.plotly_chart(style(fig, height=max(320, 28 * len(order)), yen_axis="x"), width="stretch")

    # 4. 支出の内訳（積み上げ）
    st.subheader("支出の内訳")
    fig = go.Figure()
    for label, col in EXPENSE_COLUMNS.items():
        if done[col].abs().sum() == 0:
            continue  # 一度も発生していない費目は凡例に出さない
        fig.add_bar(x=done[col], y=done["label"], orientation="h", name=label, marker_color=EXPENSE_COLORS[label],
                    hovertemplate=f"%{{y}}<br>{label} %{{x:,.0f}}円<extra></extra>")
    fig.update_layout(barmode="stack")
    st.plotly_chart(style(fig, height=max(320, 28 * len(done)), yen_axis="x"), width="stretch")
    totals = pd.Series({k: done[v].sum() for k, v in EXPENSE_COLUMNS.items()}).sort_values(ascending=False)
    totals = totals[totals != 0]
    st.caption("支出合計の内訳：" + "、".join(f"{k} {yen(v)}（{v / totals.sum():.0%}）" for k, v in totals.items()))

    # 5. ブランド別の比較（そのブランドが出店した回の平均）
    st.subheader("ブランド別の平均")
    st.caption("複数ブランドで出店した回は、それぞれのブランドに数えています。")
    exploded = done.explode("brands").dropna(subset=["brands"])
    by_brand = exploded.groupby("brands").agg(回数=("event_id", "count"), 平均売上=("sales", "mean"), 平均収支=("net", "mean"))
    by_brand = by_brand.reindex([b for b in BRAND_COLORS if b in by_brand.index]).reset_index()
    fig = go.Figure()
    for metric, color in (("平均売上", SERIES[0]), ("平均収支", SERIES[1])):
        fig.add_bar(x=by_brand["brands"], y=by_brand[metric], name=metric, marker_color=color,
                    customdata=by_brand["回数"],
                    hovertemplate=f"%{{x}}<br>{metric} %{{y:,.0f}}円<br>%{{customdata}}回<extra></extra>")
    fig.update_layout(barmode="group")
    st.plotly_chart(style(fig, height=320), width="stretch")

    # 6. WS の有無で比べる
    st.subheader("WS ありの回 と なしの回")
    ws = done.groupby("has_workshop").agg(回数=("event_id", "count"), 平均売上=("sales", "mean"), 平均収支=("net", "mean"))
    ws.index = ws.index.map({True: "WS あり", False: "WS なし"}).rename("区分")
    st.dataframe(ws.style.format({"平均売上": "{:,.0f}円", "平均収支": "{:,.0f}円"}), width="stretch")

    # 7. 明細の表
    with st.expander("収支の明細を表で見る"):
        table = pd.DataFrame({
            "開催日": done["start_date"].dt.strftime("%Y/%m/%d"),
            "イベント": done["name"],
            "日数": done["days"],
            "片道km": done["distance"],
            "売上": done["sales"],
            "支出": done["total_expense"],
            "WS資材": done["ws_cost"],
            "手伝い": done["payment"],
            "収支": done["net"],
            "損益分岐": done["break_even"].round(),
            "収支率": done["margin"],
        })
        money = ["売上", "支出", "WS資材", "手伝い", "収支", "損益分岐"]
        st.dataframe(
            table.style.format({**{c: "{:,.0f}" for c in money}, "収支率": "{:.0%}"}),
            hide_index=True, width="stretch",
        )
