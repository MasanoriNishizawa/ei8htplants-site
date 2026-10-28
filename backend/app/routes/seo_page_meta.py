"""SEO 個別ページのレコードからページメタ情報を組み立てる関数。

DB 取得やリクエストのパス判定を持たず、呼び出し元から受け取った生成関数・
本文変換関数を使ってイベント、記事、商品の PageMeta を組み立てる。
"""
from typing import Any, Callable, Optional


def build_event_page_meta(
    path: str,
    event: dict,
    make_meta: Callable[..., Any],
    event_description: Callable[[dict], str],
    event_json_ld: Callable[[dict, Any], Optional[dict]],
) -> Any:
    """イベントレコードからメタ情報を生成し、利用可能な JSON-LD を追加する。

    Args:
        path: リクエストのイベントページパス。
        event: 画像 URL 一覧を含むイベントレコード。
        make_meta: PageMeta を作る関数。
        event_description: イベント説明文を作る関数。
        event_json_ld: イベントの JSON-LD を作る関数。

    Returns:
        イベントのタイトル・説明・画像・正規 URL を持つ PageMeta。
    """
    # 1. イベントに設定された画像一覧から、メタ情報に使う先頭画像を選ぶ。
    # 変数の内容: images: イベントレコードに設定された画像 URL 一覧。
    images = event.get('image_urls') or []
    # 2. slug がある場合は slug を正規パスにし、無い場合は既定の path を使う。
    # 変数の内容: slug_value: イベントレコードから取得した未加工の slug 値。
    # 変数の内容: slug: イベントの公開 URL に使う文字列。
    slug_value = event.get('slug')
    slug = slug_value if isinstance(slug_value, str) else ''
    # 変数の内容: canonical_path: slug がある場合のイベント正規 URL。
    canonical_path = f'/official/events/{slug}' if slug else None
    # 3. 既存の説明文・メタ情報生成関数を呼び、イベント用 PageMeta を作る。
    # 変数の内容: meta: title・description・image・canonical URL を持つページメタ情報。
    meta = make_meta(
        path,
        event.get('name') if isinstance(event.get('name'), str) else '',
        event_description(event),
        images[0] if images else None,
        canonical_path,
    )
    # 4. JSON-LD が生成された場合だけ、同じ PageMeta の構造化データ一覧へ追加する。
    # 変数の内容: json_ld: イベント用の構造化データ。生成できない場合は None。
    json_ld = event_json_ld(event, meta)
    if json_ld:
        meta.json_ld.append(json_ld)
    return meta


def build_article_page_meta(
    path: str,
    article: dict,
    make_meta: Callable[..., Any],
    parse_blocks: Callable[[Any], list[dict]],
    blocks_to_text: Callable[[list[dict]], str],
    first_image_block_url: Callable[[list[dict]], Optional[str]],
) -> Any:
    """記事本文と画像から Journal 用のページメタ情報を組み立てる。

    Args:
        path: リクエストの記事ページパス。
        article: title・content・任意の image_urls を持つ記事レコード。
        make_meta: PageMeta を作る関数。
        parse_blocks: 保存された本文をブロックへ変換する関数。
        blocks_to_text: 本文ブロックから説明文を作る関数。
        first_image_block_url: 本文中の先頭画像 URL を返す関数。

    Returns:
        Journal 用タイトル・本文説明・代表画像を持つ PageMeta。
    """
    # 1. 記事本文を既存の本文パーサーでブロック一覧へ変換する。
    # 変数の内容: blocks: 記事本文を表すブロック一覧。
    blocks = parse_blocks(article.get('content'))
    # 2. image_urls はリスト形式の場合だけ採用し、それ以外は空一覧とみなす。
    # 変数の内容: image_urls: 記事レコードに設定された有効な画像 URL 一覧。
    image_urls = article.get('image_urls') if isinstance(article.get('image_urls'), list) else []
    # 3. 本文中の画像を優先し、無ければ記事の画像一覧から代表画像を選ぶ。
    # 変数の内容: hero: OGP に使う本文画像または記事の先頭画像。
    hero = first_image_block_url(blocks) or (image_urls[0] if image_urls else None)
    # 4. 記事タイトル・本文要約を既存の形式に合わせて PageMeta に渡す。
    # 変数の内容: title_value: 記事レコードから取得した未加工のタイトル値。
    # 変数の内容: title: Journal 接尾辞を付ける前の記事タイトル。
    title_value = article.get('title')
    title = title_value if isinstance(title_value, str) else ''
    # 変数の内容: description: 本文要約。本文に文字が無い場合は記事タイトル。
    description = blocks_to_text(blocks) or title
    return make_meta(path, f'{title} | Journal', description, hero)


def build_product_page_meta(
    path: str,
    product: dict,
    make_meta: Callable[..., Any],
    parse_blocks: Callable[[Any], list[dict]],
    blocks_to_text: Callable[[list[dict]], str],
) -> Any:
    """商品説明と画像から Shop 用のページメタ情報を組み立てる。

    Args:
        path: リクエストの商品ページパス。
        product: name・description・任意の image_urls を持つ商品レコード。
        make_meta: PageMeta を作る関数。
        parse_blocks: 保存された説明をブロックへ変換する関数。
        blocks_to_text: 説明ブロックからメタ説明を作る関数。

    Returns:
        Shop 用タイトル・商品説明・代表画像を持つ PageMeta。
    """
    # 1. 商品説明を既存の本文パーサーでブロック一覧へ変換する。
    # 変数の内容: blocks: 商品説明を表すブロック一覧。
    blocks = parse_blocks(product.get('description'))
    # 2. 画像 URL 一覧はリスト形式の場合だけ採用する。
    # 変数の内容: image_urls: 商品レコードに設定された有効な画像 URL 一覧。
    image_urls = product.get('image_urls') if isinstance(product.get('image_urls'), list) else []
    # 3. 商品名を説明文の代替にも使えるよう文字列として取り出す。
    # 変数の内容: name_value: 商品レコードから取得した未加工の商品名。
    name_value = product.get('name')
    # 変数の内容: name: 画面・メタ情報に使う商品名。
    name = name_value if isinstance(name_value, str) else ''
    # 変数の内容: description: 説明ブロックの要約。空の場合は商品名。
    description = blocks_to_text(blocks) or name
    # 4. Shop 接尾辞と画像一覧の先頭要素を使って PageMeta を生成する。
    return make_meta(
        path,
        f'{name} | Shop',
        description,
        image_urls[0] if image_urls else None,
    )
