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
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse, Response

from ..db import supabase, admin_supabase

logger = logging.getLogger(__name__)

router = APIRouter(tags=['seo'])

# ---------------------------------------------------------------------------
# サイト共通の定数（PageMeta.tsx の SITE / DEFAULT_DESC / ORIGIN / DEFAULT_OG_IMAGE と同じ値）
# ---------------------------------------------------------------------------

# サイトの URL（末尾のスラッシュなし）。canonical・og:url・画像の絶対 URL の土台にする
SITE_ORIGIN = 'https://ei8htplants.com'
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
NOINDEX_PREFIXES = ('/admin', '/cancel', '/checkout', '/order')
# robots.txt で Disallow にするパス（NOINDEX_PREFIXES と同じ）。
# /api は入れない: Googlebot は JavaScript を実行してページを描画する際に /api/... を読むため、
# /api を除外するとイベント・記事などの本文が描画できず、索引されなくなる
ROBOTS_DISALLOW = NOINDEX_PREFIXES

# UUID の形（events/articles/products の id）。UUID でない文字列で id 列を検索すると
# PostgREST がエラーを返すので、id で検索する前にこれで確かめる
_UUID_RE = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
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
    '/': StaticPage(),
    '/events': StaticPage('Events', 'ei8ht plants のイベント・出展情報。ワークショップ予約も受け付けています。'),
    '/gallery': StaticPage('Gallery', 'ei8ht plants、Habitat Oides、HUE の植物ギャラリー。'),
    '/concept': StaticPage('Concept', 'ei8ht plants のブランドコンセプト。ビザールプランツ・ハビタットスタイル・オーナメントプランツの3ラインをご紹介します。'),
    '/contact': StaticPage('Contact', 'ei8ht plants へのお問い合わせはこちらから。'),
    '/stockists': StaticPage('Stockists', 'ei8ht plants 取扱店一覧。'),
    '/collaborations': StaticPage(
        'Collaborations', 'Habitat Oides のコラボレーション作品・活動記録。',
        f'{SITE_ORIGIN}/img/habitatOides/habitat_oides_hero.jpg',
    ),
    '/media': StaticPage('Media', 'ei8ht plants のメディア出演情報をまとめています。'),
    '/ei8htplants': StaticPage(None, 'アガベ・塊根植物・灌木などビザールプランツを専門に扱うラインです。'),
    '/habitatoides': StaticPage(
        'Habitat Oides', '植物の生息環境を再現するハビタットスタイルの専門ライン。ワークショップも開催しています。',
        f'{SITE_ORIGIN}/img/habitatOides/habitat_oides_hero.jpg',
    ),
    '/habitatoides/workshop': StaticPage(
        'Habitat Style Workshop', 'ハビタットスタイルのワークショップ。植物の生息環境を意識したレイアウトを自分の手で制作できます。',
        f'{SITE_ORIGIN}/img/habitatOides/habitat_oides_workshop_main.jpg',
    ),
    '/hue': StaticPage('HUE by ei8ht plants', 'HUE は、色彩と形を楽しむオーナメントプランツのラインです。'),
    '/legal': StaticPage('特定商取引法に基づく表示', 'ei8ht plants 特定商取引法に基づく表示'),
    '/privacy': StaticPage('プライバシーポリシー', 'ei8ht plants のプライバシーポリシー（個人情報の取り扱い・アクセス解析について）'),
    '/chat': StaticPage('AI コンシェルジュ', '植物の育て方・管理のご相談や、ワークショップ・予約に関するご質問にAIがお答えします。'),
    '/reserve': StaticPage('Workshop 予約', 'Habitat Style Workshop へのご予約はこちらから。'),
    '/cancel': StaticPage('予約キャンセル', 'ワークショップ予約のキャンセルはこちらから。'),
    '/shop': StaticPage('Shop', 'ei8ht plants オンラインストア'),
    '/journal': StaticPage('Journal', '植物と暮らしにまつわるコラム'),
    '/checkout': StaticPage('ご注文手続き', 'ご注文手続き'),
    '/order/complete': StaticPage('ご注文ありがとうございます', 'ご注文を受け付けました。'),
}

# sitemap.xml に載せる固定ページ（検索結果に出してよい公開ページだけ。/reserve はイベントの指定が要るので外す）
SITEMAP_STATIC_PATHS = (
    '/', '/events', '/gallery', '/shop', '/journal', '/concept', '/contact', '/stockists',
    '/collaborations', '/media', '/ei8htplants', '/habitatoides', '/habitatoides/workshop',
    '/hue', '/chat', '/legal', '/privacy',
)


# ---------------------------------------------------------------------------
# メモリキャッシュ
# ---------------------------------------------------------------------------

class _TTLCache:
    """一定時間だけ値を覚えておく、スレッドセーフな簡易キャッシュ。

    serve_spa は同期関数でスレッドプールから同時に呼ばれるため、Lock で守る。
    「DB に無かった」ことも覚えておけるよう、値が None でも保存する。
    """

    def __init__(self, ttl: float, max_entries: int):
        # ttl: 値を覚えておく秒数 / max_entries: 保存する件数の上限
        self._ttl = ttl
        self._max = max_entries
        # キー → (期限の時刻（time.monotonic 基準）, 値)
        self._data: dict[Any, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: Any) -> tuple[bool, Any]:
        """キーの値を返す。

        Returns:
            (見つかったか, 値)。期限切れ・未登録なら (False, None)
        """
        now = time.monotonic()
        with self._lock:
            hit = self._data.get(key)
            if hit is None:
                return False, None
            expires, value = hit
            if expires < now:
                del self._data[key]
                return False, None
            return True, value

    def set(self, key: Any, value: Any) -> None:
        """キーに値を保存する。上限を超えたら期限切れを消し、それでも多ければ古い順に消す。"""
        now = time.monotonic()
        with self._lock:
            if len(self._data) >= self._max:
                # 1. 期限切れのものを消す
                for k in [k for k, (exp, _) in self._data.items() if exp < now]:
                    del self._data[k]
                # 2. まだ多ければ、期限が早いもの（＝古いもの）から消す
                if len(self._data) >= self._max:
                    for k, _ in sorted(self._data.items(), key=lambda kv: kv[1][0])[: len(self._data) - self._max + 1]:
                        del self._data[k]
            self._data[key] = (now + self._ttl, value)

    def clear(self) -> None:
        """全件を消す（テスト用）。"""
        with self._lock:
            self._data.clear()


# イベント・記事・商品・sitemap の読み取り結果のキャッシュ
_cache = _TTLCache(CACHE_TTL_SECONDS, CACHE_MAX_ENTRIES)


def clear_cache() -> None:
    """メモリキャッシュを空にする（テストで DB のモックを差し替えるときに使う）。"""
    _cache.clear()


# ---------------------------------------------------------------------------
# 小さな変換ヘルパー
# ---------------------------------------------------------------------------

def _str(value: Any) -> str:
    """文字列ならそのまま、それ以外（None・数値・dict など）は空文字を返す。"""
    return value if isinstance(value, str) else ''


def _rows(result: Any) -> list[dict]:
    """supabase の execute() の結果から行のリストを取り出す。形が違うときは空のリストを返す。"""
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
    """空白・改行を1つの空白にまとめ、max_len 文字を超える分を切って「…」を付ける。"""
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
    """見出し・本文ブロックの文字をつないで先頭 max_len 文字を返す（frontend の blocksToText と同じ）。"""
    parts = [
        _str(b.get('value')).replace('\n', ' ')
        for b in blocks
        if b.get('type') in ('text', 'heading')
    ]
    return ' '.join(parts)[:max_len]


def _first_image_block_url(blocks: list[dict]) -> Optional[str]:
    """ブロック配列の中で最初の画像ブロックの URL を返す。無ければ None。"""
    for b in blocks:
        if b.get('type') == 'image' and _str(b.get('url')):
            return _str(b.get('url'))
    return None


def _parse_date(value: Any) -> Optional[date]:
    """'YYYY-MM-DD'（後ろに時刻が付いていてもよい）を date にする。読めなければ None。"""
    s = _str(value)[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _format_date_label(start: Any, end: Any) -> str:
    """開催日を「2026年10月24日〜25日」の形にする（EventSite.tsx の formatDate と同じ）。"""
    s = _parse_date(start)
    if s is None:
        return ''
    e = _parse_date(end)

    def fmt(d: date) -> str:
        return f'{d.year}年{d.month}月{d.day}日'

    if e is None or e == s:
        return fmt(s)
    if s.year == e.year and s.month == e.month:
        return f'{fmt(s)}〜{e.day}日'
    return f'{fmt(s)}〜{fmt(e)}'


def _times_in(text: str) -> list[str]:
    """文字列に含まれる時刻を "HH:MM" の形で順に返す（例 "10:00〜17:00" → ["10:00", "17:00"]）。"""
    result = []
    for h, m in _TIME_RE.findall(text):
        if int(h) < 24 and int(m) < 60:
            result.append(f'{int(h):02d}:{m}')
    return result


def _event_datetime(day: date, hhmm: Optional[str]) -> str:
    """構造化データ用の日付（時刻が分かれば日本時間の日時）を返す。"""
    if hhmm:
        return f'{day.isoformat()}T{hhmm}:00+09:00'
    return day.isoformat()


def _json_for_script(data: Any) -> str:
    """<script> の中に安全に埋め込める JSON 文字列を返す。

    "</script>" や "<!--" で script が閉じられないよう、< > & と
    JavaScript で改行扱いになる U+2028 / U+2029 を \\uXXXX の形に置き換える。
    """
    s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    return (
        s.replace('<', '\\u003c')
        .replace('>', '\\u003e')
        .replace('&', '\\u0026')
        .replace(' ', '\\u2028')
        .replace(' ', '\\u2029')
    )


def _is_noindex(path: str) -> bool:
    """検索結果に出さないページ（/admin・/cancel・/checkout・/order 以下）かどうかを返す。"""
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


def _full_title(title: Optional[str]) -> str:
    """ページ名から <title> の文字列を作る（PageMeta.tsx と同じく "ページ名 | ei8ht plants"）。"""
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
    """
    meta = _make_meta(path, None, None, None)
    meta.noindex = True
    meta.canonical = False
    return meta


def _event_description(event: dict) -> str:
    """イベントの説明文を作る。

    page_content の hero.tagline・hero.subtitle・concept をつないだもの。どれも無ければ
    「開催日 / 会場」（EventSite.tsx の PageMeta と同じ形）にする。DESCRIPTION_MAX_LEN 字で切る。
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
    """トップページに入れる schema.org Organization を返す。"""
    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        'name': SITE_NAME,
        'url': SITE_ORIGIN + '/',
        'logo': LOGO_URL,
    }


def build_page_meta(path: str, query: Optional[dict] = None) -> PageMeta:
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
    # パスを "/a/b" の形にそろえる（末尾のスラッシュは外す）
    norm = '/' + path.strip('/')
    segments = [s for s in norm.split('/') if s]
    query = query or {}

    try:
        # 1. イベントの個別ページ
        if len(segments) == 2 and segments[0] == 'events':
            event = _fetch_event(segments[1])
            if event and _str(event.get('name')):
                images = event.get('image_urls') or []
                # UUID で開かれても slug があれば canonical・og:url は slug の URL にする（sitemap と同じ URL）
                slug = _str(event.get('slug'))
                canonical_path = f'/events/{slug}' if slug else None
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
        if len(segments) == 2 and segments[0] == 'journal':
            article = _fetch_article(segments[1])
            if article and _str(article.get('title')):
                blocks = _parse_blocks(article.get('content'))
                image_urls = article.get('image_urls') if isinstance(article.get('image_urls'), list) else []
                hero = _first_image_block_url(blocks) or (image_urls[0] if image_urls else None)
                title = _str(article.get('title'))
                return _make_meta(norm, f'{title} | Journal', _blocks_to_text(blocks) or title, hero)
            return _not_found_meta(norm)

        # 3. 商品の個別ページ（ShopProduct.tsx と同じく画像は image_urls の1枚目）
        if len(segments) == 2 and segments[0] == 'shop':
            product = _fetch_product(segments[1])
            if product and _str(product.get('name')):
                blocks = _parse_blocks(product.get('description'))
                image_urls = product.get('image_urls') if isinstance(product.get('image_urls'), list) else []
                name = _str(product.get('name'))
                return _make_meta(norm, f'{name} | Shop', _blocks_to_text(blocks) or name, image_urls[0] if image_urls else None)
            return _not_found_meta(norm)
    except Exception as e:
        logger.error('build_page_meta DB 読み取りエラー（%s）: %s', norm, e)
        return _make_meta(norm, None, None, None)

    # 4. 固定ページ
    page = STATIC_PAGES.get(norm)
    if page is not None:
        title = page.title
        if norm == '/events' and query.get('page') == 'past':
            title = 'Past Events'
        meta = _make_meta(norm, title, page.description, page.image)
        if norm == '/':
            meta.json_ld.append(_organization_json_ld())
        return meta

    # 5. それ以外（/admin 以下・不明なパス）は既定値に noindex を付け、canonical は付けない
    return _not_found_meta(norm)


# ---------------------------------------------------------------------------
# index.html への埋め込み
# ---------------------------------------------------------------------------

def render_head_tags(meta: PageMeta) -> str:
    """PageMeta から <head> に入れるタグの文字列を作る。値はすべて HTML エスケープする。"""
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
        f'<meta property="og:site_name" content="{e(SITE_NAME)}" />',
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
    """index.html の <title> をメタ情報のタグに置き換える。<title> が無ければ </head> の前に入れる。"""
    tags = render_head_tags(meta)
    # 置き換え文字列に "\" が含まれても正規表現の参照として解釈されないよう、関数で渡す
    replaced, count = re.subn(r'<title>.*?</title>', lambda _m: tags, index_html, count=1, flags=re.S | re.I)
    if count:
        return replaced
    return index_html.replace('</head>', tags + '\n  </head>', 1)


# index.html の中身と更新時刻（デプロイで差し替わったら読み直す）
_index_cache: dict[str, tuple[float, str]] = {}
_index_lock = threading.Lock()


def _read_index(index_path: str) -> str:
    """index.html を読む。更新時刻が変わっていなければ前回読んだ中身を使う。"""
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


def render_spa_index(index_path: str, path: str, query: Optional[dict] = None) -> str:
    """SPA の index.html に、パスに応じたメタ情報を入れた HTML を返す。

    Args:
        index_path: frontend/dist/index.html のパス
        path: リクエストのパス
        query: クエリ文字列の dict

    Returns:
        メタ情報入りの HTML 文字列
    """
    return inject_head(_read_index(index_path), build_page_meta(path, query))


# ---------------------------------------------------------------------------
# robots.txt / sitemap.xml
# ---------------------------------------------------------------------------

@router.get('/robots.txt', response_class=PlainTextResponse)
def robots_txt():
    """クローラー向けの robots.txt を返す。管理画面・予約キャンセル・購入手続きは除外する（/api は除外しない）。"""
    lines = ['User-agent: *', 'Allow: /']
    lines += [f'Disallow: {p}' for p in ROBOTS_DISALLOW]
    lines += ['', f'Sitemap: {SITE_ORIGIN}/sitemap.xml', '']
    return PlainTextResponse('\n'.join(lines))


def _sitemap_url(path: str, lastmod: Any = None) -> str:
    """sitemap の <url> 要素を1つ作る。lastmod は日付として読めるときだけ入れる。"""
    loc = html.escape(SITE_ORIGIN + quote(path, safe='/'), quote=True)
    d = _parse_date(lastmod)
    if d:
        return f'  <url><loc>{loc}</loc><lastmod>{d.isoformat()}</lastmod></url>'
    return f'  <url><loc>{loc}</loc></url>'


def _build_sitemap() -> tuple[str, bool]:
    """sitemap.xml の中身を作る。

    1. 固定ページ（SITEMAP_STATIC_PATHS）
    2. イベント（slug があれば slug の URL、無ければ id の URL）
    3. 公開済みの記事（lastmod は published_at、無ければ created_at）
    4. 公開中の商品（lastmod は created_at）
    どこかの読み取りに失敗しても、読めた分だけで返す。

    Returns:
        (XML の文字列, 全部読めたか)
    """
    entries = [_sitemap_url(p) for p in SITEMAP_STATIC_PATHS]
    ok = True
    try:
        events = _rows(supabase.table('events').select('id, slug, start_date').order('start_date', desc=True).execute())
        for ev in events:
            key = _str(ev.get('slug')) or _str(ev.get('id'))
            if key:
                entries.append(_sitemap_url(f'/events/{key}'))
    except Exception as e:
        ok = False
        logger.error('sitemap イベント取得エラー: %s', e)
    try:
        articles = _rows(
            admin_supabase.table('articles').select('id, published_at, created_at').eq('is_published', True).execute()
        )
        for a in articles:
            if _str(a.get('id')):
                entries.append(_sitemap_url(f"/journal/{a['id']}", a.get('published_at') or a.get('created_at')))
    except Exception as e:
        ok = False
        logger.error('sitemap 記事取得エラー: %s', e)
    try:
        products = _rows(
            admin_supabase.table('products').select('id, created_at').eq('is_published', True).execute()
        )
        for p in products:
            if _str(p.get('id')):
                entries.append(_sitemap_url(f"/shop/{p['id']}", p.get('created_at')))
    except Exception as e:
        ok = False
        logger.error('sitemap 商品取得エラー: %s', e)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(entries)
        + '\n</urlset>\n'
    )
    return xml, ok


@router.get('/sitemap.xml')
def sitemap_xml():
    """公開ページ・イベント・公開済みの記事・公開中の商品の URL 一覧（sitemap.xml）を返す。

    作った XML は CACHE_TTL_SECONDS 秒メモリに残す。読み取りに失敗した部分があるときは
    次のリクエストで作り直せるよう、キャッシュしない。
    """
    found, xml = _cache.get(('sitemap',))
    if not found:
        xml, ok = _build_sitemap()
        if ok:
            _cache.set(('sitemap',), xml)
    return Response(content=xml, media_type='application/xml')
