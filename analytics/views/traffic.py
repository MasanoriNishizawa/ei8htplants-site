"""アクセス解析画面：GA4 のデータで、訪問者数・PV の推移、よく見られているページ、流入元、端末・地域を見る。"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.charts import SERIES, style
from lib.context import get_context
from lib.ga import ga_config, label_paths, run_report

# 期間の選択肢：表示名 → (GA の開始日の書き方, 日数)
PERIODS = {"直近7日": ("7daysAgo", 7), "直近28日": ("28daysAgo", 28), "直近90日": ("90daysAgo", 90)}

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


def render() -> None:
    """アクセス解析画面を表示する。"""
    ctx = get_context()
    st.title("アクセス解析")

    # 1. 接続設定がまだなら、設定の手順を出して終わる
    cfg, problem = ga_config()
    if cfg is None:
        _setup_guide(problem)
        return

    period = st.segmented_control("期間", list(PERIODS), default="直近28日", key="ga_period") or "直近28日"
    start, days = PERIODS[period]

    def report(dims: tuple[str, ...], metrics: tuple[str, ...], order: str | None = None, limit: int = 1000):
        """選んだ期間で GA のレポートを取得する（引数は run_report と同じ）。"""
        return run_report(cfg.property_id, str(cfg.credentials_path), dims, metrics, start, "today", order, limit)

    try:
        totals = report((), ("activeUsers", "sessions", "screenPageViews", "averageSessionDuration"))
    except Exception as e:  # 権限不足・ID 違いなどをまとめて受けて画面で知らせる
        st.error(f"Google アナリティクスのデータを読み込めませんでした：{type(e).__name__}")
        st.caption("プロパティ ID と、サービスアカウントに「閲覧者」の権限を付けたかを確認してください。")
        return

    # 2. まとめの数字
    t = totals.iloc[0] if len(totals) else pd.Series(0, index=totals.columns)
    if t["screenPageViews"] == 0:
        st.info("この期間のデータはまだありません。タグを入れてから反映まで 1〜2 日かかることがあります。")
        return
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("訪問者数", f"{int(t['activeUsers']):,}人")
    c2.metric("訪問回数", f"{int(t['sessions']):,}回")
    c3.metric("ページビュー", f"{int(t['screenPageViews']):,}PV")
    c4.metric("1回の平均滞在", f"{int(t['averageSessionDuration'] // 60)}分{int(t['averageSessionDuration'] % 60)}秒")

    # 3. 日ごとの訪問者数
    daily = report(("date",), ("activeUsers", "screenPageViews")).sort_values("date")
    fig = go.Figure(go.Scatter(
        x=daily["date"], y=daily["activeUsers"], mode="lines+markers", line=dict(color=SERIES[0], width=2),
        marker=dict(size=8), customdata=daily["screenPageViews"],
        hovertemplate="%{x|%-m/%-d}<br>訪問者 %{y}人<br>%{customdata}PV<extra></extra>",
    ))
    fig.update_layout(title="日ごとの訪問者数", showlegend=False)
    fig.update_xaxes(tickformat="%-m/%-d")
    fig.update_yaxes(ticksuffix="人", rangemode="tozero")
    st.plotly_chart(style(fig, height=300, yen_axis=None), width="stretch")

    # 4. よく見られているページ（上位15）
    st.subheader("よく見られているページ")
    pages = report(("pagePath",), ("screenPageViews", "activeUsers"), "screenPageViews", 200)
    pages["page"] = label_paths(pages["pagePath"], ctx.raw["events"], ctx.raw["products"])
    top = pages.groupby("page", as_index=False)[["screenPageViews", "activeUsers"]].sum()
    top = top.sort_values("screenPageViews").tail(15)
    fig = go.Figure(go.Bar(
        x=top["screenPageViews"], y=top["page"], orientation="h", marker_color=SERIES[0],
        text=top["screenPageViews"].astype(int).astype(str) + "PV", textposition="outside", cliponaxis=False,
        customdata=top["activeUsers"], hovertemplate="%{y}<br>%{x}PV（%{customdata}人）<extra></extra>",
    ))
    fig.update_xaxes(range=[0, top["screenPageViews"].max() * 1.15])
    fig.update_layout(showlegend=False)
    st.plotly_chart(style(fig, height=max(260, 30 * len(top) + 60), yen_axis=None), width="stretch")

    # 5. どこから来たか（流入の種類と、具体的な参照元）
    st.subheader("どこから来たか")
    c1, c2 = st.columns(2)
    ch = report(("sessionDefaultChannelGroup",), ("sessions",), "sessions")
    ch["name"] = ch["sessionDefaultChannelGroup"].map(lambda c: CHANNELS.get(c, c))
    ch = ch.sort_values("sessions")
    fig = go.Figure(go.Bar(x=ch["sessions"], y=ch["name"], orientation="h", marker_color=SERIES[0],
                           hovertemplate="%{y}<br>%{x}回<extra></extra>"))
    fig.update_layout(title="流入の種類（訪問回数）", showlegend=False)
    c1.plotly_chart(style(fig, height=320, yen_axis=None), width="stretch")
    src = report(("sessionSource",), ("sessions",), "sessions", 10).sort_values("sessions")
    fig = go.Figure(go.Bar(x=src["sessions"], y=src["sessionSource"], orientation="h", marker_color=SERIES[0],
                           hovertemplate="%{y}<br>%{x}回<extra></extra>"))
    fig.update_layout(title="参照元（上位10）", showlegend=False)
    c2.plotly_chart(style(fig, height=320, yen_axis=None), width="stretch")

    # 6. 端末と地域
    c1, c2 = st.columns(2)
    dev = report(("deviceCategory",), ("activeUsers",), "activeUsers")
    total_users = dev["activeUsers"].sum()
    with c1:
        st.subheader("端末")
        for _, r in dev.iterrows():
            share = r["activeUsers"] / total_users if total_users else 0
            st.metric(DEVICES.get(r["deviceCategory"], r["deviceCategory"]), f"{share:.0%}", help=f"{int(r['activeUsers'])}人")
    reg = report(("region",), ("activeUsers",), "activeUsers", 10).sort_values("activeUsers")
    fig = go.Figure(go.Bar(x=reg["activeUsers"], y=reg["region"], orientation="h", marker_color=SERIES[0],
                           hovertemplate="%{y}<br>%{x}人<extra></extra>"))
    fig.update_layout(title="地域（上位10）", showlegend=False)
    c2.plotly_chart(style(fig, height=320, yen_axis=None), width="stretch")

    # 7. 予約ページを見た人のうち、実際に予約した割合
    st.subheader("WS 予約ページからの予約率")
    reserve_pv = int(pages.loc[pages["pagePath"].str.split("?").str[0] == "/reserve", "screenPageViews"].sum())
    res = ctx.raw["workshop_reservations"]
    since = ctx.today - pd.Timedelta(days=days)
    booked = int((res["created_at"].dt.tz_localize(None) >= since).sum()) if not res.empty else 0
    c1, c2, c3 = st.columns(3)
    c1.metric("予約ページの PV", f"{reserve_pv:,}PV")
    c2.metric("同じ期間の予約件数", f"{booked}件")
    c3.metric("予約率", f"{booked / reserve_pv:.0%}" if reserve_pv else "—", help="予約件数 ÷ 予約ページの PV")


def _setup_guide(problem: str | None) -> None:
    """GA との接続の設定手順を表示する。

    Args:
        problem: 今の設定で足りないものの説明
    """
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
7. リポジトリ直下の `.env` に次の2行を足して、このアプリを再起動する

```
GA_PROPERTY_ID=123456789
GA_CREDENTIALS=/Users/（ユーザー名）/.config/ei8htplants/ga-service-account.json
```
"""
    )
    st.caption("鍵ファイルはパスワードと同じ扱いです。リポジトリに入れたり、人に送ったりしないでください。")
