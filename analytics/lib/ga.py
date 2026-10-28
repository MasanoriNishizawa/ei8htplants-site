"""Google アナリティクス 4（GA4）のデータを Data API で読み出すモジュール（読み取り専用）。

- 接続には Google Cloud のサービスアカウントの鍵（JSON）を使う
- 設定は環境変数で渡す。ローカルではリポジトリ直下の .env、Streamlit Community Cloud では Secrets に書く
    GA_PROPERTY_ID=123456789                         … GA4 の「プロパティ ID」（数字。測定 ID の G-… ではない）
    鍵は次のどちらかで渡す（両方あれば GA_CREDENTIALS_JSON を優先する）
    GA_CREDENTIALS=/Users/…/ga-service-account.json   … 鍵ファイルの場所（ローカル向け。リポジトリの外に置くこと）
    GA_CREDENTIALS_JSON={"type": "service_account", …} … 鍵ファイルの中身そのもの（ファイルを置けない Community Cloud 向け）
- 鍵の中身は画面にもログにも出さない。エラーメッセージにも中身は含めない
- 鍵の中身は st.cache_data の引数に渡さない（キャッシュのキーに秘密が入らないよう、
  キャッシュ関数には「どこから鍵を読むか」の目印だけを渡し、中身は通信の直前に環境変数から読む）
- 権限は読み取り専用（analytics.readonly）だけを要求する
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import streamlit as st
from dotenv import load_dotenv

from .data import ENV_PATH

# GA の設定（GA_PROPERTY_ID など）を os.getenv で読む前に、リポジトリ直下の .env を読み込んでおく。
# すでに環境変数にある値（Community Cloud の Secrets など）は上書きしない。.env が無ければ何もしない
load_dotenv(ENV_PATH)

# GA のレポートを取り直すまでのキャッシュ時間（秒）。GA の集計は数時間遅れて反映されるので、
# Supabase のデータ（lib/data.py の CACHE_TTL）より長い1時間にして、API の呼び出し回数を減らす
GA_CACHE_TTL = 60 * 60

# 1回のレポートで取る行数の既定値（Data API の limit）
DEFAULT_REPORT_LIMIT = 1000

# 読み取り専用の権限
SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]

# 鍵の中身（JSON 文字列）を入れる環境変数の名前
CREDENTIALS_JSON_ENV = "GA_CREDENTIALS_JSON"

# 鍵を GA_CREDENTIALS_JSON から読むことを表す目印。鍵ファイルの場所の代わりに run_report へ渡す
# （ファイルの場所としては使わない書き方にして、取り違えないようにしている）
JSON_CREDENTIALS_REF = "env:GA_CREDENTIALS_JSON"

# サービスアカウントの鍵に必ず入っている項目（google-auth が接続に使うもの）
REQUIRED_KEY_FIELDS = ("client_email", "private_key", "token_uri")


class CredentialsError(ValueError):
    """GA_CREDENTIALS_JSON の中身が鍵として読めないときの例外。メッセージに鍵の中身は含めない。"""


@dataclass
class GaConfig:
    """GA への接続設定。

    Attributes:
        property_id: GA4 のプロパティ ID（数字）
        credentials_path: サービスアカウントの鍵ファイルの場所。鍵を GA_CREDENTIALS_JSON で渡すときは None
    """

    property_id: str
    credentials_path: Path | None = None

    @property
    def credentials_ref(self) -> str:
        """run_report に渡す「鍵をどこから読むか」の目印（秘密の値は含まない）。

        Returns:
            鍵ファイルの場所、または JSON_CREDENTIALS_REF
        """
        return str(self.credentials_path) if self.credentials_path is not None else JSON_CREDENTIALS_REF


def parse_credentials_json(text: str) -> dict:
    """GA_CREDENTIALS_JSON の文字列を、サービスアカウントの鍵の辞書にする。

    Secrets（TOML）で三重のダブルクォートを使うと、private_key の「\\n」が本物の改行に変わってしまうため、
    文字列の中の改行も受け付ける（json.loads の strict=False）。本物の改行も PEM の区切りとしてそのまま使える。

    Args:
        text: 鍵ファイルの中身（JSON 文字列）

    Returns:
        鍵の辞書（service_account.Credentials.from_service_account_info に渡せる形）

    Raises:
        CredentialsError: JSON として読めない・オブジェクトでない・種類が違う・必要な項目が無いとき
            （メッセージに鍵の中身は含めない）
    """
    # 1. JSON として読む。読めないときは位置だけを伝える（中身は出さない。元の例外もつなげない）
    try:
        # 変数の内容: info: JSON から読み取ったサービスアカウント設定。
        info = json.loads(text, strict=False)
    except json.JSONDecodeError as e:
        raise CredentialsError(
            f"{CREDENTIALS_JSON_ENV} を JSON として読めません（{e.lineno} 行 {e.colno} 文字目付近）。"
            "鍵ファイルの中身をそのまま貼り付けてください（Secrets では ''' で囲む）。"
        ) from None
    # 2. 鍵ファイルは { … } のオブジェクトのはず
    if not isinstance(info, dict):
        raise CredentialsError(f"{CREDENTIALS_JSON_ENV} の中身がサービスアカウントの鍵の形（{{ … }}）ではありません。")
    # 3. 種類と必要な項目があるか（足りない項目の名前だけを伝える）
    if info.get("type", "service_account") != "service_account":
        raise CredentialsError(f"{CREDENTIALS_JSON_ENV} はサービスアカウントの鍵ではありません（type が service_account でない）。")
    # 変数の内容: missing: 設定に不足している必須項目名。
    missing = [k for k in REQUIRED_KEY_FIELDS if not info.get(k)]
    if missing:
        raise CredentialsError(f"{CREDENTIALS_JSON_ENV} に必要な項目がありません: {', '.join(missing)}")
    return info


def ga_config() -> tuple[GaConfig | None, str | None]:
    """環境変数（ローカルでは .env、公開時は Secrets）から GA の接続設定を読み、足りないものがあれば理由を返す。

    Returns:
        (設定, None) または (None, 足りないものの説明)
    """
    # 1. プロパティ ID は数字だけ（測定 ID「G-…」と取り違えやすいので確認する）
    pid = os.getenv("GA_PROPERTY_ID", "").strip()
    # 変数の内容: cred: サービスアカウント鍵ファイルの場所。
    cred = os.getenv("GA_CREDENTIALS", "").strip()
    # 変数の内容: cred_json: 環境変数に設定された鍵 JSON。
    cred_json = os.getenv(CREDENTIALS_JSON_ENV, "").strip()
    if not pid:
        return None, "GA_PROPERTY_ID が設定されていません（ローカルは .env、公開時は Secrets に入れてください）。"
    if pid.upper().startswith("G-"):
        return None, "GA_PROPERTY_ID に測定 ID（G-…）が入っています。数字の「プロパティ ID」を入れてください。"
    if not pid.isdigit():
        return None, "GA_PROPERTY_ID は数字だけで入れてください。"
    # 2. 鍵の中身（GA_CREDENTIALS_JSON）があればそちらを優先し、鍵として読めるかだけ確かめる
    if cred_json:
        try:
            parse_credentials_json(cred_json)
        except CredentialsError as e:
            return None, str(e)
        return GaConfig(property_id=pid), None
    # 3. 鍵ファイルの場所（GA_CREDENTIALS）があり、ファイルが実在するか
    if not cred:
        return None, (
            "GA の鍵が設定されていません。GA_CREDENTIALS（鍵ファイルの場所）または "
            "GA_CREDENTIALS_JSON（鍵の中身）を設定してください。"
        )
    # 変数の内容: path: 展開後の鍵ファイルのパス。
    path = Path(cred).expanduser()
    if not path.is_file():
        return None, "GA_CREDENTIALS に書いた場所に鍵ファイルが見つかりません。"
    return GaConfig(property_id=pid, credentials_path=path), None


def load_credentials(credentials_ref: str):
    """「鍵をどこから読むか」の目印から、読み取り専用の権限を持つ認証情報を作る。

    鍵の中身はここで初めて環境変数から読む（キャッシュ関数の引数には入れない）。

    Args:
        credentials_ref: GaConfig.credentials_ref の値（鍵ファイルの場所、または JSON_CREDENTIALS_REF）

    Returns:
        google.oauth2.service_account.Credentials

    Raises:
        CredentialsError: GA_CREDENTIALS_JSON が鍵として読めないとき
    """
    from google.oauth2 import service_account

    # 1. GA_CREDENTIALS_JSON 方式なら、環境変数の中身を辞書にして使う
    if credentials_ref == JSON_CREDENTIALS_REF:
        # 変数の内容: info: JSON から読み取ったサービスアカウント設定。
        info = parse_credentials_json(os.getenv(CREDENTIALS_JSON_ENV, ""))
        return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    # 2. それ以外は鍵ファイルの場所として読む
    return service_account.Credentials.from_service_account_file(credentials_ref, scopes=SCOPES)


def _client(credentials_ref: str):
    """Data API のクライアントを作る（読み取り専用の権限で）。

    Args:
        credentials_ref: GaConfig.credentials_ref の値

    Returns:
        BetaAnalyticsDataClient
    """
    from google.analytics.data_v1beta import BetaAnalyticsDataClient

    return BetaAnalyticsDataClient(credentials=load_credentials(credentials_ref))


def response_to_frame(response, dimensions: list[str], metrics: list[str]) -> pd.DataFrame:
    """Data API の応答を DataFrame にする。

    Args:
        response: RunReportResponse（rows[].dimension_values / metric_values を持つもの）
        dimensions: 取得したディメンション名（列名になる）
        metrics: 取得した指標名（列名になる。数値に変換する）

    Returns:
        1行1組み合わせの表。date ディメンションは日付型にする
    """
    # 1. 行ごとにディメンションと指標の値を取り出す
    rows = [
        [d.value for d in r.dimension_values] + [m.value for m in r.metric_values]
        for r in response.rows
    ]
    # 変数の内容: df: GA 応答のディメンション・指標を列にした DataFrame。
    df = pd.DataFrame(rows, columns=dimensions + metrics)
    # 2. 指標は数値、日付は日付型にする
    for m in metrics:
        df[m] = pd.to_numeric(df[m], errors="coerce").fillna(0)
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], format="%Y%m%d", errors="coerce")
    return df


@st.cache_data(ttl=GA_CACHE_TTL, show_spinner="Google アナリティクスのデータを読み込んでいます…")
def run_report(
    property_id: str,
    credentials_ref: str,
    dimensions: tuple[str, ...],
    metrics: tuple[str, ...],
    start: str,
    end: str = "today",
    order_by_metric: str | None = None,
    limit: int = DEFAULT_REPORT_LIMIT,
) -> pd.DataFrame:
    """GA4 のレポートを1つ取得する（キャッシュあり）。

    Args:
        property_id: プロパティ ID
        credentials_ref: 鍵をどこから読むかの目印（GaConfig.credentials_ref）。
            キャッシュのキーになるため、鍵の中身ではなく場所・目印だけを渡す
        dimensions: ディメンション名（例: ("pagePath",)）
        metrics: 指標名（例: ("screenPageViews",)）
        start: 開始日（"28daysAgo" や "2026-10-01"）
        end: 終了日
        order_by_metric: 多い順に並べる指標名（None なら並べ替えない）
        limit: 最大行数

    Returns:
        response_to_frame の結果
    """
    from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, OrderBy, RunReportRequest

    # 1. 取得する項目・期間・並び順・行数を指定したリクエストを作る
    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[Dimension(name=d) for d in dimensions],
        metrics=[Metric(name=m) for m in metrics],
        date_ranges=[DateRange(start_date=start, end_date=end)],
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name=order_by_metric), desc=True)]
        if order_by_metric
        else [],
        limit=limit,
    )
    # 2. 読み取り専用の権限で送り、応答を表にする
    response = _client(credentials_ref).run_report(request)
    return response_to_frame(response, list(dimensions), list(metrics))


def label_paths(paths: pd.Series, events: pd.DataFrame, products: pd.DataFrame) -> pd.Series:
    """URL のパスを、わかりやすい名前に置き換える（イベント・商品の詳細ページは名前にする）。

    Args:
        paths: pagePath の列（例: "/events/xxxx"）
        events: events テーブル（id, name）
        products: products テーブル（id, name）

    Returns:
        表示用の名前の列（置き換えられないパスはそのまま）
    """
    # 1. よく見られる固定ページの名前
    fixed = {
        "/": "トップ", "/events": "イベント一覧", "/gallery": "ギャラリー", "/concept": "コンセプト",
        "/contact": "お問い合わせ", "/stockists": "取扱店", "/collaborations": "コラボ", "/media": "メディア",
        "/ei8htplants": "ei8ht plants", "/habitatoides": "Habitat Oides", "/habitatoides/workshop": "WS（Habitat Oides）",
        "/hue": "HUE", "/reserve": "WS 予約", "/cancel": "予約キャンセル", "/shop": "ショップ", "/journal": "ジャーナル",
        "/checkout": "購入手続き", "/order/complete": "注文完了", "/chat": "AI チャット", "/legal": "特定商取引法",
        "/privacy": "プライバシーポリシー",
    }
    # イベント詳細の URL は slug があれば slug、なければ ID なので両方で引けるようにする
    event_names: dict[str, str] = {}
    if not events.empty:
        event_names.update(zip(events["id"].astype(str), events["name"]))
        if "slug" in events.columns:
            event_names.update({str(k): v for k, v in zip(events["slug"], events["name"]) if isinstance(k, str) and k})
    # 変数の内容: product_names: 商品 ID から商品名を引く対応表。
    product_names = dict(zip(products["id"].astype(str), products["name"])) if not products.empty else {}

    def one(path: str) -> str:
        """1つのパスを表示用の名前にする。

        Args:
            path: pagePath の値

        Returns:
            表示用の名前（置き換えられないときはクエリを外したパス）
        """
        # 2. クエリは外して判定する
        p = path.split("?")[0].rstrip("/") or "/"
        if p in fixed:
            return fixed[p]
        # 3. 詳細ページは ID から名前を引く
        for prefix, names, kind in (("/events/", event_names, "イベント"), ("/shop/", product_names, "商品")):
            if p.startswith(prefix):
                # 変数の内容: key: 詳細ページのパスから切り出したイベントまたは商品識別子。
                key = p[len(prefix):]
                return f"{kind}：{names[key].strip()}" if key in names else p
        return p

    return paths.map(one)
