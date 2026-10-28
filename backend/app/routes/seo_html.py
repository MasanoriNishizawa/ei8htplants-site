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
    """JSON-LDなどの値を、script要素内に安全に埋め込めるJSON文字列へ変換する。

    Args:
        data: JSONとしてシリアライズする値。辞書やリストなど、json.dumpsが扱える値を渡す。

    Returns:
        HTMLのscript要素を早期終了させたり、HTMLとして解釈されたりしないよう、危険な文字を
        Unicodeエスケープへ置き換えたJSON文字列。
    """
    # 1. 日本語をそのまま残し、空白を省いたJSON文字列へシリアライズする。
    # 変数の内容: serialized: エスケープ前のJSON文字列。
    serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    # 2. HTMLタグやscript境界として解釈されうる文字と、JavaScript上の行区切り文字を無害化する。
    return (
        serialized.replace('<', '\\u003c')
        .replace('>', '\\u003e')
        .replace('&', '\\u0026')
        .replace('\u2028', '\\u2028')
        .replace('\u2029', '\\u2029')
    )


def render_head_tags(meta: PageMeta) -> str:
    """ページ情報からtitle・検索用メタ情報・SNS情報・構造化データのタグを生成する。

    Args:
        meta: title、説明文、画像URL、canonical URL、noindex設定、構造化データなど、
            HTMLのheadに反映するページ情報。

    Returns:
        title、description、設定に応じたcanonical/noindex、OGP、Twitterカード、JSON-LDを
        改行で連結したHTML文字列。
    """
    # 1. title と description を HTML エスケープし、基本タグを作る。
    # 変数の内容: escape: タグ属性値や要素内容に使う文字列をHTMLエスケープする関数。
    escape = lambda value: html.escape(value, quote=True)  # noqa: E731
    # 変数の内容: card: ページ固有画像がある場合は大きな画像カード、ない場合は通常カードの種別。
    card = 'summary_large_image' if meta.has_own_image else 'summary'
    # 変数の内容: tags: headへ出力するタグを順番に積むリスト。
    tags = [
        f'<title>{escape(meta.title)}</title>',
        f'<meta name="description" content="{escape(meta.description)}" />',
    ]
    # 2. canonical と noindex はページ設定に応じて追加する。
    if meta.canonical:
        tags.append(f'<link rel="canonical" href="{escape(meta.url)}" />')
    if meta.noindex:
        tags.append('<meta name="robots" content="noindex" />')
    # 3. OGP・Twitterカードの共通タグを追加する。
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
    # 4. JSON-LDをscript要素に入れ、すべてのタグをhead用の文字列にまとめる。
    # 変数の内容: structured_data: meta.json_ldから順に取り出した1件分の構造化データ。
    for structured_data in meta.json_ld:
        tags.append(f'<script type="application/ld+json">{json_for_script(structured_data)}</script>')
    return '\n    '.join(tags)


def inject_head(index_html: str, meta: PageMeta) -> str:
    """HTMLのhead内にページ情報タグを挿入し、既存titleがあればその位置から置き換える。

    Args:
        index_html: title要素を含む場合がある、ビルド済みindex.html全体の文字列。
        meta: headへ出力するtitle、説明文、canonical/noindex、OGP、Twitterカード、JSON-LDの情報。

    Returns:
        title要素があれば最初のtitle要素を生成したタグ群に置換したHTML文字列。
        title要素がなければ、最初の</head>の直前にタグ群を挿入したHTML文字列。
        </head>もない場合は、入力されたHTML文字列をそのまま返す。
    """
    # 1. PageMetaから出力タグを作り、既存titleがあれば最初の1件をタグ群へ置き換える。
    # 変数の内容: tags: headへ挿入または置換するメタデータタグ群。
    tags = render_head_tags(meta)
    # 変数の内容: replaced: title置換を試みた後のHTML、count: 実際に置換したtitle要素の件数。
    replaced, count = re.subn(
        r'<title>.*?</title>', lambda _match: tags,
        index_html, count=1, flags=re.S | re.I,
    )
    if count:
        return replaced
    # 2. titleが無いHTMLでは、headの閉じタグがあればその直前にタグ群を挿入する。
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
