"""問い合わせ・記事画面：問い合わせ件数の推移と未読数、ジャーナル記事の投稿頻度とタグ。"""

import plotly.graph_objects as go
import streamlit as st

from lib.charts import SERIES, style
from lib.context import get_context


def render() -> None:
    """問い合わせ・記事画面を表示する。"""
    ctx = get_context()
    st.title("問い合わせ・記事")
    st.caption("問い合わせは件数と既読状態だけを読み込んでいます（本文・氏名・メールは読み込みません）。")

    # 1. 問い合わせ
    contacts = ctx.raw["contacts"]
    c1, c2 = st.columns(2)
    c1.metric("問い合わせ（累計）", f"{len(contacts)}件")
    c2.metric("未読", f"{int((~contacts['is_read'].astype(bool)).sum()) if len(contacts) else 0}件")
    if len(contacts):
        monthly = contacts["created_at"].dt.tz_localize(None).dt.to_period("M").value_counts().sort_index()
        fig = go.Figure(go.Bar(x=monthly.index.to_timestamp(), y=monthly.values, marker_color=SERIES[0],
                               hovertemplate="%{x|%Y年%-m月}<br>%{y}件<extra></extra>"))
        fig.update_layout(title="月ごとの問い合わせ件数", showlegend=False)
        fig.update_xaxes(tickformat="%Y/%-m", dtick="M1")
        fig.update_yaxes(ticksuffix="件", dtick=1)
        st.plotly_chart(style(fig, height=280, yen_axis=None), width="stretch")

    # 2. ジャーナル記事
    st.subheader("ジャーナル記事")
    articles = ctx.raw["articles"]
    if articles.empty:
        st.info("記事はまだありません。記事を公開すると、月ごとの投稿数とタグの内訳が表示されます。")
        return
    pub = articles[articles["is_published"].astype(bool)]
    c1, c2 = st.columns(2)
    c1.metric("公開中の記事", f"{len(pub)}本")
    c2.metric("下書き", f"{len(articles) - len(pub)}本")
    when = pub["published_at"].fillna(pub["created_at"]).dt.tz_localize(None).dt.to_period("M").value_counts().sort_index()
    if len(when):
        fig = go.Figure(go.Bar(x=when.index.to_timestamp(), y=when.values, marker_color=SERIES[0],
                               hovertemplate="%{x|%Y年%-m月}<br>%{y}本<extra></extra>"))
        fig.update_layout(title="月ごとの公開本数", showlegend=False)
        st.plotly_chart(style(fig, height=280, yen_axis=None), width="stretch")
    tags = pub.explode("tags")["tags"].dropna().value_counts().sort_values().tail(15)
    if len(tags):
        fig = go.Figure(go.Bar(x=tags.values, y=tags.index, orientation="h", marker_color=SERIES[0],
                               hovertemplate="%{y}<br>%{x}本<extra></extra>"))
        fig.update_layout(title="よく使われているタグ", showlegend=False)
        st.plotly_chart(style(fig, height=max(240, 28 * len(tags)), yen_axis=None), width="stretch")
