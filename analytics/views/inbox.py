"""問い合わせ・記事画面：問い合わせ件数の推移と未読数、ジャーナル記事の投稿頻度とタグ。"""

import streamlit as st

from lib.charts import TOP_N, bar_chart, bar_height, monthly_bar, style, to_month
from lib.context import get_context

# 月ごとのグラフの高さ（px）
MONTHLY_HEIGHT = 280


def render() -> None:
    """問い合わせ・記事画面を表示する。"""
    ctx = get_context()
    st.title("問い合わせ・記事")
    st.caption("問い合わせは件数と既読状態だけを読み込んでいます（本文・氏名・メールは読み込みません）。")

    # 1. 問い合わせ
    contacts = ctx.raw["contacts"]
    c1, c2 = st.columns(2)
    c1.metric("問い合わせ（累計）", f"{len(contacts)}件")
    c2.metric("未読", f"{int((~contacts['is_read'].fillna(False).astype(bool)).sum())}件")
    if len(contacts):
        monthly = to_month(contacts["created_at"]).value_counts().sort_index()
        fig = monthly_bar(monthly.index, monthly.values, "%{x|%Y年%-m月}<br>%{y}件<extra></extra>",
                          title="月ごとの問い合わせ件数")
        fig.update_yaxes(ticksuffix="件", dtick=1)
        st.plotly_chart(style(fig, height=MONTHLY_HEIGHT, yen_axis=None), width="stretch")

    # 2. ジャーナル記事
    st.subheader("ジャーナル記事")
    articles = ctx.raw["articles"]
    if articles.empty:
        st.info("記事はまだありません。記事を公開すると、月ごとの投稿数とタグの内訳が表示されます。")
        return
    pub = articles[articles["is_published"].fillna(False).astype(bool)]
    c1, c2 = st.columns(2)
    c1.metric("公開中の記事", f"{len(pub)}本")
    c2.metric("下書き", f"{len(articles) - len(pub)}本")
    # 3. 月ごとの公開本数（公開日が無い記事は作成日で数える）
    when = to_month(pub["published_at"].fillna(pub["created_at"])).value_counts().sort_index()
    if len(when):
        fig = monthly_bar(when.index, when.values, "%{x|%Y年%-m月}<br>%{y}本<extra></extra>", title="月ごとの公開本数")
        st.plotly_chart(style(fig, height=MONTHLY_HEIGHT, yen_axis=None), width="stretch")
    # 4. よく使われているタグ（上位 TOP_N）
    tags = pub.explode("tags")["tags"].dropna().value_counts().sort_values().tail(TOP_N)
    if len(tags):
        fig = bar_chart(tags.values, tags.index, "%{y}<br>%{x}本<extra></extra>", title="よく使われているタグ")
        st.plotly_chart(style(fig, height=bar_height(len(tags), minimum=240), yen_axis=None), width="stretch")
