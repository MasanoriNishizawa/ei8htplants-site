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
# og:locale の値
OG_LOCALE = 'ja_JP'

# DB の読み取り結果をメモリに残しておく秒数（クローラーが連続で来ても DB を叩きすぎないため）
CACHE_TTL_SECONDS = 60
# メモリキャッシュに残す件数の上限（存在しない ID を大量に叩かれてもメモリが増え続けないようにする）
CACHE_MAX_ENTRIES = 500
# イベント・記事・商品の説明文の最大文字数（PageMeta 側の blocksToText の既定値 120 と同じ）
DESCRIPTION_MAX_LEN = 120
# イベントの構造化データに入れる画像の最大枚数
EVENT_JSONLD_MAX_IMAGES = 5

# 検索結果に出さないページ（パスの先頭がこれと一致するもの）。noindex を入れ、robots.txt でも Disallow にする
NOINDEX_PREFIXES = ('/admin', '/cancel', '/checkout', '/order', '/official/cancel', '/official/checkout', '/official/order')
# robots.txt で Disallow にするパス（NOINDEX_PREFIXES と同じ）。
# /api は入れない: Googlebot は JavaScript を実行してページを描画する際に /api/... を読むため、
# /api を除外するとイベント・記事などの本文が描画できず、索引されなくなる
ROBOTS_DISALLOW = NOINDEX_PREFIXES

# UUID の形（events/articles/products の id）。共通の部品（app/utils/ids.py）のものを使う
_UUID_RE = UUID_RE
# 時刻（"10:00" など）を取り出す正規表現。event.time / daily_times の値（例 "10:00〜17:00"）から使う
_TIME_RE = re.compile(r'(\d{1,2}):(\d{2})')


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

# sitemap.xml に載せる固定ページ（検索結果に出してよい公開ページだけ。/reserve はイベントの指定が要るので外す）
SITEMAP_STATIC_PATHS = (
    '/', '/about', '/plants', '/habitatoides', '/habitatoides/workshop', '/hue', '/official', '/official/brands',
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

def _str(value: Any) -> str:
    """文字列ならそのまま、それ以外（None・数値・dict など）は空文字を返す。

    Args:
        value: DB から読んだ値（型は決まっていない）

    Returns:
        value が文字列ならそのまま、それ以外は ''
    """
    return value if isinstance(value, str) else ''


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


def _truncate(text: str, max_len: int = DESCRIPTION_MAX_LEN) -> str:
    """空白・改行を1つの空白にまとめ、max_len 文字を超える分を切って「…」を付ける。

    Args:
        text: 切り詰める文字列
        max_len: 「…」を含めた最大の文字数（既定は DESCRIPTION_MAX_LEN）

    Returns:
        max_len 文字以内の文字列
    """
    t = re.sub(r'\s+', ' ', text).strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + '…'


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
    """'YYYY-MM-DD'（後ろに時刻が付いていてもよい）を date にする。

    Args:
        value: 日付の文字列（start_date・published_at など。文字列でなければ読めない扱い）

    Returns:
        date。読めなければ None
    """
    s = _str(value)[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _format_date_label(start: Any, end: Any) -> str:
    """開催日を「2026年10月24日〜25日」の形にする（EventSite.tsx の formatDate と同じ）。

    Args:
        start: 開始日（'YYYY-MM-DD'）
        end: 終了日（'YYYY-MM-DD'。None や開始日と同じなら 1 日だけの表記）

    Returns:
        開催日の文字列。開始日が読めなければ ''
    """
    s = _parse_date(start)
    if s is None:
        return ''
    e = _parse_date(end)

    def fmt(d: date) -> str:
        """日付を「2026年10月24日」の形にする。

        Args:
            d: 日付

        Returns:
            「YYYY年M月D日」の文字列
        """
        return f'{d.year}年{d.month}月{d.day}日'

    if e is None or e == s:
        return fmt(s)
    if s.year == e.year and s.month == e.month:
        return f'{fmt(s)}〜{e.day}日'
    return f'{fmt(s)}〜{fmt(e)}'


def _times_in(text: str) -> list[str]:
    """文字列に含まれる時刻を "HH:MM" の形で順に返す（例 "10:00〜17:00" → ["10:00", "17:00"]）。

    Args:
        text: 時刻を含む文字列（event.time・daily_times の値）

    Returns:
        "HH:MM" のリスト（24 時・60 分以上のような時刻として読めないものは除く）
    """
    result = []
    for h, m in _TIME_RE.findall(text):
        if int(h) < 24 and int(m) < 60:
            result.append(f'{int(h):02d}:{m}')
    return result


def _event_datetime(day: date, hhmm: Optional[str]) -> str:
    """構造化データ用の日付（時刻が分かれば日本時間の日時）を返す。

    Args:
        day: 日付
        hhmm: 時刻（"HH:MM"）。None なら日付だけにする

    Returns:
        'YYYY-MM-DDTHH:MM:00+09:00' または 'YYYY-MM-DD'
    """
    if hhmm:
        return f'{day.isoformat()}T{hhmm}:00+09:00'
    return day.isoformat()


def _json_for_script(data: Any) -> str:
    """<script> の中に安全に埋め込める JSON 文字列を返す。

    "</script>" や "<!--" で script が閉じられないよう、< > & と
    JavaScript で改行扱いになる U+2028 / U+2029 を \\uXXXX の形に置き換える。

    Args:
        data: JSON にする値（構造化データの dict など）

    Returns:
        エスケープ済みの JSON 文字列
    """
    s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    return (
        s.replace('<', '\\u003c')
        .replace('>', '\\u003e')
        .replace('&', '\\u0026')
        .replace('\u2028', '\\u2028')
        .replace('\u2029', '\\u2029')
    )


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
        key: URL の /events/ の後ろの部分（slug または UUID）

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
        article_id: URL の /journal/ の後ろの部分

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
        product_id: URL の /shop/ の後ろの部分

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
    """イベントの説明文を作る。

    page_content の hero.tagline・hero.subtitle・concept をつないだもの。どれも無ければ
    「開催日 / 会場」（EventSite.tsx の PageMeta と同じ形）にする。DESCRIPTION_MAX_LEN 字で切る。

    Args:
        event: _fetch_event() が返すイベントの dict

    Returns:
        説明文。材料が何も無ければ DEFAULT_DESCRIPTION
    """
    pc = event.get('page_content') if isinstance(event.get('page_content'), dict) else {}
    hero = pc.get('hero') if isinstance(pc.get('hero'), dict) else {}
    parts = [_str(hero.get('tagline')), _str(hero.get('subtitle')), _str(pc.get('concept'))]
    text = ' '.join(p.strip() for p in parts if p.strip())
    if not text:
        date_label = _format_date_label(event.get('start_date'), event.get('end_date'))
        text = ' / '.join(p for p in (date_label, _str(event.get('location'))) if p)
    return _truncate(text) if text else DEFAULT_DESCRIPTION


def _event_json_ld(event: dict, meta: PageMeta) -> Optional[dict]:
    """イベントの schema.org Event（Google 検索のイベント情報）を作る。

    開始時刻は daily_times の開始日の値か event.time の最初の時刻、終了時刻は
    daily_times の終了日の値か event.time の2つ目の時刻から取る。

    Args:
        event: _fetch_event() が返すイベントの dict（image_urls 付き）
        meta: このページの PageMeta（description・url を使う）

    Returns:
        Event の dict。開始日が読めない、または住所が無いときは None
    """
    start = _parse_date(event.get('start_date'))
    if start is None:
        return None
    end = _parse_date(event.get('end_date')) or start
    daily = event.get('daily_times') if isinstance(event.get('daily_times'), dict) else {}
    # 1. 開始日・終了日それぞれの時間帯の文字列（例 "10:00〜17:00"）を決める
    start_text = _str(daily.get(start.isoformat())) or _str(event.get('time'))
    end_text = _str(daily.get(end.isoformat())) or _str(event.get('time'))
    start_times = _times_in(start_text)
    end_times = _times_in(end_text)
    # 2. startDate と endDate の形をそろえる。開始時刻と終了時刻の両方が分かるときだけ
    #    両方を日時にし、どちらかが分からなければ両方とも日付だけにする
    #    （片方だけ日時だと、終了が開始より前と解釈されるなど食い違うことがあるため）
    start_hhmm: Optional[str] = start_times[0] if start_times else None
    end_hhmm: Optional[str] = end_times[1] if len(end_times) >= 2 else None
    if not (start_hhmm and end_hhmm):
        start_hhmm = end_hhmm = None
    # 3. 会場（Place）を作る。住所は events.address、無ければ page_content.venue.address。
    #    住所が無いと Google の必須項目（location.address）を満たせないので、Event 自体を出さない
    pc = event.get('page_content') if isinstance(event.get('page_content'), dict) else {}
    venue = pc.get('venue') if isinstance(pc.get('venue'), dict) else {}
    address = _str(event.get('address')).strip() or _str(venue.get('address')).strip()
    if not address:
        return None
    location: dict[str, Any] = {
        '@type': 'Place',
        'name': _str(event.get('location')) or SITE_NAME,
        'address': {'@type': 'PostalAddress', 'streetAddress': address, 'addressCountry': 'JP'},
    }
    # 4. 全体をまとめる
    images = (event.get('image_urls') or [])[:EVENT_JSONLD_MAX_IMAGES] or [DEFAULT_OG_IMAGE]
    return {
        '@context': 'https://schema.org',
        '@type': 'Event',
        'name': _str(event.get('name')),
        'startDate': _event_datetime(start, start_hhmm),
        'endDate': _event_datetime(end, end_hhmm),
        'eventStatus': 'https://schema.org/EventScheduled',
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'location': location,
        'image': images,
        'description': meta.description,
        'url': meta.url,
        'organizer': {'@type': 'Organization', 'name': SITE_NAME, 'url': SITE_ORIGIN},
    }


def _organization_json_ld() -> dict:
    """トップページに入れる schema.org Organization を返す。

    Returns:
        Organization の dict
    """
    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        'name': SITE_NAME,
        'url': SITE_ORIGIN + '/',
        'logo': LOGO_URL,
    }


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

    1. /events/{slug または id}: イベント名・説明・画像・構造化データ
    2. /journal/{id}: 公開済みの記事のタイトル・本文の冒頭・アイキャッチ画像
    3. /shop/{id}: 公開中の商品の名前・説明・画像
    4. 固定ページ: STATIC_PAGES の値（トップは Organization の構造化データも）
    5. それ以外・見つからない・非公開: サイトの既定値に noindex を付け、canonical は付けない（ソフト 404 対策）
    DB の読み取りに失敗したときは既定値で返す（一時的な失敗なので noindex は付けない。SPA の表示は止めない）。

    Args:
        path: リクエストのパス（"/events/foo" など。先頭のスラッシュは無くてもよい）
        query: クエリ文字列（/events?page=past で "Past Events" にするために使う）

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
            event = _fetch_event(segments[1])
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
            article = _fetch_article(segments[1])
            if article and _str(article.get('title')):
                blocks = _parse_blocks(article.get('content'))
                image_urls = article.get('image_urls') if isinstance(article.get('image_urls'), list) else []
                hero = _first_image_block_url(blocks) or (image_urls[0] if image_urls else None)
                title = _str(article.get('title'))
                return _make_meta(norm, f'{title} | Journal', _blocks_to_text(blocks) or title, hero)
            return _not_found_meta(norm)

        # 3. 商品の個別ページ（ShopProduct.tsx と同じく画像は image_urls の1枚目）
        if len(segments) == 3 and segments[:2] == ['official', 'shop']:
            product = _fetch_product(segments[1])
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
# index.html への埋め込み
# ---------------------------------------------------------------------------

def render_head_tags(meta: PageMeta) -> str:
    """PageMeta から <head> に入れるタグの文字列を作る。値はすべて HTML エスケープする。

    Args:
        meta: build_page_meta() が返すメタ情報

    Returns:
        title・meta・link・構造化データの script タグを改行でつないだ文字列
    """
    e = lambda v: html.escape(v, quote=True)  # noqa: E731 属性値・本文のエスケープ（& < > " ' を実体参照にする）
    card = 'summary_large_image' if meta.has_own_image else 'summary'
    tags = [
        f'<title>{e(meta.title)}</title>',
        f'<meta name="description" content="{e(meta.description)}" />',
    ]
    if meta.canonical:
        tags.append(f'<link rel="canonical" href="{e(meta.url)}" />')
    if meta.noindex:
        tags.append('<meta name="robots" content="noindex" />')
    tags += [
        '<meta property="og:type" content="website" />',
        f'<meta property="og:title" content="{e(meta.title)}" />',
        f'<meta property="og:description" content="{e(meta.description)}" />',
        f'<meta property="og:image" content="{e(meta.image)}" />',
        f'<meta property="og:url" content="{e(meta.url)}" />',
        f'<meta property="og:site_name" content="{e(meta.site_name)}" />',
        f'<meta property="og:locale" content="{OG_LOCALE}" />',
        f'<meta name="twitter:card" content="{card}" />',
        f'<meta name="twitter:title" content="{e(meta.title)}" />',
        f'<meta name="twitter:description" content="{e(meta.description)}" />',
        f'<meta name="twitter:image" content="{e(meta.image)}" />',
    ]
    for ld in meta.json_ld:
        tags.append(f'<script type="application/ld+json">{_json_for_script(ld)}</script>')
    return '\n    '.join(tags)


def inject_head(index_html: str, meta: PageMeta) -> str:
    """index.html の <title> をメタ情報のタグに置き換える。<title> が無ければ </head> の前に入れる。

    Args:
        index_html: index.html の中身
        meta: 入れるメタ情報

    Returns:
        メタ情報のタグを入れた HTML 文字列
    """
    tags = render_head_tags(meta)
    # 置き換え文字列に "\" が含まれても正規表現の参照として解釈されないよう、関数で渡す
    replaced, count = re.subn(r'<title>.*?</title>', lambda _m: tags, index_html, count=1, flags=re.S | re.I)
    if count:
        return replaced
    return index_html.replace('</head>', tags + '\n  </head>', 1)


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
        path: ページのパス（"/events/foo" など）
        lastmod: 最終更新日（'YYYY-MM-DD...'）。読めなければ入れない

    Returns:
        <url> 要素の文字列
    """
    loc = html.escape(origin + quote(path, safe='/'), quote=True)
    d = _parse_date(lastmod)
    if d:
        return f'  <url><loc>{loc}</loc><lastmod>{d.isoformat()}</lastmod></url>'
    return f'  <url><loc>{loc}</loc></url>'


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
    if site_name:
        paths = ('/', '/workshop', '/collaborations') if site_name == 'Habitat Oides' else ('/',)
        entries = [_sitemap_url(p, origin=origin) for p in paths]
        return ('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + '\n'.join(entries) + '\n</urlset>\n'), True

    entries = [_sitemap_url(p, origin=origin) for p in SITEMAP_STATIC_PATHS]
    ok = True
    try:
        events = _rows(supabase.table('events').select('id, slug, start_date').order('start_date', desc=True).execute())
        for ev in events:
            key = _str(ev.get('slug')) or _str(ev.get('id'))
            if key:
                entries.append(_sitemap_url(f'/official/events/{key}', origin=origin))
    except Exception as e:
        ok = False
        logger.error('sitemap イベント取得エラー: %s', error_summary(e))
    try:
        articles = _rows(
            admin_supabase.table('articles').select('id, published_at, created_at').eq('is_published', True).execute()
        )
        for a in articles:
            if _str(a.get('id')):
                entries.append(_sitemap_url(f"/official/journal/{a['id']}", a.get('published_at') or a.get('created_at'), origin))
    except Exception as e:
        ok = False
        logger.error('sitemap 記事取得エラー: %s', error_summary(e))
    try:
        products = _rows(
            admin_supabase.table('products').select('id, created_at').eq('is_published', True).execute()
        )
        for p in products:
            if _str(p.get('id')):
                entries.append(_sitemap_url(f"/official/shop/{p['id']}", p.get('created_at'), origin))
    except Exception as e:
        ok = False
        logger.error('sitemap 商品取得エラー: %s', error_summary(e))
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(entries)
        + '\n</urlset>\n'
    )
    return xml, ok


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
