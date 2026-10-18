"""画面から呼ぶ分析処理。Streamlit に依存しない純粋な関数だけを置き、テストしやすくしている。"""

from __future__ import annotations

import math
import re
import unicodedata

import numpy as np
import pandas as pd

from .finance import compute_finances, fiscal_year

# 分析に必要な最低件数（これ未満なら画面に「データ不足」を出す）
MIN_ROWS_FOR_ANALYSIS = 5
# 予約の状態のうち「キャンセル」を表す値
CANCELLED = "cancelled"

# 着地見込みで「同じイベントの過去の実績」をどれだけ信じるかを決める定数（縮小推定の K）。
# 同じイベントの実績が n 回あるとき、その実績から引く確率を n / (n + K) にする
# （時期を考慮するので、実際の n は開催月の近さで重み付けした「実質の回数」n_eff）。
# K=2 なら 1回で 33%、2回で 50%、4回で 67%、8回で 80% と、回数が増えるほど同じイベントの実績を重視し、
# 回数が少ないうちは全イベントの実績も混ぜて、たまたまの1回に引っぱられすぎないようにする
SERIES_PRIOR_K = 2

# 同じイベントの中で「開催月が近い回ほど重く見る」ときの幅（か月）。時期の重みは
# exp(−d² ÷ (2σ²))（d は開催月の差）で、σ=1.5 なら同じ月 1.0、1か月差 約0.80、2か月差 約0.41、
# 3か月差 約0.14、6か月差 ほぼ0。年に複数回あるイベントで、時期の違う回の売上に引っぱられないようにする
SEASON_SIGMA_MONTHS = 1.5
# 同じイベントの時期の重みの合計がこれ未満なら（季節の違う回しかない）、同じイベントからは引かない。
# 確率を重みの合計で割るときに、ほぼ 0 で割って不安定になるのを防ぐ
MIN_SEASON_WEIGHT_TOTAL = 1e-3
# 画面の表で「過去の売上の中央値」を見せる最低の重み（同じイベントの実績から引く確率）。0.5% 未満だと
# 見込みにほとんど効いていないのに、中央値だけ見えると「その売上で見込んだ」と誤解されるので、
# 「なし（全体の実績で見込み）」と出す（details の median_past の値は残す）
MIN_DISPLAY_SERIES_WEIGHT = 0.005

# series_key で取り除く「回ごとに変わる番号」の型。上から順に適用する。
# 単語の途中の数字（「ブース2」「3D」など）は消さないよう、型に当てはまるものだけを対象にする
_SERIES_NUMBER_PATTERNS = [
    # 「第3回」「第 12 回」「第三回」「第十二回」「第5回目」（漢数字も含む）
    re.compile(r"第\s*[0-9〇零一二三四五六七八九十百千]+\s*回目?"),
    # 「5回目」「12 回目」（直前が数字のときは別の数の一部なので除く）
    re.compile(r"(?<!\d)\d+\s*回目"),
    # 「vol.5」「Vol 5」「vol5」「volume 2」（直前が英字のときは単語の一部なので除く）
    re.compile(r"(?<![a-z])vol(?:ume)?\s*\.?\s*\d+"),
    # 英語の序数「1st」「2nd」「3rd」「6th」「11th」（前後が英数字でない独立した単語だけ）
    re.compile(r"(?<![a-z0-9])\d+(?:st|nd|rd|th)(?![a-z0-9])"),
    # 複数日開催の「day1」「Day 2」「day.3」（直前が英字のときは「sunday1」のような単語の一部なので除く）
    re.compile(r"(?<![a-z])day\s*\.?\s*\d+(?!\d)"),
    # 「#3」「# 3」
    re.compile(r"#\s*\d+"),
    # 「no.3」「No. 3」（直前が英字のときは単語の一部なので除く）
    re.compile(r"(?<![a-z])no\.\s*\d+"),
    # 西暦4桁＋月「2026.4」「2025/10」「2026-04」「2026.4.12」（日付まで書いたもの）「2026年4月」「2026年4月12日」。
    # 西暦だけの型より先に当てないと「.4」「/10」の月が残って別のキーになるので、この位置に置く
    re.compile(r"(?<!\d)(?:19|20)\d{2}\s*[./-]\s*\d{1,2}(?:\s*[./-]\s*\d{1,2})?(?![\d])"),
    re.compile(r"(?<!\d)(?:19|20)\d{2}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?"),
    # 西暦4桁「2026」「1999」「2026年」（前後が数字のときは別の数の一部なので除く）
    re.compile(r"(?<!\d)(?:19|20)\d{2}(?!\d)年?"),
    # 括弧内が数字だけの「(3)」（NFKC で全角の「（3）」も半角になる）
    re.compile(r"\(\s*\d+\s*\)"),
]
# series_key で、番号を取り除いた残りが ASCII の英数字だけでこれより短いときは（「a」など）、
# イベント名として意味のある部分が残っていないとみなして元の名前を使う（英字1文字のキーで別々のイベントが
# まとまってしまうのを防ぐ）。日本語は「祭」「灯」のように1文字でも名前として成り立つので、この条件に含めない
_SERIES_KEY_MIN_ASCII_LENGTH = 2
# 番号を取り除いたあとに消す空白と記号（\W は文字・数字以外。_ は \w に含まれるので別に指定する）
_SERIES_SYMBOLS = re.compile(r"[\W_]+")


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


def series_key(name: str) -> str:
    """イベント名から回ごとに変わる番号を取り除き、「同じイベント」をまとめるためのキーを作る。

    例: 「奇天烈 vol.5」→「奇天烈」、「Habitat Exhibition 2026」→「habitatexhibition」、
    「植物と暮らしのマーケット『THE BOTANICAL SHOW 6th』」→「植物と暮らしのマーケットthebotanicalshow」

    Args:
        name: イベント名

    Returns:
        正規化したキー。番号を取り除くと何も残らない・数字だけが残る・ASCII の英数字だけで2文字未満しか
        残らない名前（「Vol.1」「Vol.5-2」「vol.5 day1」「A 2026」など）は、別々のイベントが同じキーにならないよう、
        NFKC・小文字・空白除去だけをした元の名前を返す。
        名前が文字列でない・空のときは空文字（どのイベントとも同じとみなさない）
    """
    if not isinstance(name, str):
        return ""
    # 1. 全角英数を半角にそろえ、大文字小文字の違いをなくす
    base = unicodedata.normalize("NFKC", name).lower()
    # 2. 回ごとに変わる番号（第N回・N回目・vol.N・序数・dayN・#N・no.N・西暦（＋月）・(N)）を取り除く
    key = base
    for pattern in _SERIES_NUMBER_PATTERNS:
        key = pattern.sub(" ", key)
    # 3. 空白と記号を取り除く
    key = _SERIES_SYMBOLS.sub("", key)
    # 4. 意味のある名前が残らなければ（空・数字だけ・ASCII 英数字だけで2文字未満）、
    #    元の名前から空白だけを除いたものを使う（日本語の1文字「祭」などはそのままキーにする）
    too_short_ascii = key.isascii() and len(key) < _SERIES_KEY_MIN_ASCII_LENGTH
    if not key or key.isdigit() or too_short_ascii:
        key = re.sub(r"\s+", "", base)
    return key


def month_distance(a: int, b: int) -> int:
    """2つの開催月（1〜12）の差を、12月と1月がとなり合う「円環」で数える。

    Args:
        a: 月（1〜12）
        b: 月（1〜12）

    Returns:
        0〜6 の整数（例: 4月と4月は 0、12月と1月は 1、4月と10月は 6）
    """
    d = abs(int(a) - int(b)) % 12
    return min(d, 12 - d)


def season_weight(d: float, sigma: float = SEASON_SIGMA_MONTHS) -> float:
    """開催月の差 d から、その過去の回をどれだけ重く見るか（時期の重み）を返す。

    Args:
        d: 開催月の差（month_distance の結果）
        sigma: 重みの幅（か月）。大きいほど時期の違う回も重く見る

    Returns:
        exp(−d² ÷ (2σ²))。同じ月なら 1.0 で、月が離れるほど 0 に近づく
    """
    return math.exp(-(d ** 2) / (2 * sigma ** 2))


def weighted_median(values: list[float], weights: list[float]) -> float | None:
    """重み付きの中央値を返す（重みの累計が全体の半分に達したところの値）。

    重みがすべて同じときは、ふつうの中央値と同じ値になる（ちょうど半分で区切れるときは前後の平均）。

    Args:
        values: 値のリスト
        weights: 各値の重み（values と同じ長さ。0 以上）

    Returns:
        重み付き中央値。値が無い・重みの合計が 0 のときは None
    """
    v = np.asarray(values, dtype=float)
    w = np.asarray(weights, dtype=float)
    total = float(w.sum()) if len(w) else 0.0
    if len(v) == 0 or total <= 0:
        return None
    # 1. 値の小さい順に並べ、重みを累計する
    order = np.argsort(v, kind="stable")
    v, w = v[order], w[order]
    cum = np.cumsum(w)
    half = total / 2
    # 2. 累計が半分に達した最初の値を取る（誤差で届かないことがないよう少し余裕を持たせる）
    idx = int(np.searchsorted(cum, half - 1e-12 * total))
    # 3. ちょうど半分で区切れるときは、次の値との平均にする（ふつうの中央値と同じ扱い）
    if math.isclose(cum[idx], half, rel_tol=1e-9) and idx + 1 < len(v):
        return float((v[idx] + v[idx + 1]) / 2)
    return float(v[idx])


def series_weight(n: float, k: float = SERIES_PRIOR_K) -> float:
    """同じイベントの実績が n 回あるときに、その実績から見込みを引く確率（重み）を返す。

    Args:
        n: 同じイベントの過去の実績の回数（時期を考慮するときは時期の重みの合計 n_eff。小数でよい）
        k: 縮小推定の定数（SERIES_PRIOR_K。大きいほど全体の実績を重視する）

    Returns:
        n / (n + k)。n が 0 以下なら 0.0（全イベントの実績だけで見込む）
    """
    if n <= 0:
        return 0.0
    return n / (n + k)


def displayed_median(median: float | None, weight: float, min_weight: float = MIN_DISPLAY_SERIES_WEIGHT) -> float | None:
    """画面の表に出す「同じイベントの過去の売上の中央値」を決める。

    Args:
        median: details の median_past（無ければ None / NaN）
        weight: details の weight（同じイベントの実績から引く確率）
        min_weight: 中央値を見せる最低の重み（MIN_DISPLAY_SERIES_WEIGHT）

    Returns:
        表に出す中央値。中央値が無い、または重みが min_weight 未満で見込みにほとんど効いていないときは None
    """
    if median is None or pd.isna(median) or weight < min_weight:
        return None
    return float(median)


def series_references(
    remaining: pd.DataFrame,
    history: pd.DataFrame,
    k: float = SERIES_PRIOR_K,
    sigma: float = SEASON_SIGMA_MONTHS,
) -> pd.DataFrame:
    """残りのイベントそれぞれについて、参考にする同じイベントの過去の実績と重みを決める。

    同じイベント（series_key が同じ）の過去の回のうち、開催月が近い回ほど重く見る。
    各回の時期の重み s の合計を「時期を考慮した実質の回数」n_eff とし、
    同じイベントから引く確率 weight を n_eff / (n_eff + k) にする。

    Args:
        remaining: 今期の残りのイベント（id, name, start_date の列）
        history: 同じイベントの実績として使える過去の回（name, start_date, sales の列）
        k: 縮小推定の定数
        sigma: 時期の重みの幅（か月）

    Returns:
        残りのイベント1つ1行の表（開催日順）。列は
        event_id, name, start_date, series_key,
        n_past（同じイベントの実績の回数）,
        n_eff（時期の重みの合計＝時期を考慮した実質の回数。丸めない値）,
        median_past（時期の重み付きの売上の中央値。無ければ NaN）,
        weight（同じイベントの実績から引く確率。n_eff が MIN_SEASON_WEIGHT_TOTAL 未満なら 0）,
        past_names（まとめた過去の回のイベント名のリスト、開催日順）,
        past_dates（その開催日のリスト）, past_months（その開催月のリスト）,
        past_sales（その売上のリスト）, past_season_weights（その時期の重み s のリスト）
        past_ で始まる列はすべて同じ順に並ぶ
    """
    columns = ["event_id", "name", "start_date", "series_key", "n_past", "n_eff", "median_past", "weight",
               "past_names", "past_dates", "past_months", "past_sales", "past_season_weights"]
    if remaining.empty:
        return pd.DataFrame(columns=columns)
    # 1. 過去の回に series_key を付ける（名前の列が無いデータでは同じイベントを探さない）
    if history.empty or "name" not in history.columns:
        hist = pd.DataFrame({"key": pd.Series(dtype=str), "name": pd.Series(dtype=str),
                             "start_date": pd.Series(dtype="datetime64[ns]"), "sales": pd.Series(dtype=float)})
    else:
        hist = history.assign(key=history["name"].map(series_key))
        if "start_date" in hist.columns:
            hist = hist.sort_values("start_date", kind="stable")
        else:
            hist = hist.assign(start_date=pd.NaT)
    # 2. 残りのイベントを開催日順に並べ、1つずつ同じキーの実績を集める
    rem = remaining.sort_values(["start_date", "id"], kind="stable")
    names = rem["name"] if "name" in rem.columns else pd.Series([None] * len(rem), index=rem.index)
    rows = []
    for (_, r), name in zip(rem.iterrows(), names):
        key = series_key(name)
        # 空のキーは「名前が無い」なので、どの過去の回とも同じとみなさない
        same = hist[hist["key"] == key] if key else hist.iloc[0:0]
        n = int(len(same))
        # 3. 過去の回ごとに、残りのイベントとの開催月の差から時期の重みを出す
        #    （どちらかの開催日が分からないときは時期で差をつけず 1.0 とする）
        target = r["start_date"]
        months = [int(d.month) if pd.notna(d) else None for d in same["start_date"]]
        if pd.notna(target):
            s_list = [season_weight(month_distance(target.month, m), sigma) if m is not None else 1.0
                      for m in months]
        else:
            s_list = [1.0] * n
        sales = [float(v) for v in same["sales"]]
        # 4. 時期の重みの合計を実質の回数とし、縮小推定の重みと重み付き中央値を求める
        n_eff = float(sum(s_list))
        usable = n_eff >= MIN_SEASON_WEIGHT_TOTAL
        rows.append({
            "event_id": r["id"],
            "name": name,
            "start_date": target,
            "series_key": key,
            "n_past": n,
            "n_eff": n_eff,
            "median_past": weighted_median(sales, s_list) if usable else None,
            "weight": series_weight(n_eff, k) if usable else 0.0,
            "past_names": list(same["name"]),
            "past_dates": list(same["start_date"]),
            "past_months": months,
            "past_sales": sales,
            "past_season_weights": s_list,
        })
    return pd.DataFrame(rows, columns=columns)


def forecast_fiscal_year(
    fin: pd.DataFrame, events: pd.DataFrame, today: pd.Timestamp, n_boot: int = 5000, seed: int = 0
) -> dict | None:
    """今期（4月始まり）のイベント売上の着地見込みをブートストラップで予測する。

    今期の残りのイベント1回ごとに、売上を「くじ」で引いて足す、を何千回もくり返して、
    合計の分布（ふつう〜良い〜悪いケース）を出す。くじは2種類あり、
      - 同じイベント（series_key が同じ）の過去の実績のくじ … 確率 w = n_eff / (n_eff + SERIES_PRIOR_K)
      - 全イベントの実績のくじ … 確率 1 − w
    から引く（縮小推定）。同じイベントのくじでは、開催月が近い回ほど当たりやすくする（時期の重み s に比例）。
    n_eff は各回の s の合計で、季節の違う回しかなければ小さくなり、全イベントの実績を多く混ぜる。
    同じイベントの実績が無ければ w = 0 で、全イベントの実績だけから引く（時期は考慮しない）。

    Args:
        fin: build_event_finance_table の結果
        events: events テーブル（今後の予定を数えるのに使う）
        today: 基準日
        n_boot: くり返し回数
        seed: 乱数の種（毎回同じ結果にするため）

    Returns:
        fiscal_year（今期の年度）, actual（今期の実績合計）, remaining（今期の残りイベント数）,
        p10/p50/p90（着地見込み）, samples（シミュレーション結果の配列）,
        details（残りのイベントごとの参考にした実績。series_references の結果）の辞書。
        実績が少なすぎるときは None
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
    rem_events = in_fy[~in_fy["id"].isin(done_ids)]
    remaining = int(len(rem_events))
    # 3. 残りのイベントごとに、同じイベントの過去の実績（開催日が今日より前で実績があるもの）と重みを決める。
    #    全イベントの実績（done）は従来どおり今日以降の回も含めるが、同じイベントの実績は今日より前に限る。
    #    同じイベントのくじは数回分しかなく1回の影響が大きいので、今日以降の日付の回（日付の入力ミスや、
    #    先に売上だけ入れた回など）が混ざると見込みがゆがみやすいため。全体の実績は回数が多く影響が小さい上、
    #    同じイベントが無いデータで従来とまったく同じ結果を保つため、絞り込みを変えない
    if "start_date" in done.columns:
        history = done[done["start_date"] < today]
    else:
        history = done.iloc[0:0]
    details = series_references(rem_events, history)
    # 4. まず全イベントの実績から残りの回数ぶん引く（同じイベントが無ければ従来とまったく同じ結果になる）
    rng = np.random.default_rng(seed)
    draws = rng.choice(done["sales"].to_numpy(), size=(n_boot, remaining), replace=True).astype(float)
    # 5. 同じイベントの実績があるイベントは、確率 w で、その実績から時期の重みに比例して引き直した値に置き換える
    for j, (w, past, s_list) in enumerate(zip(details["weight"], details["past_sales"],
                                               details["past_season_weights"])):
        if w <= 0:
            continue
        p = np.asarray(s_list, dtype=float)
        use_same = rng.random(n_boot) < w
        same_draws = rng.choice(np.asarray(past, dtype=float), size=n_boot, replace=True, p=p / p.sum())
        draws[use_same, j] = same_draws[use_same]
    samples = actual + draws.sum(axis=1)
    return {
        "fiscal_year": fy,
        "actual": actual,
        "remaining": remaining,
        "p10": float(np.percentile(samples, 10)),
        "p50": float(np.percentile(samples, 50)),
        "p90": float(np.percentile(samples, 90)),
        "samples": samples,
        "details": details,
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
