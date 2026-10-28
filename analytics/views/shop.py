"""ショップ画面：売上推移・商品ランキング・都道府県別・顧客分析（RFM）・併売分析・在庫。"""

import pandas as pd
import streamlit as st

from lib.analysis import MIN_ROWS_FOR_ANALYSIS, co_purchase_pairs, repeat_summary, rfm_table, valid_orders
from lib.charts import TOP_N, bar_chart, monthly_bar, style, to_month, yen
from lib.context import get_context, not_enough

# 併売分析の表に出す組み合わせの数（多い順）
TOP_PAIRS = 20
# 商品ランキング・都道府県別のグラフの高さ（px。2つ並べるので同じ高さにそろえる）
RANKING_HEIGHT = 420


def render() -> None:
    """ショップ画面を表示する。

    Returns:
        なし。"""
    # 変数の内容: ctx: 商品画面で使う集計済みデータコンテキスト。
    ctx = get_context()
    st.title("ショップ")
    st.caption("オンラインショップの注文（キャンセルを除く）")

    # 1. 有効な注文と、その注文の明細だけを使う
    orders = valid_orders(ctx.raw["orders"])
    # 変数の内容: items: 有効注文に属する商品明細。
    items = ctx.raw["order_items"]
    # 変数の内容: items: 有効注文に属する商品明細。
    items = items[items["order_id"].isin(orders["id"])]
    # 変数の内容: products: 商品テーブルの分析用データ。
    products = ctx.raw["products"]

    # 2. まとめの数字（件数が少なくても表示する）
    rep = repeat_summary(orders)
    # 変数の内容: c1〜c4: 注文数・売上・顧客数・リピート率を並べる画面列。
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("注文数", f"{len(orders)}件")
    c2.metric("売上（送料込み）", yen(orders["total"].sum()))
    c3.metric("平均注文額", yen(orders["total"].mean()) if len(orders) else "—")
    c4.metric("リピーター率", f"{rep['repeat_rate']:.0%}" if rep["customers"] else "—")

    # 3. 分析は注文がある程度たまってから。少ないうちは理由を出して在庫だけ見せる
    if len(orders) < MIN_ROWS_FOR_ANALYSIS:
        not_enough("有効な注文", len(orders), MIN_ROWS_FOR_ANALYSIS)
        st.caption("注文がたまると、月別の売上・商品ランキング・都道府県別・顧客分析（RFM）・併売分析が表示されます。")
        _stock(products)
        return

    # 4. 月ごとの売上
    monthly = orders.assign(month=to_month(orders["created_at"]))
    # 変数の内容: monthly: 月ごとに合計した注文売上と注文件数。
    monthly = monthly.groupby("month").agg(売上=("total", "sum"), 件数=("id", "count")).reset_index()
    # 変数の内容: fig: 画面に表示する Plotly グラフ。
    fig = monthly_bar(monthly["month"], monthly["売上"], "%{x|%Y年%-m月}<br>%{y:,.0f}円（%{customdata}件）<extra></extra>",
                      title="月ごとの売上", customdata=monthly["件数"])
    st.plotly_chart(style(fig, height=300), width="stretch")

    # 5. 商品ランキング（売上の多い順・上位 TOP_N）
    c1, c2 = st.columns(2)
    # 変数の内容: rank: 商品ごとの売上を集計したランキング。
    rank = (items.assign(amount=items["price"] * items["quantity"]).groupby("product_name")
            .agg(売上=("amount", "sum"), 個数=("quantity", "sum")).sort_values("売上").tail(TOP_N).reset_index())
    # 変数の内容: fig: 画面に表示する Plotly グラフ。
    fig = bar_chart(rank["売上"], rank["product_name"], "%{y}<br>%{x:,.0f}円（%{customdata}個）<extra></extra>",
                    title=f"商品別の売上（上位{TOP_N}）", customdata=rank["個数"])
    c1.plotly_chart(style(fig, height=RANKING_HEIGHT, yen_axis="x"), width="stretch")

    # 6. 都道府県別の注文数（上位 TOP_N）
    pref = orders["prefecture"].value_counts().sort_values().tail(TOP_N)
    # 変数の内容: fig: 画面に表示する Plotly グラフ。
    fig = bar_chart(pref.values, pref.index, "%{y}<br>%{x}件<extra></extra>", title=f"都道府県別の注文数（上位{TOP_N}）")
    c2.plotly_chart(style(fig, height=RANKING_HEIGHT, yen_axis=None), width="stretch")

    # 7. 顧客分析（RFM）：最近買ったか・何回買ったか・いくら買ったか。基準日はほかの画面と同じ「今日（日本時間）」
    st.subheader("顧客分析（RFM）")
    # 変数の内容: rfm: 顧客ごとの最終購入日・購入回数・購入額の分析表。
    rfm = rfm_table(orders, ctx.today)
    # 変数の内容: seg: 顧客区分ごとの人数・平均購入額。
    seg = rfm.groupby("segment").agg(人数=("customer_key", "count"), 平均購入額=("monetary", "mean")).reset_index()
    st.dataframe(seg.style.format({"平均購入額": "{:,.0f}円"}), hide_index=True, width="stretch")

    # 8. 併売分析：一緒に買われやすい商品の組み合わせ
    st.subheader("一緒に買われている商品")
    # 変数の内容: pairs: 同時購入された商品の組み合わせ。
    pairs = co_purchase_pairs(items)
    if pairs.empty:
        st.caption("2種類以上を同時に買った注文はまだありません。")
    else:
        st.dataframe(pairs.head(TOP_PAIRS), hide_index=True, width="stretch")

    _stock(products)


def _stock(products: pd.DataFrame) -> None:
    """公開中の商品の在庫一覧を表示する（在庫の少ない順）。

    Args:
        products: products テーブル

    Returns:
        なし。"""
    # 1. 公開中の商品だけを在庫数の少ない順に並べる。
    st.subheader("在庫")
    # 0件のとき is_published が object 型の空の列になり、そのまま使うと「列の選択」と解釈されるので真偽値にそろえる
    pub = products[products["is_published"].fillna(False).astype(bool)].sort_values("stock")
    # 2. 対象商品がなければ案内を表示し、一覧表は作らない。
    if pub.empty:
        st.caption("公開中の商品はありません。")
        return
    # 3. 商品名・カテゴリ・価格・在庫を整形して一覧表示する。
    st.dataframe(
        pd.DataFrame({"商品": pub["name"], "カテゴリ": pub["category"].fillna("—"), "価格": pub["price"], "在庫": pub["stock"]})
        .style.format({"価格": "{:,.0f}円"}),
        hide_index=True, width="stretch",
    )
