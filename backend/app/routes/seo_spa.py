"""SPA の HTML にページ別のメタ情報を適用するオーケストレーション。"""
from typing import Any, Callable, Mapping, Optional


def render_spa_html(
    index_html: str,
    path: str,
    query: Optional[dict],
    hostname: str,
    build_page_meta: Callable[[str, Optional[dict], str], Any],
    inject_head: Callable[[str, Any], str],
    brand_domains: Mapping[str, tuple],
    cleanup_brand_pwa_html: Callable[[str, str], str],
) -> str:
    """SPA の HTML にページ別メタ情報を適用し、ブランド用 PWA 設定を整える。

    この関数は HTML の読み込みや DB・キャッシュへのアクセスを行わず、受け取った
    関数と値だけを使って SEO 情報の生成・挿入・ブランド別の後処理を順に行う。

    Args:
        index_html: メタ情報を挿入する SPA の index.html。
        path: リクエストされたページのパス。
        query: ページメタ情報の構築に渡すクエリ文字列の辞書。指定が無い場合は None。
        hostname: リクエスト元のホスト名。ポート番号や大文字を含む場合がある。
        build_page_meta: パス・クエリ・正規化済みホスト名からメタ情報を構築する関数。
        inject_head: HTML とメタ情報を受け取り、head にメタ情報を挿入する関数。
        brand_domains: ホスト名からブランド表示名などの設定値を引く対応表。
        cleanup_brand_pwa_html: HTML とブランド表示名を受け取り、PWA 設定を整える関数。

    Returns:
        ページメタ情報と必要なブランド別 PWA 後処理を適用した HTML 文字列。
    """
    # 1. ホスト名を小文字にし、先頭のポート番号を取り除いてメタ情報を構築する。
    # 変数の内容: host: ブランドドメイン判定とページメタ構築に使う正規化済みホスト名。
    host = hostname.lower().split(':', 1)[0]
    # 変数の内容: meta: リクエスト情報を使って構築したページ固有の SEO メタ情報。
    meta = build_page_meta(path, query, host)

    # 2. ページ固有のメタ情報を index.html の head に挿入する。
    # 変数の内容: page: head へのメタ情報挿入後、必要に応じて後処理する HTML。
    page = inject_head(index_html, meta)

    # 3. 独立ブランドドメインだけ、ブランド名を渡して古い PWA 設定を整える。
    if host in brand_domains:
        # 変数の内容: site_name: 対応するブランド設定の先頭にある表示名。
        site_name = brand_domains[host][0]
        # 変数の内容: page: ブランド固有の PWA 設定を整えた最終 HTML。
        page = cleanup_brand_pwa_html(page, site_name)

    # 4. 共通 HTML またはブランド別後処理済み HTML を返す。
    return page
