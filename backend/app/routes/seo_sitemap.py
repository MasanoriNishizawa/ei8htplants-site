"""sitemap.xml の URL 要素と本文を組み立てる処理。"""

from __future__ import annotations

from typing import Any, Callable, Optional


# 独立ブランドサイトごとに公開している正規ページ。
BRAND_SITEMAP_PATHS = {
    'Habitat Oides': ('/', '/workshop', '/collaborations'),
    'HUE by ei8ht plants': ('/', '/about', '/choose', '/living'),
}


def sitemap_url(
    path: str,
    lastmod: Any = None,
    origin: str = '',
    *,
    parse_date: Callable[[Any], Any],
    quote: Callable[..., str],
    escape: Callable[..., str],
) -> str:
    """sitemap の `<url>` 要素を1つ作る。日付として読める lastmod だけを含める。

    Args:
        path: ページのパス。
        lastmod: 最終更新日。読めない値は XML に含めない。
        origin: ページ URL の起点となるオリジン。
        parse_date: 呼び出し元の既存の日付変換関数。
        quote: URL パスをエスケープする関数。
        escape: XML の値をエスケープする関数。

    Returns:
        XML の `<url>` 要素。
    """
    # 変数の内容: loc: サイトマップ URL の XML 表記、parsed: 変換後の値。
    loc = escape(origin + quote(path, safe='/'), quote=True)
    parsed = parse_date(lastmod)
    if parsed:
        return f'  <url><loc>{loc}</loc><lastmod>{parsed.isoformat()}</lastmod></url>'
    return f'  <url><loc>{loc}</loc></url>'


def build_sitemap(
    site_name: Optional[str],
    origin: str,
    *,
    static_paths: tuple[str, ...],
    make_url: Callable[..., str],
    rows: Callable[[Any], list[dict]],
    as_string: Callable[[Any], str],
    public_client: Any,
    admin_client: Any,
    logger: Any,
    summarize_error: Callable[[Exception], str],
) -> tuple[str, bool]:
    """固定ページと DB の公開データから sitemap XML を作る。

    Args:
        site_name: ブランドサイト名。指定時はブランド固有の固定ページだけを返す。
        origin: URL の起点となるオリジン。
        static_paths: 公式サイトの固定ページ一覧。
        make_url: 呼び出し元の URL 要素生成関数。
        rows: Supabase の結果から行を取り出す関数。
        as_string: 値を文字列として安全に取り出す関数。
        public_client: 公開イベントを読む Supabase クライアント。
        admin_client: 公開記事・商品を読む Supabase クライアント。
        logger: 取得失敗を記録するロガー。
        summarize_error: ログ向けに例外内容を整形する関数。

    Returns:
        (XML 本文, すべての読み取りに成功したか)。
    """
    # 1. ブランドサイトは専用の固定 URL だけを XML 化して返す。
    if site_name:
        # ブランドサイトは DB の一覧を含めず、専用ドメインの固定ページだけを返す。
        paths = BRAND_SITEMAP_PATHS.get(site_name, ())
        entries = [make_url(path, origin=origin) for path in paths]
        return _urlset(entries), True

    # 2. 公式サイトの固定 URL を先に追加する。
    entries = [make_url(path, origin=origin) for path in static_paths]
    ok = True
    # 3. イベント・記事・商品の公開 URL を個別に読み、失敗した種類だけ記録する。
    try:
        # 変数の内容: events: 取得したイベントの一覧。
        events = rows(public_client.table('events').select('id, slug, start_date').order('start_date', desc=True).execute())
        # 変数の内容: event: サイトマップに追加する公開イベントのレコード。
        for event in events:
            # 変数の内容: key: 辞書やキャッシュを参照するキー。
            key = as_string(event.get('slug')) or as_string(event.get('id'))
            if key:
                entries.append(make_url(f'/official/events/{key}', origin=origin))
    # 変数の内容: exc: except で捕捉した処理例外。
    except Exception as exc:
        # 変数の内容: ok: 処理の成功可否。
        ok = False
        logger.error('sitemap イベント取得エラー: %s', summarize_error(exc))
    try:
        # 変数の内容: articles: 取得した記事の一覧。
        articles = rows(
            admin_client.table('articles').select('id, published_at, created_at').eq('is_published', True).execute()
        )
        # 変数の内容: article: サイトマップに追加する公開記事のレコード。
        for article in articles:
            if as_string(article.get('id')):
                entries.append(
                    make_url(
                        f"/official/journal/{article['id']}",
                        article.get('published_at') or article.get('created_at'),
                        origin,
                    )
                )
    # 変数の内容: exc: except で捕捉した処理例外。
    except Exception as exc:
        # 変数の内容: ok: 処理の成功可否。
        ok = False
        logger.error('sitemap 記事取得エラー: %s', summarize_error(exc))
    try:
        # 変数の内容: products: 対象商品の一覧。
        products = rows(
            admin_client.table('products').select('id, created_at').eq('is_published', True).execute()
        )
        # 変数の内容: product: サイトマップに追加する公開商品のレコード。
        for product in products:
            if as_string(product.get('id')):
                entries.append(
                    make_url(f"/official/shop/{product['id']}", product.get('created_at'), origin)
                )
    # 変数の内容: exc: except で捕捉した処理例外。
    except Exception as exc:
        # 変数の内容: ok: 処理の成功可否。
        ok = False
        logger.error('sitemap 商品取得エラー: %s', summarize_error(exc))
    # 4. 読み取れた URL を XML にし、全読み取りが成功したかも返す。
    return _urlset(entries), ok


def _urlset(entries: list[str]) -> str:
    """URL 要素の並びを既存形式の urlset 文書にする。

    Args:
        entries: サイトマップに含める URL エントリ。

    Returns:
        注釈に示した形式の応答（str）。
    """
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(entries)
        + '\n</urlset>\n'
    )
