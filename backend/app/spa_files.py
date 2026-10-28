"""SPA の配信先に使う dist 内ファイルパスを解決する。"""

import os
from typing import Optional


def resolve_dist_file_path(dist_dir: str, requested_path: str) -> Optional[str]:
    """指定されたパスを dist の実パス基準で解決し、内部にある場合だけ返す。

    ファイルの存在確認は行わず、解決した実パスが dist 配下かどうかだけを判定する。

    Args:
        dist_dir: 静的ファイルのルートとなる dist ディレクトリ。
        requested_path: dist を基準に解決するリクエストパス。

    Returns:
        dist 自身を除く dist 配下の実パス。範囲外なら None。
    """
    # 1. dist の実パスを基準にリクエストパスを結合し、リンクも含めて実パスへ解決する。
    # 変数の内容: dist_real: dist_dir のシンボリックリンクを解決したルートパス。
    dist_real = os.path.realpath(dist_dir)
    # 変数の内容: file_path: 要求パスを結合して実パス化した候補。
    file_path = os.path.realpath(os.path.join(dist_real, requested_path))

    # 2. dist 自身ではなく、その直下に区切り文字付きで含まれる場合だけ候補を返す。
    if file_path.startswith(dist_real + os.sep):
        return file_path
    return None
