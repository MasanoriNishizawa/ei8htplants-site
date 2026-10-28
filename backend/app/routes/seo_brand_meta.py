"""ブランド専用ドメインの公開ページ情報を解決する純粋モジュール。

このモジュールは固定カタログからページ情報を選ぶだけに限定し、URL の絶対化・
quote・PageMeta の生成・noindex/canonical の設定は呼び出し側に任せる。
"""
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class BrandPage:
    """ブランド公開ページの表示情報と canonical 用パス。

    Args:
        title: サイト名だけで表示するか、ブランド名に付けるページタイトル。
        description: 公開ページに設定する説明文。
        image_path: OGP 画像のサイト内パス。
        canonical_path: canonical URL に使う正規化済みのサイト内パス。

    Returns:
        属性に各値を保持する不変のページ情報。
    """

    title: str
    description: str
    image_path: str
    canonical_path: str


# 変数の内容: _BRAND_PAGES: ブランド名と公開パスをキーに、ページ固有の表示情報を保持する固定カタログ。
_BRAND_PAGES: dict[str, dict[str, tuple[str, str, str]]] = {
    'Habitat Oides': {
        '/': (
            'Habitat Oides',
            '植物の生息環境を再現するハビタットスタイルの専門ライン。ワークショップも開催しています。',
            '/img/habitatOides/habitat_oides_hero.jpg',
        ),
        '/workshop': (
            'Habitat Style Workshop',
            'ハビタットスタイルのワークショップ。植物の生息環境を意識したレイアウトを自分の手で制作できます。',
            '/img/habitatOides/habitat_oides_workshop_main.jpg',
        ),
        '/collaborations': (
            'Collaborations',
            'Habitat Oides のコラボレーション作品・活動記録。',
            '/img/habitatOides/habitat_oides_hero.jpg',
        ),
        '/habitatoides': (
            'Habitat Oides',
            '植物の生息環境を再現するハビタットスタイルの専門ライン。ワークショップも開催しています。',
            '/img/habitatOides/habitat_oides_hero.jpg',
        ),
        '/habitatoides/workshop': (
            'Habitat Style Workshop',
            'ハビタットスタイルのワークショップ。植物の生息環境を意識したレイアウトを自分の手で制作できます。',
            '/img/habitatOides/habitat_oides_workshop_main.jpg',
        ),
    },
    'HUE by ei8ht plants': {
        '/': (
            'HUE by ei8ht plants',
            'HUE は、色彩と形を楽しむオーナメントプランツのラインです。',
            '/img/logo-hue.png',
        ),
        '/hue': (
            'HUE by ei8ht plants',
            'HUE は、色彩と形を楽しむオーナメントプランツのラインです。',
            '/img/logo-hue.png',
        ),
        '/about': (
            'HUEについて',
            '植物を、部屋に置くものとしてだけでなく、日々を一緒に過ごす存在として。HUEは葉の色やかたちに目を向け、暮らしの景色になる一鉢を紹介します。',
            '/img/logo-hue.png',
        ),
        '/choose': (
            '一鉢の選び方',
            '名前や育て方を調べる前に、まずは心に留まった葉の色やかたちを見つける。HUEの一鉢選びは、そんな小さな好みから始まります。',
            '/img/logo-hue.png',
        ),
        '/living': (
            '植物のある部屋',
            '植物を迎えると、目に入る景色や部屋で過ごす時間が少し変わります。飾り方に決まりはありません。好きなものと並べながら、自分の居場所をつくっていきます。',
            '/img/logo-hue.png',
        ),
    },
}

# 変数の内容: _CANONICAL_PATHS: 互換用の旧ブランドパスを公開ページの正規パスへ対応付ける辞書。
_CANONICAL_PATHS = {
    '/habitatoides': '/',
    '/hue': '/',
    '/habitatoides/workshop': '/workshop',
}


def resolve_brand_page(path: str, site_name: str) -> Optional[BrandPage]:
    """ブランド名と URL パスから公開ページ情報を選ぶ。

    Args:
        path: リクエストの URL パス。前後のスラッシュは無視する。
        site_name: ``Habitat Oides`` または ``HUE by ei8ht plants``。

    Returns:
        公開パスに対応するページ情報。公開カタログにないパスでは None。

    Raises:
        KeyError: カタログに定義されていないブランド名が指定された場合。
    """
    # 1. 先頭・末尾のスラッシュをそろえ、公開ページ一覧からページ情報を探す。
    # 変数の内容: normalized_path: カタログ照合用の正規化パス、page: ブランドの公開ページ項目。
    normalized_path = '/' + path.strip('/')
    page = _BRAND_PAGES[site_name].get(normalized_path)
    if page is None:
        return None

    # 2. 旧ブランド URL は既存 canonical と同じ正規パスへ変換する。
    # 変数の内容: title/description/image_path: ページの表示情報、canonical_path: canonical に使う正規パス。
    title, description, image_path = page
    canonical_path = _CANONICAL_PATHS.get(normalized_path, normalized_path)
    return BrandPage(
        title=title,
        description=description,
        image_path=image_path,
        canonical_path=canonical_path,
    )
