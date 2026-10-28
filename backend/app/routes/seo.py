"""検索エンジン・SNS 向けの情報をサーバー側で返すモジュール。

公開サイトは React の SPA で、ページのタイトルや OGP は画面が表示されてから
JavaScript（frontend/src/components/PageMeta.tsx）で入れている。SNS のクローラー
（LINE・X・Facebook など）は JavaScript を実行しないため、index.html を返す時点で
パスに応じたメタ情報を <head> に入れておく。

このモジュールが受け持つもの:
- render_spa_index(): SPA の index.html にページごとのメタ情報・構造化データを入れて返す
- GET /robots.txt: クローラーへの案内
- GET /sitemap.xml: 公開ページの一覧

値は PageMeta.tsx と各ページの <PageMeta> 呼び出しに合わせている（表示後に
JavaScript が同じ値で上書きしても見た目が変わらないようにするため）。
"""
import html
import json
import logging
import os
import re
import threading
# time はこのモジュールでは直接使わないが、テストが seo.time.monotonic を差し替えてキャッシュの期限を確かめるため残す
import time  # noqa: F401
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse, Response

from ..config import SITE_ORIGIN
from ..db import admin_supabase, supabase
from ..utils.cache import TTLCache
from ..utils.errors import error_summary
from ..utils.ids import UUID_RE
from .seo_html import (
    OG_LOCALE,
    cleanup_brand_pwa_html,
    inject_head,
    json_for_script as _json_for_script,
    render_head_tags,
)
from .seo_paths import normalize_legacy_path
from .seo_brand_meta import resolve_brand_page
from .seo_static_meta import STATIC_PAGES, StaticPage
from .seo_page_data import (
    SeoDataDeps,
    _EVENT_COLUMNS,
    fetch_article as _fetch_article_data,
    fetch_event as _fetch_event_data,
    fetch_product as _fetch_product_data,
)
from .seo_page_meta import (
    build_article_page_meta as _build_article_page_meta,
    build_event_page_meta as _build_event_page_meta,
    build_product_page_meta as _build_product_page_meta,
)
from .seo_robots import build_robots_txt as _build_robots_txt
from .seo_sitemap import build_sitemap as _build_sitemap_content, sitemap_url as _make_sitemap_url
from .seo_structured_data import (
    DESCRIPTION_MAX_LEN,
    EVENT_JSONLD_MAX_IMAGES,
    _TIME_RE,
    _str,
    _truncate,
    event_datetime as _event_datetime,
    event_description as _build_event_description,
    event_json_ld as _build_event_json_ld,
    format_date_label as _build_format_date_label,
    organization_json_ld as _build_organization_json_ld,
    parse_date as _build_parse_date,
    times_in as _build_times_in,
)

# 変数の内容: logger: モジュール名を使って記録するロガー、router: この API 群のルーター。
logger = logging.getLogger(__name__)

router = APIRouter(tags=['seo'])

# ---------------------------------------------------------------------------
# サイト共通の定数（PageMeta.tsx の SITE / DEFAULT_DESC / ORIGIN / DEFAULT_OG_IMAGE と同じ値）
# ---------------------------------------------------------------------------

# サイトの URL（SITE_ORIGIN）は config.py の値を使う。canonical・og:url・画像の絶対 URL の土台にする
# サイト名。title の末尾（"ページ名 | ei8ht plants"）と og:site_name に使う
SITE_NAME = 'ei8ht plants'
# ページ固有の説明が無いときの説明文
DEFAULT_DESCRIPTION = '植物の生息環境を切り取るハビタットスタイルの専門店。ワークショップ・イベント情報も発信しています。'
# ページ固有の画像が無いときの OGP 画像（サイトのロゴ）
DEFAULT_OG_IMAGE = f'{SITE_ORIGIN}/img/logo-ei8htplants.png'
# 構造化データ（Organization）のロゴ
LOGO_URL = DEFAULT_OG_IMAGE
# DB の読み取り結果をメモリに残しておく秒数（クローラーが連続で来ても DB を叩きすぎないため）
CACHE_TTL_SECONDS = 60
# メモリキャッシュに残す件数の上限（存在しない ID を大量に叩かれてもメモリが増え続けないようにする）
CACHE_MAX_ENTRIES = 500

# 検索結果に出さないページ（パスの先頭がこれと一致するもの）。noindex を入れ、robots.txt でも Disallow にする
NOINDEX_PREFIXES = ('/admin', '/cancel', '/checkout', '/order', '/official/cancel', '/official/checkout', '/official/order')
# robots.txt で Disallow にするパス（NOINDEX_PREFIXES と同じ）。
# /api は入れない: Googlebot は JavaScript を実行してページを描画する際に /api/... を読むため、
# /api を除外するとイベント・記事などの本文が描画できず、索引されなくなる
ROBOTS_DISALLOW = NOINDEX_PREFIXES

# UUID の形（events/articles/products の id）。共通の部品（app/utils/ids.py）のものを使う
_UUID_RE = UUID_RE


# sitemap.xml に載せる固定ページ（検索結果に出してよい正規公開ページだけ。
# ブランド旧URLは別ドメインへの転送用なので載せず、予約・購入完了などの個別導線も外す）
SITEMAP_STATIC_PATHS = (
    '/', '/about', '/plants', '/official', '/official/brands',
    '/official/events', '/official/gallery', '/official/shop', '/official/journal',
    '/official/concept', '/official/contact', '/official/stockists', '/official/collaborations',
    '/official/media', '/official/chat', '/official/legal', '/official/privacy',
)

# ブランド専用ドメイン。未知の Host ヘッダーを canonical URL に使わないよう、許可リストで解決する。
BRAND_DOMAINS = {
    'habitatoides.com': ('Habitat Oides', 'https://habitatoides.com'),
    'www.habitatoides.com': ('Habitat Oides', 'https://habitatoides.com'),
    'huebyei8htplants.com': ('HUE by ei8ht plants', 'https://huebyei8htplants.com'),
    'www.huebyei8htplants.com': ('HUE by ei8ht plants', 'https://huebyei8htplants.com'),
}


# ---------------------------------------------------------------------------
# メモリキャッシュ
# ---------------------------------------------------------------------------

# 一定時間だけ値を覚えておく簡易キャッシュ（共通の部品 app/utils/cache.py。以前の名前でも使えるようにしておく）
_TTLCache = TTLCache


# イベント・記事・商品・sitemap の読み取り結果のキャッシュ
_cache = _TTLCache(CACHE_TTL_SECONDS, CACHE_MAX_ENTRIES)


def clear_cache() -> None:
    """メモリキャッシュを空にする（テストで DB のモックを差し替えるときに使う）。

    Returns:
        なし。
    """
    _cache.clear()


# ---------------------------------------------------------------------------
# 小さな変換ヘルパー
# ---------------------------------------------------------------------------

def _rows(result: Any) -> list[dict]:
    """supabase の execute() の結果から行のリストを取り出す。

    Args:
        result: supabase のクエリの execute() の戻り値

    Returns:
        dict の行だけのリスト。.data がリストでないときは空のリスト
    """
    # 変数の内容: data: 指定テーブルから取得した公開対象レコード一覧。。
    data = getattr(result, 'data', None)
    if not isinstance(data, list):
        return []
    return [r for r in data if isinstance(r, dict)]


def _absolute_url(url: Any) -> Optional[str]:
    """画像などの URL を絶対 URL（https://...）にして返す。使えない URL は None を返す。

    Args:
        url: DB に入っている URL（絶対 URL・"//" 始まり・"/" 始まりのいずれか）

    Returns:
        絶対 URL。空・blob: など外から見られない URL のときは None
    """
    # 1. 空 URL とブラウザー内だけで使える URL を除外する。
    u = _str(url).strip()
    if not u or u.startswith(('blob:', 'data:')):
        return None
    # 2. 絶対 URL は維持し、相対 URL はサイトの origin を付ける。
    if u.startswith(('https://', 'http://')):
        return u
    if u.startswith('//'):
        return 'https:' + u
    if u.startswith('/'):
        return SITE_ORIGIN + u
    return None


def _parse_blocks(content: Any) -> list[dict]:
    """記事・商品の本文をブロックの配列にする（frontend の parseBlocks と同じ動き）。

    本文は JSON のブロック配列（[{type: 'text', value: ...}, ...]）で保存されている。
    古いデータは「## 見出し」と本文の行が並んだテキストなので、それもブロックに直す。

    Args:
        content: articles.content / products.description の値

    Returns:
        ブロック（dict）のリスト。中身が無ければ空のリスト
    """
    # 変数の内容: text: 生成または解析する本文。
    text = _str(content)
    if not text:
        return []
    # 1. JSON のブロック配列として読めればそれを使う
    try:
        # 変数の内容: parsed: JSON として解析した値（配列ならブロック一覧として採用する）。
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [b for b in parsed if isinstance(b, dict)]
    except ValueError:
        pass
    # 2. 読めなければ古いテキスト形式として「## 」行を見出し、それ以外の行を本文にする
    blocks: list[dict] = []
    # 変数の内容: line: 旧形式の本文を改行で分けた現在行。
    for line in text.split('\n'):
        if line.startswith('## '):
            blocks.append({'type': 'heading', 'value': line[3:]})
        elif line.strip():
            if blocks and blocks[-1].get('type') == 'text':
                blocks[-1]['value'] += '\n' + line
            else:
                blocks.append({'type': 'text', 'value': line})
    return blocks


def _blocks_to_text(blocks: list[dict], max_len: int = DESCRIPTION_MAX_LEN) -> str:
    """見出し・本文ブロックの文字をつないで先頭 max_len 文字を返す（frontend の blocksToText と同じ）。

    Args:
        blocks: _parse_blocks() が返すブロックのリスト
        max_len: 返す最大の文字数（既定は DESCRIPTION_MAX_LEN）

    Returns:
        text・heading ブロックの文字を空白でつないだ先頭 max_len 文字。無ければ ''
    """
    # 変数の内容: parts: 後で連結する要素の一覧。
    parts = [
        _str(b.get('value')).replace('\n', ' ')
        for b in blocks
        if b.get('type') in ('text', 'heading')
    ]
    return ' '.join(parts)[:max_len]


def _first_image_block_url(blocks: list[dict]) -> Optional[str]:
    """ブロック配列の中で最初の画像ブロックの URL を返す。

    Args:
        blocks: _parse_blocks() が返すブロックのリスト

    Returns:
        最初の画像ブロックの URL。画像ブロックが無ければ None
    """
    # 変数の内容: b: JSON 配列から抽出したブロック候補。
    for b in blocks:
        if b.get('type') == 'image' and _str(b.get('url')):
            return _str(b.get('url'))
    return None


def _parse_date(value: Any) -> Optional[date]:
    """従来の SEO モジュール名で日付変換関数を公開する互換ラッパー。

    Args:
        value: ISO 形式の日付文字列。

    Returns:
        読み取れた日付。形式が不正な場合は None。
    """
    return _build_parse_date(value)


def _format_date_label(start: Any, end: Any) -> str:
    """従来の関数名でイベント開催日の表示文字列を返す互換ラッパー。

    Args:
        start: 開始日（YYYY-MM-DD）。
        end: 終了日（YYYY-MM-DD）。

    Returns:
        開催日の表示文字列。開始日を読めない場合は空文字。
    """
    return _build_format_date_label(start, end)


def _times_in(text: str) -> list[str]:
    """従来の関数名と正規表現差し替え境界を保ってイベント時刻を抽出する。

    Args:
        text: 時刻を含む event.time または daily_times の文字列。

    Returns:
        有効な時刻を HH:MM 形式で並べたリスト。
    """
    return _build_times_in(text, _TIME_RE)


def _is_noindex(path: str) -> bool:
    """検索結果に出さないページ（/admin・/cancel・/checkout・/order 以下）かどうかを返す。

    Args:
        path: 先頭が "/" のパス

    Returns:
        NOINDEX_PREFIXES のどれかと一致するか、その下のパスなら True
    """
    return any(path == p or path.startswith(p + '/') for p in NOINDEX_PREFIXES)


# ---------------------------------------------------------------------------
# DB の読み取り（メモリキャッシュ付き）
# ---------------------------------------------------------------------------

def _seo_data_deps() -> SeoDataDeps:
    """従来の seo モジュールの差し替え可能な参照から取得依存を作る。

    テストや既存呼び出しが ``seo._cache``・``seo.supabase`` などを差し替える契約を
    維持するため、依存はモジュール読み込み時ではなく各呼び出し時に組み立てる。

    Returns:
        現在の seo モジュール参照を保持する不変な依存オブジェクト。
    """
    # 1. 呼び出し時点のキャッシュ・DB・変換関数・UUID 判定を依存へ束ねる。
    return SeoDataDeps(
        cache=_cache,
        public_db=supabase,
        admin_db=admin_supabase,
        rows=_rows,
        absolute_url=_absolute_url,
        uuid_pattern=_UUID_RE,
    )


def _fetch_event(key: str) -> Optional[dict]:
    """従来の関数名を保ち、現在の SEO モジュール依存でイベントを取得する。

    Args:
        key: イベントの slug または UUID。

    Returns:
        画像 URL 一覧を付けたイベント行。未登録なら None。
    """
    return _fetch_event_data(key, _seo_data_deps())


def _fetch_article(article_id: str) -> Optional[dict]:
    """従来の関数名を保ち、現在の SEO モジュール依存で公開記事を取得する。

    Args:
        article_id: 記事の UUID。

    Returns:
        公開済みの記事行。未登録・非公開・ID 不正なら None。
    """
    return _fetch_article_data(article_id, _seo_data_deps())


def _fetch_product(product_id: str) -> Optional[dict]:
    """従来の関数名を保ち、現在の SEO モジュール依存で公開商品を取得する。

    Args:
        product_id: 商品の UUID。

    Returns:
        公開中の商品行。未登録・非公開・ID 不正なら None。
    """
    return _fetch_product_data(product_id, _seo_data_deps())


# ---------------------------------------------------------------------------
# パスごとのメタ情報を決める
# ---------------------------------------------------------------------------

@dataclass
class PageMeta:
    """<head> に入れるメタ情報。"""

    # <title>・og:title・twitter:title（"ページ名 | ei8ht plants" の形。トップはサイト名だけ）
    title: str
    # meta description・og:description・twitter:description
    description: str
    # og:image・twitter:image（絶対 URL）
    image: str
    # canonical・og:url（絶対 URL）
    url: str
    # True のとき <meta name="robots" content="noindex"> を入れる
    noindex: bool = False
    # True のとき <link rel="canonical"> を入れる。存在しないページ（ソフト 404）では False にする
    canonical: bool = True
    # True のときページ固有の画像（twitter:card を summary_large_image にする）。False は既定のロゴ
    has_own_image: bool = False
    # <script type="application/ld+json"> に入れる構造化データ（dict）のリスト
    json_ld: list[dict] = field(default_factory=list)
    # og:site_name（独立ブランドサイトでは各ブランド名にする）
    site_name: str = SITE_NAME


def _full_title(title: Optional[str]) -> str:
    """ページ名から <title> の文字列を作る（PageMeta.tsx と同じく "ページ名 | ei8ht plants"）。

    Args:
        title: ページ名。None・空ならサイト名だけにする

    Returns:
        <title> に入れる文字列
    """
    return f'{title} | {SITE_NAME}' if title else SITE_NAME


def _make_meta(
    path: str,
    title: Optional[str],
    description: Optional[str],
    image: Optional[str],
    canonical_path: Optional[str] = None,
) -> PageMeta:
    """ページ名・説明・画像（どれも省略可）から既定値を補って PageMeta を作る。

    Args:
        path: リクエストのパス（noindex の判定に使う）
        title: ページ名（None ならサイト名だけのタイトル）
        description: 説明（None なら既定の説明）
        image: 画像 URL（None なら既定のロゴ）
        canonical_path: canonical・og:url に使うパス。None なら path と同じ
            （UUID で開いたイベントを slug の URL にそろえるときに使う）

    Returns:
        PageMeta
    """
    # 変数の内容: img: 対象画像レコード。
    img = _absolute_url(image) if image else None
    return PageMeta(
        title=_full_title(title),
        description=description or DEFAULT_DESCRIPTION,
        image=img or DEFAULT_OG_IMAGE,
        url=SITE_ORIGIN + quote(canonical_path or path, safe='/'),
        noindex=_is_noindex(path),
        has_own_image=img is not None,
    )


def _not_found_meta(path: str) -> PageMeta:
    """存在しない・非公開のイベント／記事／商品や、不明なパス向けの既定値を返す。

    SPA なのでステータスは 200 のままだが、中身の無いページが検索結果に載らないよう
    （ソフト 404 対策）noindex を入れ、canonical は入れない。

    Args:
        path: リクエストのパス（og:url に使う）

    Returns:
        既定値に noindex=True・canonical=False を付けた PageMeta
    """
    # 変数の内容: meta: ページの title・description・画像などの SEO 情報。
    meta = _make_meta(path, None, None, None)
    # 変数の内容: meta.canonical: 対象オブジェクトに設定するcanonical属性値、meta.noindex: 対象オブジェクトに設定するnoindex属性値。
    meta.noindex = True
    # 変数の内容: meta.canonical: 対象オブジェクトに設定するcanonical属性値。
    meta.canonical = False
    return meta


def _event_description(event: dict) -> str:
    """従来の SEO モジュール名でイベント説明文を作る互換ラッパー。

    Args:
        event: _fetch_event() が返すイベントの dict

    Returns:
        説明文。材料が何も無ければ DEFAULT_DESCRIPTION。
    """
    return _build_event_description(
        event,
        default_description=DEFAULT_DESCRIPTION,
        description_max_len=DESCRIPTION_MAX_LEN,
    )


def _event_json_ld(event: dict, meta: PageMeta) -> Optional[dict]:
    """従来の SEO モジュール名で Event JSON-LD を作る互換ラッパー。

    Args:
        event: _fetch_event() が返すイベントの dict（image_urls 付き）
        meta: このページの PageMeta（description・url を使う）。

    Returns:
        Event の dict。開始日が読めない、または住所が無いときは None。
    """
    return _build_event_json_ld(
        event,
        description=meta.description,
        url=meta.url,
        site_name=SITE_NAME,
        site_origin=SITE_ORIGIN,
        default_image=DEFAULT_OG_IMAGE,
        max_images=EVENT_JSONLD_MAX_IMAGES,
        time_pattern=_TIME_RE,
    )


def _organization_json_ld() -> dict:
    """従来の SEO モジュール名で Organization JSON-LD を返す互換ラッパー。

    Returns:
        トップページに埋め込む Organization JSON-LD。
    """
    return _build_organization_json_ld(site_name=SITE_NAME, site_origin=SITE_ORIGIN, logo_url=LOGO_URL)


def _brand_domain_meta(path: str, site_name: str, origin: str) -> PageMeta:
    """ブランド独立ドメイン用の canonical / OGP を作る。未公開パスは noindex にする。

    Args:
        path: 検証対象のファイルパスまたは URL パス。
        site_name: サイト識別名。
        origin: リクエスト元または生成 URL の origin。

    Returns:
        注釈に示した形式の応答（PageMeta）。
    """
    # 1. パスを正規化し、純粋なページ解決関数から公開情報を取得する。
    norm = '/' + path.strip('/')
    page = resolve_brand_page(norm, site_name)
    # 2. 未公開パスは noindex 用の既定メタ情報を返す。
    if page is None:
        # 変数の内容: logo: ブランドロゴの画像パス。
        logo = 'hue' if site_name == 'HUE by ei8ht plants' else 'habitatoides'
        return PageMeta(
            title=site_name, description=DEFAULT_DESCRIPTION, image=f'{origin}/img/logo-{logo}.png',
            url=f'{origin}{quote(norm, safe="/")}', noindex=True, canonical=False, site_name=site_name,
        )
    # 3. 公開ページは正規 URL とブランド情報を組み立てる。
    return PageMeta(
        title=site_name if page.title == site_name else f'{page.title} | {site_name}',
        description=page.description,
        image=f'{origin}{page.image_path}',
        url=f'{origin}{quote(page.canonical_path, safe="/")}',
        has_own_image=True,
        site_name=site_name,
    )


def build_page_meta(path: str, query: Optional[dict] = None, hostname: str = '') -> PageMeta:
    """パスに応じた <head> のメタ情報を決める。

    1. /official/events/{slug または id}: イベント名・説明・画像・構造化データ
    2. /official/journal/{id}: 公開済みの記事のタイトル・本文の冒頭・アイキャッチ画像
    3. /official/shop/{id}: 公開中の商品の名前・説明・画像
    4. 固定ページ: STATIC_PAGES の値（トップは Organization の構造化データも）
    5. それ以外・見つからない・非公開: サイトの既定値に noindex を付け、canonical は付けない（ソフト 404 対策）
    DB の読み取りに失敗したときは既定値で返す（一時的な失敗なので noindex は付けない。SPA の表示は止めない）。

    Args:
        path: リクエストのパス（"/official/events/foo" など。先頭のスラッシュは無くてもよい）
        query: クエリ文字列（/official/events?page=past で "Past Events" にするために使う）

    Returns:
        PageMeta
    """
    # 変数の内容: host: リクエスト元のホスト名。
    host = hostname.lower().split(':', 1)[0]
    if host in BRAND_DOMAINS:
        return _brand_domain_meta(path, *BRAND_DOMAINS[host])

    # ブランド専用 host の処理後、旧公式 URL を現行パスへ正規化する。
    # 変数の内容: norm: 正規化したパスまたは文字列。
    norm = normalize_legacy_path(path)
    # 変数の内容: query: DB へ渡す検索条件、segments: 分割した URL パス要素。
    segments = [s for s in norm.split('/') if s]
    query = query or {}

    try:
        # 1. イベントの個別ページ
        if len(segments) == 3 and segments[:2] == ['official', 'events']:
            # 1. 先頭の公式サイト階層とコレクション名を除き、3番目の要素を識別子として読む。
            event = _fetch_event(segments[2])
            if event and _str(event.get('name')):
                # 2. 既存の差し替え可能な関数群を渡し、イベント用メタ情報を生成する。
                return _build_event_page_meta(
                    norm,
                    event,
                    _make_meta,
                    _event_description,
                    _event_json_ld,
                )
            return _not_found_meta(norm)

        # 2. 記事の個別ページ（タイトルは JournalArticle.tsx と同じ "記事名 | Journal"）
        if len(segments) == 3 and segments[:2] == ['official', 'journal']:
            # 1. 先頭の公式サイト階層とコレクション名を除き、3番目の要素を識別子として読む。
            article = _fetch_article(segments[2])
            if article and _str(article.get('title')):
                # 2. 既存の差し替え可能な本文・画像関数を渡し、Journal 用メタ情報を生成する。
                return _build_article_page_meta(
                    norm,
                    article,
                    _make_meta,
                    _parse_blocks,
                    _blocks_to_text,
                    _first_image_block_url,
                )
            return _not_found_meta(norm)

        # 3. 商品の個別ページ（ShopProduct.tsx と同じく画像は image_urls の1枚目）
        if len(segments) == 3 and segments[:2] == ['official', 'shop']:
            # 1. 先頭の公式サイト階層とコレクション名を除き、3番目の要素を識別子として読む。
            product = _fetch_product(segments[2])
            if product and _str(product.get('name')):
                # 2. 既存の差し替え可能な本文関数を渡し、Shop 用メタ情報を生成する。
                return _build_product_page_meta(
                    norm,
                    product,
                    _make_meta,
                    _parse_blocks,
                    _blocks_to_text,
                )
            return _not_found_meta(norm)
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        # 例外の文字列には URL の一部（利用者の入力）が入りうるので、型名とコードだけを出す
        logger.error('build_page_meta DB 読み取りエラー（%r）: %s', norm, error_summary(e))
        return _make_meta(norm, None, None, None)

    # 4. 固定ページ
    page = STATIC_PAGES.get(norm)
    if page is not None:
        # 変数の内容: title: ページまたはメールのタイトル。
        title = page.title
        if norm == '/official/events' and query.get('page') == 'past':
            # 変数の内容: title: ページまたはメールのタイトル。
            title = 'Past Events'
        # 変数の内容: meta: ページの title・description・画像などの SEO 情報。
        meta = _make_meta(norm, title, page.description, page.image)
        if norm in {'/', '/official'}:
            meta.json_ld.append(_organization_json_ld())
        return meta

    # 5. それ以外（/admin 以下・不明なパス）は既定値に noindex を付け、canonical は付けない
    return _not_found_meta(norm)


# ---------------------------------------------------------------------------
# index.html のパス → (更新時刻, 中身)。デプロイで差し替わって更新時刻が変わったら読み直す
_index_cache: dict[str, tuple[float, str]] = {}
# _index_cache を読み書きするときに取るロック（複数のリクエストが同時に読み書きしても壊れないようにする）。
# ファイルの読み込み中は持たない（読み込みが遅くてもほかのリクエストを待たせないため）
_index_lock = threading.Lock()


def _read_index(index_path: str) -> str:
    """index.html を読む。更新時刻が変わっていなければ前回読んだ中身を使う。

    Args:
        index_path: index.html のパス

    Returns:
        index.html の中身

    Raises:
        OSError: ファイルが無い・読めない場合
    """
    # 1. 更新時刻を調べ、変更が無ければキャッシュした HTML を返す。
    mtime = os.path.getmtime(index_path)
    with _index_lock:
        # 変数の内容: hit: キャッシュ検索の結果。
        hit = _index_cache.get(index_path)
        if hit and hit[0] == mtime:
            return hit[1]
    # 2. キャッシュに無い場合はファイルを読み、更新時刻と内容を保存する。
    with open(index_path, encoding='utf-8') as f:
        # 変数の内容: content: 読み込んだ、または生成した内容。
        content = f.read()
    with _index_lock:
        _index_cache[index_path] = (mtime, content)
    return content


def render_spa_index(index_path: str, path: str, query: Optional[dict] = None, hostname: str = '') -> str:
    """SPA の index.html に、パスに応じたメタ情報を入れた HTML を返す。

    Args:
        index_path: frontend/dist/index.html のパス
        path: リクエストのパス
        query: クエリ文字列の dict
        hostname: リクエスト元のホスト名。ポートを除いて小文字化し、独立ブランドドメイン向けの
            メタ情報とPWA設定を選ぶために使う。

    Returns:
        メタ情報入りの HTML 文字列
    """
    # 1. HTML にページ固有の SEO 情報を埋め込む。
    host = hostname.lower().split(':', 1)[0]
    page = inject_head(_read_index(index_path), build_page_meta(path, query, host))
    # 2. ブランド独立ドメインでは古い PWA 登録を解除するスクリプトを加える。
    if host in BRAND_DOMAINS:
        # ブランド専用ドメイン向けのPWA後始末を、HTML文字列変換関数へ委譲する。
        # 変数の内容: site_name: BRAND_DOMAINSで定義したこのブランドの表示名。
        site_name = BRAND_DOMAINS[host][0]
        page = cleanup_brand_pwa_html(page, site_name)
    return page


# ---------------------------------------------------------------------------
# robots.txt / sitemap.xml
# ---------------------------------------------------------------------------

@router.get('/robots.txt', response_class=PlainTextResponse)
def robots_txt(request: Request) -> PlainTextResponse:
    """クローラー向けの robots.txt を返す。管理画面・予約キャンセル・購入手続きは除外する（/api は除外しない）。

    Returns:
        robots.txt の本文（text/plain）

    Args:
        request: FastAPI に渡す HTTP リクエスト。
    """
    # 変数の内容: hostname: リクエストヘッダーから取得した Host 値。
    hostname = request.headers.get('host', '')
    # 1. robots.txt の純粋な本文生成を呼び出し、text/plain 応答として返す。
    # 変数の内容: body: robots.txt の directive と Sitemap 行を含む本文。
    body = _build_robots_txt(hostname, ROBOTS_DISALLOW, BRAND_DOMAINS, SITE_ORIGIN)
    return PlainTextResponse(body)


def _sitemap_url(path: str, lastmod: Any = None, origin: str = SITE_ORIGIN) -> str:
    """sitemap の <url> 要素を1つ作る。lastmod は日付として読めるときだけ入れる。

    Args:
        path: ページのパス（"/official/events/foo" など）
        lastmod: 最終更新日（'YYYY-MM-DD...'）。読めなければ入れない

    Returns:
        <url> 要素の文字列
    """
    return _make_sitemap_url(
        path,
        lastmod,
        origin,
        parse_date=_parse_date,
        quote=quote,
        escape=html.escape,
    )


def _build_sitemap(site_name: Optional[str] = None, origin: str = SITE_ORIGIN) -> tuple[str, bool]:
    """sitemap.xml の中身を作る。

    1. 固定ページ（SITEMAP_STATIC_PATHS）
    2. イベント（slug があれば slug の URL、無ければ id の URL）
    3. 公開済みの記事（lastmod は published_at、無ければ created_at）
    4. 公開中の商品（lastmod は created_at）
    どこかの読み取りに失敗しても、読めた分だけで返す。

    Returns:
        (XML の文字列, 全部読めたか)

    Args:
        site_name: サイト識別名。
        origin: リクエスト元または生成 URL の origin。
    """
    return _build_sitemap_content(
        site_name,
        origin,
        static_paths=SITEMAP_STATIC_PATHS,
        make_url=_sitemap_url,
        rows=_rows,
        as_string=_str,
        public_client=supabase,
        admin_client=admin_supabase,
        logger=logger,
        summarize_error=error_summary,
    )


@router.get('/sitemap.xml')
def sitemap_xml(request: Request) -> Response:
    """公開ページ・イベント・公開済みの記事・公開中の商品の URL 一覧（sitemap.xml）を返す。

    作った XML は CACHE_TTL_SECONDS 秒メモリに残す。読み取りに失敗した部分があるときは
    次のリクエストで作り直せるよう、キャッシュしない。

    Returns:
        sitemap.xml の本文（application/xml）

    Args:
        request: FastAPI に渡す HTTP リクエスト。
    """
    # 変数の内容: cache_key: メモリキャッシュを参照するキー、found: キャッシュに値があるかを示すフラグ、host: リクエスト元のホスト名、origin: URL の起点となる origin、site: ホスト名に対応するサイト設定、site_name: 対象ブランドまたはサイト名、xml: 生成した sitemap XML。
    host = request.headers.get('host', '').lower().split(':', 1)[0]
    site = BRAND_DOMAINS.get(host)
    site_name, origin = site if site else (None, SITE_ORIGIN)
    cache_key = ('sitemap', site_name or 'ei8htplants')
    found, xml = _cache.get(cache_key)
    # 2. キャッシュ済み XML を使い、無ければページ一覧を読み、成功時だけ保存する。
    if not found:
        # 変数の内容: ok: 処理の成功可否、xml: 生成した sitemap XML。
        xml, ok = _build_sitemap(site_name, origin)
        if ok:
            _cache.set(cache_key, xml)
    return Response(content=xml, media_type='application/xml')
