"""概要画面：選んだ期間の主要な数字と、月ごとの売上・収支の推移、今後の予定。"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.analysis import active_reservations
from lib.charts import POSITIVE, SERIES, style, yen
from lib.context import get_context


def render() -> None:
    """概要画面を表示する（会計年度はサイドバーで選んだ期間。初期値は「すべての期」）。

    Returns:
        なし。"""
    # 変数の内容: ctx: 概要画面で使う集計済みデータコンテキスト。
    ctx = get_context()
    st.title("概要")
    st.caption(ctx.year_label)

    # 変数の内容: done: 概要カードとグラフに使う売上確定イベント。
    done = ctx.done
    # 変数の内容: active_res: キャンセル済みを除いた有効予約の一覧。
    active_res = active_reservations(ctx.res)

    # 1. 主要な数字を4つのタイルで並べる
    # c1〜c4: 売上・収支・出店回数・予約人数を並べる画面列。
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("イベント売上（合計）", yen(done["sales"].sum()) if not done.empty else "—")
    c2.metric("イベント収支（合計）", yen(done["net"].sum()) if not done.empty else "—")
    c3.metric("出店回数（実績）", f"{len(done)}回")
    c4.metric("WS 予約人数", f"{int(active_res['participants'].sum())}人")

    if done.empty:
        st.info("売上の入力されたイベントがまだありません。")
        return

    # 2. 月ごとの売上（棒）と収支（棒）。単位が同じ円なので1つの軸に並べる
    # 変数の内容: monthly: 月ごとに集計した売上と収支の系列。
    monthly = done.groupby("month")[["sales", "net"]].sum().reset_index()
    # 変数の内容: fig: 画面に表示する Plotly グラフ。
    fig = go.Figure()
    fig.add_bar(x=monthly["month"], y=monthly["sales"], name="売上", marker_color=SERIES[0],
                hovertemplate="%{x|%Y年%-m月}<br>売上 %{y:,.0f}円<extra></extra>")
    fig.add_bar(x=monthly["month"], y=monthly["net"], name="収支", marker_color=SERIES[1],
                hovertemplate="%{x|%Y年%-m月}<br>収支 %{y:,.0f}円<extra></extra>")
    fig.update_layout(title="月ごとの売上と収支", barmode="group")
    fig.update_xaxes(tickformat="%Y/%-m", dtick="M1")
    st.plotly_chart(style(fig), width="stretch")

    # 3. 売上の累計（選んだ期間の中でどこまで積み上がったか）
    # 変数の内容: cum: 開催日順に並べ、売上累計を追加したイベント一覧。
    cum = done.sort_values("start_date").assign(cum=lambda d: d["sales"].cumsum())
    # 変数の内容: fig2: 売上累計を表示する Plotly グラフ。
    fig2 = go.Figure(go.Scatter(
        x=cum["start_date"], y=cum["cum"], mode="lines+markers", name="累計売上",
        line=dict(color=POSITIVE, width=2), marker=dict(size=8),
        customdata=cum[["name", "sales"]],
        hovertemplate="%{x|%Y/%-m/%-d} %{customdata[0]}<br>この回 %{customdata[1]:,.0f}円<br>累計 %{y:,.0f}円<extra></extra>",
    ))
    fig2.update_layout(title="売上の累計", showlegend=False)
    st.plotly_chart(style(fig2, height=300), width="stretch")

    # 4. これからのイベント（最終日が今日以降のもの。開催中のイベントも含める）。最終日が無ければ初日で判定する
    # 変数の内容: ev: 今後の開催予定を絞り込む元イベント一覧。
    ev = ctx.raw["events"]
    # 変数の内容: last_day: イベントごとの最終開催日。終了日未設定時は開始日。
    last_day = ev["end_date"].fillna(ev["start_date"])
    # 変数の内容: upcoming: 最終開催日が今日以降のイベント。
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
