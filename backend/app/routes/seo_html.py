"""SEOメタデータをHTMLのheadへ埋め込む純粋な文字列処理。"""
from __future__ import annotations

import html
import json
import re
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .seo import PageMeta

# OGP の locale タグに設定する日本語ロケール。
OG_LOCALE = 'ja_JP'


def json_for_script(data: Any) -> str:
    """script要素内で安全に使えるJSON文字列にする。

    Args:
        data: テスト対象に渡すデータ。

    Returns:
        注釈に示した形式の応答（str）。
    """
    # 変数の内容: serialized: script 内へ挿入する JSON 文字列。
    serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    return (
        serialized.replace('<', '\\u003c')
        .replace('>', '\\u003e')
        .replace('&', '\\u0026')
        .replace('\u2028', '\\u2028')
        .replace('\u2029', '\\u2029')
    )


def render_head_tags(meta: PageMeta) -> str:
    """PageMetaからheadに追加するメタデータタグを生成する。

    Args:
        meta: HTML head に挿入するメタ情報。

    Returns:
        注釈に示した形式の応答（str）。
    """
    # 1. title と description を HTML エスケープし、基本タグを作る。
    escape = lambda value: html.escape(value, quote=True)  # noqa: E731
    card = 'summary_large_image' if meta.has_own_image else 'summary'
    tags = [
        f'<title>{escape(meta.title)}</title>',
        f'<meta name="description" content="{escape(meta.description)}" />',
    ]
    # 2. canonical と noindex はページ設定に応じて追加する。
    if meta.canonical:
        tags.append(f'<link rel="canonical" href="{escape(meta.url)}" />')
    if meta.noindex:
        tags.append('<meta name="robots" content="noindex" />')
    # 3. OGP の共通タグを追加して head 用の文字列にする。
    tags += [
        '<meta property="og:type" content="website" />',
        f'<meta property="og:title" content="{escape(meta.title)}" />',
        f'<meta property="og:description" content="{escape(meta.description)}" />',
        f'<meta property="og:image" content="{escape(meta.image)}" />',
        f'<meta property="og:url" content="{escape(meta.url)}" />',
        f'<meta property="og:site_name" content="{escape(meta.site_name)}" />',
        f'<meta property="og:locale" content="{OG_LOCALE}" />',
        f'<meta name="twitter:card" content="{card}" />',
        f'<meta name="twitter:title" content="{escape(meta.title)}" />',
        f'<meta name="twitter:description" content="{escape(meta.description)}" />',
        f'<meta name="twitter:image" content="{escape(meta.image)}" />',
    ]
    # 変数の内容: structured_data: structured_data の反復ごとの値。
    for structured_data in meta.json_ld:
        tags.append(f'<script type="application/ld+json">{json_for_script(structured_data)}</script>')
    return '\n    '.join(tags)


def inject_head(index_html: str, meta: PageMeta) -> str:
    """既存titleを置き換えるか、無ければhead終端の前にheadタグを挿入する。

    Args:
        index_html: HTML の index.html 文字列。
        meta: HTML head に挿入するメタ情報。

    Returns:
        注釈に示した形式の応答（str）。
    """
    # 変数の内容: count: 対象件数、replaced: 置換後の HTML と置換件数、tags: head に出力するメタタグ。
    tags = render_head_tags(meta)
    replaced, count = re.subn(
        r'<title>.*?</title>', lambda _match: tags,
        index_html, count=1, flags=re.S | re.I,
    )
    if count:
        return replaced
    return index_html.replace('</head>', tags + '\n  </head>', 1)
