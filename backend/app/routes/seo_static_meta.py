"""公開される固定ページのメタ情報カタログ。

各ページのタイトル・説明・OGP 画像を保持する。値は frontend の各ページにある
``<PageMeta>`` 呼び出しと同期し、SEO 応答側からも従来どおり参照できる形で公開する。
"""
from dataclasses import dataclass
from typing import Optional

from ..config import SITE_ORIGIN


@dataclass(frozen=True)
class StaticPage:
    """固定ページのメタ情報を表す不変データ。

    ``title`` が ``None`` の場合はサイト名だけのタイトルになる。
    ``description`` と ``image`` が ``None`` の場合はサイト既定値を使う。
    """

    # ページタイトル。None の場合はサイト名を使う。
    title: Optional[str] = None
    # 検索結果や OGP に表示するページ説明。None の場合は既定文を使う。
    description: Optional[str] = None
    # OGP に使う画像 URL。None の場合は既定ロゴを使う。
    image: Optional[str] = None


# 固定ページごとのメタ情報。キーは末尾スラッシュを除いたパスで、
# 値は frontend/src/pages 以下の <PageMeta> 呼び出しに合わせた日本語設定。
STATIC_PAGES: dict[str, StaticPage] = {
    '/': StaticPage(None, 'アガベ・塊根植物・灌木などビザールプランツを専門に扱うラインです。'),
    '/about': StaticPage('Our Story', '個性的な植物を育て、一株ごとの魅力を届けるei8ht plantsの考え方をご紹介します。'),
    '/plants': StaticPage('Plants', 'アガベ、塊根植物、灌木、多肉植物。ei8ht plantsが扱うビザールプランツをご紹介します。'),
    '/official/brands': StaticPage('Our Brands', '植物との向き合い方から生まれた、ei8ht plants の3つのブランドをご紹介します。'),
    '/official': StaticPage(),
    '/official/events': StaticPage('Events', 'ei8ht plants のイベント・出展情報。ワークショップ予約も受け付けています。'),
    '/official/gallery': StaticPage('Gallery', 'ei8ht plants、Habitat Oides、HUE の植物ギャラリー。'),
    '/official/concept': StaticPage('Concept', 'ei8ht plants のブランドコンセプト。ビザールプランツ・ハビタットスタイル・オーナメントプランツの3ラインをご紹介します。'),
    '/official/contact': StaticPage('Contact', 'ei8ht plants へのお問い合わせはこちらから。'),
    '/official/stockists': StaticPage('Stockists', 'ei8ht plants 取扱店一覧。'),
    '/official/collaborations': StaticPage(
        'Collaborations', 'Habitat Oides のコラボレーション作品・活動記録。',
        f'{SITE_ORIGIN}/img/habitatOides/habitat_oides_hero.jpg',
    ),
    '/official/media': StaticPage('Media', 'ei8ht plants のメディア出演情報をまとめています。'),
    '/habitatoides': StaticPage(
        'Habitat Oides', '植物の生息環境を再現するハビタットスタイルの専門ライン。ワークショップも開催しています。',
        f'{SITE_ORIGIN}/img/habitatOides/habitat_oides_hero.jpg',
    ),
    '/habitatoides/workshop': StaticPage(
        'Habitat Style Workshop', 'ハビタットスタイルのワークショップ。植物の生息環境を意識したレイアウトを自分の手で制作できます。',
        f'{SITE_ORIGIN}/img/habitatOides/habitat_oides_workshop_main.jpg',
    ),
    '/hue': StaticPage('HUE by ei8ht plants', 'HUE は、色彩と形を楽しむオーナメントプランツのラインです。'),
    '/official/legal': StaticPage('特定商取引法に基づく表示', 'ei8ht plants 特定商取引法に基づく表示'),
    '/official/privacy': StaticPage('プライバシーポリシー', 'ei8ht plants のプライバシーポリシー（個人情報の取り扱い・アクセス解析について）'),
    '/official/chat': StaticPage('AI コンシェルジュ', '植物の育て方・管理のご相談や、ワークショップ・予約に関するご質問にAIがお答えします。'),
    '/official/reserve': StaticPage('Workshop 予約', 'Habitat Style Workshop へのご予約はこちらから。'),
    '/official/cancel': StaticPage('予約キャンセル', 'ワークショップ予約のキャンセルはこちらから。'),
    '/official/shop': StaticPage('Shop', 'ei8ht plants オンラインストア'),
    '/official/journal': StaticPage('Journal', '植物と暮らしにまつわるコラム'),
    '/official/checkout': StaticPage('ご注文手続き', 'ご注文手続き'),
    '/official/order/complete': StaticPage('ご注文ありがとうございます', 'ご注文を受け付けました。'),
}
