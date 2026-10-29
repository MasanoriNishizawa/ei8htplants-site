"""アクセス解析画面：GA4 のデータで、訪問者数・PV の推移、よく見られているページ、流入元、端末・地域を見る。"""

from collections.abc import Callable

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.analysis import CANCELLED
from lib.charts import SERIES, TOP_N, bar_chart, bar_height, style
from lib.context import get_context
from lib.ga import DEFAULT_REPORT_LIMIT, ga_config, label_paths, run_report

# 期間の選択肢：表示名 → (GA の開始日の書き方, 日数)
PERIODS = {"直近7日": ("7daysAgo", 7), "直近28日": ("28daysAgo", 28), "直近90日": ("90daysAgo", 90)}
# 期間の初期値
DEFAULT_PERIOD = "直近28日"

# 流入の種類（GA のチャネル名）を日本語にする
CHANNELS = {
    "Direct": "直接（URL入力・ブックマーク）",
    "Organic Search": "検索（Google など）",
    "Organic Social": "SNS（Instagram など）",
    "Referral": "他サイトのリンク",
    "Paid Search": "検索広告",
    "Paid Social": "SNS広告",
    "Email": "メール",
    "Unassigned": "不明",
}

# 端末の種類を日本語にする
DEVICES = {"mobile": "スマホ", "desktop": "パソコン", "tablet": "タブレット"}

# よく見られているページの集計で GA から取るページ数（同じページのクエリ違いをまとめる前の行数）
PAGE_REPORT_LIMIT = 200
# 参照元・地域のグラフに出す上位の件数
TOP_SOURCES = 10
# 横に2つ並べるグラフの高さ（px）
HALF_CHART_HEIGHT = 320
# WS 予約ページのパス（予約率の計算で、このページの PV を分母にする）
RESERVE_PATH = "/reserve"

# レポートを取る関数の型（ディメンション・指標・並べ替えの指標・行数 → 表）
Report = Callable[..., pd.DataFrame]


def _part_failed(kind: str) -> None:
    """2本目以降の GA レポートが取れなかったとき、その表の場所に表示できないことを出す。

    Args:
        kind: 表の種類名（例: "日ごとの訪問者数"）

    Returns:
        なし。"""
    st.warning(f"この表は表示できません（{kind}）。時間をおいて「データを再読み込み」を押してください。")


def _try_report(kind: str, report: Report, *args) -> pd.DataFrame | None:
    """GA のレポートを1つ取り、失敗したらその表の場所に知らせて None を返す（画面全体は止めない）。

    Args:
        kind: 表の種類名（失敗したときの表示に使う）
        report: レポートを取る関数
        *args: report に渡す引数

    Returns:
        取得した表。失敗したときは None
    """
    try:
        return report(*args)
    except Exception:  # 権限・通信・上限などの失敗は表ごとに受け止め、ほかの表は表示を続ける
        _part_failed(kind)
        return None


def render() -> None:
    """アクセス解析画面を表示する（会計年度では絞り込まないので、年度の選択欄は出さない）。

    Returns:
        なし。"""
    # 変数の内容: ctx: 年度フィルターを使わずに取得したアクセス解析用コンテキスト。
    ctx = get_context(use_year_filter=False)
    st.title("アクセス解析")

    # 1. 接続設定がまだなら、設定の手順を出して終わる
    # 変数の内容: cfg: GA4 接続設定。problem: 設定不足時に画面へ出す案内文。
    cfg, problem = ga_config()
    if cfg is None:
        _setup_guide(problem)
        return

    # 変数の内容: period: 画面で選択されたアクセス解析の期間名。
    period = st.segmented_control("期間", list(PERIODS), default=DEFAULT_PERIOD, key="ga_period") or DEFAULT_PERIOD
    # 変数の内容: start: GA レポートの開始日。；days: 選択期間の日数。
    start, days = PERIODS[period]

    def report(
        dims: tuple[str, ...], metrics: tuple[str, ...], order: str | None = None, limit: int = DEFAULT_REPORT_LIMIT
    ) -> pd.DataFrame:
        """選んだ期間で GA のレポートを取得する。

        Args:
            dims: ディメンション名
            metrics: 指標名
            order: 多い順に並べる指標名（None なら並べ替えない）
            limit: 最大行数

        Returns:
            run_report の結果
        """
        return run_report(cfg.property_id, cfg.credentials_ref, dims, metrics, start, "today", order, limit)

    # 2. 1本目（まとめの数字）が取れなければ、設定の問題とみなして画面全体で知らせる
    try:
        # 変数の内容: totals: 期間全体の訪問者数などをまとめた GA レポート。
        totals = report((), ("activeUsers", "sessions", "screenPageViews", "averageSessionDuration"))
    except Exception as e:  # 権限不足・ID 違いなどをまとめて受けて画面で知らせる
        # e: 利用者向け案内に例外の種類だけを示すための取得エラー。
        st.error(f"Google アナリティクスのデータを読み込めませんでした：{type(e).__name__}")
        st.caption("プロパティ ID と、サービスアカウントに「閲覧者」の権限を付けたかを確認してください。")
        return

    # 3. まとめの数字
    # 変数の内容: t: 期間全体の集計行。レポートが空なら各指標を0とする。
    t = totals.iloc[0] if len(totals) else pd.Series(0, index=totals.columns)
    if t["screenPageViews"] == 0:
        st.info("この期間のデータはまだありません。タグを入れてから反映まで 1〜2 日かかることがあります。")
        return
    # 変数の内容: c1〜c4: アクセス解析の主要指標を並べる画面列。
    # c1〜c4: 訪問者・訪問回数・PV・平均滞在時間を並べる画面列。
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("訪問者数", f"{int(t['activeUsers']):,}人")
    c2.metric("訪問回数", f"{int(t['sessions']):,}回")
    c3.metric("ページビュー", f"{int(t['screenPageViews']):,}PV")
    c4.metric("1回の平均滞在", f"{int(t['averageSessionDuration'] // 60)}分{int(t['averageSessionDuration'] % 60)}秒")

    # 4. 2本目以降の表は、取れなかったものだけ「表示できません」と出して続ける
    _daily(report)
    # 変数の内容: pages: ページ別の閲覧数・訪問者数を含む GA レポート。
    pages = _pages(ctx, report)
    _sources(report)
    _devices_and_regions(report)
    _reservation_rate(ctx, pages, days)


def _daily(report: Report) -> None:
    """日ごとの訪問者数を折れ線で表示する。

    Args:
        report: レポートを取る関数

    Returns:
        なし。"""
    # 1. 日別アクセスレポートを取得し、取得できなければこの図の表示を省略する。
    # 変数の内容: daily: 日別アクセスレポート。取得できなければ後続表示を行わない。
    daily = _try_report("日ごとの訪問者数", report, ("date",), ("activeUsers", "screenPageViews"))
    if daily is None:
        return
    # 2. 日付順に並べ替え、訪問者数とページビューの推移を折れ線図にする。
    # 変数の内容: daily: 日別アクセスレポート。取得できなければ後続表示を行わない。
    daily = daily.sort_values("date")
    # 変数の内容: fig: 日別アクティブユーザー数の推移を描画する Plotly 図。
    fig = go.Figure(go.Scatter(
        x=daily["date"], y=daily["activeUsers"], mode="lines+markers", line=dict(color=SERIES[0], width=2),
        marker=dict(size=8), customdata=daily["screenPageViews"],
        hovertemplate="%{x|%-m/%-d}<br>訪問者 %{y}人<br>%{customdata}PV<extra></extra>",
    ))
    # 3. 日付・人数の表示形式を整えて画面に描画する。
    fig.update_layout(title="日ごとの訪問者数", showlegend=False)
    fig.update_xaxes(tickformat="%-m/%-d")
    fig.update_yaxes(ticksuffix="人", rangemode="tozero")
    st.plotly_chart(style(fig, height=300, yen_axis=None), width="stretch")


def _pages(ctx, report: Report) -> pd.DataFrame | None:
    """よく見られているページ（上位 TOP_N）を横棒で表示する。

    Args:
        ctx: get_context の結果（イベント・商品の名前を使う）
        report: レポートを取る関数

    Returns:
        ページごとの PV の表（予約率の計算に使う）。取れなかったときは None
    """
    st.subheader("よく見られているページ")
    # 変数の内容: pages: ページ別閲覧数のレポート。
    pages = _try_report("よく見られているページ", report, ("pagePath",), ("screenPageViews", "activeUsers"),
                        "screenPageViews", PAGE_REPORT_LIMIT)
    if pages is None:
        return None
    # 1. パスを名前に置き換え、同じ名前（クエリ違いなど）はまとめる
    pages["page"] = label_paths(pages["pagePath"], ctx.raw["events"], ctx.raw["products"])
    # 変数の内容: top: ページ名ごとに閲覧数と訪問者数を合算した表。
    top = pages.groupby("page", as_index=False)[["screenPageViews", "activeUsers"]].sum()
    # 変数の内容: top: ページ名ごとに閲覧数と訪問者数を合算した表。
    top = top.sort_values("screenPageViews").tail(TOP_N)
    # 2. 横棒で表示する
    # fig: ページ別閲覧数を横棒で示すグラフ。
    fig = bar_chart(
        top["screenPageViews"], top["page"], "%{y}<br>%{x}PV（%{customdata}人）<extra></extra>",
        text=top["screenPageViews"].astype(int).astype(str) + "PV", customdata=top["activeUsers"],
    )
    st.plotly_chart(style(fig, height=bar_height(len(top), per_bar=30, minimum=260, extra=60), yen_axis=None),
                    width="stretch")
    return pages


def _sources(report: Report) -> None:
    """どこから来たか（流入の種類と、具体的な参照元）を横に並べて表示する。

    Args:
        report: レポートを取る関数

    Returns:
        なし。"""
    st.subheader("どこから来たか")
    # 変数の内容: c1, c2: 流入元グラフを横並びにする左側のレイアウト列。
    c1, c2 = st.columns(2)
    # 1. 流入の種類（GA のチャネル名を日本語にする）
    with c1:
        # 変数の内容: ch: GA のチャネル別訪問回数。
        ch = _try_report("流入の種類", report, ("sessionDefaultChannelGroup",), ("sessions",), "sessions")
        if ch is not None:
            ch["name"] = ch["sessionDefaultChannelGroup"].map(lambda c: CHANNELS.get(c, c))
            # 変数の内容: ch: GA のチャネル別訪問回数。
            ch = ch.sort_values("sessions")
            # 変数の内容: fig: 画面に表示する Plotly グラフ。
            fig = bar_chart(ch["sessions"], ch["name"], "%{y}<br>%{x}回<extra></extra>", title="流入の種類（訪問回数）")
            st.plotly_chart(style(fig, height=HALF_CHART_HEIGHT, yen_axis=None), width="stretch")
    # 2. 参照元（上位 TOP_SOURCES）
    with c2:
        # 変数の内容: src: GA の参照元別訪問回数。
        src = _try_report("参照元", report, ("sessionSource",), ("sessions",), "sessions", TOP_SOURCES)
        if src is not None:
            # 変数の内容: src: GA の参照元別訪問回数。
            src = src.sort_values("sessions")
            # 変数の内容: fig: 画面に表示する Plotly グラフ。
            fig = bar_chart(src["sessions"], src["sessionSource"], "%{y}<br>%{x}回<extra></extra>",
                            title=f"参照元（上位{TOP_SOURCES}）")
            st.plotly_chart(style(fig, height=HALF_CHART_HEIGHT, yen_axis=None), width="stretch")


def _devices_and_regions(report: Report) -> None:
    """端末の割合と、地域（上位 TOP_SOURCES）を横に並べて表示する。

    Args:
        report: レポートを取る関数

    Returns:
        なし。"""
    # 変数の内容: c1, c2: 端末・地域グラフを横並びにする左側のレイアウト列。
    c1, c2 = st.columns(2)
    # 1. 端末ごとの訪問者の割合
    with c1:
        st.subheader("端末")
        # 変数の内容: dev: GA の端末別訪問者数。
        dev = _try_report("端末", report, ("deviceCategory",), ("activeUsers",), "activeUsers")
        if dev is not None:
            # 変数の内容: total_users: 端末別訪問者数の合計。
            total_users = dev["activeUsers"].sum()
            for _, r in dev.iterrows():
                # 変数の内容: share: 全訪問者に対する現在の端末の訪問者割合。
                share = r["activeUsers"] / total_users if total_users else 0
                st.metric(DEVICES.get(r["deviceCategory"], r["deviceCategory"]), f"{share:.0%}",
                          help=f"{int(r['activeUsers'])}人")
    # 2. 地域ごとの訪問者数
    with c2:
        # 変数の内容: reg: GA の地域別訪問者数。
        reg = _try_report("地域", report, ("region",), ("activeUsers",), "activeUsers", TOP_SOURCES)
        if reg is not None:
            # 変数の内容: reg: GA の地域別訪問者数。
            reg = reg.sort_values("activeUsers")
            # 変数の内容: fig: 画面に表示する Plotly グラフ。
            fig = bar_chart(reg["activeUsers"], reg["region"], "%{y}<br>%{x}人<extra></extra>",
                            title=f"地域（上位{TOP_SOURCES}）")
            st.plotly_chart(style(fig, height=HALF_CHART_HEIGHT, yen_axis=None), width="stretch")


def _reservation_rate(ctx, pages: pd.DataFrame | None, days: int) -> None:
    """WS 予約ページを見た数に対して、同じ期間に実際に予約された割合を表示する。

    Args:
        ctx: get_context の結果（WS 予約・今日を使う）
        pages: _pages の結果（取れなかったときは None）
        days: 選んだ期間の日数

    Returns:
        なし。"""
    st.subheader("WS 予約ページからの予約率")
    if pages is None:
        _part_failed("WS 予約ページからの予約率")
        return
    # 1. 予約ページの PV（クエリ違いもまとめる）
    # reserve_pv: クエリ文字列を除いた予約ページの合計PV。
    reserve_pv = int(pages.loc[pages["pagePath"].str.split("?").str[0] == RESERVE_PATH, "screenPageViews"].sum())
    # 2. 同じ期間に入った予約のうち、キャンセルされていないものを数える
    # raw: 期間選択に使う問い合わせではなく、全予約レコード。
    raw = ctx.raw["workshop_reservations"]
    # 変数の内容: res: キャンセル状態を除外したワークショップ予約。
    res = raw[raw["status"] != CANCELLED]
    # 変数の内容: since: 選択期間の開始日時。
    since = ctx.today - pd.Timedelta(days=days)
    # 変数の内容: booked: 選択期間内に作成された有効予約件数。
    booked = int((res["created_at"].dt.tz_localize(None) >= since).sum()) if not res.empty else 0
    # 変数の内容: c1〜c3: 予約ページPV・予約件数・予約率を並べる画面列。
    # c1〜c3: 予約ページPV・有効予約件数・予約率を並べる画面列。
    c1, c2, c3 = st.columns(3)
    c1.metric("予約ページの PV", f"{reserve_pv:,}PV")
    c2.metric("同じ期間の予約件数（キャンセル除く）", f"{booked}件")
    c3.metric("予約率", f"{booked / reserve_pv:.0%}" if reserve_pv else "—",
              help="キャンセルされていない予約の件数 ÷ 予約ページの PV")


def _setup_guide(problem: str | None) -> None:
    """GA との接続の設定手順を表示する。

    Args:
        problem: 今の設定で足りないものの説明

    Returns:
        なし。"""
    # 1. 接続設定の問題を警告として示す。
    st.warning(problem or "Google アナリティクスとの接続が設定されていません。")
    st.markdown(
        """
**設定の手順（最初の1回だけ）**

1. [Google Cloud コンソール](https://console.cloud.google.com/) でプロジェクトを作る（既存のものでも可）
2. 「API とサービス → ライブラリ」で **Google Analytics Data API** を有効にする
3. 「IAM と管理 → サービスアカウント」でサービスアカウントを作り、「鍵 → 鍵を追加 → JSON」で鍵ファイルをダウンロードする
4. 鍵ファイルを **リポジトリの外**（例: `~/.config/ei8htplants/ga-service-account.json`）に置く
5. Google アナリティクスの「管理 → プロパティのアクセス管理」で、サービスアカウントのメールアドレス（`…@….iam.gserviceaccount.com`）を **閲覧者** として追加する
6. 「管理 → プロパティの詳細」で **プロパティ ID**（数字）を確認する
7. **ローカル**: リポジトリ直下の `.env` に次の2行を足して、このアプリを再起動する

```
GA_PROPERTY_ID=123456789
GA_CREDENTIALS=/Users/（ユーザー名）/.config/ei8htplants/ga-service-account.json
```

8. **Streamlit Community Cloud**: アプリの Settings → Secrets に、プロパティ ID と鍵ファイルの中身を入れて保存する
   （鍵ファイルは置けないので、中身をそのまま `GA_CREDENTIALS_JSON` に貼る。`'''` で囲む）

```
GA_PROPERTY_ID = "123456789"
GA_CREDENTIALS_JSON = '''
{ 鍵ファイルの中身をそのまま貼り付ける }
'''
```
"""
    )
    # 2. 鍵情報の取り扱い上の注意を、設定手順の下に表示する。
    st.caption("鍵ファイル（とその中身）はパスワードと同じ扱いです。リポジトリに入れたり、人に送ったりしないでください。")
