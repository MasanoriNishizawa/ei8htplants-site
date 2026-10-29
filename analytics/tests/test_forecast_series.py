"""着地見込み（forecast_fiscal_year）の「同じイベントの過去の実績と開催時期を考慮する」部分のテスト。

確かめること
- series_key: イベント名から回ごとの番号を取り除いて同じイベントをまとめるキー
- month_distance / season_weight / weighted_median / series_weight: 時期の重みと縮小推定の部品
- series_references: 残りのイベントごとに参考にする過去の回と重みの決め方
- forecast_fiscal_year: 同じイベントの実績で見込みが寄ること・従来版との一致・再現性・details
- 画面（views/advanced.py の _forecast_details）: 表の列と表示、残り0件の文言（AppTest）

本番（Supabase・GA4）には接続しない。データはすべてテスト内で手作りする。
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from streamlit.testing.v1 import AppTest

# analytics フォルダを import の起点にする
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.analysis import (  # noqa: E402
    _SERIES_KEY_MIN_ASCII_LENGTH,
    MIN_DISPLAY_SERIES_WEIGHT,
    MIN_SEASON_WEIGHT_TOTAL,
    SEASON_SIGMA_MONTHS,
    SERIES_PRIOR_K,
    displayed_median,
    forecast_fiscal_year,
    month_distance,
    season_weight,
    series_key,
    series_references,
    series_weight,
    weighted_median,
)
from lib.finance import fiscal_year  # noqa: E402

# 予測の基準日（今日）。今期は 2026年度（2026-04-01〜2027-03-31）
TODAY = pd.Timestamp("2026-10-18")

# 列が NaN（値なし）として扱われる「売上の列」の型をそろえるための空の Series
_EMPTY_DATES = pd.Series(dtype="datetime64[ns]")


# ───────────────────────── 手作りデータの部品 ─────────────────────────


def _history(rows: list[tuple]) -> pd.DataFrame:
    """series_references に渡す「過去の回」の表を作る。

    Args:
        rows: (イベント名, 開催日の文字列 または None, 売上) のリスト

    Returns:
        name, start_date, sales の列を持つ表
    """
    return pd.DataFrame({
        "name": [r[0] for r in rows],
        "start_date": pd.to_datetime([r[1] for r in rows]),
        "sales": [float(r[2]) for r in rows],
    })


def _remaining(rows: list[tuple]) -> pd.DataFrame:
    """series_references に渡す「今期の残りのイベント」の表を作る。

    Args:
        rows: (id, イベント名, 開催日の文字列 または None) のリスト

    Returns:
        id, name, start_date の列を持つ表
    """
    return pd.DataFrame({
        "id": [r[0] for r in rows],
        "name": [r[1] for r in rows],
        "start_date": pd.to_datetime([r[2] for r in rows]),
    })


def _fin_and_events(done_rows: list[tuple], future_rows: list[tuple]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """forecast_fiscal_year に渡す収支の表（build_event_finance_table の形）とイベントの表を作る。

    Args:
        done_rows: 実績のある回 (id, イベント名, 開催日の文字列, 売上) のリスト
        future_rows: 実績のない回（今後の予定・入力待ち） (id, イベント名, 開催日の文字列) のリスト

    Returns:
        (fin, events)。fin は実績のある回だけ（has_result=True）で、event_id・name・start_date・sales・
        has_result・fiscal_year の列を持つ。events は全部の回の id・name・start_date
    """
    # 1. 実績のある回の収支の表
    # 変数の内容: fin: 予測計算へ渡すイベント収支のテスト表.
    fin = pd.DataFrame({
        "event_id": [r[0] for r in done_rows],
        "name": [r[1] for r in done_rows],
        "start_date": pd.to_datetime([r[2] for r in done_rows]),
        "sales": [float(r[3]) for r in done_rows],
    })
    fin["has_result"] = True
    fin["fiscal_year"] = fin["start_date"].map(fiscal_year)
    # 2. イベントの表（実績のある回と無い回をまとめる）
    # 変数の内容: events: 予測対象と過去開催を含むイベントテスト表.
    events = pd.DataFrame({
        "id": [r[0] for r in done_rows] + [r[0] for r in future_rows],
        "name": [r[1] for r in done_rows] + [r[1] for r in future_rows],
        "start_date": pd.to_datetime([r[2] for r in done_rows] + [r[2] for r in future_rows]),
    })
    return fin, events


def _legacy_forecast_samples(fin: pd.DataFrame, events: pd.DataFrame, today: pd.Timestamp,
                             n_boot: int, seed: int) -> np.ndarray:
    """変更前の forecast_fiscal_year と同じ計算で samples を作る（従来版との一致を確かめるため）。

    Args:
        fin: 収支の表
        events: イベントの表
        today: 基準日
        n_boot: くり返し回数
        seed: 乱数の種

    Returns:
        従来版の samples
    """
    # 1. 実績のある回・今期・実績合計・残り回数（変更前のコードと同じ手順）
    # 変数の内容: done: 売上実績があるイベントのテスト行.
    done = fin[fin["has_result"]]
    # 変数の内容: fy: 対象データの会計年度。
    fy = fiscal_year(today)
    # 変数の内容: fy_end: 会計年度の末日。
    fy_end = pd.Timestamp(year=fy + 1, month=3, day=31)
    # 変数の内容: actual: 対象年度内の実績データ。
    actual = float(done.loc[done["fiscal_year"] == fy, "sales"].sum())
    # 変数の内容: in_fy: 対象会計年度に含まれるデータ。
    in_fy = events[(events["start_date"].map(fiscal_year) == fy) & (events["start_date"] <= fy_end)]
    # 変数の内容: remaining: 残期間の予測データ。
    remaining = int((~in_fy["id"].isin(set(done["event_id"]))).sum())
    # 2. 全イベントの実績から残りの回数ぶん引いて足す
    # 変数の内容: rng: 固定seedから作った再現可能な乱数生成器.
    rng = np.random.default_rng(seed)
    # 変数の内容: draws: 予測計算で得たサンプル系列。
    draws = rng.choice(done["sales"].to_numpy(), size=(n_boot, remaining), replace=True)
    return actual + draws.sum(axis=1)


# ───────────────────────── series_key ─────────────────────────


@pytest.mark.parametrize("name,expected", [
    # vol 番号（大文字小文字・桁数が違っても同じイベント）
    ("奇天烈 vol.5", "奇天烈"),
    ("奇天烈 Vol.12", "奇天烈"),
    ("Volume 2 Fes", "fes"),
    ("vol 5 fes", "fes"),
    # 英語の序数と記号（『』）を取り除く
    ("植物と暮らしのマーケット『THE BOTANICAL SHOW 6th』", "植物と暮らしのマーケットthebotanicalshow"),
    ("festa 1st", "festa"),
    # 西暦4桁（後ろの「年」も含む）
    ("Habitat Exhibition 2026", "habitatexhibition"),
    ("2026年 春のマルシェ", "春のマルシェ"),
    # 第N回（算用数字・漢数字）
    ("第3回 〇〇", "〇〇"),
    ("第三回 〇〇", "〇〇"),
    ("第十二回 祭", "祭"),
    # #N・no.N・(N)/（N）・全角
    ("ＡＢＣ　＃３", "abc"),
    ("fair no.4", "fair"),
    ("fair No. 4", "fair"),
    ("マルシェ(3)", "マルシェ"),
    ("マルシェ（12）", "マルシェ"),
])
def test_series_keyは回ごとの番号を取り除いて同じイベントのキーになる(name, expected):
    """回ごとに変わる番号（vol・第N回・序数・西暦・#N・no.N・(N)）を取り除いたキーになること。

    Args:
        name: テスト対象のイベント・商品・系列名。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. 回ごとに変わる番号（vol・第N回・序数・西暦・#N・no.N・(N)）を取り除いたキーになること。
    assert series_key(name) == expected


def test_series_keyは番号違いの同じイベントを同じキーにする():
    """「奇天烈 vol.5」と「奇天烈 Vol.12」、「第3回」と「第三回」が同じキーになること。

    Returns:
        なし。"""
    # 1. 「奇天烈 vol.5」と「奇天烈 Vol.12」、「第3回」と「第三回」が同じキーになること。
    assert series_key("奇天烈 vol.5") == series_key("奇天烈 Vol.12")
    assert series_key("第3回 〇〇") == series_key("第三回 〇〇")
    assert series_key("Habitat Exhibition 2025") == series_key("Habitat Exhibition 2026")


@pytest.mark.parametrize("name,expected", [
    # 単語の一部の数字は消さない
    ("ブース2", "ブース2"),
    ("3Dプリント展", "3dプリント展"),
    ("5thavenue", "5thavenue"),
    # vol・no で始まる英単語を誤って消さない
    ("Volcano Fes", "volcanofes"),
    ("Nordic Fair", "nordicfair"),
    # 前後に数字が続く数は西暦とみなさない
    ("A12026", "a12026"),
])
def test_series_keyは単語の一部の数字や英字を消さない(name, expected):
    """「ブース2」「3Dプリント展」の数字や、「Volcano」「Nordic」の vol・no を消さないこと。

    Args:
        name: テスト対象のイベント・商品・系列名。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. 「ブース2」「3Dプリント展」の数字や、「Volcano」「Nordic」の vol・no を消さないこと。
    assert series_key(name) == expected


@pytest.mark.parametrize("name,expected", [
    ("Vol.1", "vol.1"),
    ("2026", "2026"),
])
def test_series_keyは番号を除くと空になる名前を元の名前で返す(name, expected):
    """番号を取り除くと何も残らない名前は、NFKC・小文字・空白除去だけをした元の名前になること。

    Args:
        name: テスト対象のイベント・商品・系列名。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. 番号を取り除くと何も残らない名前は、NFKC・小文字・空白除去だけをした元の名前になること。
    assert series_key(name) == expected
    # 別の番号の名前とは同じキーにならない
    assert series_key("Vol.1") != series_key("Vol.2")


@pytest.mark.parametrize("name", [None, 1, 3.5, "", "   ", "　"])
def test_series_keyは文字列でない名前や空の名前を空文字にする(name):
    """文字列でない・空・空白だけの名前は空文字になること。

    Args:
        name: テスト対象のイベント・商品・系列名。

    Returns:
        なし。"""
    # 1. 文字列でない・空・空白だけの名前は空文字になること。
    assert series_key(name) == ""


@pytest.mark.parametrize("name,expected", [
    # 番号を除いて「空」になる
    ("Vol.5-2", "vol.5-2"),
    ("vol.5 day1", "vol.5day1"),
    # 番号を除いて「ASCII 英数字だけで2文字未満」になる
    ("A 2026", "a2026"),
    ("x vol.1", "xvol.1"),
    ("a", "a"),
    # 番号を除いて「数字だけ」になる（「2026.4」は西暦＋月の型で全部消えるので空 → 元の名前）
    ("2026.4", "2026.4"),
    ("12回目", "12回目"),
])
def test_series_keyは番号を除いた残りが空か数字だけか英字1文字なら元の名前を返す(name, expected):
    """番号を除いた残りが空・数字だけ・ASCII 英数字だけで2文字未満なら、NFKC・小文字・空白除去の元の名前になること。

    Args:
        name: テスト対象のイベント・商品・系列名。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. 番号を除いた残りが空・数字だけ・ASCII 英数字だけで2文字未満なら、NFKC・小文字・空白除去の元の名前になること。
    assert _SERIES_KEY_MIN_ASCII_LENGTH == 2
    assert series_key(name) == expected


@pytest.mark.parametrize("name,expected", [
    # 日本語は1文字でも名前として残す
    ("第十二回 祭", "祭"),
    ("灯 vol.3", "灯"),
    ("祭", "祭"),
    # ASCII 英数字でもちょうど2文字なら番号を除いたキーにする（境界）
    ("ab 2026", "ab"),
    ("AB", "ab"),
])
def test_series_keyは日本語1文字やASCII2文字の名前をキーとして残す(name, expected):
    """日本語1文字（「祭」「灯」）や ASCII 2文字は短くてもキーとして使うこと。

    Args:
        name: テスト対象のイベント・商品・系列名。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. 日本語1文字（「祭」「灯」）や ASCII 2文字は短くてもキーとして使うこと。
    assert series_key(name) == expected


def test_series_keyは英字1文字の別々のイベントを同じキーにしない():
    """「A 2026」と「A 2025」は元の名前になるので別のキーになり、「B 2026」とも違うこと。

    Returns:
        なし。"""
    # 1. 「A 2026」と「A 2025」は元の名前になるので別のキーになり、「B 2026」とも違うこと。
    assert series_key("A 2026") != series_key("A 2025")
    assert series_key("A 2026") != series_key("B 2026")
    # 日本語1文字は番号違いでも同じイベントにまとまる
    assert series_key("灯 vol.3") == series_key("灯 vol.4")


@pytest.mark.parametrize("name", [
    "Market 2026.4",
    "Market 2025/10",
    "Market 2026-04",
    "Market 2026.4.12",
    "Market 2026/4/12",
    "Market 2026年4月",
    "Market 2026",
])
def test_series_keyは西暦と月や日付の番号を取り除く(name):
    """「2026.4」「2025/10」「2026-04」「2026.4.12」「2026年4月」などの年月・日付を取り除いて「market」になること。

    Args:
        name: テスト対象のイベント・商品・系列名。

    Returns:
        なし。"""
    # 1. 「2026.4」「2025/10」「2026-04」「2026.4.12」「2026年4月」などの年月・日付を取り除いて「market」になること。
    assert series_key(name) == "market"


@pytest.mark.parametrize("name,expected", [
    ("〇〇 5回目", "〇〇"),
    ("第5回目 〇〇", "〇〇"),
    ("15回目 〇〇", "〇〇"),
    ("〇〇 12 回目", "〇〇"),
    # 従来の「第N回」も変わらない
    ("第3回 〇〇", "〇〇"),
])
def test_series_keyはN回目と第N回目を取り除く(name, expected):
    """「5回目」「第5回目」を取り除き、「第N回」と同じキーになること。

    Args:
        name: テスト対象のイベント・商品・系列名。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. 「5回目」「第5回目」を取り除き、「第N回」と同じキーになること。
    assert series_key(name) == expected


@pytest.mark.parametrize("name,expected", [
    ("奇天烈 vol.5 day2", "奇天烈"),
    ("Day 2 マルシェ", "マルシェ"),
    ("day.3 fes", "fes"),
    # 単語の一部の day（sunday・holiday）は消さない
    ("Sunday1 Market", "sunday1market"),
    ("Holiday1 Fes", "holiday1fes"),
])
def test_series_keyは複数日開催のday番号を取り除き単語の一部のdayは消さない(name, expected):
    """「day2」「Day 2」「day.3」は取り除き、「Sunday1」「Holiday1」の day は消さないこと。

    Args:
        name: テスト対象のイベント・商品・系列名。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. 「day2」「Day 2」「day.3」は取り除き、「Sunday1」「Holiday1」の day は消さないこと。
    assert series_key(name) == expected


def test_series_keyはday番号違いの日を同じイベントにまとめる():
    """複数日開催の「day1」「day2」が、日付のないイベント名と同じキーになること。

    Returns:
        なし。"""
    # 1. 複数日開催の「day1」「day2」が、日付のないイベント名と同じキーになること。
    assert series_key("奇天烈 vol.5 day1") == series_key("奇天烈 vol.5 day2") == series_key("奇天烈 vol.6")


def test_series_keyは年月日の日付も日まで取り除く():
    """「2026年4月12日」も「2026.4.12」と同じく日まで取り除き、「2026年4月」と同じイベントにまとめる。

    Returns:
        なし。"""
    # 1. 年月日の書き方でも日まで消える
    assert series_key("Market 2026年4月12日") == "market"
    # 2. 書き方の違う同じイベントが、すべて同じキーになる
    assert series_key("Market 2026年4月12日") == series_key("Market 2026年4月") == series_key("Market 2026.4.12")


# ───────────────────────── month_distance / season_weight ─────────────────────────


@pytest.mark.parametrize("a,b,expected", [
    (4, 4, 0),
    (4, 5, 1),
    (12, 1, 1),
    (1, 12, 1),
    (11, 2, 3),
    (4, 10, 6),
    (1, 7, 6),
    (3, 10, 5),
])
def test_month_distanceは12月と1月をとなり合う円環で月の差を数える(a, b, expected):
    """月の差を 0〜6 の円環で数えること（12月と1月は1、4月と10月は6）。

    Args:
        a: 比較する月または数値の1つ目。
        b: 比較する月または数値の2つ目。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. 月の差を 0〜6 の円環で数えること（12月と1月は1、4月と10月は6）。
    assert month_distance(a, b) == expected
    # 順番を入れ替えても同じ
    assert month_distance(b, a) == expected


def test_month_distanceは全ての組み合わせで0から6に収まる():
    """1〜12 のどの組み合わせでも 0〜6 の範囲に収まること。

    Returns:
        なし。"""
    # 1. 1〜12 のどの組み合わせでも 0〜6 の範囲に収まること。
    # 変数の内容: a: 月差計算に渡す1〜12月の開始月。
    for a in range(1, 13):
        # 変数の内容: b: 月差計算へ渡す1〜12月の対象月。
        for b in range(1, 13):
            assert 0 <= month_distance(a, b) <= 6


@pytest.mark.parametrize("d,expected", [
    (0, 1.0),
    (1, 0.8007374029168081),
    (2, 0.41111229050718745),
    (3, 0.1353352832366127),
    (4, 0.02856550078455038),
    (5, 0.003865920139472741),
    (6, 0.00033546262790251185),
])
def test_season_weightは月の差dからexpの重みを返す(d, expected):
    """σ=1.5 で exp(−d²/(2σ²)) の値になること（同じ月 1.0、1か月差 約0.80、半年差 ほぼ0）。

    Args:
        d: 基準月からの月差。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. σ=1.5 で exp(−d²/(2σ²)) の値になること（同じ月 1.0、1か月差 約0.80、半年差 ほぼ0）。
    assert SEASON_SIGMA_MONTHS == 1.5
    assert season_weight(d) == pytest.approx(expected)
    assert season_weight(d) == pytest.approx(math.exp(-(d ** 2) / (2 * 1.5 ** 2)))


def test_season_weightは月が離れるほど小さくなりsigmaを広げると大きくなる():
    """d が増えるほど重みが単調に下がり、sigma を大きくすると同じ d でも重みが大きくなること。

    Returns:
        なし。"""
    # 1. d が増えるほど重みが単調に下がり、sigma を大きくすると同じ d でも重みが大きくなること。
    # 変数の内容: weights: 月差ごとの季節重み一覧.
    weights = [season_weight(d) for d in range(7)]
    assert all(a > b for a, b in zip(weights, weights[1:]))
    assert season_weight(3, sigma=3.0) > season_weight(3)


# ───────────────────────── weighted_median / series_weight ─────────────────────────


def test_weighted_medianは重みが同じならふつうの中央値になる():
    """重みがすべて同じとき、奇数個は真ん中、偶数個は真ん中2つの平均になること。

    Returns:
        なし。"""
    # 1. 重みがすべて同じとき、奇数個は真ん中、偶数個は真ん中2つの平均になること。
    assert weighted_median([30, 10, 20], [1, 1, 1]) == 20
    assert weighted_median([40, 10, 30, 20], [1, 1, 1, 1]) == 25
    assert weighted_median([5], [0.3]) == 5


def test_weighted_medianは重いほうの値に寄る():
    """重みの大きい値が中央値になること（並びが不順でも値の小さい順に数える）。

    Returns:
        なし。"""
    # 1. 重みの大きい値が中央値になること（並びが不順でも値の小さい順に数える）。
    assert weighted_median([300000, 100000], [0.001, 1.0]) == 100000
    assert weighted_median([100000, 300000], [1.0, 3.0]) == 300000
    # 10 の重み 1、20 の重み 1、30 の重み 3 → 累計が半分(2.5)に達するのは 30
    assert weighted_median([30, 10, 20], [3, 1, 1]) == 30


def test_weighted_medianは値が無いか重みの合計が0ならNoneを返す():
    """値が空・重みが全部 0 のときは None になること。

    Returns:
        なし。"""
    # 1. 値が空・重みが全部 0 のときは None になること。
    assert weighted_median([], []) is None
    assert weighted_median([1, 2], [0, 0]) is None


@pytest.mark.parametrize("n,expected", [
    (1, 1 / 3),
    (2, 0.5),
    (4, 2 / 3),
    (8, 0.8),
    (0.5, 0.2),
])
def test_series_weightは回数nからn割るn足すKを返す(n, expected):
    """K=2 で n/(n+K) になること（1回 33%、2回 50%、4回 67%、8回 80%）。

    Args:
        n: 検証対象の件数または数値。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. K=2 で n/(n+K) になること（1回 33%、2回 50%、4回 67%、8回 80%）。
    assert SERIES_PRIOR_K == 2
    assert series_weight(n) == pytest.approx(expected)


@pytest.mark.parametrize("n", [0, 0.0, -1])
def test_series_weightは回数が0以下なら0を返す(n):
    """n が 0 以下なら 0.0 になること（全イベントの実績だけで見込む）。

    Args:
        n: 検証対象の件数または数値。

    Returns:
        なし。"""
    # 1. n が 0 以下なら 0.0 になること（全イベントの実績だけで見込む）。
    assert series_weight(n) == 0.0


def test_series_weightはKを大きくすると小さくなる():
    """k を大きくするほど同じイベントの重みが下がること。

    Returns:
        なし。"""
    # 1. k を大きくするほど同じイベントの重みが下がること。
    assert series_weight(2, k=6) == pytest.approx(0.25)
    assert series_weight(2, k=6) < series_weight(2)


# ───────────────────────── displayed_median ─────────────────────────


@pytest.mark.parametrize("weight,expected", [
    (0.0049, None),  # しきい値の少し下 → 出さない
    (0.005, 120000.0),  # しきい値ちょうど → 出す
    (0.0051, 120000.0),
    (0.6, 120000.0),
    (0.0, None),
])
def test_displayed_medianは重みが0点5パーセント未満なら中央値を出さない(weight, expected):
    """重みが MIN_DISPLAY_SERIES_WEIGHT（0.005）未満なら None、以上なら中央値をそのまま返すこと。

    Args:
        weight: 中央値計算に使う重み。
        expected: 比較する期待値。

    Returns:
        なし。"""
    # 1. 重みが MIN_DISPLAY_SERIES_WEIGHT（0.005）未満なら None、以上なら中央値をそのまま返すこと。
    assert MIN_DISPLAY_SERIES_WEIGHT == 0.005
    assert displayed_median(120000, weight) == expected


@pytest.mark.parametrize("median", [None, float("nan"), np.nan])
def test_displayed_medianは中央値が無ければ重みに関係なくNoneを返す(median):
    """中央値が None・NaN なら、重みが大きくても None になること。

    Args:
        median: 検証対象の件数または数値。

    Returns:
        なし。"""
    # 1. 中央値が None・NaN なら、重みが大きくても None になること。
    assert displayed_median(median, 0.9) is None


def test_displayed_medianはmin_weightを変えるとしきい値が変わり値はfloatで返す():
    """min_weight を指定するとそのしきい値で判定し、返す値は float になること。

    Returns:
        なし。"""
    # 1. min_weight を指定するとそのしきい値で判定し、返す値は float になること。
    assert displayed_median(100000, 0.3, min_weight=0.5) is None
    # 変数の内容: shown: 画面に表示された値。
    shown = displayed_median(np.int64(100000), 0.5, min_weight=0.5)
    assert shown == 100000.0 and isinstance(shown, float)


# ───────────────────────── series_references ─────────────────────────

# series_references の戻り値の列（この順）
REF_COLUMNS = ["event_id", "name", "start_date", "series_key", "n_past", "n_eff", "median_past", "weight",
               "past_names", "past_dates", "past_months", "past_sales", "past_season_weights"]


def test_series_referencesは同じキーの過去の回だけを開催日順に集める():
    """同じイベント（番号違い）の回だけが集まり、別のイベントは混ざらず、過去の回は開催日順に並ぶこと。

    Returns:
        なし。"""
    # 1. 同じイベント（番号違い）の回だけが集まり、別のイベントは混ざらず、過去の回は開催日順に並ぶこと。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([
        ("奇天烈 vol.3", "2025-11-10", 120000),
        ("別のマルシェ", "2025-11-12", 50000),
        ("奇天烈 vol.1", "2023-11-10", 80000),
        ("Volcano Fes", "2025-11-01", 999999),
        ("奇天烈 Vol.2", "2024-11-10", 100000),
    ])
    # 変数の内容: remaining: 残期間の予測データ。
    remaining = _remaining([("r1", "奇天烈 vol.4", "2026-11-15")])
    # 変数の内容: ref: 残りイベントごとに参照する過去実績をまとめた表。
    ref = series_references(remaining, history)
    assert list(ref.columns) == REF_COLUMNS
    # 変数の内容: row: 処理対象のデータ行。
    row = ref.iloc[0]
    assert row["event_id"] == "r1" and row["name"] == "奇天烈 vol.4" and row["series_key"] == "奇天烈"
    assert row["n_past"] == 3
    # 過去の回は開催日順（past_ の列はすべて同じ順）
    assert row["past_names"] == ["奇天烈 vol.1", "奇天烈 Vol.2", "奇天烈 vol.3"]
    assert list(row["past_dates"]) == list(pd.to_datetime(["2023-11-10", "2024-11-10", "2025-11-10"]))
    assert row["past_months"] == [11, 11, 11]
    assert row["past_sales"] == [80000.0, 100000.0, 120000.0]
    # 同じ月なので時期の重みはすべて 1.0、実質の回数は 3、重みは 3/(3+2)
    assert row["past_season_weights"] == pytest.approx([1.0, 1.0, 1.0])
    assert row["n_eff"] == pytest.approx(3.0)
    assert row["weight"] == pytest.approx(0.6)
    assert row["median_past"] == pytest.approx(100000)


def test_series_referencesは残りのイベントを開催日とidの順に並べる():
    """残りのイベントの行が開催日順（同じ日なら id 順）に並ぶこと。

    Returns:
        なし。"""
    # 1. 残りのイベントの行が開催日順（同じ日なら id 順）に並ぶこと。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([("A", "2025-05-01", 10000)])
    # 変数の内容: remaining: 残期間の予測データ。
    remaining = _remaining([
        ("r3", "C", "2027-01-10"),
        ("r2", "B", "2026-12-01"),
        ("r1", "A", "2026-12-01"),
    ])
    # 変数の内容: ref: 残りイベントごとに参照する過去実績をまとめた表。
    ref = series_references(remaining, history)
    assert list(ref["event_id"]) == ["r1", "r2", "r3"]
    # 同じイベントの無い行は回数 0・重み 0・中央値なし
    # 変数の内容: b: 参照結果から取り出した対象イベントの集計行。
    b = ref[ref["event_id"] == "r2"].iloc[0]
    assert b["n_past"] == 0 and b["n_eff"] == 0 and b["weight"] == 0.0
    assert b["median_past"] is None or pd.isna(b["median_past"])
    assert b["past_names"] == [] and b["past_sales"] == []


def test_series_referencesは開催月の近さで時期の重みとn_effとweightを計算する():
    """同じ月 1.0・1か月差 約0.80・3か月差 約0.14 の重みが付き、n_eff はその合計、weight は n_eff/(n_eff+2) になること。

    Returns:
        なし。"""
    # 1. 同じ月 1.0・1か月差 約0.80・3か月差 約0.14 の重みが付き、n_eff はその合計、weight は n_eff/(n_eff+2…。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([
        ("マルシェ 2025", "2025-11-03", 100000),  # 同じ月（d=0）
        ("マルシェ 2024", "2024-10-03", 200000),  # 1か月差（d=1）
        ("マルシェ 2023", "2023-08-03", 400000),  # 3か月差（d=3）
    ])
    # 変数の内容: remaining: 残期間の予測データ。
    remaining = _remaining([("r1", "マルシェ 2026", "2026-11-20")])
    # 変数の内容: row: 処理対象のデータ行。
    row = series_references(remaining, history).iloc[0]
    # 変数の内容: s: 開催月の差に対応する季節重みの一覧。
    s = [season_weight(3), season_weight(1), season_weight(0)]  # 開催日順（2023→2024→2025）
    assert row["past_months"] == [8, 10, 11]
    assert row["past_season_weights"] == pytest.approx(s)
    assert row["n_eff"] == pytest.approx(sum(s))
    assert row["n_eff"] == pytest.approx(0.1353 + 0.8007 + 1.0, abs=1e-3)
    assert row["weight"] == pytest.approx(sum(s) / (sum(s) + 2))
    # 重み付き中央値: 100000(1.0) 200000(0.80) 400000(0.14) → 半分(約0.97)に届くのは 100000
    assert row["median_past"] == pytest.approx(100000)


def test_series_referencesは12月と1月をとなりの月として重みを付ける():
    """残りが1月・過去が12月のとき、1か月差の重み（約0.80）になること。

    Returns:
        なし。"""
    # 1. 残りが1月・過去が12月のとき、1か月差の重み（約0.80）になること。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([("冬市", "2025-12-20", 50000)])
    # 変数の内容: row: 処理対象のデータ行。
    row = series_references(_remaining([("r1", "冬市", "2027-01-15")]), history).iloc[0]
    assert row["past_season_weights"] == pytest.approx([season_weight(1)])


def test_series_referencesは季節の違う回しか無いとweightを0にする():
    """時期の重みの合計がしきい値未満（半年差の回だけ）なら、weight=0・中央値なしになること。

    Returns:
        なし。"""
    # 1. 時期の重みの合計がしきい値未満（半年差の回だけ）なら、weight=0・中央値なしになること。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([
        ("春秋フェス", "2024-10-05", 300000),
        ("春秋フェス", "2025-10-05", 300000),
    ])
    # 変数の内容: row: 処理対象のデータ行。
    row = series_references(_remaining([("r1", "春秋フェス", "2027-04-10")]), history).iloc[0]
    # 半年差 2回で n_eff ≈ 0.00067 < 0.001
    assert row["n_past"] == 2
    assert row["n_eff"] == pytest.approx(2 * season_weight(6))
    assert row["n_eff"] < MIN_SEASON_WEIGHT_TOTAL
    assert row["weight"] == 0.0
    assert row["median_past"] is None or pd.isna(row["median_past"])
    # 過去の回の一覧には残る（表で「重み0%」として見せるため）
    assert row["past_names"] == ["春秋フェス", "春秋フェス"]


def test_series_referencesは時期の重みの合計がしきい値以上ならweightを付ける():
    """n_eff がしきい値以上（5か月差 約0.0039）なら weight が 0 より大きくなること。

    Returns:
        なし。"""
    # 1. n_eff がしきい値以上（5か月差 約0.0039）なら weight が 0 より大きくなること。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([("春秋フェス", "2025-11-05", 300000)])
    # 変数の内容: row: 処理対象のデータ行。
    row = series_references(_remaining([("r1", "春秋フェス", "2027-04-10")]), history).iloc[0]
    assert row["n_eff"] == pytest.approx(season_weight(5))
    assert row["n_eff"] >= MIN_SEASON_WEIGHT_TOTAL
    assert row["weight"] == pytest.approx(series_weight(season_weight(5)))
    assert row["median_past"] == pytest.approx(300000)


def test_series_referencesは過去の回の開催日が不明なら重み1とする():
    """開催日が分からない過去の回は時期で差をつけず s=1.0、開催月は None になること。

    Returns:
        なし。"""
    # 1. 開催日が分からない過去の回は時期で差をつけず s=1.0、開催月は None になること。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([
        ("夏祭り", None, 70000),
        ("夏祭り", "2025-01-10", 90000),  # 7月の残りに対して 6か月差
    ])
    # 変数の内容: row: 処理対象のデータ行。
    row = series_references(_remaining([("r1", "夏祭り", "2026-07-10")]), history).iloc[0]
    # 開催日の並べ替えで NaT は最後に来る
    assert row["past_months"] == [1, None]
    assert row["past_season_weights"] == pytest.approx([season_weight(6), 1.0])
    assert row["n_eff"] == pytest.approx(1.0 + season_weight(6))


def test_series_referencesは残りのイベントの開催日が不明なら全部の回を重み1とする():
    """残りのイベントの開催日が分からないときは、すべての過去の回を s=1.0 で数えること。

    Returns:
        なし。"""
    # 1. 残りのイベントの開催日が分からないときは、すべての過去の回を s=1.0 で数えること。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([
        ("夏祭り", "2025-01-10", 90000),
        ("夏祭り", "2025-07-10", 70000),
    ])
    # 変数の内容: row: 処理対象のデータ行。
    row = series_references(_remaining([("r1", "夏祭り", None)]), history).iloc[0]
    assert row["past_season_weights"] == [1.0, 1.0]
    assert row["n_eff"] == pytest.approx(2.0)
    assert row["weight"] == pytest.approx(0.5)
    assert row["median_past"] == pytest.approx(80000)


def test_series_referencesは過去の回に名前の列が無いと同じイベントを探さない():
    """history に name 列が無いとき、どの残りのイベントも回数 0・重み 0 になること。

    Returns:
        なし。"""
    # 1. history に name 列が無いとき、どの残りのイベントも回数 0・重み 0 になること。
    history = pd.DataFrame({"start_date": pd.to_datetime(["2025-11-01"]), "sales": [10000.0]})
    # 変数の内容: ref: 残りイベントごとに参照する過去実績をまとめた表。
    ref = series_references(_remaining([("r1", "A", "2026-11-01")]), history)
    # 変数の内容: row: 処理対象のデータ行。
    row = ref.iloc[0]
    assert row["n_past"] == 0 and row["weight"] == 0.0 and row["past_names"] == []


def test_series_referencesは残りのイベントに名前の列が無いと同じイベントを探さない():
    """remaining に name 列が無いとき、キーは空文字・回数 0・重み 0 になること。

    Returns:
        なし。"""
    # 1. remaining に name 列が無いとき、キーは空文字・回数 0・重み 0 になること。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([("A", "2025-11-01", 10000)])
    # 変数の内容: remaining: 残期間の予測データ。
    remaining = pd.DataFrame({"id": ["r1"], "start_date": pd.to_datetime(["2026-11-01"])})
    # 変数の内容: row: 処理対象のデータ行。
    row = series_references(remaining, history).iloc[0]
    assert row["series_key"] == "" and row["n_past"] == 0 and row["weight"] == 0.0


def test_series_referencesは名前が空のイベント同士を同じとみなさない():
    """残りのイベントも過去の回も名前が None のとき、同じイベントとして扱わないこと。

    Returns:
        なし。"""
    # 1. 残りのイベントも過去の回も名前が None のとき、同じイベントとして扱わないこと。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([(None, "2025-11-01", 10000)])
    # 変数の内容: row: 処理対象のデータ行。
    row = series_references(_remaining([("r1", None, "2026-11-01")]), history).iloc[0]
    assert row["series_key"] == "" and row["n_past"] == 0 and row["weight"] == 0.0


def test_series_referencesは過去の回に開催日の列が無いと全部を重み1とする():
    """history に start_date 列が無いとき、開催月は None・時期の重みは 1.0 になること。

    Returns:
        なし。"""
    # 1. history に start_date 列が無いとき、開催月は None・時期の重みは 1.0 になること。
    history = pd.DataFrame({"name": ["A", "A"], "sales": [10000.0, 30000.0]})
    # 変数の内容: row: 処理対象のデータ行。
    row = series_references(_remaining([("r1", "A", "2026-11-01")]), history).iloc[0]
    assert row["past_months"] == [None, None]
    assert row["past_season_weights"] == [1.0, 1.0]
    assert row["weight"] == pytest.approx(0.5)


def test_series_referencesは残りが無ければ列だけの空の表を返す():
    """残りのイベントが 0 件なら、決まった列を持つ空の表になること。

    Returns:
        なし。"""
    # 1. 残りのイベントが 0 件なら、決まった列を持つ空の表になること。
    # 変数の内容: remaining: 売上予測が必要なイベントのテスト表.
    remaining = pd.DataFrame({"id": [], "name": [], "start_date": _EMPTY_DATES})
    # 変数の内容: ref: 残りイベントごとに参照する過去実績をまとめた表。
    ref = series_references(remaining, _history([("A", "2025-11-01", 1)]))
    assert ref.empty and list(ref.columns) == REF_COLUMNS


def test_series_referencesは過去の回が空でも残りのイベントの行を作る():
    """history が空でも、残りのイベントごとに回数 0・重み 0 の行ができること。

    Returns:
        なし。"""
    # 1. history が空でも、残りのイベントごとに回数 0・重み 0 の行ができること。
    history = pd.DataFrame({"name": [], "start_date": _EMPTY_DATES, "sales": []})
    # 変数の内容: ref: 残りイベントごとに参照する過去実績をまとめた表。
    ref = series_references(_remaining([("r1", "A", "2026-11-01"), ("r2", "B", "2026-12-01")]), history)
    assert list(ref["event_id"]) == ["r1", "r2"]
    assert list(ref["n_past"]) == [0, 0] and list(ref["weight"]) == [0.0, 0.0]


# ───────────────────────── forecast_fiscal_year ─────────────────────────


def _no_series_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    """同じイベントが1つも無いデータ（従来版との一致を確かめる用）を作る。

    Returns:
        (fin, events)。実績6回（うち今期2回）、残り3回（今後の予定2回・入力待ち1回）
    """
    # 変数の内容: done: 予測テストに使う売上実績イベントの行。
    done = [
        ("d1", "ひだまり市", "2025-05-10", 12000),
        ("d2", "みどり展", "2025-08-10", 34000),
        ("d3", "森のマーケット", "2025-12-10", 56000),
        ("d4", "Volcano Fes", "2026-02-10", 23000),
        ("d5", "ブース2", "2026-05-10", 41000),
        ("d6", "3Dプリント展", "2026-07-10", 18000),
    ]
    # 変数の内容: future: 予測テストに使う売上未入力イベントの行。
    future = [
        ("f0", "入力待ちの市", "2026-09-01"),  # 今日より前だが売上が入っていない
        ("f1", "Nordic Fair", "2026-11-01"),
        ("f2", "冬の植物市", "2027-02-01"),
        ("f3", "来年度の市", "2027-05-01"),  # 来年度なので残りに数えない
    ]
    return _fin_and_events(done, future)


@pytest.mark.parametrize("seed", [0, 1, 42])
def test_forecastは同じイベントが無ければ従来版とsamplesが完全に一致する(seed):
    """同じイベントの過去の実績が無いデータでは、変更前の計算と samples が完全一致すること。

    Args:
        seed: 基準月からの月差。

    Returns:
        なし。"""
    # 1. 同じイベントの過去の実績が無いデータでは、変更前の計算と samples が完全一致すること。
    # 変数の内容: fin: 予測計算へ渡すイベント収支のテスト表。events: 予測対象と過去開催を含むイベントテスト表。
    fin, events = _no_series_data()
    # 変数の内容: fc: テスト条件で計算した着地予測結果。
    fc = forecast_fiscal_year(fin, events, TODAY, n_boot=3000, seed=seed)
    # 変数の内容: legacy: 従来の予測計算で得た比較用サンプル。
    legacy = _legacy_forecast_samples(fin, events, TODAY, n_boot=3000, seed=seed)
    assert fc["remaining"] == 3
    assert fc["actual"] == 41000 + 18000
    np.testing.assert_array_equal(fc["samples"], legacy)
    assert fc["p50"] == float(np.percentile(legacy, 50))
    # details はあるが、どの行も重み 0
    assert list(fc["details"]["weight"]) == [0.0, 0.0, 0.0]


def test_forecastは名前の列が無いデータでも従来版と一致する():
    """収支・イベントの表に name 列が無いデータでも、従来版と samples が完全一致すること。

    Returns:
        なし。"""
    # 1. 収支・イベントの表に name 列が無いデータでも、従来版と samples が完全一致すること。
    # 変数の内容: fin: 予測計算へ渡すイベント収支のテスト表。events: 予測対象と過去開催を含むイベントテスト表。
    fin, events = _no_series_data()
    # 変数の内容: fin: テスト対象関数へ渡す収支データ表。
    fin = fin.drop(columns=["name"])
    # 変数の内容: events: テスト対象関数へ渡すイベントデータ表。
    events = events.drop(columns=["name"])
    # 変数の内容: fc: テスト条件で計算した着地予測結果。
    fc = forecast_fiscal_year(fin, events, TODAY, n_boot=2000, seed=7)
    np.testing.assert_array_equal(fc["samples"], _legacy_forecast_samples(fin, events, TODAY, 2000, 7))
    assert list(fc["details"]["n_past"]) == [0, 0, 0]


def _series_data(series_name_for_remaining: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """全体の実績は 2万円、同じイベント（奇天烈）の11月の回は 10万円のデータを作る。

    Args:
        series_name_for_remaining: 今期の残りのイベント（2026-11-15）の名前

    Returns:
        (fin, events)。今期の実績は 0、残りは1回
    """
    # 変数の内容: done: 予測テストに使う売上実績イベントの行。
    done = [(f"g{i}", f"いろいろ市{chr(65 + i)}", f"2024-0{i + 4}-10", 20000) for i in range(5)]
    # 変数の内容: done: 予測テストに使う売上実績イベントの行。
    done += [(f"k{i}", f"奇天烈 vol.{i + 1}", f"{2022 + i}-11-10", 100000) for i in range(4)]
    # 変数の内容: future: 予測テストに使う売上未入力イベントの行。
    future = [("r1", series_name_for_remaining, "2026-11-15")]
    return _fin_and_events(done, future)


def test_forecastは同じイベントがあると見込みのp50がその実績側に寄る():
    """同じイベントの実績が 10万円なら p50 が 10万円に寄り、同じイベントが無ければ全体の 2万円のままになること。

    Returns:
        なし。"""
    # 1. 同じイベントの実績が 10万円なら p50 が 10万円に寄り、同じイベントが無ければ全体の 2万円のままになること。
    # 変数の内容: fin: 予測計算へ渡すイベント収支のテスト表。events: 予測対象と過去開催を含むイベントテスト表。
    fin, events = _series_data("奇天烈 vol.5")
    # 変数の内容: fc: テスト条件で計算した着地予測結果。
    fc = forecast_fiscal_year(fin, events, TODAY, n_boot=5000, seed=0)
    assert fc["actual"] == 0 and fc["remaining"] == 1
    # 同じ月の4回 → n_eff=4、weight=4/6。10万円を引く確率 ≈ 2/3 + 1/3×4/9 ≈ 0.81
    assert fc["p50"] == pytest.approx(100000)
    # 変数の内容: share: 同一イベントの過去売上が予測サンプルに現れた割合。
    share = float(np.mean(fc["samples"] == 100000))
    assert share == pytest.approx(2 / 3 + (1 / 3) * (4 / 9), abs=0.03)

    # 比較: 同じイベントの無い名前なら全体の実績（2万円が 5/9）だけで引くので p50 は 2万円
    # 変数の内容: fin2: 比較条件の予測計算へ渡す収支表。events2: 比較条件の予測計算へ渡すイベント表。
    fin2, events2 = _series_data("はじめての市")
    # 変数の内容: fc2: 比較条件で再計算した着地予測結果。
    fc2 = forecast_fiscal_year(fin2, events2, TODAY, n_boot=5000, seed=0)
    assert fc2["p50"] == pytest.approx(20000)
    assert fc["p50"] > fc2["p50"]
    assert float(np.mean(fc2["samples"] == 100000)) == pytest.approx(4 / 9, abs=0.03)


def test_forecastは季節の違う同じイベントの回をほとんど選ばない():
    """春の残りに対し、4月の回(10万)と10月の回(30万)があると、同じイベントから引いた売上のほとんどが10万になること。

    Returns:
        なし。"""
    # 変数の内容: today: 日付計算で固定する今日。
    today = pd.Timestamp("2026-04-01")
    # 変数の内容: done: 予測テストに使う売上実績イベントの行。
    done = [(f"g{i}", f"いろいろ市{chr(65 + i)}", f"2025-0{i + 5}-10", 1000 * (i + 1)) for i in range(5)]
    # 同じイベント（年2回開催）: 4月の回は 10万円、10月の回は 30万円
    done += [
        ("s1", "春秋フェス 2024", "2024-04-10", 100000),
        ("s2", "春秋フェス 2024", "2024-10-10", 300000),
        ("s3", "春秋フェス 2025", "2025-04-10", 100000),
        ("s4", "春秋フェス 2025", "2025-10-10", 300000),
    ]
    # 変数の内容: fin: 計算に渡す売上・費用の入力値、events: API に返すイベントのテストデータ。
    fin, events = _fin_and_events(done, [("r1", "春秋フェス 2026", "2026-04-20")])
    # 変数の内容: n_boot: 予測の反復回数。、seed: 予測を再現する乱数の種。
    n_boot, seed = 20000, 3
    # 変数の内容: fc: テスト条件で計算した着地予測結果。
    fc = forecast_fiscal_year(fin, events, today, n_boot=n_boot, seed=seed)

    # 1. details: 4月の回は重み 1、10月の回は半年差でほぼ 0、n_eff ≈ 2、weight ≈ 0.5
    # 変数の内容: row: テスト結果表から取り出した対象行.
    row = fc["details"].iloc[0]
    assert row["past_months"] == [4, 10, 4, 10]
    assert row["past_season_weights"] == pytest.approx([1.0, season_weight(6), 1.0, season_weight(6)])
    assert row["weight"] == pytest.approx(0.5, abs=1e-3)

    # 2. 置き換え部分を同じ乱数の手順で再現し、同じイベントから引いた売上がほぼすべて 10万円であることを確かめる
    # 変数の内容: rng: 固定seedから作った再現可能な乱数生成器.
    rng = np.random.default_rng(seed)
    rng.choice(fin["sales"].to_numpy(), size=(n_boot, 1), replace=True)
    # 変数の内容: use_same: 同一イベントの過去実績で置換するシミュレーション行。
    use_same = rng.random(n_boot) < row["weight"]
    # 変数の内容: p: 同一イベントの過去開催回を抽選する確率配列。
    p = np.asarray(row["past_season_weights"]) / sum(row["past_season_weights"])
    # 変数の内容: same_draws: 同一イベントの過去売上から抽選したサンプル。
    same_draws = rng.choice(np.asarray(row["past_sales"]), size=n_boot, replace=True, p=p)
    # 変数の内容: replaced: 過去売上で置換された予測サンプル。
    replaced = fc["samples"][use_same]
    np.testing.assert_array_equal(replaced, same_draws[use_same])
    assert float(np.mean(replaced == 100000)) > 0.99

    # 3. 全体として見ても、10万円は 30万円よりずっと多く出る
    #    （30万円は全体の実績から引いたときだけ: 約 0.5 × 2/9 ≈ 11%）
    # 変数の内容: n100: 予測サンプル中で10万円になった件数.
    n100 = int(np.sum(fc["samples"] == 100000))
    # 変数の内容: n300: 予測サンプル中で30万円と一致する件数。
    n300 = int(np.sum(fc["samples"] == 300000))
    assert n100 > 4 * n300
    assert n300 / n_boot == pytest.approx(0.5 * 2 / 9, abs=0.02)


def test_forecastはseedが同じなら同じ結果になり違えば変わる():
    """同じ seed なら samples と p10/p50/p90 が完全に同じ、違う seed なら samples が変わること。

    Returns:
        なし。"""
    # 1. 同じ seed なら samples と p10/p50/p90 が完全に同じ、違う seed なら samples が変わること。
    # 変数の内容: fin: 予測計算へ渡すイベント収支のテスト表。events: 予測対象と過去開催を含むイベントテスト表。
    fin, events = _series_data("奇天烈 vol.5")
    # 変数の内容: a: 同じ乱数種で計算した1つ目の予測結果。
    a = forecast_fiscal_year(fin, events, TODAY, n_boot=2000, seed=11)
    # 変数の内容: b: 同じ乱数種で計算した2つ目の予測結果。
    b = forecast_fiscal_year(fin, events, TODAY, n_boot=2000, seed=11)
    # 変数の内容: c: 異なる乱数種で計算した予測結果。
    c = forecast_fiscal_year(fin, events, TODAY, n_boot=2000, seed=12)
    np.testing.assert_array_equal(a["samples"], b["samples"])
    assert (a["p10"], a["p50"], a["p90"]) == (b["p10"], b["p50"], b["p90"])
    assert not np.array_equal(a["samples"], c["samples"])


def test_forecastのdetailsは残りのイベントごとに参考にした実績を持つ():
    """details に残りのイベントが開催日順に並び、今日以降の回や実績の無い回は過去の実績に含まれないこと。

    Returns:
        なし。"""
    # 変数の内容: done: 予測テストに使う売上実績イベントの行。
    done = [(f"g{i}", f"いろいろ市{chr(65 + i)}", f"2025-0{i + 4}-10", 20000) for i in range(5)]
    # 変数の内容: done: 予測テストに使う売上実績イベントの行。
    done += [
        ("k1", "奇天烈 vol.1", "2024-11-10", 80000),
        ("k2", "奇天烈 vol.2", "2025-11-10", 120000),
        # 今日と同じ日の回（実績あり）は「今日より前」ではないので過去の実績に含めない
        ("k3", "奇天烈 vol.3", "2026-10-18", 999999),
    ]
    # 変数の内容: future: 予測テストに使う売上未入力イベントの行。
    future = [
        ("r2", "第2回 冬の市", "2027-01-20"),
        ("r1", "奇天烈 vol.4", "2026-11-15"),
        ("w1", "奇天烈 vol.0", "2026-09-01"),  # 入力待ち（実績なし）は残りに入るが過去の実績にはならない
    ]
    # 変数の内容: fin: 計算に渡す売上・費用の入力値、events: API に返すイベントのテストデータ。
    fin, events = _fin_and_events(done, future)
    # 変数の内容: fc: テスト条件で計算した着地予測結果。
    fc = forecast_fiscal_year(fin, events, TODAY, n_boot=1000, seed=0)
    # 変数の内容: d: 予測詳細テーブル。
    d = fc["details"]
    assert list(d.columns) == REF_COLUMNS
    assert fc["remaining"] == 3 and len(d) == 3
    # 1. 開催日順
    assert list(d["event_id"]) == ["w1", "r1", "r2"]
    # 2. 奇天烈 vol.4: 今日の回(vol.3)と入力待ち(vol.0)は含まず、vol.1・vol.2 だけ
    # 変数の内容: r1: 同じイベント系列に属する開催実績の集計行。
    r1 = d[d["event_id"] == "r1"].iloc[0]
    assert r1["past_names"] == ["奇天烈 vol.1", "奇天烈 vol.2"]
    assert r1["past_sales"] == [80000.0, 120000.0]
    assert r1["n_past"] == 2
    assert r1["n_eff"] == pytest.approx(2.0)
    assert r1["weight"] == pytest.approx(0.5)
    assert r1["median_past"] == pytest.approx(100000)
    # 3. 冬の市は同じイベントが無いので重み 0
    # 変数の内容: r2: 過去実績のない冬の市について計算した参照詳細行。
    r2 = d[d["event_id"] == "r2"].iloc[0]
    assert r2["series_key"] == "冬の市" and r2["n_past"] == 0 and r2["weight"] == 0.0
    # 4. 今期の実績には今日の回(vol.3)も入る
    assert fc["actual"] == 999999


def test_forecastは残りのイベントが無ければdetailsが空になる():
    """今期の残りが 0 回なら、見込みは実績合計と同じで details は空の表になること。

    Returns:
        なし。"""
    # 1. 今期の残りが 0 回なら、見込みは実績合計と同じで details は空の表になること。
    # 変数の内容: done: 売上実績があるイベントのテスト行.
    done = [(f"g{i}", f"市{i}", f"2026-0{i + 4}-10", 10000) for i in range(5)]
    # 変数の内容: fin: 計算に渡す売上・費用の入力値、events: API に返すイベントのテストデータ。
    fin, events = _fin_and_events(done, [])
    # 変数の内容: fc: テスト条件で計算した着地予測結果。
    fc = forecast_fiscal_year(fin, events, TODAY, n_boot=500)
    assert fc["remaining"] == 0
    assert fc["p10"] == fc["p50"] == fc["p90"] == 50000
    assert fc["details"].empty and list(fc["details"].columns) == REF_COLUMNS


# ───────────────────────── 画面の表（AppTest） ─────────────────────────


def _details_script(details):
    """AppTest で _forecast_details だけを描く小さなスクリプト。

    Args:
        details: 表示する details（series_references の結果の形）

    Returns:
        なし。"""
    from views.advanced import _forecast_details

    _forecast_details(details)


def _sample_details() -> pd.DataFrame:
    """画面に出す details を series_references で作る（同じイベントあり1件・なし1件・名前なし1件）。

    Returns:
        details の表
    """
    # 変数の内容: history: 予測テストで参照する過去イベントの履歴。
    history = _history([
        ("奇天烈 vol.1", "2024-11-10", 80000),
        ("奇天烈 vol.2", "2025-10-10", 120000),
        ("奇天烈 vol.3", None, 100000),
    ])
    # 変数の内容: remaining: 残期間の予測データ。
    remaining = _remaining([
        ("r1", "奇天烈 vol.4", "2026-11-15"),
        ("r2", "はじめての市", "2026-12-01"),
        ("r3", None, "2027-01-10"),
    ])
    return series_references(remaining, history)


def test_画面の表は残りのイベントごとに参考にした実績を列に並べて表示する():
    """_forecast_details が見出し・決まった列・値の表示形式（円・%・小数1桁・過去の回の説明）で表を出すこと。

    Returns:
        なし。"""
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = AppTest.from_function(_details_script, kwargs={"details": _sample_details()}, default_timeout=30).run()
    assert not at.exception
    assert [s.value for s in at.subheader] == ["残りのイベントと参考にした実績"]
    # 変数の内容: table: 画面テストから取得した表示用の DataFrame。
    table = at.dataframe[0].value
    assert list(table.columns) == [
        "イベント名", "開催日", "同じイベントの過去の回数", "時期を考慮した実質の回数",
        "過去の売上の中央値", "同じイベントの重み", "まとめた過去の回",
    ]
    # 変数の内容: rows: テスト用レコードの一覧。
    rows = table.to_dict("records")
    # 1. 同じイベントのある行
    # 変数の内容: s1: 2025年10月開催分に適用する季節重み。
    s1 = season_weight(month_distance(11, 10))  # 2025年10月の回の重み（約0.80）
    # 変数の内容: n_eff: 時期の重みを加味した実績回数。
    n_eff = 1.0 + s1 + 1.0
    assert rows[0]["イベント名"] == "奇天烈 vol.4"
    assert rows[0]["開催日"] == "2026-11-15"
    assert rows[0]["同じイベントの過去の回数"] == 3
    assert rows[0]["時期を考慮した実質の回数"] == f"{n_eff:.1f}" == "2.8"
    assert rows[0]["過去の売上の中央値"] == "100,000円"
    assert rows[0]["同じイベントの重み"] == f"{n_eff / (n_eff + 2):.0%}"
    assert rows[0]["まとめた過去の回"] == (
        "奇天烈 vol.1（2024年11月・重み100%） / 奇天烈 vol.2（2025年10月・重み80%） / "
        "奇天烈 vol.3（時期不明・重み100%）"
    )
    # 2. 同じイベントの無い行
    assert rows[1]["イベント名"] == "はじめての市"
    assert rows[1]["同じイベントの過去の回数"] == 0
    assert rows[1]["時期を考慮した実質の回数"] == "0.0"
    assert rows[1]["過去の売上の中央値"] == "なし（全体の実績で見込み）"
    assert rows[1]["同じイベントの重み"] == "0%"
    assert rows[1]["まとめた過去の回"] == ""
    # 3. 名前の無い行
    assert rows[2]["イベント名"] == "（名前なし）"
    # 4. 表の下の説明
    assert any("同じイベントの重み" in c.value for c in at.caption)


def test_画面の表は季節の違う回しか無い行の中央値をなしと表示する():
    """weight=0（半年差の回だけ）の行は、中央値が「なし（全体の実績で見込み）」、重みが 0% と出ること。

    Returns:
        なし。"""
    # 1. weight=0（半年差の回だけ）の行は、中央値が「なし（全体の実績で見込み）」、重みが 0% と出ること。
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([("春秋フェス", "2025-10-05", 300000)])
    # 変数の内容: details: 残りイベントごとにまとめた過去実績・重みの表。
    details = series_references(_remaining([("r1", "春秋フェス", "2027-04-10")]), history)
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = AppTest.from_function(_details_script, kwargs={"details": details}, default_timeout=30).run()
    assert not at.exception
    # 変数の内容: row: 処理対象のデータ行。
    row = at.dataframe[0].value.to_dict("records")[0]
    assert row["同じイベントの過去の回数"] == 1
    assert row["過去の売上の中央値"] == "なし（全体の実績で見込み）"
    assert row["同じイベントの重み"] == "0%"
    assert row["まとめた過去の回"] == "春秋フェス（2025年10月・重み0%）"


def test_画面の表は残りのイベントが無ければその旨を表示する():
    """details が空なら表を出さず「今期の残りのイベントはありません。」と表示すること。

    Returns:
        なし。"""
    # 1. details が空なら表を出さず「今期の残りのイベントはありません。」と表示すること。
    # 変数の内容: empty: 残りイベントが0件のときに返される空の参照結果。
    empty = series_references(pd.DataFrame({"id": [], "name": [], "start_date": _EMPTY_DATES}),
                              _history([("A", "2025-01-01", 1)]))
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = AppTest.from_function(_details_script, kwargs={"details": empty}, default_timeout=30).run()
    assert not at.exception
    assert [s.value for s in at.subheader] == ["残りのイベントと参考にした実績"]
    assert len(at.dataframe) == 0
    assert [c.value for c in at.caption] == ["今期の残りのイベントはありません。"]


def test_画面の表は重みが0点5パーセント未満の行の中央値をなしと表示する():
    """中央値があっても重みが 0.5% 未満なら「なし（全体の実績で見込み）」、0.5% ちょうどなら金額を出すこと（境界）。

    Returns:
        なし。"""
    # 1. 中央値のある行を3つ作り、重みを 0.0049・0.005・0.3 に置き換える
    # 変数の内容: history: 過去開催のイベント名・開催日・売上を含む参照テストデータ.
    history = _history([("市", "2025-11-01", 50000)])
    # 変数の内容: details: 残りイベントごとにまとめた過去実績・重みの表。
    details = series_references(_remaining([
        ("r1", "市", "2026-11-01"), ("r2", "市", "2026-11-02"), ("r3", "市", "2026-11-03"),
    ]), history)
    details["weight"] = [0.0049, 0.005, 0.3]
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = AppTest.from_function(_details_script, kwargs={"details": details}, default_timeout=30).run()
    assert not at.exception
    # 変数の内容: rows: テスト用レコードの一覧。
    rows = at.dataframe[0].value.to_dict("records")
    assert [r["過去の売上の中央値"] for r in rows] == ["なし（全体の実績で見込み）", "50,000円", "50,000円"]


def test_画面の表は5か月差の回だけだと中央値をなしと表示し4か月差なら表示する():
    """実データの形で、5か月差の回だけ（重み約0.19%）は「なし」、4か月差の回（重み約1.4%）は金額を出すこと。

    Returns:
        なし。"""
    # 変数の内容: history: 予測テストで参照する過去イベントの履歴。
    history = _history([
        ("五月市", "2025-11-05", 300000),  # 4月の残りに対して 5か月差
        ("四月差市", "2025-12-05", 200000),  # 4月の残りに対して 4か月差
    ])
    # 変数の内容: details: 残りイベントごとにまとめた過去実績・重みの表。
    details = series_references(_remaining([
        ("r1", "五月市", "2027-04-10"),
        ("r2", "四月差市", "2027-04-11"),
    ]), history)
    # 1. 計算上は中央値があり、weight は 0 より大きい
    assert 0 < details.loc[0, "weight"] < MIN_DISPLAY_SERIES_WEIGHT <= details.loc[1, "weight"]
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = AppTest.from_function(_details_script, kwargs={"details": details}, default_timeout=30).run()
    # 変数の内容: rows: テスト用レコードの一覧。
    rows = at.dataframe[0].value.to_dict("records")
    # 2. 画面では重み 0.5% 未満の行だけ「なし」
    assert rows[0]["過去の売上の中央値"] == "なし（全体の実績で見込み）"
    assert rows[0]["同じイベントの重み"] == "0%"
    assert rows[1]["過去の売上の中央値"] == "200,000円"
    assert rows[1]["同じイベントの重み"] == "1%"


def _forecast_script(fin, events, today):
    """AppTest で _forecast（着地見込みの見出し・説明文・数字・グラフ・表）を描く小さなスクリプト。

    Args:
        fin: 収支の表
        events: イベントの表
        today: 基準日

    Returns:
        なし。"""
    from types import SimpleNamespace

    from views.advanced import _forecast

    # get_context の結果のうち _forecast が使う raw と today だけを持つ代わりのもの
    # 変数の内容: ctx: 画面関数が必要とするrawデータと基準日を持つ簡易コンテキスト.
    ctx = SimpleNamespace(raw={"events": events}, today=today)
    _forecast(ctx, fin)


def test_着地見込みの説明文は何から引くかと実績が無いときの扱いを説明する():
    """_forecast の説明文に、2つのくじ・時期の重み・n÷(n+2)・実績が無いときの扱いが書かれていること。

    Returns:
        なし。"""
    # 変数の内容: fin: 計算に渡す売上・費用の入力値、events: API に返すイベントのテストデータ。
    fin, events = _series_data("奇天烈 vol.5")
    # 変数の内容: at: Streamlit AppTest の現在の画面状態。
    at = AppTest.from_function(_forecast_script, kwargs={"fin": fin, "events": events, "today": TODAY},
                               default_timeout=30).run()
    assert not at.exception
    assert [h.value for h in at.header] == ["今期のイベント売上の着地見込み"]
    # 変数の内容: text: 設定ファイルの本文。
    text = at.caption[0].value
    # 1. 今期・残り回数・くり返し回数
    assert "2026年度の実績に、まだ売上が入っていない 1 回（今後の予定と入力待ち）" in text
    assert "5,000 回くり返しました（ブートストラップ法）" in text
    # 2. 何から引くか（2つのくじ）
    assert "1回分の売上は、次の2つのどちらかから引きます。" in text
    assert "(1) 同じイベント（「vol.5」「第3回」「2026」などの回の番号を除いた名前が同じもの）の過去の売上。" in text
    assert "(2) 全イベントの1回あたり売上（時期は考慮しません）。" in text
    # 3. 時期の重みの値（関数の結果と同じ数字）
    assert (f"1か月差 {season_weight(1):.2f}、2か月差 {season_weight(2):.2f}、3か月差 {season_weight(3):.2f}"
            in text)
    assert "1か月差 0.80、2か月差 0.41、3か月差 0.14" in text
    # 4. 引く割合
    assert "n ÷ (n + 2)" in text and "1回で33%、2回で50%、4回で67%" in text
    # 5. 実績が無いとき・時期の離れた回しか無いとき
    assert "同じイベントの実績が無いときは全イベントの実績だけで、" in text
    assert "時期の離れた回しか無いときは主に全イベントの実績で見込みます。" in text
    # 6. 表も続けて表示される
    assert "残りのイベントと参考にした実績" in [s.value for s in at.subheader]
    assert at.dataframe[0].value.to_dict("records")[0]["過去の売上の中央値"] == "100,000円"
