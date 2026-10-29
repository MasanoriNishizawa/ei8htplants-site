"""正規化済みパスから SEO ページを選び、ページメタ情報を解決する。

DB 取得・個別ページのメタ生成・ログ出力は呼び出し元から依存として受け取り、
既存の ``seo`` モジュールが持つ差し替え可能な参照をそのまま利用する。
"""
import logging
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional


@dataclass(frozen=True)
class SeoPageResolutionDeps:
    """ページ選択で使う既存処理・参照をまとめた依存オブジェクト。

    Attributes:
        fetch_event: slug または UUID で公開イベントを取得する関数。
        fetch_article: ID で公開記事を取得する関数。
        fetch_product: ID で公開商品を取得する関数。
        make_meta: PageMeta を生成する関数。
        not_found_meta: ソフト 404 用の PageMeta を生成する関数。
        build_event_page_meta: イベント行から PageMeta を生成する関数。
        build_article_page_meta: 記事行から PageMeta を生成する関数。
        build_product_page_meta: 商品行から PageMeta を生成する関数。
        event_description: イベントの説明文を生成する関数。
        event_json_ld: イベントの構造化データを生成する関数。
        parse_blocks: 記事・商品本文をブロックへ変換する関数。
        blocks_to_text: 本文ブロックから説明文を作る関数。
        first_image_block_url: 本文中の先頭画像 URL を返す関数。
        static_pages: 正規パスと固定ページ情報の対応表。
        organization_json_ld: Organization 構造化データを生成する関数。
        logger: DB 読み取り例外を記録するロガー。
        error_summary: 例外本文を含めずにエラーを要約する関数。
    """

    fetch_event: Callable[[str], Optional[dict]]
    fetch_article: Callable[[str], Optional[dict]]
    fetch_product: Callable[[str], Optional[dict]]
    make_meta: Callable[..., Any]
    not_found_meta: Callable[[str], Any]
    build_event_page_meta: Callable[..., Any]
    build_article_page_meta: Callable[..., Any]
    build_product_page_meta: Callable[..., Any]
    event_description: Callable[[dict], str]
    event_json_ld: Callable[[dict, Any], Optional[dict]]
    parse_blocks: Callable[[Any], list[dict]]
    blocks_to_text: Callable[[list[dict]], str]
    first_image_block_url: Callable[[list[dict]], Optional[str]]
    static_pages: Mapping[str, Any]
    organization_json_ld: Callable[[], dict]
    logger: logging.Logger
    error_summary: Callable[[BaseException], str]


def resolve_seo_page_meta(
    normalized_path: str,
    query: Optional[dict],
    deps: SeoPageResolutionDeps,
) -> Any:
    """正規化済みパスに対応する動的・固定・not-found メタ情報を返す。

    Args:
        normalized_path: ``normalize_legacy_path`` 適用後のパス。
        query: リクエストのクエリ値。None の場合は空辞書として扱う。
        deps: seo モジュールの現在の参照から作ったページ解決依存。

    Returns:
        対象ページの PageMeta。

    """
    # 1. 正規化済みパスをセグメントに分け、クエリが無い場合は空辞書にする。
    # 変数の内容: segments: パスを slash で分けた各要素、query_values: ページ選択に使うクエリ値。
    segments = [segment for segment in normalized_path.split('/') if segment]
    query_values = query or {}

    try:
        # 2. イベント個別ページを先に照合し、取得・生成の例外を下の共通 fallback で扱う。
        if len(segments) == 3 and segments[:2] == ['official', 'events']:
            # 変数の内容: event: slug または UUID で取得した公開イベント行。
            event = deps.fetch_event(segments[2])
            if event and _has_text(event.get('name')):
                return deps.build_event_page_meta(
                    normalized_path,
                    event,
                    deps.make_meta,
                    deps.event_description,
                    deps.event_json_ld,
                )
            return deps.not_found_meta(normalized_path)

        # 3. 記事個別ページを照合し、既存の本文変換・メタ生成関数を再利用する。
        if len(segments) == 3 and segments[:2] == ['official', 'journal']:
            # 変数の内容: article: ID で取得した公開記事行。
            article = deps.fetch_article(segments[2])
            if article and _has_text(article.get('title')):
                return deps.build_article_page_meta(
                    normalized_path,
                    article,
                    deps.make_meta,
                    deps.parse_blocks,
                    deps.blocks_to_text,
                    deps.first_image_block_url,
                )
            return deps.not_found_meta(normalized_path)

        # 4. 商品個別ページを照合し、既存の商品メタ生成関数を再利用する。
        if len(segments) == 3 and segments[:2] == ['official', 'shop']:
            # 変数の内容: product: ID で取得した公開商品行。
            product = deps.fetch_product(segments[2])
            if product and _has_text(product.get('name')):
                return deps.build_product_page_meta(
                    normalized_path,
                    product,
                    deps.make_meta,
                    deps.parse_blocks,
                    deps.blocks_to_text,
                )
            return deps.not_found_meta(normalized_path)
    # 変数の内容: error: 動的ページの取得または PageMeta 生成中に発生した例外。
    except Exception as error:
        # 例外本文に利用者入力が含まれうるため、従来どおり要約だけを記録する。
        deps.logger.error(
            'build_page_meta DB 読み取りエラー（%r）: %s',
            normalized_path,
            deps.error_summary(error),
        )
        return deps.make_meta(normalized_path, None, None, None)

    # 5. 動的ページに該当しない場合は固定ページを引き、必要な補正を適用する。
    # 変数の内容: page: 正規化済みパスに対応する固定ページ SEO 情報。
    page = deps.static_pages.get(normalized_path)
    if page is not None:
        # 変数の内容: title: ページまたはメールのタイトル。
        title = page.title
        if normalized_path == '/official/events' and query_values.get('page') == 'past':
            title = 'Past Events'
        # 変数の内容: meta: ページの title・description・画像などの SEO 情報。
        meta = deps.make_meta(normalized_path, title, page.description, page.image)
        if normalized_path in {'/', '/official'}:
            meta.json_ld.append(deps.organization_json_ld())
        return meta

    # 6. 不明なパスはソフト 404 用の既定メタ情報を返す。
    return deps.not_found_meta(normalized_path)


def _has_text(value: Any) -> bool:
    """SEO ページに必要な値が文字列として空でないことを判定する。

    Args:
        value: レコードから取得した値。

    Returns:
        値が空でない文字列なら True。
    """
    # 1. 元コードの ``_str(value)`` と同じく、空白だけの文字列も真値として扱う。
    # 変数の内容: value: 確認対象のレコード値。
    return isinstance(value, str) and bool(value)
