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
    if site_name:
        # ブランドサイトは DB の一覧を含めず、専用ドメインの固定ページだけを返す。
        paths = BRAND_SITEMAP_PATHS.get(site_name, ())
        entries = [make_url(path, origin=origin) for path in paths]
        return _urlset(entries), True

    entries = [make_url(path, origin=origin) for path in static_paths]
    ok = True
    try:
        events = rows(public_client.table('events').select('id, slug, start_date').order('start_date', desc=True).execute())
        for event in events:
            key = as_string(event.get('slug')) or as_string(event.get('id'))
            if key:
                entries.append(make_url(f'/official/events/{key}', origin=origin))
    except Exception as exc:
        ok = False
        logger.error('sitemap イベント取得エラー: %s', summarize_error(exc))
    try:
        articles = rows(
            admin_client.table('articles').select('id, published_at, created_at').eq('is_published', True).execute()
        )
        for article in articles:
            if as_string(article.get('id')):
                entries.append(
                    make_url(
                        f"/official/journal/{article['id']}",
                        article.get('published_at') or article.get('created_at'),
                        origin,
                    )
                )
    except Exception as exc:
        ok = False
        logger.error('sitemap 記事取得エラー: %s', summarize_error(exc))
    try:
        products = rows(
            admin_client.table('products').select('id, created_at').eq('is_published', True).execute()
        )
        for product in products:
            if as_string(product.get('id')):
                entries.append(
                    make_url(f"/official/shop/{product['id']}", product.get('created_at'), origin)
                )
    except Exception as exc:
        ok = False
        logger.error('sitemap 商品取得エラー: %s', summarize_error(exc))
    return _urlset(entries), ok


def _urlset(entries: list[str]) -> str:
    """URL 要素の並びを既存形式の urlset 文書にする。"""
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(entries)
        + '\n</urlset>\n'
    )
