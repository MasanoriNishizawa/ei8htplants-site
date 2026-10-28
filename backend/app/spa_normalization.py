"""SPA リクエストの Host とパスを既存の照合形式へ正規化する。"""


def normalize_spa_host(host: str) -> str:
    """SPA の Host を既存のドメイン照合形式へ正規化する。

    Args:
        host: HTTP リクエストの Host ヘッダー。未指定なら空文字列を渡す。

    Returns:
        小文字化して最初のコロン以降を除いた Host 名。
    """
    # 1. Host を小文字にそろえ、従来どおり最初のコロン以降を除いて返す。
    return host.lower().split(':', 1)[0]


def normalize_spa_path(path: str) -> str:
    """SPA のパスを既存のルート照合形式へ正規化する。

    Args:
        path: FastAPI のパスパラメーター。先頭・末尾のスラッシュを含む場合がある。

    Returns:
        前後のスラッシュを除いたパス。
    """
    # 1. パスの前後にあるスラッシュを除き、従来の照合形式で返す。
    return path.strip('/')
