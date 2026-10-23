"""イベント収支画面：イベントごとの収支ランキング、支出の内訳、ブランド・会場別の比較。"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.charts import BRAND_COLORS, EXPENSE_COLORS, NEGATIVE, POSITIVE, SERIES, bar_height, event_labels, style, yen
from lib.context import get_context, no_data
from lib.finance import FUEL_EFFICIENCY_KM_PER_L

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

# 収支ランキングで、棒の外に出す金額ラベルのために軸の左右に取る余白（値の幅に対する割合）
NET_LABEL_PAD_LEFT = 0.18  # 赤字の棒があるときの左側
NET_LABEL_PAD_RIGHT = 0.15  # 右側


def render() -> None:
    """イベント収支画面を表示する。"""
    ctx = get_context()
    st.title("イベント収支")
    st.caption(
        f"{ctx.year_label}・計算式は管理画面の収支ページと同じです"
        f"（移動費は往復距離 ÷ {FUEL_EFFICIENCY_KM_PER_L}km/L × ガソリン単価）"
    )

    if ctx.fin.empty:
        no_data("イベント収支")
        return
    done = ctx.done.copy()
    pending = len(ctx.fin) - len(done)
    if pending:
        st.caption(f"売上が 0 円のイベント {pending} 件は、未開催または入力前として集計から外しています。")
    if done.empty:
        no_data("売上の入力されたイベント")
        return
    # グラフの軸に出す名前。年を入れ、同じ名前が重なるときは連番を付けて、別の回が1本の棒にまとまらないようにする
    done["label"] = event_labels(done["start_date"], done["name"])

    _summary(done)
    _ranking(done)
    _break_even(done)
    _expenses(done)
    _brands(done)
    _workshop(done)
    _detail_table(done)


def _summary(done: pd.DataFrame) -> None:
    """まとめの数字（売上・収支の中央値、黒字の回数、収支率）を表示する。

    Args:
        done: 売上の実績がある回の表
    """
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("1回あたりの売上（中央値）", yen(done["sales"].median()))
    c2.metric("1回あたりの収支（中央値）", yen(done["net"].median()))
    c3.metric("黒字の回", f"{int((done['net'] > 0).sum())} / {len(done)}回")
    c4.metric("収支率（収支合計 ÷ 売上合計）", f"{done['net'].sum() / done['sales'].sum():.0%}")


def _ranking(done: pd.DataFrame) -> None:
    """イベントごとの収支を横棒で並べる（黒字は青・赤字は赤。色だけに頼らず数値も表示する）。

    Args:
        done: 売上の実績がある回の表（label 列を持つ）
    """
    # 1. 収支の小さい順に並べた横棒（横棒は下から積まれるので、いちばん上が最も黒字の回になる）
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
    # 2. 棒の外に出す金額ラベルが軸の名前や右端にかからないよう、左右に余白を取る
    lo, hi = min(0, ranked["net"].min()), max(0, ranked["net"].max())
    span = hi - lo
    fig.update_xaxes(range=[lo - span * (NET_LABEL_PAD_LEFT if lo < 0 else 0), hi + span * NET_LABEL_PAD_RIGHT])
    st.plotly_chart(style(fig, height=bar_height(len(ranked)), yen_axis="x"), width="stretch")


def _break_even(done: pd.DataFrame) -> None:
    """売上と損益分岐点を並べる。売上が損益分岐を超えた分が利益になる。

    Args:
        done: 売上の実績がある回の表（label 列を持つ）
    """
    st.subheader("売上と損益分岐点")
    st.caption("◆ は収支が 0 円になる売上。棒がこれより右にあれば黒字です。")
    order = done.sort_values("sales")
    fig = go.Figure()
    fig.add_bar(x=order["sales"], y=order["label"], orientation="h", name="売上", marker_color=SERIES[0],
                hovertemplate="%{y}<br>売上 %{x:,.0f}円<extra></extra>")
    fig.add_scatter(x=order["break_even"], y=order["label"], mode="markers", name="損益分岐の売上",
                    marker=dict(symbol="diamond", size=11, color=SERIES[1], line=dict(color="white", width=2)),
                    hovertemplate="%{y}<br>損益分岐 %{x:,.0f}円<extra></extra>")
    st.plotly_chart(style(fig, height=bar_height(len(order)), yen_axis="x"), width="stretch")


def _expenses(done: pd.DataFrame) -> None:
    """支出の内訳を積み上げ横棒で表示し、費目ごとの合計と割合を文章で添える。

    手伝い支払いは物販が赤字の回にマイナスになることがあるため、割合はプラスの費目だけで計算し、
    マイナスの費目は割合から除いたことを注記する。

    Args:
        done: 売上の実績がある回の表（label 列を持つ）
    """
    st.subheader("支出の内訳")
    # 1. 費目ごとに積み上げる（一度も発生していない費目は凡例に出さない）
    fig = go.Figure()
    for label, col in EXPENSE_COLUMNS.items():
        if done[col].abs().sum() == 0:
            continue
        fig.add_bar(x=done[col], y=done["label"], orientation="h", name=label, marker_color=EXPENSE_COLORS[label],
                    hovertemplate=f"%{{y}}<br>{label} %{{x:,.0f}}円<extra></extra>")
    fig.update_layout(barmode="stack")
    st.plotly_chart(style(fig, height=bar_height(len(done)), yen_axis="x"), width="stretch")
    # 2. 費目ごとの合計。割合はプラスの費目の合計に対して出す
    totals = pd.Series({k: done[v].sum() for k, v in EXPENSE_COLUMNS.items()}).sort_values(ascending=False)
    positive = totals[totals > 0]
    negative = totals[totals < 0]
    if not positive.empty:
        st.caption("支出合計の内訳：" + "、".join(
            f"{k} {yen(v)}（{v / positive.sum():.0%}）" for k, v in positive.items()
        ))
    # 3. マイナスの費目（物販が赤字の回の手伝い支払いなど）は割合から外したことを書く
    if not negative.empty:
        st.caption(
            "、".join(f"{k} {yen(v)}" for k, v in negative.items())
            + " は合計がマイナス（物販が赤字の回で差し引かれた分）のため、割合の計算から除いています。"
        )


def _brands(done: pd.DataFrame) -> None:
    """ブランド別の平均売上・平均収支を比べる（そのブランドが出店した回の平均）。

    Args:
        done: 売上の実績がある回の表
    """
    st.subheader("ブランド別の平均")
    st.caption("複数ブランドで出店した回は、それぞれのブランドに数えています。")
    # 1. 1回に複数ブランドがあれば行を分けて、ブランドごとに集計する
    exploded = done.explode("brands").dropna(subset=["brands"])
    by_brand = exploded.groupby("brands").agg(回数=("event_id", "count"), 平均売上=("sales", "mean"), 平均収支=("net", "mean"))
    # 2. 決まったブランドを決まった順に並べ、BRAND_COLORS に無いブランドも消さずに後ろへ足す
    known = [b for b in BRAND_COLORS if b in by_brand.index]
    others = sorted(b for b in by_brand.index if b not in BRAND_COLORS)
    by_brand = by_brand.reindex(known + others).reset_index()
    fig = go.Figure()
    for metric, color in (("平均売上", SERIES[0]), ("平均収支", SERIES[1])):
        fig.add_bar(x=by_brand["brands"], y=by_brand[metric], name=metric, marker_color=color,
                    customdata=by_brand["回数"],
                    hovertemplate=f"%{{x}}<br>{metric} %{{y:,.0f}}円<br>%{{customdata}}回<extra></extra>")
    fig.update_layout(barmode="group")
    st.plotly_chart(style(fig, height=320), width="stretch")


def _workshop(done: pd.DataFrame) -> None:
    """WS ありの回となしの回の平均売上・平均収支を表で比べる。

    Args:
        done: 売上の実績がある回の表
    """
    st.subheader("WS ありの回 と なしの回")
    ws = done.groupby("has_workshop").agg(回数=("event_id", "count"), 平均売上=("sales", "mean"), 平均収支=("net", "mean"))
    ws.index = ws.index.map({True: "WS あり", False: "WS なし"}).rename("区分")
    st.dataframe(ws.style.format({"平均売上": "{:,.0f}円", "平均収支": "{:,.0f}円"}), width="stretch")


def _detail_table(done: pd.DataFrame) -> None:
    """収支の明細を、開いて見られる表で表示する。

    Args:
        done: 売上の実績がある回の表
    """
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
        # 金額の列は桁区切り、収支率は % で表示する
        money = ["売上", "支出", "WS資材", "手伝い", "収支", "損益分岐"]
        st.dataframe(
            table.style.format({**{c: "{:,.0f}" for c in money}, "収支率": "{:.0%}"}),
            hide_index=True, width="stretch",
        )
