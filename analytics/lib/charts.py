"""グラフの見た目を揃えるための共通設定（色・線の太さ・余白・ホバー）。

色は検証済みの配色（カテゴリ8色・連続色・正負の2色）をそのまま使う。
カテゴリ色は決まった順番で割り当て、絞り込みで系列が減っても色を変えない。
"""

from __future__ import annotations

import plotly.graph_objects as go

# カテゴリ色（系列の区別用）。この順番で使い、使い回し・自動生成はしない
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]

# ブランドごとの色。どの画面でも同じブランドは同じ色にする（3色までは散布図でも見分けられる組み合わせ）
BRAND_COLORS = {
    "ei8ht plants": SERIES[0],
    "Habitat Oides": SERIES[1],
    "HUE by ei8ht plants": SERIES[2],
}

# 支出の内訳ごとの色（積み上げ棒グラフで隣り合う順番に並べてある）
EXPENSE_COLORS = {
    "出店料": SERIES[0],
    "移動費": SERIES[1],
    "高速代": SERIES[2],
    "宿泊費": SERIES[3],
    "その他": SERIES[4],
    "WS資材費": SERIES[5],
    "手伝い支払い": SERIES[6],
}

# 正負を表す2色（黒字＝青、赤字＝赤）
POSITIVE = "#2a78d6"
NEGATIVE = "#e34948"

# 連続量（大きいほど濃い）の青の段階。薄い→濃い
SEQUENTIAL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]

# 文字・軸・罫線の色
INK_PRIMARY = "#0b0b0b"  # 見出し・値
INK_SECONDARY = "#52514e"  # 凡例・補足
INK_MUTED = "#898781"  # 軸の目盛り
GRID = "#e1e0d9"  # 罫線（控えめにする）
BASELINE = "#c3c2b7"  # 0 の基準線
SURFACE = "#fcfcfb"  # グラフの背景

# 日本語が読みやすいフォントの候補
FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Segoe UI", sans-serif'


def style(fig: go.Figure, height: int = 360, yen_axis: str | None = "y") -> go.Figure:
    """グラフに共通の見た目を当てる。

    Args:
        fig: 対象のグラフ
        height: 高さ（px）
        yen_axis: 金額を表す軸（"x" / "y"）。指定した軸の目盛りを「円」表記にする。None なら何もしない

    Returns:
        見た目を整えたグラフ（同じオブジェクト）
    """
    # 1. 背景・フォント・余白・凡例の位置（グラフの上に横並び）
    fig.update_layout(
        height=height,
        paper_bgcolor=SURFACE,
        plot_bgcolor=SURFACE,
        font=dict(family=FONT, color=INK_SECONDARY, size=13),
        margin=dict(l=8, r=8, t=72 if fig.layout.title.text else 40, b=8),
        title=dict(x=0, xanchor="left", y=1, yanchor="top", yref="container", pad=dict(t=8, l=4)),
        legend=dict(orientation="h", yanchor="bottom", y=1.01, xanchor="left", x=0, title_text="", traceorder="normal"),
        hoverlabel=dict(bgcolor="white", font=dict(family=FONT, color=INK_PRIMARY)),
        bargap=0.3,
    )
    # 2. 軸と罫線は控えめな色にし、0 の基準線だけ少し濃くする
    axis = dict(gridcolor=GRID, zerolinecolor=BASELINE, linecolor=BASELINE, tickfont=dict(color=INK_MUTED))
    fig.update_xaxes(**axis, showgrid=False)
    fig.update_yaxes(**axis)
    # 3. 金額の軸は「¥1.2万」ではなく桁区切りの円表記にする
    if yen_axis == "y":
        fig.update_yaxes(tickformat=",.0f", ticksuffix="円")
    elif yen_axis == "x":
        fig.update_xaxes(tickformat=",.0f", ticksuffix="円")
    # 4. 棒の先端を少し丸め、棒どうしの間に背景色の細い隙間を入れる
    fig.update_traces(marker=dict(cornerradius=4, line=dict(color=SURFACE, width=2)), selector=dict(type="bar"))
    return fig


def yen(value: float) -> str:
    """金額を「12,345円」の形にする（マイナスは「−」付き）。

    Args:
        value: 金額

    Returns:
        表示用の文字列
    """
    return f"{value:,.0f}円".replace("-", "−")
