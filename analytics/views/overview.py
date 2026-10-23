"""概要画面：選んだ期間の主要な数字と、月ごとの売上・収支の推移、今後の予定。"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.analysis import active_reservations
from lib.charts import POSITIVE, SERIES, style, yen
from lib.context import get_context


def render() -> None:
    """概要画面を表示する（会計年度はサイドバーで選んだ期間。初期値は「すべての期」）。"""
    ctx = get_context()
    st.title("概要")
    st.caption(ctx.year_label)

    done = ctx.done
    active_res = active_reservations(ctx.res)

    # 1. 主要な数字を4つのタイルで並べる
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("イベント売上（合計）", yen(done["sales"].sum()) if not done.empty else "—")
    c2.metric("イベント収支（合計）", yen(done["net"].sum()) if not done.empty else "—")
    c3.metric("出店回数（実績）", f"{len(done)}回")
    c4.metric("WS 予約人数", f"{int(active_res['participants'].sum())}人")

    if done.empty:
        st.info("売上の入力されたイベントがまだありません。")
        return

    # 2. 月ごとの売上（棒）と収支（棒）。単位が同じ円なので1つの軸に並べる
    monthly = done.groupby("month")[["sales", "net"]].sum().reset_index()
    fig = go.Figure()
    fig.add_bar(x=monthly["month"], y=monthly["sales"], name="売上", marker_color=SERIES[0],
                hovertemplate="%{x|%Y年%-m月}<br>売上 %{y:,.0f}円<extra></extra>")
    fig.add_bar(x=monthly["month"], y=monthly["net"], name="収支", marker_color=SERIES[1],
                hovertemplate="%{x|%Y年%-m月}<br>収支 %{y:,.0f}円<extra></extra>")
    fig.update_layout(title="月ごとの売上と収支", barmode="group")
    fig.update_xaxes(tickformat="%Y/%-m", dtick="M1")
    st.plotly_chart(style(fig), width="stretch")

    # 3. 売上の累計（選んだ期間の中でどこまで積み上がったか）
    cum = done.sort_values("start_date").assign(cum=lambda d: d["sales"].cumsum())
    fig2 = go.Figure(go.Scatter(
        x=cum["start_date"], y=cum["cum"], mode="lines+markers", name="累計売上",
        line=dict(color=POSITIVE, width=2), marker=dict(size=8),
        customdata=cum[["name", "sales"]],
        hovertemplate="%{x|%Y/%-m/%-d} %{customdata[0]}<br>この回 %{customdata[1]:,.0f}円<br>累計 %{y:,.0f}円<extra></extra>",
    ))
    fig2.update_layout(title="売上の累計", showlegend=False)
    st.plotly_chart(style(fig2, height=300), width="stretch")

    # 4. これからのイベント（最終日が今日以降のもの。開催中のイベントも含める）。最終日が無ければ初日で判定する
    ev = ctx.raw["events"]
    last_day = ev["end_date"].fillna(ev["start_date"])
    upcoming = ev[last_day >= ctx.today].sort_values("start_date")
    st.subheader(f"今後のイベント（{len(upcoming)}件）")
    if upcoming.empty:
        st.caption("予定されているイベントはありません。")
    else:
        st.dataframe(
            pd.DataFrame({
                "開催日": upcoming["start_date"].dt.strftime("%Y/%m/%d"),
                "イベント": upcoming["name"],
                "会場": upcoming["location"],
                "WS": upcoming["has_workshop"].map({True: "あり", False: ""}),
                "ブランド": upcoming["brands"].map(lambda b: " / ".join(b) if isinstance(b, list) else ""),
            }),
            hide_index=True,
            width="stretch",
        )
