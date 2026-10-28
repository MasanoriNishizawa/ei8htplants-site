"""SPA のブランド管理画面と旧ブランド URL の転送先を解決する。"""

from typing import Mapping, Optional


# 変数の内容: 旧 URL を受け付ける host ごとの path と正規 URL の対応表。
_MOVED_PAGES = {
    'ei8htplants.com': {
        'habitatoides': 'https://habitatoides.com/',
        'habitatoides/workshop': 'https://habitatoides.com/workshop',
        'hue': 'https://huebyei8htplants.com/',
        'collaborations': 'https://habitatoides.com/collaborations',
    },
    'www.ei8htplants.com': {
        'habitatoides': 'https://habitatoides.com/',
        'habitatoides/workshop': 'https://habitatoides.com/workshop',
        'hue': 'https://huebyei8htplants.com/',
        'collaborations': 'https://habitatoides.com/collaborations',
    },
    'habitatoides.com': {'hue': 'https://huebyei8htplants.com/'},
    'www.habitatoides.com': {'hue': 'https://huebyei8htplants.com/'},
    'huebyei8htplants.com': {'habitatoides': 'https://habitatoides.com/'},
    'www.huebyei8htplants.com': {'habitatoides': 'https://habitatoides.com/'},
}


def resolve_spa_redirect(
    host: str,
    path: str,
    query: str,
    site_origin: str,
    brand_domains: Mapping[str, tuple],
) -> Optional[str]:
    """SPA fallback のブランド管理画面または旧ブランド URL の転送先を返す。

    Host の小文字化と path の前後スラッシュ除去は呼び出し側の責務とする。
    1. ブランド host の admin と admin 配下を公式サイトへ転送する。
    2. 旧 URL 対応表から転送先を探し、該当時は query を付けて返す。
    3. どちらにも該当しない場合は None を返す。

    Args:
        host: 呼び出し側で小文字化済みのリクエスト Host。
        path: 呼び出し側で前後のスラッシュを除去済みの URL パス。
        query: URL の query 文字列（先頭の ? を含まない）。
        site_origin: 公式サイトの origin。
        brand_domains: ブランド host とブランド情報の対応表。

    Returns:
        転送先 URL。転送対象でない場合は None。
    """
    # 変数の内容: destination: 条件に一致したときに返す転送先 URL。
    destination: Optional[str] = None

    # 1. ブランド host の管理画面を公式サイトへ送り、管理画面のクエリも保持する。
    if host in brand_domains and (path == 'admin' or path.startswith('admin/')):
        destination = f'{site_origin}/{path}'
        if query:
            destination += '?' + query
        return destination

    # 2. 旧ブランド URL の対応表から、host と path の組み合わせに一致する転送先を探す。
    destination = _MOVED_PAGES.get(host, {}).get(path)
    if destination and query:
        destination += '?' + query

    # 3. 一致した URL、または転送対象がないことを示す None を返す。
    return destination
