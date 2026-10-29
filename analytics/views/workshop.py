"""ワークショップ画面：予約数・キャンセル率・時間枠の埋まり具合・予約のタイミング・リピーター。"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.analysis import active_reservations, repeat_summary, session_fill_rates
from lib.charts import SEQUENTIAL_SCALE, SERIES, bar_chart, bar_height, event_labels, pct, style
from lib.context import Context, get_context, no_data

# 曜日の表示名（pandas の dayofweek の 0=月曜 〜 6=日曜 の順）
WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"]
# 予約が入った時間帯を何時間ごとにまとめるか（3 なら 0時台〜・3時台〜…の8区分）
HOUR_BIN = 3
# 「直前の予約」とみなす日数（参加日のこの日数前まで）と、「早めの予約」とみなす日数（この日数前より前）
SHORT_LEAD_DAYS = 3
# 予約が参加日の7日以上前なら「早め」と数える境界（日）
EARLY_LEAD_DAYS = 7
# イベントごとの予約人数のグラフで、軸に出すイベント名の最大文字数
WS_EVENT_LABEL_LENGTH = 22


def render() -> None:
    """ワークショップ画面を表示する。

    Returns:
        なし。"""
    # 変数の内容: ctx: ワークショップ画面で使う集計済みデータコンテキスト。
    ctx = get_context()
    st.title("ワークショップ")
    st.caption(ctx.year_label)

    # 変数の内容: res: ワークショップの申込レコード一覧。
    res = ctx.res
    if res.empty:
        no_data("WS 予約")
        return
    # 変数の内容: active: キャンセル済みを除いたワークショップ申込一覧。
    active = active_reservations(res)

    # 1. まとめの数字（キャンセルだけでも件数とキャンセル率は出す）
    _summary(res, active)
    if active.empty:
        st.info("有効な予約がありません（すべてキャンセルされています）。")
        return

    # 2. 以降は有効な予約（キャンセル除く）で分析する
    _by_event(active)
    _fill_rates(ctx, res)
    _lead_time(active)
    _booking_time(active)


def _summary(res: pd.DataFrame, active: pd.DataFrame) -> None:
    """まとめの数字（予約件数・人数・キャンセル率・リピーター・持ち込みの割合）を表示する。

    Args:
        res: 予約の表（キャンセル含む）
        active: 有効な予約（キャンセル除く）

    Returns:
        なし。"""
    # 1. リピーターは「異なるイベントで予約した数」で数える（同じイベントの2枠は1回）
    # 変数の内容: rep: 異なるイベントを基準にした利用者数・リピーター数の集計。
    rep = repeat_summary(active, unit="event_id")
    # 変数の内容: c1〜c4: 予約件数・人数・キャンセル率・リピーター数を並べる画面列。
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("予約件数（キャンセル含む）", f"{len(res)}件")
    c2.metric("予約人数（キャンセル除く）", f"{int(active['participants'].sum())}人")
    c3.metric("キャンセル率", pct(int(res["is_cancelled"].sum()), len(res)))
    c4.metric("リピーター", f"{rep['repeaters']} / {rep['customers']}人",
              help="2つ以上のイベントで予約した人（メールアドレスで判定。同じイベントの複数の枠は1回と数える）")
    # 2. 持ち込みの割合（有効な予約が無いときは「—」）
    # c1 / c2: 植物持ち込みと鉢持ち込みの割合を並べる画面列。
    c1, c2 = st.columns(2)
    c1.metric("植物の持ち込み", pct(int(active["bring_plant"].fillna(False).astype(bool).sum()), len(active)))
    c2.metric("鉢の持ち込み", pct(int(active["bring_pot"].fillna(False).astype(bool).sum()), len(active)))


def _by_event(active: pd.DataFrame) -> None:
    """イベントごとの予約人数を横棒で表示する（新しいイベントを上に並べる）。

    Args:
        active: 有効な予約

    Returns:
        なし。"""
    # 1. イベントごとに人数を合計する（同じ名前のイベントでも別の回は別の行にする）
    # 変数の内容: by_event: イベントごとに予約人数を合計した開催日順の表。
    by_event = (
        active.groupby("event_id", dropna=False)
        .agg(event_name=("event_name", "first"), start_date=("start_date", "first"), participants=("participants", "sum"))
        .reset_index()
        .sort_values("start_date")
    )
    # 2. 横棒は下から積まれるので、開催日の古い順に渡すと新しいイベントが上に来る。
    #    軸の名前には年を入れ、同じ名前が残るときは連番を付ける
    # labels: 横棒グラフのイベント名表示。開催年を含み、同名回は区別する。
    labels = event_labels(by_event["start_date"], by_event["event_name"], WS_EVENT_LABEL_LENGTH)
    # 変数の内容: fig: 画面に表示する Plotly グラフ。
    fig = bar_chart(
        by_event["participants"], labels, "%{customdata}<br>%{x}人<extra></extra>",
        title="イベントごとの予約人数", text=by_event["participants"].astype(int).astype(str) + "人",
        customdata=by_event["event_name"],
    )
    fig.update_xaxes(ticksuffix="人")
    st.plotly_chart(style(fig, height=bar_height(len(by_event), per_bar=40, minimum=240, extra=80), yen_axis=None),
                    width="stretch")


def _fill_rates(ctx: Context, res: pd.DataFrame) -> None:
    """時間枠ごとの埋まり具合をヒートマップで表示する（濃いほど埋まっている）。

    Args:
        ctx: get_context の結果（ws_sessions・events を使う）
        res: 予約の表（キャンセル含む。埋まり具合の計算ではキャンセルを数えない）

    Returns:
        なし。"""
    st.subheader("時間枠の埋まり具合")
    # 1. 選んだ期間に予約のあるイベントの時間枠だけを残す（同じ名前のイベントを取り違えないよう event_id で絞る）
    # fill: 時間枠ごとの予約人数・定員・充足率をまとめた表。
    fill = session_fill_rates(res, ctx.raw["ws_sessions"], ctx.raw["events"])
    # 変数の内容: fill: 選択期間内イベントの時間枠別予約充足データ。
    fill = fill[fill["event_id"].isin(set(res["event_id"].dropna()))]
    if fill.empty:
        st.caption("時間枠を設定したイベントがありません。")
        return
    # 2. イベント（行）× 時間枠（列）の表にする。行は開催日の古い順（ヒートマップでは下から上へ並ぶ）
    # events: 充足率表から取り出したイベント一覧を開催日順に並べた表。
    events = fill.drop_duplicates("event_id").sort_values("start_date")
    # 変数の内容: order: ヒートマップのイベント行を開催日の順に並べる識別子。
    order = list(events["event_id"])
    # 変数の内容: names: イベント識別子からヒートマップに表示するラベルへの対応表。
    names = dict(zip(order, event_labels(events["start_date"], events["event_name"])))
    # 変数の内容: pivot: イベント×時間枠の予約充足率。
    pivot = fill.pivot_table(index="event_id", columns="time_label", values="fill_rate", aggfunc="mean")
    # 変数の内容: booked: イベント×時間枠ごとに合計した予約人数。
    booked = fill.pivot_table(index="event_id", columns="time_label", values="booked", aggfunc="sum")
    # 変数の内容: cap: イベント×時間枠の定員。
    cap = fill.pivot_table(index="event_id", columns="time_label", values="max_participants", aggfunc="sum")
    # 変数の内容: pivot, booked, cap: 開催日順にそろえた充足率・予約人数・定員の表。
    pivot, booked, cap = (t.reindex(order) for t in (pivot, booked, cap))
    # 変数の内容: fig: 画面に表示する Plotly グラフ。
    fig = go.Figure(go.Heatmap(
        z=pivot.values, x=pivot.columns, y=[names[i] for i in pivot.index], zmin=0, zmax=1,
        colorscale=SEQUENTIAL_SCALE,
        # その時間枠がないイベントの欄は空欄にする（「null」と出さない）
        text=(booked.astype("Int64").astype(str) + "/" + cap.astype("Int64").astype(str)).where(cap.notna(), ""),
        texttemplate="%{text}", xgap=2, ygap=2,
        colorbar=dict(title="埋まり率", tickformat=".0%"),
        hovertemplate="%{y}<br>%{x}<br>%{text}人（%{z:.0%}）<extra></extra>",
    ))
    st.plotly_chart(style(fig, height=bar_height(len(pivot), per_bar=60, minimum=240), yen_axis=None), width="stretch")
    # 3. 全体の埋まり率（定員の合計が 0 なら「—」）
    # total_booked / total_cap: 全時間枠の予約人数と定員の合計。
    total_booked, total_cap = int(fill["booked"].sum()), int(fill["max_participants"].sum())
    st.caption(f"全体の埋まり率：{pct(total_booked, total_cap)}（{total_booked} / {total_cap}人）")


def _lead_time(active: pd.DataFrame) -> None:
    """参加日の何日前に予約されたかをヒストグラムで表示する。

    予約日が参加日より後（lead_days が負）の行は、参加希望日の入力ミスなどで意味を持たないので除き、件数を注記する。

    Args:
        active: 有効な予約

    Returns:
        なし。"""
    st.subheader("予約のタイミング")
    # 1. 日数が分かる予約のうち、予約日が参加日より後のものを除く
    # 変数の内容: known: 参加希望日と予約日がそろっている予約のリード日数。
    known = active["lead_days"].dropna()
    # 変数の内容: lead: 参加日より前に予約された記録のリード日数。
    lead = known[known >= 0]
    # 変数の内容: excluded: 予約日が参加日より後のため分析から除外した件数。
    excluded = len(known) - len(lead)
    if len(lead) == 0:
        st.caption("参加日の情報がありません。")
    else:
        # 2. 1日ごとの件数を、左ほど早い（日数が大きい）向きに並べる
        # fig: 予約日のリード日数ごとの件数を示すヒストグラム。
        fig = go.Figure(go.Histogram(
            x=lead, xbins=dict(start=-0.5, size=1), marker_color=SERIES[0],
            hovertemplate="%{x}日前<br>%{y}件<extra></extra>",
        ))
        fig.update_layout(title=f"参加日の何日前に予約したか（中央値 {lead.median():.0f}日前）", showlegend=False)
        fig.update_xaxes(title_text="何日前", autorange="reversed")
        fig.update_yaxes(title_text="件数")
        st.plotly_chart(style(fig, height=300, yen_axis=None), width="stretch")
        st.caption(f"当日〜{SHORT_LEAD_DAYS}日前の予約が {pct(int((lead <= SHORT_LEAD_DAYS).sum()), len(lead))}、"
                   f"{EARLY_LEAD_DAYS}日以上前が {pct(int((lead >= EARLY_LEAD_DAYS).sum()), len(lead))}。"
                   "告知のタイミングを決める目安になります。")
    # 3. 除いた件数を注記する
    if excluded:
        st.caption(f"予約日が参加日より後になっている {excluded} 件は、このグラフから除いています。")


def _booking_time(active: pd.DataFrame) -> None:
    """予約が入った曜日・時間帯をヒートマップで表示する（いつ告知を見て予約しているか）。

    Args:
        active: 有効な予約（created_at は日本時間）

    Returns:
        なし。"""
    st.subheader("予約が入った曜日と時間帯")
    # 1. 曜日 × HOUR_BIN 時間ごとの件数を数える（予約の無い枠も 0 として並べる）
    # t: 有効予約の作成日時を集めた日本時間の系列。
    t = active["created_at"]
    # 変数の内容: grid: 曜日×時間帯ごとの予約件数。
    grid = pd.crosstab(t.dt.dayofweek, t.dt.hour // HOUR_BIN * HOUR_BIN).reindex(
        index=range(len(WEEKDAY_LABELS)), columns=range(0, 24, HOUR_BIN), fill_value=0
    )
    # 2. ヒートマップにする（月曜を上に並べる）
    # fig: 曜日と時間帯ごとの予約数を示すヒートマップ。
    fig = go.Figure(go.Heatmap(
        z=grid.values, x=[f"{h}時台〜" for h in grid.columns], y=WEEKDAY_LABELS,
        colorscale=SEQUENTIAL_SCALE,
        xgap=2, ygap=2, colorbar=dict(title="件数"),
        hovertemplate="%{y}曜 %{x}<br>%{z}件<extra></extra>",
    ))
    fig.update_yaxes(autorange="reversed")
    st.plotly_chart(style(fig, height=300, yen_axis=None), width="stretch")
