"""画面から呼ぶ分析処理。Streamlit に依存しない純粋な関数だけを置き、テストしやすくしている。"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .finance import compute_finances, fiscal_year

# 分析に必要な最低件数（これ未満なら画面に「データ不足」を出す）
MIN_ROWS_FOR_ANALYSIS = 5
# 予約の状態のうち「キャンセル」を表す値
CANCELLED = "cancelled"


# ───────────────────────── ワークショップ ─────────────────────────


def reservation_table(reservations: pd.DataFrame, sessions: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    """予約にイベント名・セッション名・リードタイムを付けた分析用の表を作る。

    Args:
        reservations: workshop_reservations テーブル
        sessions: ws_sessions テーブル
        events: events テーブル

    Returns:
        予約1件1行の表。is_cancelled（キャンセルか）と lead_days（予約から参加希望日までの日数）を含む
    """
    if reservations.empty:
        return reservations.assign(is_cancelled=pd.Series(dtype=bool), lead_days=pd.Series(dtype=float))
    # 1. イベント名とセッションの時間帯を付ける
    df = reservations.merge(
        events[["id", "name", "start_date"]].rename(columns={"id": "event_id", "name": "event_name"}),
        on="event_id",
        how="left",
    )
    df = df.merge(
        sessions[["id", "time_label", "max_participants"]].rename(columns={"id": "session_id"}),
        on="session_id",
        how="left",
    )
    # 2. キャンセルかどうか
    df["is_cancelled"] = df["status"] == CANCELLED
    # 3. 予約日から参加日までの日数。参加希望日がなければイベント初日で代用する
    target = df["preferred_date"].fillna(df["start_date"])
    booked = df["created_at"].dt.tz_localize(None).dt.normalize()
    df["lead_days"] = (target - booked).dt.days
    return df


def session_fill_rates(res: pd.DataFrame, sessions: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    """セッション（時間枠）ごとの埋まり具合を計算する。キャンセルは数えない。

    Args:
        res: reservation_table の結果
        sessions: ws_sessions テーブル
        events: events テーブル

    Returns:
        セッション1つ1行の表（event_name, time_label, booked, max_participants, fill_rate）
    """
    # 1. 有効な予約の参加人数をセッションごとに合計する
    active = res[~res["is_cancelled"]] if not res.empty else res
    booked = active.groupby("session_id")["participants"].sum() if not active.empty else pd.Series(dtype=float)
    # 2. 全セッションに結合する（予約0件の枠も 0 として残す）
    df = sessions.merge(events[["id", "name"]].rename(columns={"id": "event_id", "name": "event_name"}), on="event_id")
    df["booked"] = df["id"].map(booked).fillna(0).astype(int)
    df["fill_rate"] = df["booked"] / df["max_participants"].where(df["max_participants"] > 0)
    return df[["event_name", "time_label", "booked", "max_participants", "fill_rate"]]


def repeat_summary(df: pd.DataFrame, key: str = "customer_key") -> dict[str, float]:
    """リピーター（2回以上利用した人）の人数と割合を出す。

    Args:
        df: customer_key 列を持つ表（予約・注文など）
        key: 顧客を識別する列名

    Returns:
        customers（利用者数）, repeaters（リピーター数）, repeat_rate（リピーター率）
    """
    counts = df[key].dropna().value_counts()
    customers = int(len(counts))
    repeaters = int((counts >= 2).sum())
    return {
        "customers": customers,
        "repeaters": repeaters,
        "repeat_rate": repeaters / customers if customers else 0.0,
    }


# ───────────────────────── ショップ ─────────────────────────


def valid_orders(orders: pd.DataFrame) -> pd.DataFrame:
    """キャンセルを除いた有効な注文だけを返す。

    Args:
        orders: orders テーブル

    Returns:
        status が cancelled 以外の注文
    """
    return orders[orders["status"] != CANCELLED]


def rfm_table(orders: pd.DataFrame, today: pd.Timestamp) -> pd.DataFrame:
    """顧客ごとの RFM（最終購入からの日数・購入回数・購入金額）を計算し、3段階のランクを付ける。

    Args:
        orders: 有効な注文（customer_key, total, created_at を含む）
        today: 基準日（日本時間）

    Returns:
        顧客1人1行の表（recency_days, frequency, monetary, segment）
    """
    if orders.empty:
        return pd.DataFrame(columns=["customer_key", "recency_days", "frequency", "monetary", "segment"])
    # 1. 顧客ごとに集計する
    g = orders.groupby("customer_key").agg(
        last=("created_at", "max"), frequency=("id", "count"), monetary=("total", "sum")
    )
    g["recency_days"] = (today - g["last"]).dt.days
    # 2. わかりやすい3区分に分ける（件数が少ないので分位ではなく固定のしきい値で区切る）
    def segment(r: pd.Series) -> str:
        if r["frequency"] >= 2 and r["recency_days"] <= 90:
            return "優良（直近90日・2回以上）"
        if r["recency_days"] <= 90:
            return "新規・最近（直近90日）"
        return "休眠（90日以上購入なし）"

    g["segment"] = g.apply(segment, axis=1)
    return g.reset_index()[["customer_key", "recency_days", "frequency", "monetary", "segment"]]


def co_purchase_pairs(items: pd.DataFrame) -> pd.DataFrame:
    """同じ注文で一緒に買われた商品の組み合わせを数える（併売分析）。

    Args:
        items: order_items テーブル（有効な注文に絞ったもの）

    Returns:
        商品A・商品B・同時購入回数の表（多い順）
    """
    pairs: dict[tuple[str, str], int] = {}
    # 1. 注文ごとに商品名の組み合わせを数える
    for _, names in items.groupby("order_id")["product_name"]:
        uniq = sorted(set(names))
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                pairs[(uniq[i], uniq[j])] = pairs.get((uniq[i], uniq[j]), 0) + 1
    rows = [{"商品A": a, "商品B": b, "同時購入回数": n} for (a, b), n in pairs.items()]
    return pd.DataFrame(rows, columns=["商品A", "商品B", "同時購入回数"]).sort_values("同時購入回数", ascending=False)


# ───────────────────────── 予測・シミュレーション ─────────────────────────


def forecast_fiscal_year(
    fin: pd.DataFrame, events: pd.DataFrame, today: pd.Timestamp, n_boot: int = 5000, seed: int = 0
) -> dict | None:
    """今期（4月始まり）のイベント売上の着地見込みをブートストラップで予測する。

    これまでのイベント1回あたりの売上を「くじ」に見立て、今期の残りのイベントの数だけ引いて足す、を
    何千回もくり返して、合計の分布（ふつう〜良い〜悪いケース）を出す。

    Args:
        fin: build_event_finance_table の結果
        events: events テーブル（今後の予定を数えるのに使う）
        today: 基準日
        n_boot: くり返し回数
        seed: 乱数の種（毎回同じ結果にするため）

    Returns:
        actual（今期の実績合計）, remaining（今期の残りイベント数）, p10/p50/p90（着地見込み）,
        samples（シミュレーション結果の配列）の辞書。実績が少なすぎるときは None
    """
    # 1. 売上の実績がある回だけを使う
    done = fin[fin["has_result"]]
    if len(done) < MIN_ROWS_FOR_ANALYSIS:
        return None
    fy = fiscal_year(today)
    fy_end = pd.Timestamp(year=fy + 1, month=3, day=31)
    # 2. 今期の実績合計と、今期のまだ実績がないイベント（今日以降の予定＋入力待ち）を数える
    actual = float(done.loc[done["fiscal_year"] == fy, "sales"].sum())
    done_ids = set(done["event_id"])
    in_fy = events[(events["start_date"].map(fiscal_year) == fy) & (events["start_date"] <= fy_end)]
    remaining = int((~in_fy["id"].isin(done_ids)).sum())
    # 3. 過去の1回あたり売上から、残りの回数ぶん無作為に引いて合計する
    rng = np.random.default_rng(seed)
    draws = rng.choice(done["sales"].to_numpy(), size=(n_boot, remaining), replace=True)
    samples = actual + draws.sum(axis=1)
    return {
        "fiscal_year": fy,
        "actual": actual,
        "remaining": remaining,
        "p10": float(np.percentile(samples, 10)),
        "p50": float(np.percentile(samples, 50)),
        "p90": float(np.percentile(samples, 90)),
        "samples": samples,
    }


def fit_linear(x: pd.Series, y: pd.Series) -> dict | None:
    """最小二乗法で y = a × x + b の直線を当てはめる。

    Args:
        x: 説明する値（例: 移動距離）
        y: 説明される値（例: 売上）

    Returns:
        slope（傾き）, intercept（切片）, r2（決定係数。1 に近いほど直線でよく説明できる）。
        点が3つ未満、または x がすべて同じときは None
    """
    mask = x.notna() & y.notna()
    x, y = x[mask].astype(float), y[mask].astype(float)
    if len(x) < 3 or x.nunique() < 2:
        return None
    # 1. 直線の傾きと切片を求める
    slope, intercept = np.polyfit(x, y, 1)
    # 2. 決定係数 R² = 1 − 残差の二乗和 ÷ 全体のばらつき
    pred = slope * x + intercept
    ss_res = float(((y - pred) ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum())
    return {"slope": float(slope), "intercept": float(intercept), "r2": 1 - ss_res / ss_tot if ss_tot else 0.0}


def simulate_event(
    expected_sales: float,
    booth_fee: int,
    distance: int,
    gas_price: int,
    expressway_toll: int,
    accommodation: int,
    other_expenses: int,
    ws_participants: int,
    payment_flag: bool,
) -> dict[str, float]:
    """これから出店を考えているイベントの収支を、管理画面と同じ式で見積もる。

    Args:
        expected_sales: 見込み売上（円）
        booth_fee: 出店料
        distance: 片道距離（km）
        gas_price: ガソリン単価（円/L）
        expressway_toll: 高速代
        accommodation: 宿泊費
        other_expenses: その他支出
        ws_participants: WS 参加見込み人数（0 なら WS なし）
        payment_flag: 手伝い支払いがあるか

    Returns:
        compute_finances の結果
    """
    fin = {
        "sales": expected_sales,
        "booth_fee": booth_fee,
        "distance": distance,
        "gas_price": gas_price,
        "expressway_toll": expressway_toll,
        "accommodation": accommodation,
        "other_expenses": other_expenses,
        "ws_participants": ws_participants,
        "payment_flag": payment_flag,
    }
    return compute_finances(fin, has_workshop=ws_participants > 0)
