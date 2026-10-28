"""グラフの見た目を揃えるための共通設定（色・線の太さ・余白・ホバー）と、よく使うグラフの部品。

色は検証済みの配色（カテゴリ8色・連続色・正負の2色）をそのまま使う。
カテゴリ色は決まった順番で割り当て、絞り込みで系列が減っても色を変えない。
"""

from __future__ import annotations

from collections.abc import Sequence

import pandas as pd
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

# 正負を表す2色（黒字＝青、赤字＝赤）。カテゴリ色の青と赤と同じ値を使う
POSITIVE = SERIES[0]
NEGATIVE = SERIES[7]

# 連続量（大きいほど濃い）の青の段階。薄い→濃い
SEQUENTIAL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]
# ヒートマップの colorscale に渡す形（[位置 0〜1, 色] の組のリスト）にした SEQUENTIAL
SEQUENTIAL_SCALE = [[i / (len(SEQUENTIAL) - 1), c] for i, c in enumerate(SEQUENTIAL)]

# 文字・軸・罫線の色
INK_PRIMARY = "#0b0b0b"  # 見出し・値
INK_SECONDARY = "#52514e"  # 凡例・補足
INK_MUTED = "#898781"  # 軸の目盛り
GRID = "#e1e0d9"  # 罫線（控えめにする）
BASELINE = "#c3c2b7"  # 0 の基準線
SURFACE = "#fcfcfb"  # グラフの背景

# 日本語が読みやすいフォントの候補
FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Segoe UI", sans-serif'

# ランキングのグラフに出す上位の件数（商品・都道府県・ページ・タグなど）
TOP_N = 15

# 棒の外に出す値のラベルが右端で切れないよう、軸の最大値に掛ける余白の倍率（1.15 なら 15% 広げる）
LABEL_PAD = 1.15

# 横棒グラフで、棒1本あたりに取る高さ（px）と、グラフ全体の最低の高さ（px）
BAR_ROW_HEIGHT = 28
MIN_BAR_CHART_HEIGHT = 320

# グラフの軸に出すイベント名の最大文字数（これより長い名前は「…」で切る）
EVENT_LABEL_LENGTH = 18


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


def pct(numerator: float, denominator: float) -> str:
    """割合を「12%」の形にする。分母が 0 のときは割合を出せないので「—」にする。

    Args:
        numerator: 分子
        denominator: 分母

    Returns:
        表示用の文字列
    """
    return f"{numerator / denominator:.0%}" if denominator else "—"


def bar_height(n: int, per_bar: int = BAR_ROW_HEIGHT, minimum: int = MIN_BAR_CHART_HEIGHT, extra: int = 0) -> int:
    """横棒グラフの高さを、棒の本数に合わせて決める（棒が多いほど高くし、少なくても minimum は確保する）。

    Args:
        n: 棒の本数
        per_bar: 棒1本あたりの高さ（px）
        minimum: 最低の高さ（px）
        extra: タイトルや軸のために足す高さ（px）

    Returns:
        グラフの高さ（px）
    """
    return max(minimum, per_bar * n + extra)


def bar_chart(
    x: Sequence,
    y: Sequence,
    hovertemplate: str,
    *,
    title: str | None = None,
    horizontal: bool = True,
    text: Sequence[str] | None = None,
    customdata: Sequence | None = None,
    color: str = SERIES[0],
) -> go.Figure:
    """1系列だけの棒グラフ（凡例なし）を作る。ランキングや件数の表示で共通に使う。

    Args:
        x: 横軸の値（横棒なら棒の長さ）
        y: 縦軸の値（横棒なら項目名）
        hovertemplate: マウスを乗せたときの表示（Plotly の書式）
        title: グラフのタイトル（None なら付けない）
        horizontal: True なら横棒、False なら縦棒
        text: 棒の外に出す値のラベル（None なら出さない）。出すときは値の軸を LABEL_PAD 倍に広げる
        customdata: hovertemplate の %{customdata} で参照する値
        color: 棒の色

    Returns:
        棒グラフ（見た目は style で整える）
    """
    # 1. 棒を1本の系列として作る
    fig = go.Figure(go.Bar(
        x=x, y=y, orientation="h" if horizontal else "v", marker_color=color,
        customdata=customdata, hovertemplate=hovertemplate,
    ))
    fig.update_layout(showlegend=False)
    if title:
        fig.update_layout(title=title)
    # 2. 値のラベルを棒の外に出すときは、ラベルが切れないように値の軸の範囲を広げる
    if text is not None:
        fig.update_traces(text=text, textposition="outside", cliponaxis=False)
        values = pd.Series(x if horizontal else y, dtype=float)
        top = float(values.max()) if len(values) else 0.0
        if top > 0:
            if horizontal:
                fig.update_xaxes(range=[0, top * LABEL_PAD])
            else:
                fig.update_yaxes(range=[0, top * LABEL_PAD])
    return fig


def to_month(times: pd.Series) -> pd.Series:
    """日時の列を「その月の1日」（時刻・タイムゾーンなし）にそろえる。月ごとの集計に使う。

    Args:
        times: 日時の列（タイムゾーン付きでも無しでもよい。付きならその時刻のまま外す）

    Returns:
        月初の日付の列
    """
    if getattr(times.dt, "tz", None) is not None:
        # 変数の内容: times: 日付列をタイムゾーンなしにそろえ、月単位の集計に使う。
        times = times.dt.tz_localize(None)
    return times.dt.to_period("M").dt.to_timestamp()


def monthly_bar(
    months: Sequence,
    values: Sequence,
    hovertemplate: str,
    *,
    title: str | None = None,
    customdata: Sequence | None = None,
    color: str = SERIES[0],
) -> go.Figure:
    """月ごとの縦棒グラフを作る（横軸は「2026/4」の形で1か月ごとに目盛りを付ける）。

    Args:
        months: 月初の日付（to_month の結果）
        values: 月ごとの値
        hovertemplate: マウスを乗せたときの表示（Plotly の書式）
        title: グラフのタイトル（None なら付けない）
        customdata: hovertemplate の %{customdata} で参照する値
        color: 棒の色

    Returns:
        棒グラフ（見た目は style で整える）
    """
    # 変数の内容: fig: 月別の値を月目盛りで表示する Plotly 棒グラフ。
    fig = bar_chart(months, values, hovertemplate, title=title, horizontal=False, customdata=customdata, color=color)
    fig.update_xaxes(tickformat="%Y/%-m", dtick="M1")
    return fig


def short_label(name: str, n: int = EVENT_LABEL_LENGTH) -> str:
    """長い名前をグラフの軸に収まる長さに切る。

    Args:
        name: 名前（前後の空白は取り除く。文字列でなければ「（名前なし）」）
        n: 最大文字数

    Returns:
        切り詰めた名前（切ったときは末尾に「…」）
    """
    # 変数の内容: name: グラフ表示用に前後の空白を除いた名前。未入力値は代替名にする。
    name = name.strip() if isinstance(name, str) else "（名前なし）"
    return name if len(name) <= n else name[: n - 1] + "…"


def unique_labels(labels: Sequence[str]) -> list[str]:
    """同じ文字列が2回目以降に出てきたら「（2）」「（3）」と連番を付けて、すべて別の文字列にする。

    Plotly の棒グラフは同じ項目名の棒を1本にまとめてしまうため、軸の項目名が重ならないようにする。

    Args:
        labels: 項目名の並び

    Returns:
        重なりのない項目名のリスト（並びは同じ。1回目に出てきたものはそのまま）
    """
    # 変数の内容: seen: 同名ラベルが何回目に現れたかを記録する辞書。
    seen: dict[str, int] = {}
    # 変数の内容: out: 重複を避けた表示ラベルを入力順に集めるリスト。
    out: list[str] = []
    for label in labels:
        # 1. その文字列が何回目かを数える
        seen[label] = seen.get(label, 0) + 1
        candidate = label if seen[label] == 1 else f"{label}（{seen[label]}）"
        # 2. 連番を付けた結果が別の項目名と重なるときは、さらに番号を進める
        while candidate in out:
            seen[label] += 1
            candidate = f"{label}（{seen[label]}）"
        out.append(candidate)
    return out


def event_labels(dates: pd.Series, names: pd.Series, n: int = EVENT_LABEL_LENGTH) -> list[str]:
    """イベントをグラフの軸に出す名前「2026/4/12 イベント名」を作る（重なるときは連番を付ける）。

    年を入れるので、毎年同じ日に開く同じ名前のイベントも別の棒になる。

    Args:
        dates: 開催日の列
        names: イベント名の列（dates と同じ並び）
        n: イベント名の最大文字数

    Returns:
        軸に出す名前のリスト（dates と同じ並び。すべて別の文字列）
    """
    # 変数の内容: raw: 開催日と短縮名を組み合わせた、グラフ軸用ラベル。
    raw = [
        f"{d.strftime('%Y/%-m/%-d')} {short_label(name, n)}" if pd.notna(d) else short_label(name, n)
        for d, name in zip(dates, names)
    ]
    return unique_labels(raw)
