"""robots.txt のホスト解決と本文生成を行う純粋な処理。"""

from collections.abc import Mapping, Sequence


def build_robots_txt(
    hostname: str,
    disallow_paths: Sequence[str],
    brand_domains: Mapping[str, tuple[str, str]],
    site_origin: str,
) -> str:
    """許可済みホストに対応する Sitemap を選び、robots.txt の本文を作る。

    Args:
        hostname: リクエストの Host 値。大文字やポート番号を含んでもよい。
        disallow_paths: robots.txt で拒否する URL パスの順序付き一覧。
        brand_domains: ホスト名を (ブランド名, 正規 origin) に対応づける許可リスト。
        site_origin: 未知のホストに使う本体サイトの origin。

    Returns:
        directive の順序と末尾改行を含む robots.txt 本文。
    """
    # 1. Host を小文字にそろえ、指定があれば有効な数値ポートだけを取り除く。
    # 変数の内容: normalized_hostname: 許可リストとの照合に使う正規化済みホスト名。
    normalized_hostname = hostname.lower()
    # 変数の内容: colon_count: Host に含まれるコロン数。IPv6 のような複数コロン形式は対象外。
    colon_count = normalized_hostname.count(':')
    if colon_count == 1:
        # 変数の内容: host_part: Host のホスト部分、port_text: 検証するポート文字列。
        host_part, _, port_text = normalized_hostname.partition(':')
        # 2. ポートが ASCII 数字かつ 0〜65535 の範囲かを検証する。
        # 変数の内容: normalized_port: 先頭のゼロを除き、整数化可能な長さにしたポート文字列。
        normalized_port = port_text.lstrip('0') or '0'
        # 変数の内容: valid_port: ポート文字列が ASCII 数字で範囲内かを示す判定結果。
        valid_port = (
            port_text.isascii()
            and port_text.isdecimal()
            and len(normalized_port) <= 5
            and int(normalized_port) <= 65535
        )
        # 変数の内容: normalized_hostname: ポート検証に成功した場合のホスト部分。不正値は空にする。
        normalized_hostname = host_part if valid_port else ''
    elif colon_count > 1:
        # IPv6 形式など、単一のホスト名として扱えない Host はブランド許可リストに照合しない。
        normalized_hostname = ''

    # 変数の内容: brand_entry: 許可されたブランドの情報。未登録時は空の名前と本体 origin。
    brand_entry = brand_domains.get(normalized_hostname, ('', site_origin))
    # 変数の内容: sitemap_origin: robots.txt の Sitemap 行に使う正規 origin。
    sitemap_origin = brand_entry[1]

    # 3. directive を既存の順番で並べ、Sitemap 行と末尾改行を加えて返す。
    # 変数の内容: lines: robots.txt 本文を構成する順序付きの各行。
    lines = ['User-agent: *', 'Allow: /']
    # 変数の内容: path: robots.txt に出力する拒否対象パス。
    lines.extend(f'Disallow: {path}' for path in disallow_paths)
    lines.extend(['', f'Sitemap: {sitemap_origin}/sitemap.xml', ''])
    return '\n'.join(lines)
