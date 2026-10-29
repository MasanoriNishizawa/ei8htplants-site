"""収支計算と分析処理のテスト。本番には接続しない（すべて手で作ったデータで確かめる）。"""

import sys
from pathlib import Path

import pandas as pd
import pytest

# analytics フォルダを import の起点にする
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.analysis import (  # noqa: E402
    co_purchase_pairs,
    fit_linear,
    forecast_fiscal_year,
    repeat_summary,
    rfm_table,
    session_fill_rates,
)
from lib.data import hash_email  # noqa: E402
from lib.finance import break_even_sales, build_event_finance_table, compute_finances, fiscal_year  # noqa: E402

# テストで使う収支の1行（手伝い支払いあり・WS 7人）
FIN = {
    "sales": 33900, "booth_fee": 4000, "distance": 110, "gas_price": 160, "expressway_toll": 0,
    "accommodation": 0, "ws_participants": 7, "payment_flag": True, "other_expenses": 0,
}


def test_compute_finances_matches_admin_formula():
    """管理画面の computeFinances と同じ値になること（手計算と比較）。

    Returns:
        なし。"""
    # 1. 管理画面の computeFinances と同じ値になること（手計算と比較）。
    r = compute_finances(FIN, has_workshop=True)
    # 移動費 = 110×2÷10×160 = 3520、支出 = 4000+3520 = 7520
    assert r["transport"] == 3520
    assert r["total_expense"] == 7520
    # WS 売上 7000・資材 4900
    assert r["ws_sales"] == 7000 and r["ws_cost"] == 4900
    # 手伝い = round((33900−7000−7520)×0.2) + round(7000×0.7) = 3876 + 4900 = 8776
    assert r["payment"] == 8776
    # 収支 = 33900 − 7520 − 4900 − 8776 = 12704
    assert r["net"] == 12704


def test_compute_finances_without_workshop_ignores_participants():
    """WS を開催していないイベントでは参加人数を計算に使わないこと。

    Returns:
        なし。"""
    # 1. WS を開催していないイベントでは参加人数を計算に使わないこと。
    r = compute_finances({**FIN, "payment_flag": False}, has_workshop=False)
    assert r["ws_cost"] == 0 and r["payment"] == 0
    assert r["net"] == 33900 - 7520


def test_rounding_matches_javascript():
    """.5 の丸めが JavaScript の Math.round と同じ（正の方向へ）になること。

    Returns:
        なし。"""
    # 移動費 = 1×2÷10×165 = 33.0、手伝い = (5 − 0 − (33+0))×0.2 = −5.6 → −6
    # 1. .5 の丸めが JavaScript の Math.round と同じ（正の方向へ）になること。
    r = compute_finances({**FIN, "sales": 5, "booth_fee": 0, "distance": 1, "gas_price": 165, "ws_participants": 0},
                         has_workshop=False)
    assert r["payment"] == -6
    # 2.5 → 3（Python の round なら 2 になる）
    r2 = compute_finances({**FIN, "sales": 12.5, "booth_fee": 0, "distance": 0, "ws_participants": 0},
                          has_workshop=False)
    assert r2["payment"] == 3


@pytest.mark.parametrize("payment_flag,has_ws", [(True, True), (False, True), (True, False), (False, False)])
def test_break_even_gives_zero_net(payment_flag, has_ws):
    """損益分岐の売上を入れると収支がほぼ 0 円になること。

    Args:
        payment_flag: イベントの支払い状態を表す真偽値。
        has_ws: イベントにワークショップがあるかを示す真偽値。

    Returns:
        なし。"""
    # 1. 損益分岐の売上を入れると収支がほぼ 0 円になること。
    fin = {**FIN, "payment_flag": payment_flag}
    # 変数の内容: be: 損益分岐点の計算結果。
    be = break_even_sales(fin, has_ws)
    assert abs(compute_finances({**fin, "sales": be}, has_ws)["net"]) <= 1


def test_fiscal_year_starts_in_april():
    """会計年度は4月始まりであること。

    Returns:
        なし。"""
    # 1. 会計年度は4月始まりであること。
    assert fiscal_year(pd.Timestamp("2026-03-31")) == 2025
    assert fiscal_year(pd.Timestamp("2026-04-01")) == 2026


def _events():
    """テスト用のイベント表を作る。

    Returns:
        イベント行の一覧を返す。"""
    return pd.DataFrame({
        "id": ["e1", "e2", "e3"],
        "name": ["A", "B", "C"],
        "start_date": pd.to_datetime(["2026-04-04", "2026-05-01", "2026-12-01"]),
        "end_date": pd.to_datetime(["2026-04-05", None, None]),
        "location": ["x", "y", "z"],
        "brands": [["ei8ht plants"], ["Habitat Oides", "ei8ht plants"], []],
        "has_workshop": [True, False, False],
        "is_past": [True, True, False],
    })


def test_build_event_finance_table_marks_unentered_sales():
    """売上 0 円の回は has_result=False になり、日数が正しく数えられること。

    Returns:
        なし。"""
    # 1. 売上 0 円の回は has_result=False になり、日数が正しく数えられること。
    fin = pd.DataFrame([{**FIN, "event_id": "e1"}, {**FIN, "event_id": "e3", "sales": 0}])
    # 変数の内容: t: テスト用イベントと収支を結合して計算した DataFrame。
    t = build_event_finance_table(_events(), fin)
    assert list(t["has_result"]) == [True, False]
    assert t.loc[0, "days"] == 2
    assert t.loc[0, "net"] == 12704


def test_forecast_needs_enough_results_and_counts_remaining():
    """実績が少ないときは予測しないこと、十分あれば残り回数を足して見込みを出すこと。

    Returns:
        なし。"""
    # 1. 実績が少ないときは予測しないこと、十分あれば残り回数を足して見込みを出すこと。
    events = pd.DataFrame({
        "id": [f"e{i}" for i in range(7)],
        "start_date": pd.to_datetime(["2026-04-10", "2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10",
                                      "2026-11-01", "2027-02-01"]),
    })
    # 変数の内容: fin: 計算に渡す売上・費用の入力値。
    fin = pd.DataFrame({
        "event_id": [f"e{i}" for i in range(5)],
        "sales": [10000, 20000, 30000, 40000, 50000],
        "has_result": True,
        "fiscal_year": 2026,
    })
    # 変数の内容: today: 日付計算で固定する今日。
    today = pd.Timestamp("2026-10-16")
    assert forecast_fiscal_year(fin.head(4), events, today) is None
    # 変数の内容: fc: テスト条件で計算した着地予測結果。
    fc = forecast_fiscal_year(fin, events, today, n_boot=2000)
    assert fc["actual"] == 150000 and fc["remaining"] == 2
    # 残り2回は 1万〜5万円なので、見込みは 17万〜25万円の間に入る
    assert 170000 <= fc["p10"] <= fc["p50"] <= fc["p90"] <= 250000


def test_fit_linear_recovers_line():
    """きれいな直線のデータから傾きと切片を正しく求めること。

    Returns:
        なし。"""
    # 1. きれいな直線のデータから傾きと切片を正しく求めること。
    fit = fit_linear(pd.Series([1, 2, 3, 4]), pd.Series([12, 14, 16, 18]))
    assert fit["slope"] == pytest.approx(2) and fit["intercept"] == pytest.approx(10) and fit["r2"] == pytest.approx(1)
    assert fit_linear(pd.Series([1, 1, 1]), pd.Series([1, 2, 3])) is None


def test_hash_email_is_stable_and_normalized():
    """同じメールアドレスは大文字小文字・空白に関係なく同じ識別子になり、元の文字列を含まないこと。

    Returns:
        なし。"""
    # 1. 同じメールアドレスは大文字小文字・空白に関係なく同じ識別子になり、元の文字列を含まないこと。
    assert hash_email(" Foo@Example.com ") == hash_email("foo@example.com")
    assert "example" not in hash_email("foo@example.com")
    assert hash_email(None) is None


def test_repeat_summary_and_rfm():
    """リピーターの数え方と RFM の区分が正しいこと。

    Returns:
        なし。"""
    # 1. リピーターの数え方と RFM の区分が正しいこと。
    orders = pd.DataFrame({
        "id": ["o1", "o2", "o3"],
        "customer_key": ["a", "a", "b"],
        "total": [1000, 2000, 500],
        "created_at": pd.to_datetime(["2026-09-01", "2026-10-01", "2026-01-01"]).tz_localize("Asia/Tokyo"),
    })
    assert repeat_summary(orders) == {"customers": 2, "repeaters": 1, "repeat_rate": 0.5}
    # 変数の内容: rfm: RFM 分析関数の返却結果。
    rfm = rfm_table(orders, pd.Timestamp("2026-10-16", tz="Asia/Tokyo")).set_index("customer_key")
    assert rfm.loc["a", "frequency"] == 2 and rfm.loc["a", "monetary"] == 3000
    assert rfm.loc["a", "segment"].startswith("優良")
    assert rfm.loc["b", "segment"].startswith("休眠")


def test_co_purchase_pairs_counts_each_order_once():
    """同じ注文の中の商品の組み合わせを1回として数えること。

    Returns:
        なし。"""
    # 1. 同じ注文の中の商品の組み合わせを1回として数えること。
    items = pd.DataFrame({"order_id": ["o1", "o1", "o1", "o2", "o2"], "product_name": ["鉢", "土", "鉢", "鉢", "土"]})
    # 変数の内容: pairs: テストで照合する値の組み合わせ。
    pairs = co_purchase_pairs(items)
    assert pairs.iloc[0].to_dict() == {"商品A": "土", "商品B": "鉢", "同時購入回数": 2}


def test_session_fill_rates_excludes_cancelled():
    """時間枠の埋まり具合にキャンセルを含めないこと。

    Returns:
        なし。"""
    # 1. 時間枠の埋まり具合にキャンセルを含めないこと。
    sessions = pd.DataFrame({"id": ["s1"], "event_id": ["e1"], "time_label": ["11:00"], "max_participants": [4]})
    # 変数の内容: res: 時間枠ごとの予約人数計算に渡す予約データ。
    res = pd.DataFrame({"session_id": ["s1", "s1"], "participants": [2, 1], "is_cancelled": [False, True]})
    # 変数の内容: fill: キャンセル予約を除いて計算した時間枠ごとの埋まり率。
    fill = session_fill_rates(res, sessions, _events())
    assert fill.iloc[0]["booked"] == 2 and fill.iloc[0]["fill_rate"] == 0.5


# ───────────────────────── アクセス解析（GA4） ─────────────────────────

from types import SimpleNamespace  # noqa: E402

from lib.ga import ga_config, label_paths, response_to_frame  # noqa: E402


def test_ga_config_reports_missing_and_wrong_values(monkeypatch, tmp_path):
    """接続設定の不足・取り違えを、わかる理由つきで返すこと。

    Args:
        monkeypatch: 依存値を一時差し替えする pytest フィクスチャ。
        tmp_path: テスト用の一時ディレクトリ。

    Returns:
        なし。"""
    # 1. 接続設定の不足・取り違えを、わかる理由つきで返すこと。
    key = tmp_path / "key.json"
    key.write_text("{}")
    monkeypatch.delenv("GA_PROPERTY_ID", raising=False)
    monkeypatch.delenv("GA_CREDENTIALS", raising=False)
    assert ga_config()[0] is None and "GA_PROPERTY_ID" in ga_config()[1]
    # 測定 ID（G-…）を入れてしまった場合
    monkeypatch.setenv("GA_PROPERTY_ID", "G-HCVVDNYL94")
    assert "測定 ID" in ga_config()[1]
    monkeypatch.setenv("GA_PROPERTY_ID", "123456789")
    assert "GA_CREDENTIALS" in ga_config()[1]
    monkeypatch.setenv("GA_CREDENTIALS", str(tmp_path / "none.json"))
    assert "見つかりません" in ga_config()[1]
    monkeypatch.setenv("GA_CREDENTIALS", str(key))
    # 変数の内容: cfg: 環境変数から組み立てた GA 接続設定。；problem: GA 接続設定が不足・不正なときの説明文。
    cfg, problem = ga_config()
    assert problem is None and cfg.property_id == "123456789" and cfg.credentials_path == key


def test_response_to_frame_converts_types():
    """Data API の応答を、数値・日付に変換した表にすること。

    Returns:
        なし。"""
    # 1. Data API の応答を、数値・日付に変換した表にすること。
    row = lambda d, m: SimpleNamespace(  # noqa: E731
        dimension_values=[SimpleNamespace(value=v) for v in d], metric_values=[SimpleNamespace(value=v) for v in m]
    )
    # 変数の内容: resp: テスト対象 API の HTTP 応答。
    resp = SimpleNamespace(rows=[row(["20261016"], ["12", "30"]), row(["20261017"], ["3", "4.5"])])
    # 変数の内容: df: 分析対象の Pandas DataFrame。
    df = response_to_frame(resp, ["date"], ["activeUsers", "screenPageViews"])
    assert df["date"].iloc[0] == pd.Timestamp("2026-10-16")
    assert df["activeUsers"].tolist() == [12, 3] and df["screenPageViews"].tolist() == [30, 4.5]
    assert response_to_frame(SimpleNamespace(rows=[]), ["date"], ["activeUsers"]).empty


def test_label_paths_names_pages_events_and_products():
    """固定ページは日本語名、イベント・商品の詳細は名前にし、わからないパスはそのまま返すこと。

    Returns:
        なし。"""
    # 1. 固定ページは日本語名、イベント・商品の詳細は名前にし、わからないパスはそのまま返すこと。
    events = pd.DataFrame({"id": ["e1", "e2"], "slug": ["kagoen-autumn", None], "name": ["花郷園 秋 ", "叢宴"]})
    # 変数の内容: products: 商品IDと商品名を対応させるテストデータ。
    products = pd.DataFrame({"id": ["p1"], "name": ["EG-90L"]})
    # 変数の内容: paths: 表示名への変換を確かめる URL パスのテスト列。
    paths = pd.Series(["/", "/reserve?event=e1", "/events/kagoen-autumn", "/events/e2", "/shop/p1", "/events/zzz", "/foo/"])
    assert label_paths(paths, events, products).tolist() == [
        "トップ", "WS 予約", "イベント：花郷園 秋", "イベント：叢宴", "商品：EG-90L", "/events/zzz", "/foo",
    ]
