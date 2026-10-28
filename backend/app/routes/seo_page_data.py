"""SEO 用のイベント・記事・商品の読み取り処理。

このモジュールは DB クライアント、キャッシュ、行変換、画像 URL 変換、UUID 判定を
依存オブジェクトから受け取り、SEO メタ情報に必要な公開データだけを取得する。
"""
from dataclasses import dataclass
from typing import Any, Optional, Pattern


# イベントのメタ情報に使う列。管理情報 admin_info は読み取らない。
_EVENT_COLUMNS = 'id, slug, name, start_date, end_date, time, location, address, page_content, daily_times'


@dataclass(frozen=True)
class SeoDataDeps:
    """SEO データ取得関数が使う外部依存をまとめる不変オブジェクト。

    Attributes:
        cache: ``get(key) -> (found, value)`` と ``set(key, value)`` を持つ TTL キャッシュ。
        public_db: 公開イベントとイベント画像を読む Supabase クライアント。
        admin_db: 公開済み記事・商品を読む Supabase クライアント。
        rows: execute() の応答から辞書行一覧を取り出す関数。
        absolute_url: 外部公開できる画像 URL を絶対 URL に変換する関数。
        uuid_pattern: 記事・商品 ID とイベント ID の形式を検証する正規表現。
    """

    # キャッシュの値と未登録を区別する TTL キャッシュ。
    cache: Any
    # anon 権限でイベント情報と画像情報を読む DB クライアント。
    public_db: Any
    # 管理用権限で公開済みの記事・商品を読む DB クライアント。
    admin_db: Any
    # Supabase 応答を辞書行の一覧にする変換関数。
    rows: Any
    # ブラウザー内限定 URL を除外し、公開用の絶対 URL にする変換関数。
    absolute_url: Any
    # ID が UUID 形式かどうかを判定する正規表現。
    uuid_pattern: Pattern[str]


def fetch_event(key: str, deps: SeoDataDeps) -> Optional[dict]:
    """イベントを slug、必要なら UUID の id で取得し、公開画像 URL を付けて返す。

    Args:
        key: URL のイベント識別子。slug または UUID。
        deps: DB・キャッシュ・変換関数をまとめた依存オブジェクト。

    Returns:
        画像 URL 一覧を ``image_urls`` に持つイベント行。未登録なら None。
    """
    # 1. slug/id ごとの結果をキャッシュから探し、None の負キャッシュも尊重する。
    # 変数の内容: cache_key: イベント取得結果のキャッシュキー、found/cached: 保存済み結果の有無と値。
    cache_key = ('event', key)
    found, cached = deps.cache.get(cache_key)
    if found:
        return cached

    # 2. 公開 DB を slug で検索し、slug が無く UUID 形式なら id でも検索する。
    # 変数の内容: rows: slug または UUID で取得したイベント行。
    rows = deps.rows(
        deps.public_db.table('events').select(_EVENT_COLUMNS).eq('slug', key).limit(1).execute()
    )
    if not rows and deps.uuid_pattern.match(key):
        rows = deps.rows(
            deps.public_db.table('events').select(_EVENT_COLUMNS).eq('id', key).limit(1).execute()
        )

    # 3. イベントがあれば表示順に画像を読み、公開可能な絶対 URL だけを設定する。
    # 変数の内容: event: 取得したイベント行、image_rows: 表示順で読んだイベント画像行。
    event = rows[0] if rows else None
    if event is not None:
        image_rows = deps.rows(
            deps.public_db.table('event_images')
            .select('url').eq('event_id', event.get('id')).order('display_order').execute()
        )
        event['image_urls'] = [
            url for url in (deps.absolute_url(image.get('url')) for image in image_rows) if url
        ]

    # 4. 取得結果または未登録の None を保存し、後続リクエストの DB 読み取りを抑える。
    deps.cache.set(cache_key, event)
    return event


def fetch_article(article_id: str, deps: SeoDataDeps) -> Optional[dict]:
    """UUID 形式の ID で公開済みの記事だけを取得する。

    Args:
        article_id: URL の記事 ID。
        deps: DB・キャッシュ・ID 判定をまとめた依存オブジェクト。

    Returns:
        メタ情報用の公開記事行。ID 不正・未登録・非公開なら None。
    """
    # 1. ID 形式を先に検証し、不正値は DB に送らない。
    if not deps.uuid_pattern.match(article_id):
        return None

    # 2. 正しい ID はキャッシュを確認し、None の負キャッシュも利用する。
    # 変数の内容: cache_key: 記事取得結果のキャッシュキー、found/cached: 保存済み結果の有無と値。
    cache_key = ('article', article_id)
    found, cached = deps.cache.get(cache_key)
    if found:
        return cached

    # 3. メタ情報に必要な列だけ管理 DB から読み、公開済み条件を必ず付ける。
    # 変数の内容: rows: 公開済み条件で取得した記事行。
    rows = deps.rows(
        deps.admin_db.table('articles')
        .select('id, title, content, image_urls, published_at, created_at')
        .eq('id', article_id).eq('is_published', True).limit(1).execute()
    )
    # 変数の内容: article: 取得した公開記事行。未登録または非公開なら None。
    article = rows[0] if rows else None

    # 4. 見つかった行または None を保存し、同じ ID の再問い合わせを防ぐ。
    deps.cache.set(cache_key, article)
    return article


def fetch_product(product_id: str, deps: SeoDataDeps) -> Optional[dict]:
    """UUID 形式の ID で公開中の商品だけを取得する。

    Args:
        product_id: URL の商品 ID。
        deps: DB・キャッシュ・ID 判定をまとめた依存オブジェクト。

    Returns:
        メタ情報用の公開商品行。ID 不正・未登録・非公開なら None。
    """
    # 1. ID 形式を先に検証し、不正値は DB に送らない。
    if not deps.uuid_pattern.match(product_id):
        return None

    # 2. 正しい ID はキャッシュを確認し、None の負キャッシュも利用する。
    # 変数の内容: cache_key: 商品取得結果のキャッシュキー、found/cached: 保存済み結果の有無と値。
    cache_key = ('product', product_id)
    found, cached = deps.cache.get(cache_key)
    if found:
        return cached

    # 3. メタ情報に必要な列だけ管理 DB から読み、公開済み条件を必ず付ける。
    # 変数の内容: rows: 公開済み条件で取得した商品行。
    rows = deps.rows(
        deps.admin_db.table('products')
        .select('id, name, description, image_urls, created_at')
        .eq('id', product_id).eq('is_published', True).limit(1).execute()
    )
    # 変数の内容: product: 取得した公開商品行。未登録または非公開なら None。
    product = rows[0] if rows else None

    # 4. 見つかった行または None を保存し、同じ ID の再問い合わせを防ぐ。
    deps.cache.set(cache_key, product)
    return product
