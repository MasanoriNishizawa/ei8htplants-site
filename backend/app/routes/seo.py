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
from .seo_html import OG_LOCALE, inject_head, json_for_script as _json_for_script, render_head_tags
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


@dataclass(frozen=True)
class StaticPage:
    """固定ページのメタ情報（各ページの <PageMeta> に渡している値と同じ）。

    title が None のときはサイト名だけのタイトルになる（PageMeta の title 省略時と同じ）。
    description・image が None のときはサイト既定の値を使う。
    """

    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None


# 固定ページのメタ情報。キーはパス（末尾スラッシュなし）。値は frontend/src/pages/*.tsx の
# <PageMeta> 呼び出しを写したもの（言語切り替えのあるページは日本語の値）
STATIC_PAGES: dict[str, StaticPage] = {
    '/': StaticPage(None, 'アガベ・塊根植物・灌木などビザールプランツを専門に扱うラインです。'),
    '/about': StaticPage('Our Story', '個性的な植物を育て、一株ごとの魅力を届けるei8ht plantsの考え方をご紹介します。'),
    '/plants': StaticPage('Plants', 'アガベ、塊根植物、灌木、多肉植物。ei8ht plantsが扱うビザールプランツをご紹介します。'),
    '/official/brands': StaticPage('Our Brands', '植物との向き合い方から生まれた、ei8ht plants の3つのブランドをご紹介します。'),
    '/official': StaticPage(),
    '/official/events': StaticPage('Events', 'ei8ht plants のイベント・出展情報。ワークショップ予約も受け付けています。'),
    '/official/gallery': StaticPage('Gallery', 'ei8ht plants、Habitat Oides、HUE の植物ギャラリー。'),
    '/official/concept': StaticPage('Concept', 'ei8ht plants のブランドコンセプト。ビザールプランツ・ハビタットスタイル・オーナメントプランツの3ラインをご紹介します。'),
    '/official/contact': StaticPage('Contact', 'ei8ht plants へのお問い合わせはこちらから。'),
    '/official/stockists': StaticPage('Stockists', 'ei8ht plants 取扱店一覧。'),
    '/official/collaborations': StaticPage(
        'Collaborations', 'Habitat Oides のコラボレーション作品・活動記録。',
        f'{SITE_ORIGIN}/img/habitatOides/habitat_oides_hero.jpg',
    ),
    '/official/media': StaticPage('Media', 'ei8ht plants のメディア出演情報をまとめています。'),
    '/habitatoides': StaticPage(
        'Habitat Oides', '植物の生息環境を再現するハビタットスタイルの専門ライン。ワークショップも開催しています。',
        f'{SITE_ORIGIN}/img/habitatOides/habitat_oides_hero.jpg',
    ),
    '/habitatoides/workshop': StaticPage(
        'Habitat Style Workshop', 'ハビタットスタイルのワークショップ。植物の生息環境を意識したレイアウトを自分の手で制作できます。',
        f'{SITE_ORIGIN}/img/habitatOides/habitat_oides_workshop_main.jpg',
    ),
    '/hue': StaticPage('HUE by ei8ht plants', 'HUE は、色彩と形を楽しむオーナメントプランツのラインです。'),
    '/official/legal': StaticPage('特定商取引法に基づく表示', 'ei8ht plants 特定商取引法に基づく表示'),
    '/official/privacy': StaticPage('プライバシーポリシー', 'ei8ht plants のプライバシーポリシー（個人情報の取り扱い・アクセス解析について）'),
    '/official/chat': StaticPage('AI コンシェルジュ', '植物の育て方・管理のご相談や、ワークショップ・予約に関するご質問にAIがお答えします。'),
    '/official/reserve': StaticPage('Workshop 予約', 'Habitat Style Workshop へのご予約はこちらから。'),
    '/official/cancel': StaticPage('予約キャンセル', 'ワークショップ予約のキャンセルはこちらから。'),
    '/official/shop': StaticPage('Shop', 'ei8ht plants オンラインストア'),
    '/official/journal': StaticPage('Journal', '植物と暮らしにまつわるコラム'),
    '/official/checkout': StaticPage('ご注文手続き', 'ご注文手続き'),
    '/official/order/complete': StaticPage('ご注文ありがとうございます', 'ご注文を受け付けました。'),
}

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
    """メモリキャッシュを空にする（テストで DB のモックを差し替えるときに使う）。"""
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
    u = _str(url).strip()
    if not u or u.startswith(('blob:', 'data:')):
        return None
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
    text = _str(content)
    if not text:
        return []
    # 1. JSON のブロック配列として読めればそれを使う
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [b for b in parsed if isinstance(b, dict)]
    except ValueError:
        pass
    # 2. 読めなければ古いテキスト形式として「## 」行を見出し、それ以外の行を本文にする
    blocks: list[dict] = []
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

# イベントのメタ情報に使う列（管理情報 admin_info は読まない）
_EVENT_COLUMNS = 'id, slug, name, start_date, end_date, time, location, address, page_content, daily_times'


def _fetch_event(key: str) -> Optional[dict]:
    """イベントを slug または id で読み、画像 URL のリスト（'image_urls'）を付けて返す。

    公開 API（GET /api/events/{event_id}）と同じく slug を先に探し、無ければ id で探す。
    結果（見つからなかったことも含む）は CACHE_TTL_SECONDS 秒だけメモリに残す。
    DB の読み取りは公開用クライアント（anon）で行う。

    Args:
        key: URL の /official/events/ の後ろの部分（slug または UUID）

    Returns:
        イベントの dict（image_urls 付き）。見つからなければ None
    """
    cache_key = ('event', key)
    found, cached = _cache.get(cache_key)
    if found:
        return cached
    # 1. slug で探す
    rows = _rows(supabase.table('events').select(_EVENT_COLUMNS).eq('slug', key).limit(1).execute())
    # 2. 無ければ、UUID の形のときだけ id で探す
    if not rows and _UUID_RE.match(key):
        rows = _rows(supabase.table('events').select(_EVENT_COLUMNS).eq('id', key).limit(1).execute())
    event = rows[0] if rows else None
    # 3. 見つかったら画像を表示順で読み、外から見られる URL だけ残す
    if event is not None:
        imgs = _rows(
            supabase.table('event_images').select('url').eq('event_id', event.get('id')).order('display_order').execute()
        )
        event['image_urls'] = [u for u in (_absolute_url(i.get('url')) for i in imgs) if u]
    _cache.set(cache_key, event)
    return event


def _fetch_article(article_id: str) -> Optional[dict]:
    """公開済みの記事を id で読んで返す。非公開・存在しない・id の形でない場合は None。

    記事の公開 API（GET /api/articles）と同じく、管理用クライアントに is_published=true の
    条件を付けて読む（記事テーブルには anon 向けの読み取り設定が見当たらないため）。
    読むのはメタ情報に必要な列だけにする。

    Args:
        article_id: URL の /official/journal/ の後ろの部分

    Returns:
        記事の dict（id・title・content・image_urls・published_at・created_at）。無ければ None
    """
    if not _UUID_RE.match(article_id):
        return None
    cache_key = ('article', article_id)
    found, cached = _cache.get(cache_key)
    if found:
        return cached
    rows = _rows(
        admin_supabase.table('articles')
        .select('id, title, content, image_urls, published_at, created_at')
        .eq('id', article_id).eq('is_published', True).limit(1).execute()
    )
    article = rows[0] if rows else None
    _cache.set(cache_key, article)
    return article


def _fetch_product(product_id: str) -> Optional[dict]:
    """公開中の商品を id で読んで返す。非公開・存在しない・id の形でない場合は None。

    商品の公開 API（GET /api/products）と同じく、管理用クライアントに is_published=true の
    条件を付けて読む。読むのはメタ情報に必要な列だけにする。

    Args:
        product_id: URL の /official/shop/ の後ろの部分

    Returns:
        商品の dict（id・name・description・image_urls・created_at）。無ければ None
    """
    if not _UUID_RE.match(product_id):
        return None
    cache_key = ('product', product_id)
    found, cached = _cache.get(cache_key)
    if found:
        return cached
    rows = _rows(
        admin_supabase.table('products')
        .select('id, name, description, image_urls, created_at')
        .eq('id', product_id).eq('is_published', True).limit(1).execute()
    )
    product = rows[0] if rows else None
    _cache.set(cache_key, product)
    return product


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
    meta = _make_meta(path, None, None, None)
    meta.noindex = True
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
    """ブランド独立ドメイン用の canonical / OGP を作る。未公開パスは noindex にする。"""
    norm = '/' + path.strip('/')
    pages = {
        'Habitat Oides': {
            '/': ('Habitat Oides', '植物の生息環境を再現するハビタットスタイルの専門ライン。ワークショップも開催しています。', '/img/habitatOides/habitat_oides_hero.jpg'),
            '/workshop': ('Habitat Style Workshop', 'ハビタットスタイルのワークショップ。植物の生息環境を意識したレイアウトを自分の手で制作できます。', '/img/habitatOides/habitat_oides_workshop_main.jpg'),
            '/collaborations': ('Collaborations', 'Habitat Oides のコラボレーション作品・活動記録。', '/img/habitatOides/habitat_oides_hero.jpg'),
            '/habitatoides': ('Habitat Oides', '植物の生息環境を再現するハビタットスタイルの専門ライン。ワークショップも開催しています。', '/img/habitatOides/habitat_oides_hero.jpg'),
            '/habitatoides/workshop': ('Habitat Style Workshop', 'ハビタットスタイルのワークショップ。植物の生息環境を意識したレイアウトを自分の手で制作できます。', '/img/habitatOides/habitat_oides_workshop_main.jpg'),
        },
        'HUE by ei8ht plants': {
            '/': ('HUE by ei8ht plants', 'HUE は、色彩と形を楽しむオーナメントプランツのラインです。', '/img/logo-hue.png'),
            '/hue': ('HUE by ei8ht plants', 'HUE は、色彩と形を楽しむオーナメントプランツのラインです。', '/img/logo-hue.png'),
            '/about': ('HUEについて', '植物を、部屋に置くものとしてだけでなく、日々を一緒に過ごす存在として。HUEは葉の色やかたちに目を向け、暮らしの景色になる一鉢を紹介します。', '/img/logo-hue.png'),
            '/choose': ('一鉢の選び方', '名前や育て方を調べる前に、まずは心に留まった葉の色やかたちを見つける。HUEの一鉢選びは、そんな小さな好みから始まります。', '/img/logo-hue.png'),
            '/living': ('植物のある部屋', '植物を迎えると、目に入る景色や部屋で過ごす時間が少し変わります。飾り方に決まりはありません。好きなものと並べながら、自分の居場所をつくっていきます。', '/img/logo-hue.png'),
        },
    }
    page = pages[site_name].get(norm)
    if page is None:
        logo = 'hue' if site_name == 'HUE by ei8ht plants' else 'habitatoides'
        return PageMeta(
            title=site_name, description=DEFAULT_DESCRIPTION, image=f'{origin}/img/logo-{logo}.png',
            url=f'{origin}{quote(norm, safe="/")}', noindex=True, canonical=False, site_name=site_name,
        )
    title, description, image_path = page
    canonical_path = '/' if norm in ('/habitatoides', '/hue') else '/workshop' if norm == '/habitatoides/workshop' else norm
    return PageMeta(
        title=site_name if title == site_name else f'{title} | {site_name}', description=description, image=f'{origin}{image_path}',
        url=f'{origin}{quote(canonical_path, safe="/")}', has_own_image=True, site_name=site_name,
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
    host = hostname.lower().split(':', 1)[0]
    if host in BRAND_DOMAINS:
        return _brand_domain_meta(path, *BRAND_DOMAINS[host])

    # パスを "/a/b" の形にそろえ、旧公式ページURLは新しい場所へ寄せる。
    norm = '/' + path.strip('/')
    if norm == '/ei8htplants':
        norm = '/'
    elif norm == '/brands' or norm.startswith('/brands/'):
        norm = '/official' + norm
    elif norm == '/events' or norm.startswith('/events/'):
        norm = '/official' + norm
    elif norm == '/shop' or norm.startswith('/shop/'):
        norm = '/official' + norm
    elif norm == '/journal' or norm.startswith('/journal/'):
        norm = '/official' + norm
    elif norm == '/order' or norm.startswith('/order/'):
        norm = '/official' + norm
    elif norm in {'/gallery', '/concept', '/contact', '/stockists', '/collaborations', '/media', '/legal', '/privacy', '/chat', '/reserve', '/cancel', '/checkout'}:
        norm = '/official' + norm
    segments = [s for s in norm.split('/') if s]
    query = query or {}

    try:
        # 1. イベントの個別ページ
        if len(segments) == 3 and segments[:2] == ['official', 'events']:
            # 1. 先頭の公式サイト階層とコレクション名を除き、3番目の要素を識別子として読む。
            event = _fetch_event(segments[2])
            if event and _str(event.get('name')):
                images = event.get('image_urls') or []
                # UUID で開かれても slug があれば canonical・og:url は slug の URL にする（sitemap と同じ URL）
                slug = _str(event.get('slug'))
                canonical_path = f'/official/events/{slug}' if slug else None
                meta = _make_meta(
                    norm, _str(event.get('name')), _event_description(event),
                    images[0] if images else None, canonical_path,
                )
                ld = _event_json_ld(event, meta)
                if ld:
                    meta.json_ld.append(ld)
                return meta
            return _not_found_meta(norm)

        # 2. 記事の個別ページ（タイトルは JournalArticle.tsx と同じ "記事名 | Journal"）
        if len(segments) == 3 and segments[:2] == ['official', 'journal']:
            # 1. 先頭の公式サイト階層とコレクション名を除き、3番目の要素を識別子として読む。
            article = _fetch_article(segments[2])
            if article and _str(article.get('title')):
                blocks = _parse_blocks(article.get('content'))
                image_urls = article.get('image_urls') if isinstance(article.get('image_urls'), list) else []
                hero = _first_image_block_url(blocks) or (image_urls[0] if image_urls else None)
                title = _str(article.get('title'))
                return _make_meta(norm, f'{title} | Journal', _blocks_to_text(blocks) or title, hero)
            return _not_found_meta(norm)

        # 3. 商品の個別ページ（ShopProduct.tsx と同じく画像は image_urls の1枚目）
        if len(segments) == 3 and segments[:2] == ['official', 'shop']:
            # 1. 先頭の公式サイト階層とコレクション名を除き、3番目の要素を識別子として読む。
            product = _fetch_product(segments[2])
            if product and _str(product.get('name')):
                blocks = _parse_blocks(product.get('description'))
                image_urls = product.get('image_urls') if isinstance(product.get('image_urls'), list) else []
                name = _str(product.get('name'))
                return _make_meta(norm, f'{name} | Shop', _blocks_to_text(blocks) or name, image_urls[0] if image_urls else None)
            return _not_found_meta(norm)
    except Exception as e:
        # 例外の文字列には URL の一部（利用者の入力）が入りうるので、型名とコードだけを出す
        logger.error('build_page_meta DB 読み取りエラー（%r）: %s', norm, error_summary(e))
        return _make_meta(norm, None, None, None)

    # 4. 固定ページ
    page = STATIC_PAGES.get(norm)
    if page is not None:
        title = page.title
        if norm == '/official/events' and query.get('page') == 'past':
            title = 'Past Events'
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
    mtime = os.path.getmtime(index_path)
    with _index_lock:
        hit = _index_cache.get(index_path)
        if hit and hit[0] == mtime:
            return hit[1]
    with open(index_path, encoding='utf-8') as f:
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

    Returns:
        メタ情報入りの HTML 文字列
    """
    host = hostname.lower().split(':', 1)[0]
    page = inject_head(_read_index(index_path), build_page_meta(path, query, host))
    if host in BRAND_DOMAINS:
        # 独立前に登録されたPWAのService Workerが、古いei8ht plants画面を表示し続けないよう解除する。
        page = re.sub(r'<link\s+rel="manifest"[^>]*>', '', page, flags=re.I)
        page = re.sub(r'<script\s+id="vite-plugin-pwa:register-sw"[^>]*>\s*</script>', '', page, flags=re.I)
        cleanup_old_pwa = (
            '<script>(function(){'
            "if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations()"
            '.then(function(items){return Promise.all(items.map(function(item){return item.unregister()}))})}'
            "if('caches' in window){caches.keys().then(function(keys){return Promise.all(keys.map(function(key){return caches.delete(key)}))})}"
            '})();</script>'
        )
        page = page.replace('</head>', cleanup_old_pwa + '</head>')
        site_name = BRAND_DOMAINS[host][0]
        page = re.sub(
            r'(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*("\s*/?>)',
            lambda match: f'{match.group(1)}{html.escape(site_name, quote=True)}{match.group(2)}',
            page, flags=re.I,
        )
    return page


# ---------------------------------------------------------------------------
# robots.txt / sitemap.xml
# ---------------------------------------------------------------------------

@router.get('/robots.txt', response_class=PlainTextResponse)
def robots_txt(request: Request) -> PlainTextResponse:
    """クローラー向けの robots.txt を返す。管理画面・予約キャンセル・購入手続きは除外する（/api は除外しない）。

    Returns:
        robots.txt の本文（text/plain）
    """
    lines = ['User-agent: *', 'Allow: /']
    lines += [f'Disallow: {p}' for p in ROBOTS_DISALLOW]
    host = request.headers.get('host', '').lower().split(':', 1)[0]
    origin = BRAND_DOMAINS.get(host, ('', SITE_ORIGIN))[1]
    lines += ['', f'Sitemap: {origin}/sitemap.xml', '']
    return PlainTextResponse('\n'.join(lines))


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
    """
    host = request.headers.get('host', '').lower().split(':', 1)[0]
    site = BRAND_DOMAINS.get(host)
    site_name, origin = site if site else (None, SITE_ORIGIN)
    cache_key = ('sitemap', site_name or 'ei8htplants')
    found, xml = _cache.get(cache_key)
    if not found:
        xml, ok = _build_sitemap(site_name, origin)
        if ok:
            _cache.set(cache_key, xml)
    return Response(content=xml, media_type='application/xml')
