"""SEO の個別ページ用メタ情報組み立て関数を確認するテスト。

各テストでは DB や FastAPI を介さず、関数へ渡す変換処理と
メタ情報生成関数を差し替えて、入力・出力の契約を確かめる。
"""
from dataclasses import dataclass, field

from app.routes.seo_page_meta import (
    build_article_page_meta,
    build_event_page_meta,
    build_product_page_meta,
)


@dataclass
class _FakeMeta:
    """メタ情報生成関数の戻り値を置き換えるテスト用データ。"""

    # 変数の内容: json_ld: 構造化データを追加するためのリスト。
    json_ld: list = field(default_factory=list)


class _MetaFactory:
    """make_meta の引数を記録し、呼び出しごとにメタ情報を返す。"""

    def __init__(self):
        """呼び出し履歴と既定のメタ情報を初期化する。

        戻り値:
            なし。"""
        # 変数の内容: calls: make_meta に渡された引数の履歴。
        self.calls = []
        # 変数の内容: result: 呼び出し元へ返すテスト用メタ情報。
        self.result = _FakeMeta()

    def __call__(self, *args):
        """呼び出し引数を記録して、設定済みのメタ情報を返す。

        Args:
            *args: パス、タイトル、説明、画像、必要に応じて canonical パス。

        Returns:
            呼び出し元で JSON-LD を追記できるテスト用メタ情報。
        """
        # 1. 実際に渡された引数を保存し、後続の検証に使う。
        self.calls.append(args)
        # 2. 呼び出し結果として共通のテスト用オブジェクトを返す。
        return self.result


class TestBuildEventPageMeta:
    """イベント情報からページ用メタ情報を作る純関数の契約を確認する。"""

    def test_slugと先頭画像を使いJSON_LDをメタ情報へ追加する(self):
        """slug を canonical に使い、イベント画像と生成した JSON-LD を反映する。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: factory: make_meta の引数を記録する偽物。
        factory = _MetaFactory()
        # 変数の内容: event: メタ情報へ反映するイベントと複数画像。
        event = {'name': '秋の植物市', 'slug': 'autumn-market', 'image_urls': ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg']}
        # 変数の内容: json_ld: イベント用 JSON-LD 生成関数が返す構造化データ。
        json_ld = {'@type': 'Event', 'name': '秋の植物市'}
        # 変数の内容: result: 組み立て後に返されるメタ情報。
        result = build_event_page_meta(
            '/official/events/autumn-market', event, factory,
            lambda value: '開催説明', lambda value, meta: json_ld,
        )

        # 1. canonical 用パスとイベントの先頭画像が make_meta に渡ることを確認する。
        assert factory.calls == [(
            '/official/events/autumn-market', '秋の植物市', '開催説明',
            'https://cdn.example/a.jpg', '/official/events/autumn-market',
        )]
        # 2. JSON-LD が同じメタ情報のリストへ追加され、オブジェクト自体が返ることを確認する。
        assert result is factory.result
        assert result.json_ld == [json_ld]

    def test_slugや画像が無い場合はcanonicalと画像を省略する(self):
        """任意の slug と画像が無ければ canonical_path と画像を None にする。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: factory: メタ情報生成時の引数を記録する偽物。
        factory = _MetaFactory()
        # 変数の内容: event: slug と画像一覧を持たないイベント。
        event = {'name': '名前のみのイベント'}

        # 1. slug と画像がない境界値を使って関数を呼ぶ。
        build_event_page_meta(
            '/official/events/legacy-id', event, factory,
            lambda value: '説明', lambda value, meta: None,
        )

        # 2. path は呼び出し元の値を保ち、任意値だけが None になることを確認する。
        assert factory.calls == [('/official/events/legacy-id', '名前のみのイベント', '説明', None, None)]
        assert factory.result.json_ld == []


class TestBuildArticlePageMeta:
    """記事本文の変換結果と画像選択を確認する。"""

    def test_本文の最初の画像を優先しJournal接尾辞を付ける(self):
        """本文内画像を image_urls より優先し、本文要約を説明に使う。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: factory: make_meta の呼び出し引数を記録する偽物。
        factory = _MetaFactory()
        # 変数の内容: article: 本文画像と一覧画像を持つ記事。
        article = {
            'title': '葉の記録', 'content': '記事ブロック',
            'image_urls': ['https://cdn.example/cover.jpg'],
        }
        # 変数の内容: parsed_content: parse_blocks に渡された本文の記録。
        parsed_content = []
        # 変数の内容: blocks: 本文変換関数へ渡す記事ブロック。
        blocks = [{'type': 'image', 'url': 'https://cdn.example/inline.jpg'}]

        # 1. 依存関数を差し替えて記事ページのメタ情報を組み立てる。
        result = build_article_page_meta(
            '/official/journal/story-id', article, factory,
            lambda content: parsed_content.append(content) or blocks,
            lambda value: '記事本文の説明',
            lambda value: next((item['url'] for item in value if item.get('type') == 'image'), None),
        )

        # 2. 本文を解析し、本文画像・タイトル接尾辞・本文説明を選ぶことを確認する。
        assert parsed_content == ['記事ブロック']
        assert factory.calls == [(
            '/official/journal/story-id', '葉の記録 | Journal',
            '記事本文の説明', 'https://cdn.example/inline.jpg',
        )]
        assert result is factory.result

    def test_本文画像が無ければ一覧画像を使い説明が空ならタイトルにする(self):
        """本文画像・本文説明が無い場合に一覧画像と記事タイトルへフォールバックする。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: factory: make_meta に渡された値を記録する偽物。
        factory = _MetaFactory()
        # 変数の内容: article: 空の本文と一覧画像を持つ記事。
        article = {'title': '短い記事', 'content': '', 'image_urls': ['cover.jpg']}
        # 変数の内容: parsed_blocks: パース後の空ブロック一覧。
        parsed_blocks = []

        # 1. 本文が空で、本文画像・説明が作れない条件で関数を呼ぶ。
        build_article_page_meta(
            '/official/journal/short', article, factory,
            lambda content: parsed_blocks,
            lambda value: '',
            lambda value: None,
        )

        # 2. 一覧画像とタイトルの説明へのフォールバックを確認する。
        assert factory.calls == [('/official/journal/short', '短い記事 | Journal', '短い記事', 'cover.jpg')]

    def test_画像一覧が不正型なら画像なしで生成する(self):
        """image_urls がリストでないとき、画像選択依存関数にも渡さず None を使う。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: factory: make_meta の引数を記録する偽物。
        factory = _MetaFactory()
        # 変数の内容: image_calls: 本文ブロックの画像選択関数の呼び出し回数。
        image_calls = []
        # 変数の内容: article: image_urls が想定外の文字列である記事。
        article = {'title': '画像なし', 'content': '本文', 'image_urls': 'not-a-list'}

        # 1. 本文から画像が見つからないようにして、型境界を確認する。
        build_article_page_meta(
            '/official/journal/no-image', article, factory,
            lambda content: [], lambda value: '本文説明',
            lambda value: image_calls.append(value) or None,
        )

        # 2. 空ブロックを画像選択へ渡し、不正な image_urls を無視することを確認する。
        assert image_calls == [[]]
        assert factory.calls == [('/official/journal/no-image', '画像なし | Journal', '本文説明', None)]


class TestBuildProductPageMeta:
    """商品説明の変換結果と一覧画像の選択を確認する。"""

    def test_説明文を解析してShop接尾辞と先頭画像を使う(self):
        """description を解析し、本文要約と image_urls の先頭をメタ情報へ渡す。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: factory: make_meta の引数を記録する偽物。
        factory = _MetaFactory()
        # 変数の内容: product: 説明と複数画像を持つ商品。
        product = {
            'name': '小さな鉢', 'description': '商品説明ブロック',
            'image_urls': ['https://cdn.example/product.jpg', 'https://cdn.example/second.jpg'],
        }
        # 変数の内容: parsed_content: parse_blocks に渡された description の記録。
        parsed_content = []

        # 1. 商品説明のパーサーとテキスト変換を注入して関数を呼ぶ。
        result = build_product_page_meta(
            '/official/shop/product-id', product, factory,
            lambda content: parsed_content.append(content) or [{'type': 'text', 'value': '説明ブロック'}],
            lambda value: '植物に合う小さな鉢です',
        )

        # 2. 商品説明の解析・タイトル接尾辞・説明・先頭画像を確認する。
        assert parsed_content == ['商品説明ブロック']
        assert factory.calls == [(
            '/official/shop/product-id', '小さな鉢 | Shop',
            '植物に合う小さな鉢です', 'https://cdn.example/product.jpg',
        )]
        assert result is factory.result

    def test_説明が空なら商品名を使い画像が空なら画像なしにする(self):
        """本文要約と画像一覧が空の場合、商品名を説明に使い画像は None にする。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: factory: make_meta の引数を記録する偽物。
        factory = _MetaFactory()
        # 変数の内容: product: 説明が空で画像一覧も空の商品。
        product = {'name': '苔玉', 'description': '', 'image_urls': []}

        # 1. 空の説明ブロックを返す依存を注入して関数を呼ぶ。
        build_product_page_meta(
            '/official/shop/kokedama', product, factory,
            lambda content: [], lambda value: '',
        )

        # 2. 商品名への説明フォールバックと画像なしを確認する。
        assert factory.calls == [('/official/shop/kokedama', '苔玉 | Shop', '苔玉', None)]

    def test_image_urlsが不正型なら画像なしで生成する(self):
        """商品画像一覧がリスト以外なら先頭要素を参照しない。

        Args:
            self: テストクラスのインスタンス。

        Returns:
            なし。
        """
        # 変数の内容: factory: make_meta の引数を記録する偽物。
        factory = _MetaFactory()
        # 変数の内容: product: image_urls が辞書型の商品。
        product = {'name': '小鉢', 'description': '説明', 'image_urls': {'url': 'cover.jpg'}}

        # 1. 商品説明は本文ブロックを返し、画像だけが不正型になる入力を処理する。
        build_product_page_meta(
            '/official/shop/mini-pot', product, factory,
            lambda content: [{'type': 'text', 'value': content}],
            lambda value: '説明です',
        )

        # 2. 不正型の画像一覧は無視され、他のメタ情報は通常どおり組み立てる。
        assert factory.calls == [('/official/shop/mini-pot', '小鉢 | Shop', '説明です', None)]
