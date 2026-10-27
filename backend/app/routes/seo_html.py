"""SEOメタデータをHTMLのheadへ埋め込む純粋な文字列処理。"""
from __future__ import annotations

import html
import json
import re
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .seo import PageMeta

OG_LOCALE = 'ja_JP'


def json_for_script(data: Any) -> str:
    """script要素内で安全に使えるJSON文字列にする。"""
    serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    return (
        serialized.replace('<', '\\u003c')
        .replace('>', '\\u003e')
        .replace('&', '\\u0026')
        .replace('\u2028', '\\u2028')
        .replace('\u2029', '\\u2029')
    )


def render_head_tags(meta: PageMeta) -> str:
    """PageMetaからheadに追加するメタデータタグを生成する。"""
    escape = lambda value: html.escape(value, quote=True)  # noqa: E731
    card = 'summary_large_image' if meta.has_own_image else 'summary'
    tags = [
        f'<title>{escape(meta.title)}</title>',
        f'<meta name="description" content="{escape(meta.description)}" />',
    ]
    if meta.canonical:
        tags.append(f'<link rel="canonical" href="{escape(meta.url)}" />')
    if meta.noindex:
        tags.append('<meta name="robots" content="noindex" />')
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
    for structured_data in meta.json_ld:
        tags.append(f'<script type="application/ld+json">{json_for_script(structured_data)}</script>')
    return '\n    '.join(tags)


def inject_head(index_html: str, meta: PageMeta) -> str:
    """既存titleを置き換えるか、無ければhead終端の前にheadタグを挿入する。"""
    tags = render_head_tags(meta)
    replaced, count = re.subn(
        r'<title>.*?</title>', lambda _match: tags,
        index_html, count=1, flags=re.S | re.I,
    )
    if count:
        return replaced
    return index_html.replace('</head>', tags + '\n  </head>', 1)
