"""ワークショップ画面：予約数・キャンセル率・時間枠の埋まり具合・予約のタイミング・リピーター。"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.analysis import repeat_summary, session_fill_rates
from lib.charts import SEQUENTIAL, SERIES, style
from lib.context import get_context, not_enough


def render() -> None:
    """ワークショップ画面を表示する。"""
    ctx = get_context()
    st.title("ワークショップ")
    st.caption(ctx.year_label)

    res = ctx.res
    if res.empty:
        not_enough("WS 予約", 0, 1)
        return
    active = res[~res["is_cancelled"]]

    # 1. まとめの数字
    rep = repeat_summary(active)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("予約件数", f"{len(res)}件")
    c2.metric("予約人数（キャンセル除く）", f"{int(active['participants'].sum())}人")
    c3.metric("キャンセル率", f"{res['is_cancelled'].mean():.0%}")
    c4.metric("リピーター", f"{rep['repeaters']} / {rep['customers']}人", help="2回以上予約した人（メールアドレスで判定）")

    # 2. イベントごとの予約人数
    by_event = (
        active.groupby(["event_name", "start_date"])["participants"].sum().reset_index().sort_values("start_date")
    )
    # イベント名が長いので横棒にし、新しいイベントを上に並べる
    by_event = by_event.iloc[::-1]
    labels = by_event["start_date"].dt.strftime("%-m/%-d ") + by_event["event_name"].map(
        lambda n: n.strip() if len(n.strip()) <= 22 else n.strip()[:21] + "…"
    )
    fig = go.Figure(go.Bar(
        x=by_event["participants"], y=labels, orientation="h", marker_color=SERIES[0],
        text=by_event["participants"].astype(str) + "人", textposition="outside", cliponaxis=False,
        customdata=by_event["event_name"], hovertemplate="%{customdata}<br>%{x}人<extra></extra>",
    ))
    fig.update_layout(title="イベントごとの予約人数", showlegend=False)
    fig.update_xaxes(ticksuffix="人", range=[0, by_event["participants"].max() * 1.15])
    st.plotly_chart(style(fig, height=max(240, 40 * len(by_event) + 80), yen_axis=None), width="stretch")

    # 3. 時間枠ごとの埋まり具合（濃いほど埋まっている）
    st.subheader("時間枠の埋まり具合")
    fill = session_fill_rates(res, ctx.raw["ws_sessions"], ctx.raw["events"])
    event_names = set(res["event_name"].dropna())
    fill = fill[fill["event_name"].isin(event_names)]
    if fill.empty:
        st.caption("時間枠を設定したイベントがありません。")
    else:
        pivot = fill.pivot_table(index="event_name", columns="time_label", values="fill_rate", aggfunc="mean")
        booked = fill.pivot_table(index="event_name", columns="time_label", values="booked", aggfunc="sum")
        cap = fill.pivot_table(index="event_name", columns="time_label", values="max_participants", aggfunc="sum")
        fig = go.Figure(go.Heatmap(
            z=pivot.values, x=pivot.columns, y=pivot.index, zmin=0, zmax=1,
            colorscale=[[i / (len(SEQUENTIAL) - 1), c] for i, c in enumerate(SEQUENTIAL)],
            # その時間枠がないイベントの欄は空欄にする（「null」と出さない）
            text=(booked.astype("Int64").astype(str) + "/" + cap.astype("Int64").astype(str)).where(cap.notna(), ""),
            texttemplate="%{text}", xgap=2, ygap=2,
            colorbar=dict(title="埋まり率", tickformat=".0%"),
            hovertemplate="%{y}<br>%{x}<br>%{text}人（%{z:.0%}）<extra></extra>",
        ))
        st.plotly_chart(style(fig, height=max(240, 60 * len(pivot)), yen_axis=None), width="stretch")
        st.caption(f"全体の埋まり率：{fill['booked'].sum() / fill['max_participants'].sum():.0%}"
                   f"（{int(fill['booked'].sum())} / {int(fill['max_participants'].sum())}人）")

    # 4. 何日前に予約されるか
    st.subheader("予約のタイミング")
    lead = active["lead_days"].dropna()
    if len(lead) == 0:
        st.caption("参加日の情報がありません。")
    else:
        fig = go.Figure(go.Histogram(
            x=lead, xbins=dict(start=-0.5, size=1), marker_color=SERIES[0],
            hovertemplate="%{x}日前<br>%{y}件<extra></extra>",
        ))
        fig.update_layout(title=f"参加日の何日前に予約したか（中央値 {lead.median():.0f}日前）", showlegend=False)
        fig.update_xaxes(title_text="何日前", autorange="reversed")
        fig.update_yaxes(title_text="件数")
        st.plotly_chart(style(fig, height=300, yen_axis=None), width="stretch")
        st.caption(f"当日〜3日前の予約が {(lead <= 3).mean():.0%}、7日以上前が {(lead >= 7).mean():.0%}。"
                   "告知のタイミングを決める目安になります。")

    # 5. 持ち込みの割合
    c1, c2 = st.columns(2)
    c1.metric("植物の持ち込み", f"{active['bring_plant'].mean():.0%}")
    c2.metric("鉢の持ち込み", f"{active['bring_pot'].mean():.0%}")

    # 6. 予約が入った曜日・時間帯（いつ告知を見て予約しているか）
    st.subheader("予約が入った曜日と時間帯")
    t = active["created_at"]
    days = ["月", "火", "水", "木", "金", "土", "日"]
    grid = pd.crosstab(t.dt.dayofweek, t.dt.hour // 3 * 3).reindex(index=range(7), columns=range(0, 24, 3), fill_value=0)
    fig = go.Figure(go.Heatmap(
        z=grid.values, x=[f"{h}時台〜" for h in grid.columns], y=days,
        colorscale=[[i / (len(SEQUENTIAL) - 1), c] for i, c in enumerate(SEQUENTIAL)],
        xgap=2, ygap=2, colorbar=dict(title="件数"),
        hovertemplate="%{y}曜 %{x}<br>%{z}件<extra></extra>",
    ))
    fig.update_yaxes(autorange="reversed")
    st.plotly_chart(style(fig, height=300, yen_axis=None), width="stretch")
