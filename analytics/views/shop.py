"""ショップ画面：売上推移・商品ランキング・都道府県別・顧客分析（RFM）・併売分析・在庫。"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.analysis import MIN_ROWS_FOR_ANALYSIS, co_purchase_pairs, repeat_summary, rfm_table, valid_orders
from lib.charts import SERIES, style, yen
from lib.context import get_context, not_enough


def render() -> None:
    """ショップ画面を表示する。"""
    ctx = get_context()
    st.title("ショップ")
    st.caption("オンラインショップの注文（キャンセルを除く）")

    orders = valid_orders(ctx.raw["orders"])
    items = ctx.raw["order_items"]
    items = items[items["order_id"].isin(orders["id"])]
    products = ctx.raw["products"]

    # 1. まとめの数字（件数が少なくても表示する）
    rep = repeat_summary(orders)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("注文数", f"{len(orders)}件")
    c2.metric("売上（送料込み）", yen(orders["total"].sum()))
    c3.metric("平均注文額", yen(orders["total"].mean()) if len(orders) else "—")
    c4.metric("リピーター率", f"{rep['repeat_rate']:.0%}" if rep["customers"] else "—")

    # 2. 分析は注文がある程度たまってから。少ないうちは理由を出して在庫だけ見せる
    if len(orders) < MIN_ROWS_FOR_ANALYSIS:
        not_enough("有効な注文", len(orders), MIN_ROWS_FOR_ANALYSIS)
        st.caption("注文がたまると、月別の売上・商品ランキング・都道府県別・顧客分析（RFM）・併売分析が表示されます。")
        _stock(products)
        return

    # 3. 月ごとの売上
    monthly = orders.assign(month=orders["created_at"].dt.tz_localize(None).dt.to_period("M").dt.to_timestamp())
    monthly = monthly.groupby("month").agg(売上=("total", "sum"), 件数=("id", "count")).reset_index()
    fig = go.Figure(go.Bar(x=monthly["month"], y=monthly["売上"], marker_color=SERIES[0], customdata=monthly["件数"],
                           hovertemplate="%{x|%Y年%-m月}<br>%{y:,.0f}円（%{customdata}件）<extra></extra>"))
    fig.update_layout(title="月ごとの売上", showlegend=False)
    fig.update_xaxes(tickformat="%Y/%-m", dtick="M1")
    st.plotly_chart(style(fig, height=300), width="stretch")

    # 4. 商品ランキング（売上の多い順・上位15）
    c1, c2 = st.columns(2)
    rank = (items.assign(amount=items["price"] * items["quantity"]).groupby("product_name")
            .agg(売上=("amount", "sum"), 個数=("quantity", "sum")).sort_values("売上").tail(15).reset_index())
    fig = go.Figure(go.Bar(x=rank["売上"], y=rank["product_name"], orientation="h", marker_color=SERIES[0],
                           customdata=rank["個数"], hovertemplate="%{y}<br>%{x:,.0f}円（%{customdata}個）<extra></extra>"))
    fig.update_layout(title="商品別の売上（上位15）", showlegend=False)
    c1.plotly_chart(style(fig, height=420, yen_axis="x"), width="stretch")

    # 5. 都道府県別の注文数
    pref = orders["prefecture"].value_counts().sort_values().tail(15)
    fig = go.Figure(go.Bar(x=pref.values, y=pref.index, orientation="h", marker_color=SERIES[0],
                           hovertemplate="%{y}<br>%{x}件<extra></extra>"))
    fig.update_layout(title="都道府県別の注文数（上位15）", showlegend=False)
    c2.plotly_chart(style(fig, height=420, yen_axis=None), width="stretch")

    # 6. 顧客分析（RFM）：最近買ったか・何回買ったか・いくら買ったか
    st.subheader("顧客分析（RFM）")
    rfm = rfm_table(orders, pd.Timestamp.now(tz="Asia/Tokyo"))
    seg = rfm.groupby("segment").agg(人数=("customer_key", "count"), 平均購入額=("monetary", "mean")).reset_index()
    st.dataframe(seg.style.format({"平均購入額": "{:,.0f}円"}), hide_index=True, width="stretch")

    # 7. 併売分析：一緒に買われやすい商品の組み合わせ
    st.subheader("一緒に買われている商品")
    pairs = co_purchase_pairs(items)
    if pairs.empty:
        st.caption("2種類以上を同時に買った注文はまだありません。")
    else:
        st.dataframe(pairs.head(20), hide_index=True, width="stretch")

    _stock(products)


def _stock(products: pd.DataFrame) -> None:
    """公開中の商品の在庫一覧を表示する（在庫の少ない順）。

    Args:
        products: products テーブル
    """
    st.subheader("在庫")
    pub = products[products["is_published"]].sort_values("stock")
    if pub.empty:
        st.caption("公開中の商品はありません。")
        return
    st.dataframe(
        pd.DataFrame({"商品": pub["name"], "カテゴリ": pub["category"].fillna("—"), "価格": pub["price"], "在庫": pub["stock"]})
        .style.format({"価格": "{:,.0f}円"}),
        hide_index=True, width="stretch",
    )
