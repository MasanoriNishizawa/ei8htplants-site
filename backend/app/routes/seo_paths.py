"""SEO で使う旧公式サイト URL のパス正規化処理。"""

# 旧公式サイトでルート直下に公開していたページ群。
# これらの完全一致パスと配下だけを /official 以下へ移す。
_OFFICIAL_ROOT_PATHS = frozenset({
    'brands',
    'events',
    'shop',
    'journal',
    'order',
    'gallery',
    'concept',
    'contact',
    'stockists',
    'collaborations',
    'media',
    'legal',
    'privacy',
    'chat',
    'reserve',
    'cancel',
    'checkout',
})


def normalize_legacy_path(path: str) -> str:
    """旧公式サイトの URL を現行の公式サイト階層に正規化する。

    Args:
        path: リクエストの URL パス。先頭・末尾の slash は省略や重複を許容する。

    Returns:
        slash 始まりで末尾 slash のない正規化済みパス。
        旧ルート直下の公式ページは /official 以下に移し、旧ブランドトップは / にする。
    """
    # 1. 先頭と末尾の slash を除き、空パスをルートとして扱う。
    # 変数の内容: normalized: slash の重複表記を整理した内部パス。
    normalized = path.strip('/')
    if not normalized:
        return '/'

    # 2. 旧ブランドトップの完全一致だけをブランドページのルートへ統一する。
    if normalized == 'ei8htplants':
        return '/'

    # 3. 旧公式ページの先頭セグメントだけを確認し、対象ページと配下に official を付ける。
    # 変数の内容: first_segment: URL パスの先頭にあるページ識別子。
    first_segment = normalized.split('/', 1)[0]
    if first_segment in _OFFICIAL_ROOT_PATHS:
        return f'/official/{normalized}'

    # 4. 対象外のパスは、先頭 slash を付けるだけで既存の階層を保つ。
    return f'/{normalized}'
