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


def cleanup_brand_pwa_html(index_html: str, site_name: str) -> str:
    """ブランド専用ドメイン向けにHTML内の旧PWA設定を後始末する。

    Args:
        index_html: PWA関連タグを取り除き、後始末スクリプトを加えるHTML文字列。
        site_name: Appleのホーム画面タイトルに設定するブランド名。

    Returns:
        旧PWAの登録とキャッシュを解除する処理を反映したHTML文字列。
    """
    # 1. ブランドサイトでは旧PWAマニフェストと自動登録スクリプトを除去する。
    # 変数の内容: cleaned_html: ブランド向けにPWA登録タグを取り除いたHTML。
    cleaned_html = re.sub(r'<link\s+rel="manifest"[^>]*>', '', index_html, flags=re.I)
    cleaned_html = re.sub(
        r'<script\s+id="vite-plugin-pwa:register-sw"[^>]*>\s*</script>',
        '',
        cleaned_html,
        flags=re.I,
    )

    # 2. 旧Service Workerとキャッシュを解除するスクリプトをheadへ加える。
    # 変数の内容: cleanup_script: 登録済みService WorkerとCache Storageを消去するインラインスクリプト。
    cleanup_script = (
        '<script>(function(){'
        "if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations()"
        '.then(function(items){return Promise.all(items.map(function(item){return item.unregister()}))})}'
        "if('caches' in window){caches.keys().then(function(keys){return Promise.all(keys.map(function(key){return caches.delete(key)}))})}"
        '})();</script>'
    )
    cleaned_html = cleaned_html.replace('</head>', cleanup_script + '</head>')

    # 3. Appleのホーム画面タイトルをブランド名に置き換える。
    # 変数の内容: escaped_site_name: 属性値へ安全に挿入できるようエスケープしたブランド名。
    escaped_site_name = html.escape(site_name, quote=True)
    # 変数の内容: branded_html: ブランド名のタイトルを反映した最終HTML。
    # 変数の内容: match: Apple向けタイトルmetaタグに一致した正規表現の照合結果。
    branded_html = re.sub(
        r'(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*("\s*/?>)',
        lambda match: f'{match.group(1)}{escaped_site_name}{match.group(2)}',
        cleaned_html,
        flags=re.I,
    )
    return branded_html
