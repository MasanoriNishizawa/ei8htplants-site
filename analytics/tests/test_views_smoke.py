"""分析ダッシュボードの7画面（views/）を streamlit.testing.v1.AppTest で描き、壊れていないことを確かめる画面テスト。

確かめること
- 通常のデータ・空のデータ・予約がすべてキャンセルのデータで、各画面を描いても例外（at.exception）が出ない
- 会計年度「すべての期」と、データにある各年度を選んでも例外が出ない
- アクセス解析画面：GA が未設定のとき・GA のデータが取れるとき・2本目以降のレポートだけ失敗するとき
- 画面に「nan」「inf」の文字が出ない（数値の計算が 0 割りなどで壊れていない）

本番（Supabase・GA4）には一切接続しない。
- Supabase：lib.context.load_all をモックにし、テスト用の行（Supabase の JSON と同じ形）を
  lib.data.load_table と同じ変換（日時の型・メールのハッシュ化）にかけて返す
- GA4：lib.ga._client を偽のクライアントに差し替える（鍵は架空の JSON。ga_config の形の確認だけ通る）
- requests.get / requests.post は conftest.py で「呼ばれたら失敗」にしてある

ページの切り替えは app.py の st.navigation をそのまま使う。AppTest.switch_page はファイルのページ専用で、
関数を渡した st.Page（app.py の書き方）には使えないため、1回描いたあとに AppTest が覚えている
「登録されたページ（url_pathname → ページのハッシュ）」から目的のページを選んで次の描画で開く。
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

import lib.context
import lib.data
import lib.ga
from lib.auth import SESSION_EMAIL
from lib.context import ALL_YEARS

# 確かめる app.py の場所（このファイルから見て1つ上）
APP_PATH = str(Path(__file__).resolve().parents[1] / "app.py")

# ログイン済みとして扱う架空のアカウント
EMAIL = "admin@example.com"

# 画面の一覧：url_path（app.py の st.Page に書いたもの。概要は既定のページで url_path なし）→ 画面のタイトル
PAGES = {
    "": "概要",
    "events": "イベント収支",
    "workshop": "ワークショップ",
    "shop": "ショップ",
    "inbox": "問い合わせ・記事",
    "traffic": "アクセス解析",
    "advanced": "予測・シミュレーション",
}

# テスト名に付ける画面の ID（pytest -k で絞り込みやすいよう英字にする。PAGES と同じ順）
PAGE_IDS = ["overview", "events", "workshop", "shop", "inbox", "traffic", "advanced"]

# 会計年度の選択欄を出さない画面（get_context(use_year_filter=False)）。
# アクセス解析は GA の期間で絞り、予測・シミュレーションはすべての実績を使うため
NO_YEAR_PAGES = ["traffic", "advanced"]

# サイドバーに会計年度の選択欄がある画面
YEAR_PAGES = [u for u in PAGES if u not in NO_YEAR_PAGES]
YEAR_PAGE_IDS = [i for u, i in zip(PAGES, PAGE_IDS) if u not in NO_YEAR_PAGES]

# サイドバーの会計年度の選択欄の key（lib/context.py の get_context）
YEAR_KEY = "fiscal_year"

# GA の2本目以降のレポートが失敗したときに、その表の場所に出す約束の文言（backend 担当と合わせた仕様）
MSG_GA_PART_FAILED = "この表は表示できません"

# 数値が出せないときに出す約束の記号（nan% などの代わり）
DASH = "—"

# 画面に出てはいけない文字（数値の計算が壊れたときの表示）。単語の一部（「info」など）は拾わない
BAD_NUMBER = re.compile(r"(?<![A-Za-z])(nan|NaN|inf|Inf|-inf)(?![A-Za-z])")

# アクセス解析の期間の選択肢 → GA に渡す開始日（views/traffic.py の PERIODS と同じ）
PERIOD_STARTS = {"直近7日": "7daysAgo", "直近28日": "28daysAgo", "直近90日": "90daysAgo"}

# GA の架空の鍵（ga_config が「鍵の形か」を確かめるのに必要な項目だけ入れる。本物の鍵ではない）
FAKE_GA_KEY = json.dumps(
    {
        "type": "service_account",
        "client_email": "fake@fake-project.iam.gserviceaccount.com",
        "private_key": "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n",
        "token_uri": "https://oauth2.example.invalid/token",
    }
)


# ======================================================================== テスト用のデータ


def _day(today: pd.Timestamp, offset: int) -> str:
    """今日から offset 日ずらした日付を "YYYY-MM-DD" で返す（Supabase の date 列と同じ形）。

    Args:
        today: 今日（時刻なし）
        offset: ずらす日数（負なら過去）

    Returns:
        日付の文字列
    """
    return (today + pd.Timedelta(days=offset)).strftime("%Y-%m-%d")


def _ts(today: pd.Timestamp, offset: int, hour: int = 10) -> str:
    """今日から offset 日ずらした日時を ISO 形式（UTC）で返す（Supabase の timestamptz 列と同じ形）。

    Args:
        today: 今日（時刻なし）
        offset: ずらす日数（負なら過去）
        hour: 日本時間の時

    Returns:
        日時の文字列
    """
    t = (today + pd.Timedelta(days=offset, hours=hour)).tz_localize("Asia/Tokyo").tz_convert("UTC")
    return t.isoformat()


def _finance(event_id: str, sales: int, booth_fee: int = 5000, distance: int = 30, ws: int = 0, **extra) -> dict:
    """event_finances の1行を作る。

    Args:
        event_id: イベントの ID
        sales: 売上（0 は未開催・入力前の扱い）
        booth_fee: 出店料
        distance: 片道の距離（km）
        ws: WS 参加人数
        **extra: ほかに上書きする列

    Returns:
        event_finances の行
    """
    row = {
        "event_id": event_id, "sales": sales, "booth_fee": booth_fee, "distance": distance, "gas_price": 170,
        "expressway_toll": 0, "accommodation": 0, "ws_participants": ws, "payment_flag": True, "other_expenses": 0,
    }
    row.update(extra)
    return row


def normal_rows() -> dict[str, list[dict]]:
    """通常のデータ（各テーブルが数件ずつ）を、Supabase から返る JSON と同じ形で作る。

    - イベントは複数の会計年度にまたがる（今日から 400 日前〜40 日後）
    - 同じ名前のイベント「Green Fes」が約1年違いで2回ある（別の会計年度）
    - 回の番号違いの同じイベント「Plant Market vol.1 / vol.2 / vol.3」がある（着地見込みの「同じイベント」）
    - 3日間の開催（複数日開催）がある
    - ワークショップありのイベント（時間枠・予約つき）がある
    - 売上 0 円（入力前）と、収支未入力の今後のイベントがある

    Returns:
        テーブル名 → 行のリスト
    """
    today = pd.Timestamp.now(tz="Asia/Tokyo").tz_localize(None).normalize()
    # 1. イベント（id, 開始日のずれ, 日数, 名前, 会場, ブランド, WS の有無）
    ev_specs = [
        ("e1", -400, 1, "Plant Market vol.1", "東京", ["ei8ht plants"], False),
        ("e2", -380, 2, "Green Fes", "大阪", ["ei8ht plants", "Habitat Oides"], False),
        ("e3", -200, 3, "Botanical Week 2025", "名古屋", ["HUE by ei8ht plants"], False),
        ("e4", -100, 1, "Plant Market vol.2", "東京", ["ei8ht plants"], False),
        ("e5", -30, 2, "Habitat WS Day", "横浜", ["Habitat Oides"], True),
        ("e6", -10, 2, "Green Fes", "大阪", ["ei8ht plants", "Habitat Oides"], False),
        ("e7", 15, 1, "Plant Market vol.3", "東京", ["ei8ht plants"], True),
        ("e8", 40, 2, "Winter Plants Fair", "福岡", ["HUE by ei8ht plants"], False),
    ]
    events = [
        {
            "id": eid, "slug": f"slug-{eid}", "name": name, "start_date": _day(today, off),
            "end_date": _day(today, off + days - 1) if days > 1 else None, "location": loc, "brands": brands,
            "has_workshop": ws, "is_past": off < 0,
        }
        for eid, off, days, name, loc, brands, ws in ev_specs
    ]
    # 2. 収支（e7 は売上 0 円＝入力前、e8 は未入力）
    finances = [
        _finance("e1", 80000),
        _finance("e2", 150000, booth_fee=15000, distance=300, expressway_toll=12000, accommodation=9000),
        _finance("e3", 60000, booth_fee=20000, distance=120, other_expenses=3000),
        _finance("e4", 95000, booth_fee=8000),
        _finance("e5", 70000, booth_fee=6000, distance=40, ws=9),
        _finance("e6", 30000, booth_fee=25000, distance=300, payment_flag=False),  # 赤字の回
        _finance("e7", 0),
    ]
    # 3. WS の時間枠と予約（e5 は開催済み、e7 はこれから）
    sessions = [
        {"id": "s1", "event_id": "e5", "time_label": "10:00〜", "max_participants": 6},
        {"id": "s2", "event_id": "e5", "time_label": "13:00〜", "max_participants": 6},
        {"id": "s3", "event_id": "e7", "time_label": "11:00〜", "max_participants": 4},
    ]
    res_specs = [
        ("r1", "e5", "s1", 2, "confirmed", -45, "a@example.com", True, False),
        ("r2", "e5", "s1", 3, "confirmed", -40, "b@example.com", False, True),
        ("r3", "e5", "s2", 1, "cancelled", -35, "c@example.com", False, False),
        ("r4", "e5", "s2", 4, "confirmed", -31, "d@example.com", True, True),
        ("r5", "e7", "s3", 2, "confirmed", -5, "a@example.com", False, False),  # リピーター
        ("r6", "e7", "s3", 1, "confirmed", -1, "e@example.com", True, False),
    ]
    reservations = [
        {
            "id": rid, "event_id": eid, "session_id": sid, "participants": n, "status": status,
            "bring_plant": plant, "bring_pot": pot,
            "preferred_date": _day(today, -30 if eid == "e5" else 15), "created_at": _ts(today, off, 9 + i * 2),
            "email": email,
        }
        for i, (rid, eid, sid, n, status, off, email, plant, pot) in enumerate(res_specs)
    ]
    # 4. 商品・注文（有効な注文は分析に必要な 5 件以上。キャンセル1件つき）
    products = [
        {"id": "p1", "name": "アガベ A", "price": 5000, "stock": 2, "category": "plant", "tags": ["agave"],
         "is_published": True, "created_at": _ts(today, -300)},
        {"id": "p2", "name": "鉢 B", "price": 3000, "stock": 10, "category": None, "tags": [],
         "is_published": True, "created_at": _ts(today, -300)},
        {"id": "p3", "name": "非公開の商品", "price": 1000, "stock": 0, "category": "other", "tags": None,
         "is_published": False, "created_at": _ts(today, -10)},
    ]
    ord_specs = [
        ("o1", -200, "x@example.com", "東京都", "paid", [("p1", 1), ("p2", 1)]),
        ("o2", -150, "y@example.com", "大阪府", "shipped", [("p1", 2)]),
        ("o3", -60, "x@example.com", "東京都", "paid", [("p2", 3)]),
        ("o4", -20, "z@example.com", "北海道", "paid", [("p1", 1), ("p2", 2)]),
        ("o5", -5, "x@example.com", "東京都", "pending", [("p2", 1)]),
        ("o6", -2, "w@example.com", "福岡県", "paid", [("p1", 1)]),
        ("o7", -1, "v@example.com", "沖縄県", "cancelled", [("p1", 5)]),
    ]
    price = {p["id"]: p["price"] for p in products}
    pname = {p["id"]: p["name"] for p in products}
    orders, items = [], []
    for oid, off, email, pref, status, lines in ord_specs:
        subtotal = sum(price[pid] * q for pid, q in lines)
        orders.append({"id": oid, "subtotal": subtotal, "shipping_fee": 800, "total": subtotal + 800, "status": status,
                       "prefecture": pref, "created_at": _ts(today, off), "customer_email": email})
        items += [{"order_id": oid, "product_id": pid, "product_name": pname[pid], "price": price[pid], "quantity": q}
                  for pid, q in lines]
    # 5. 問い合わせ・記事（下書き1本つき）
    contacts = [
        {"id": "c1", "is_read": True, "created_at": _ts(today, -90)},
        {"id": "c2", "is_read": False, "created_at": _ts(today, -20)},
        {"id": "c3", "is_read": False, "created_at": _ts(today, -3)},
    ]
    articles = [
        {"id": "a1", "title": "植え替えのコツ", "tags": ["植え替え", "アガベ"], "is_published": True,
         "published_at": _ts(today, -120), "created_at": _ts(today, -121)},
        {"id": "a2", "title": "イベント出店のお知らせ", "tags": ["イベント"], "is_published": True,
         "published_at": None, "created_at": _ts(today, -15)},
        {"id": "a3", "title": "下書きの記事", "tags": None, "is_published": False,
         "published_at": None, "created_at": _ts(today, -1)},
    ]
    return {
        "events": events, "event_finances": finances, "ws_sessions": sessions, "workshop_reservations": reservations,
        "products": products, "orders": orders, "order_items": items, "contacts": contacts, "articles": articles,
    }


def empty_rows() -> dict[str, list[dict]]:
    """全テーブルが0件のデータ。

    Returns:
        テーブル名 → 空のリスト
    """
    return {table: [] for table in lib.data.COLUMNS}


def all_cancelled_rows() -> dict[str, list[dict]]:
    """通常のデータのうち、WS 予約だけをすべてキャンセルにしたデータ。

    Returns:
        テーブル名 → 行のリスト
    """
    rows = normal_rows()
    for r in rows["workshop_reservations"]:
        r["status"] = "cancelled"
    return rows


def _to_frames(rows: dict[str, list[dict]]) -> dict[str, pd.DataFrame]:
    """Supabase の JSON と同じ形の行を、lib.data.load_table と同じ変換で DataFrame にする。

    load_table の中の通信（_fetch_all）だけをこの行に置き換えて呼ぶので、
    日時の型・メールのハッシュ化などは本物と同じになる（キャッシュは通さない）。

    Args:
        rows: テーブル名 → 行のリスト

    Returns:
        テーブル名 → DataFrame
    """
    original = lib.data._fetch_all  # noqa: SLF001
    try:
        lib.data._fetch_all = lambda table: rows[table]  # noqa: SLF001
        # st.cache_data の内側の関数（__wrapped__）を呼んでキャッシュを通さない
        return {table: lib.data.load_table.__wrapped__(table) for table in lib.data.COLUMNS}
    finally:
        lib.data._fetch_all = original  # noqa: SLF001


# ======================================================================== GA の偽クライアント


def _ga_rows(dims: list[str], metrics: list[str]) -> list[tuple[list[str], list[str]]]:
    """GA のレポートの偽の行（ディメンションの値, 指標の値）を作る。

    Args:
        dims: ディメンション名
        metrics: 指標名

    Returns:
        行のリスト
    """
    # 1. まとめの数字（ディメンションなし）は1行
    if not dims:
        values = {"activeUsers": "120", "sessions": "150", "screenPageViews": "480", "averageSessionDuration": "95.5"}
        return [([], [values.get(m, "10") for m in metrics])]
    # 2. ディメンションごとの値（予約ページ /reserve と、イベント・商品の詳細ページを含める）
    samples = {
        "date": ["20261001", "20261002", "20261003"],
        "pagePath": ["/", "/reserve", "/reserve?event=e7", "/events/slug-e7", "/shop/p1", "/unknown"],
        "sessionDefaultChannelGroup": ["Direct", "Organic Search", "Organic Social", "Something New"],
        "sessionSource": ["(direct)", "google", "instagram.com"],
        "deviceCategory": ["mobile", "desktop", "tablet"],
        "region": ["Tokyo", "Osaka", "(not set)"],
    }
    key = dims[0]
    return [([v], [str(10 * (i + 1)) for _ in metrics]) for i, v in enumerate(samples.get(key, ["x"]))]


class FakeGaClient:
    """BetaAnalyticsDataClient の代わり。run_report の呼び出しを記録し、決めた回数目以降は失敗させる。

    Attributes:
        calls: 呼ばれたレポートのディメンション名の一覧（呼ばれた順）
        starts: 呼ばれたレポートの開始日（"28daysAgo" など。呼ばれた順）
        fail_from: この回数目（1始まり）以降の呼び出しを失敗させる。None なら失敗しない
    """

    def __init__(self, fail_from: int | None = None) -> None:
        self.calls: list[tuple[str, ...]] = []
        self.starts: list[str] = []
        self.fail_from = fail_from

    def run_report(self, request):
        """偽のレポートを返す（または失敗させる）。

        Args:
            request: RunReportRequest

        Returns:
            rows[].dimension_values / metric_values を持つ応答
        """
        # 1. 呼ばれたレポートを記録する
        dims = [d.name for d in request.dimensions]
        metrics = [m.name for m in request.metrics]
        self.calls.append(tuple(dims))
        self.starts += [r.start_date for r in request.date_ranges]
        # 2. 決めた回数目以降は失敗させる（権限不足・上限超えなどの代わり）
        if self.fail_from is not None and len(self.calls) >= self.fail_from:
            raise RuntimeError("テスト用：GA のレポートの取得に失敗")
        # 3. 応答の形にそろえて返す
        rows = [
            SimpleNamespace(
                dimension_values=[SimpleNamespace(value=v) for v in dv],
                metric_values=[SimpleNamespace(value=v) for v in mv],
            )
            for dv, mv in _ga_rows(dims, metrics)
        ]
        return SimpleNamespace(rows=rows)


# ======================================================================== 準備（fixture）


@pytest.fixture(autouse=True)
def clear_cache():
    """テストの前後で st.cache_data を空にする（GA のレポートのキャッシュが別のテストに残らないように）。"""
    st.cache_data.clear()
    yield
    st.cache_data.clear()


@pytest.fixture
def use_data(monkeypatch):
    """lib.context.load_all をモックにし、渡した行を返すようにする関数を返す。

    Returns:
        use(rows) … 以降の画面で使うデータを決める関数
    """

    def use(rows: dict[str, list[dict]]) -> None:
        frames = _to_frames(rows)
        # 画面ごとに中身を書き換えられても困らないよう、毎回コピーを返す
        monkeypatch.setattr(lib.context, "load_all", lambda: {k: v.copy() for k, v in frames.items()})

    use(normal_rows())
    return use


@pytest.fixture
def ga(monkeypatch):
    """GA を「設定済み」にし、偽のクライアントを使わせる。

    Returns:
        FakeGaClient（fail_from を書き換えると失敗させられる）
    """
    client = FakeGaClient()
    monkeypatch.setenv("GA_PROPERTY_ID", "123456789")
    monkeypatch.setenv("GA_CREDENTIALS_JSON", FAKE_GA_KEY)
    monkeypatch.setattr(lib.ga, "_client", lambda credentials_ref: client)
    return client


# ======================================================================== 画面の操作


def _login_app() -> AppTest:
    """ログイン済みの状態で app.py を1回描く（既定のページ＝概要が開く）。

    Returns:
        描画後の AppTest
    """
    at = AppTest.from_file(APP_PATH, default_timeout=60)
    # 1. 手元の analytics/.streamlit/secrets.toml（本物の接続情報・許可リスト）を読ませない。
    #    AppTest に架空の Secrets を渡すと、描画のあいだ st.secrets がこれに差し替わり、ファイルは読まれない
    #    （読まれると本物の値が環境変数に入り、許可リストで架空のアカウントがログアウトされる）
    at.secrets = {"TEST_ONLY_DUMMY": "not-a-secret"}
    # 2. ログイン済みにする（lib/auth.py の require_login はこの値があれば通す）
    at.session_state[SESSION_EMAIL] = EMAIL
    return at.run()


def _open(at: AppTest, url_path: str) -> AppTest:
    """st.navigation に登録された画面を url_path で選んで描く。

    AppTest.switch_page はファイルのページ用なので、関数を渡した st.Page では、
    前の描画で AppTest が受け取った「登録されたページ」の一覧からハッシュを引いて次の描画で開く。

    Args:
        at: 1回以上描画済みの AppTest
        url_path: app.py の st.Page に書いた url_path（概要は ""）

    Returns:
        描画後の AppTest
    """
    registered = at._registered_pages  # noqa: SLF001
    hashes = [h for h, info in registered.items() if info.get("url_pathname") == url_path]
    assert hashes, f"st.navigation に url_path={url_path!r} の画面がありません: {list(registered.values())}"
    at._page_hash = hashes[0]  # noqa: SLF001
    return at.run()


def _render(url_path: str) -> AppTest:
    """ログイン済みで指定の画面を描く。

    Args:
        url_path: 画面の url_path（概要は ""）

    Returns:
        描画後の AppTest
    """
    at = _login_app()
    return at if url_path == "" else _open(at, url_path)


def _select_year(at: AppTest, label: str) -> AppTest:
    """サイドバーの会計年度を選んで描き直す。

    Args:
        at: 描画済みの AppTest
        label: 選ぶ年度の表示名

    Returns:
        描画後の AppTest
    """
    return at.sidebar.selectbox(key=YEAR_KEY).select(label).run()


def _plotly_texts(spec: str) -> list[str]:
    """plotly のグラフの仕様（JSON）から、画面に文字として出る部分（タイトル・注記・棒の数値ラベルなど）を集める。

    グラフの数値の配列に入る NaN（欠けている値）は空白で描かれるので対象にしない。

    Args:
        spec: plotly_chart の proto.spec

    Returns:
        文字列のリスト
    """
    fig = json.loads(spec)
    out: list[str] = []

    def walk(node, key: str = "") -> None:
        # 1. 文字として描かれるキーの値だけを拾う
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, k)
        elif isinstance(node, list):
            for v in node:
                walk(v, key)
        elif isinstance(node, str) and key in {"text", "title", "name", "y", "x", "ticksuffix"}:
            out.append(node)

    walk(fig)
    return out


def _texts(at: AppTest) -> list[str]:
    """画面に出ている文字（見出し・説明・メッセージ・数字のタイル・表・グラフの文字）を集める。

    Args:
        at: 描画後の AppTest

    Returns:
        文字列のリスト
    """
    out: list[str] = []
    # 1. 見出し・説明・メッセージ
    for group in (at.title, at.header, at.subheader, at.caption, at.markdown, at.info, at.warning, at.error,
                  at.success):
        out += [str(e.value) for e in group]
    # 2. 数字のタイル（見出しと値）
    for m in at.metric:
        out += [str(m.label), str(m.value)]
    # 3. 表（中身の値をすべて文字にする。書式付きの表は表示用の値も見る）
    for df in at.dataframe:
        value = df.value
        out += [str(c) for c in value.columns]
        # 生の値の NaN は表では空欄で描かれるので、書式付きの表示用の値（_styler_texts）のほうで確かめる
        out += [str(v) for v in value.astype(str).to_numpy().ravel() if v not in ("nan", "None", "<NA>", "NaT")]
    out += _styler_texts(at)
    # 4. グラフの文字
    for chart in at.get("plotly_chart"):
        out += _plotly_texts(chart.proto.spec)
    return out


def _styler_texts(at: AppTest) -> list[str]:
    """書式付きの表（pandas の Styler）の表示用の値（「1,000円」「25%」など）を集める。

    Args:
        at: 描画後の AppTest

    Returns:
        文字列のリスト。表示用の値が無い表は何も足さない
    """
    from streamlit import dataframe_util

    out: list[str] = []
    for df in at.dataframe:
        # Streamlit 1.66 では proto.arrow_data.styler.display_values に arrow 形式で入る
        # （streamlit/elements/lib/pandas_styler_utils.py の _marshall_display_values）。書式なしの表は空
        arrow = df.proto.arrow_data
        data = arrow.styler.display_values if arrow.HasField("styler") else b""
        if data:
            out += [str(v) for v in dataframe_util.convert_arrow_bytes_to_pandas_df(data).astype(str).to_numpy().ravel()]
    return out


def _assert_clean(at: AppTest, where: str) -> None:
    """例外が出ておらず、画面に nan / inf の文字が出ていないことを確かめる。

    Args:
        at: 描画後の AppTest
        where: 失敗したときに出す場所の説明
    """
    # 1. 例外（画面の赤いエラー枠）が出ていない
    assert not at.exception, f"{where}: 例外が出ました: {[e.value for e in at.exception]}"
    # 2. nan・inf の文字が出ていない
    bad = [t for t in _texts(at) if BAD_NUMBER.search(t)]
    assert not bad, f"{where}: 画面に nan / inf が出ています: {bad}"


def _metric(at: AppTest, label: str) -> str:
    """見出しが label の数字のタイルの値を返す。

    Args:
        at: 描画後の AppTest
        label: タイルの見出し

    Returns:
        タイルの値
    """
    values = [str(m.value) for m in at.metric if m.label == label]
    assert values, f"数字のタイル「{label}」がありません: {[m.label for m in at.metric]}"
    return values[0]


# ======================================================================== テスト


@pytest.mark.parametrize("url_path", list(PAGES), ids=PAGE_IDS)
def test_通常のデータで各画面を描くと例外もnanもinfも出ずタイトルが出る(use_data, ga, url_path):
    at = _render(url_path)
    _assert_clean(at, PAGES[url_path])
    # 開いた画面のタイトルが出ている（ページの切り替えが効いている）
    assert [t.value for t in at.title] == [PAGES[url_path]]


@pytest.mark.parametrize("url_path", list(PAGES), ids=PAGE_IDS)
def test_全テーブルが0件でも各画面を描くと例外もnanもinfも出ない(use_data, ga, url_path):
    use_data(empty_rows())
    at = _render(url_path)
    _assert_clean(at, f"{PAGES[url_path]}（0件）")
    assert [t.value for t in at.title] == [PAGES[url_path]]
    # 会計年度の選択欄がある画面では、選択肢は「すべての期」だけ
    if url_path in YEAR_PAGES:
        assert at.sidebar.selectbox(key=YEAR_KEY).options == [ALL_YEARS]


@pytest.mark.parametrize("url_path", list(PAGES), ids=PAGE_IDS)
def test_予約がすべてキャンセルでも各画面を描くと例外もnanもinfも出ない(use_data, ga, url_path):
    use_data(all_cancelled_rows())
    at = _render(url_path)
    _assert_clean(at, f"{PAGES[url_path]}（予約がすべてキャンセル）")


def test_予約がすべてキャンセルのときワークショップ画面の持ち込みの割合はダッシュで出る(use_data, ga):
    use_data(all_cancelled_rows())
    at = _render("workshop")
    assert not at.exception
    # 1. キャンセル率は 100%、予約人数は 0 人
    assert _metric(at, "キャンセル率") == "100%"
    assert _metric(at, "予約人数（キャンセル除く）") == "0人"
    # 2. 有効な予約が無いので持ち込みの割合は計算できない → 「—」（nan% ではない）
    assert _metric(at, "植物の持ち込み") == DASH
    assert _metric(at, "鉢の持ち込み") == DASH


def test_概要画面の予約人数はキャンセルを除いて数える(use_data, ga):
    at = _render("")
    assert not at.exception
    # 通常のデータの有効な予約は 2+3+4+2+1 = 12 人（キャンセル r3 の1人を除く）
    assert _metric(at, "WS 予約人数") == "12人"


@pytest.mark.parametrize("url_path", YEAR_PAGES, ids=YEAR_PAGE_IDS)
def test_会計年度をすべての期と各年度に切り替えても各画面で例外もnanもinfも出ない(use_data, ga, url_path):
    at = _render(url_path)
    box = at.sidebar.selectbox(key=YEAR_KEY)
    # 1. 既定は「すべての期」。データは複数の会計年度にまたがるので年度の選択肢が2つ以上ある
    assert box.value == ALL_YEARS
    years = [o for o in box.options if o != ALL_YEARS]
    assert len(years) >= 2, box.options
    # 2. 各年度を選び、最後に「すべての期」に戻す
    for label in years + [ALL_YEARS]:
        at = _select_year(at, label)
        _assert_clean(at, f"{PAGES[url_path]}（{label}）")
        assert at.sidebar.selectbox(key=YEAR_KEY).value == label
        assert [t.value for t in at.title] == [PAGES[url_path]]


@pytest.mark.parametrize("url_path", NO_YEAR_PAGES)
def test_アクセス解析と予測の画面には会計年度の選択欄が出ない(use_data, ga, url_path):
    at = _render(url_path)
    assert not at.exception
    # アクセス解析は GA の期間（直近7日など）で、予測はすべての実績で見るので、年度の選択欄は出さない
    assert all(b.key != YEAR_KEY for b in at.sidebar.selectbox)
    if url_path == "traffic":
        assert any(g.key == "ga_period" for g in at.get("button_group"))


def test_予約がすべてキャンセルで年度を切り替えてもワークショップ画面に例外もnanも出ない(use_data, ga):
    use_data(all_cancelled_rows())
    at = _render("workshop")
    for label in at.sidebar.selectbox(key=YEAR_KEY).options:
        at = _select_year(at, label)
        _assert_clean(at, f"ワークショップ（予約がすべてキャンセル・{label}）")


def test_GAが未設定ならアクセス解析画面は設定の手順を出しGAを呼ばない(use_data, monkeypatch):
    calls = []
    monkeypatch.setattr(lib.ga, "_client", lambda ref: calls.append(ref))
    at = _render("traffic")
    _assert_clean(at, "アクセス解析（GA 未設定）")
    # 1. 足りない設定の説明と、設定の手順が出る
    assert any("GA_PROPERTY_ID" in w.value for w in at.warning)
    assert any("設定の手順" in m.value for m in at.markdown)
    # 2. GA には接続しない
    assert calls == []
    assert len(at.metric) == 0


def test_GAのデータが取れるとアクセス解析画面に数字と予約率が出る(use_data, ga):
    at = _render("traffic")
    _assert_clean(at, "アクセス解析（GA あり）")
    # 1. まとめの数字（偽の GA の値）
    assert _metric(at, "訪問者数") == "120人"
    assert _metric(at, "ページビュー") == "480PV"
    assert _metric(at, "1回の平均滞在") == "1分35秒"
    # 2. 予約ページの PV は「/reserve」と「/reserve?…」の合計（20 + 30）
    assert _metric(at, "予約ページの PV") == "50PV"
    # 3. 7種類のレポートを取得した
    assert len(ga.calls) == 7


@pytest.mark.parametrize("period", ["直近7日", "直近90日"])
def test_GAの期間を切り替えてもアクセス解析画面に例外もnanも出ない(use_data, ga, period):
    at = _render("traffic")
    # 1. 期間の選択欄（segmented_control）で期間を選び直す
    groups = [g for g in at.get("button_group") if g.key == "ga_period"]
    assert groups, "期間の選択欄がありません"
    assert groups[0].value == "直近28日"
    at = groups[0].set_value(period).run()
    # 2. 選んだ期間になり、その期間の開始日で GA に問い合わせ直している
    assert [g.value for g in at.get("button_group") if g.key == "ga_period"] == [period]
    assert PERIOD_STARTS[period] in ga.starts
    _assert_clean(at, f"アクセス解析（{period}）")


@pytest.mark.parametrize("fail_from", [2, 3, 5, 7], ids=["from2", "from3", "from5", "only7"])
def test_GAの2本目以降のレポートが失敗しても画面全体はエラーにならずその表の場所に表示できませんと出る(
    use_data, ga, fail_from
):
    ga.fail_from = fail_from
    at = _render("traffic")
    # 1. 例外（画面全体のエラー）にならない
    _assert_clean(at, f"アクセス解析（{fail_from}本目以降が失敗）")
    # 2. 1本目（まとめの数字）は出ている
    assert _metric(at, "訪問者数") == "120人"
    # 3. 失敗した表の場所に約束の文言が出る
    assert any(MSG_GA_PART_FAILED in t for t in _texts(at)), _texts(at)


def test_GAの1本目のレポートが失敗するとアクセス解析画面は読み込めませんと出す(use_data, ga):
    ga.fail_from = 1
    at = _render("traffic")
    _assert_clean(at, "アクセス解析（1本目が失敗）")
    assert any("Google アナリティクスのデータを読み込めませんでした" in e.value for e in at.error)
    assert len(at.metric) == 0


def test_データの読み込みに失敗すると各画面はエラーを出して止まる(monkeypatch):
    def fail():
        raise RuntimeError("テスト用：読み込み失敗")

    monkeypatch.setattr(lib.context, "load_all", fail)
    for url_path, title in PAGES.items():
        at = _render(url_path)
        assert not at.exception, title
        assert any("データを読み込めませんでした" in e.value for e in at.error), title
