"""
routes/seo.py（SPA の index.html へのメタ情報の埋め込み・robots.txt・sitemap.xml）のテスト。

- DB は seo モジュールの supabase / admin_supabase をパッチして差し替える
  （app.db.supabase へのパッチはローカル参照のため効かない）
- seo は 60 秒のメモリキャッシュを持つので、各テストの前後で seo.clear_cache() を呼ぶ
- serve_spa は frontend/dist/index.html を読むため、dist が無い環境ではその部分を skip する
"""
import html
import json
import os
import re
from unittest.mock import MagicMock, patch
from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

from app import main as app_main
from app.main import app
from app.routes import seo
from app.routes import seo_robots
from app.routes.seo_paths import normalize_legacy_path


# ---------------------------------------------------------------------------
# テスト用データ
# ---------------------------------------------------------------------------

# イベントの UUID
EVENT_ID = '11111111-1111-1111-1111-111111111111'
# 記事の UUID
ARTICLE_ID = '22222222-2222-2222-2222-222222222222'
# 商品の UUID
PRODUCT_ID = '33333333-3333-3333-3333-333333333333'
# DB に無い UUID
MISSING_ID = '99999999-9999-9999-9999-999999999999'

# HTML・script を壊しうる文字を含むイベント名
DANGEROUS_NAME = 'Plant <Market> "2026" & \'x\'</script>'


class TestNormalizeLegacyPath:
    """旧URLパスを正規化する純関数の境界を確認する。"""

    @pytest.mark.parametrize('path,expected', [
        ('', '/'),
        ('/', '/'),
        ('///', '/'),
        ('events', '/official/events'),
        ('/events/', '/official/events'),
        ('//official/events///', '/official/events'),
    ])
    def test_先頭末尾のslashを正規化する(self, path, expected):
        """先頭・末尾のslashを整理し、常にslash始まりのパスを返す。

        Args:
            path: 正規化する入力パス。
            expected: 期待する正規化後のパス。

        Returns:
            なし。
        """
        # 1. パスの区切り文字だけを正規化し、期待値と比較する。
        assert normalize_legacy_path(path) == expected

    @pytest.mark.parametrize('path', ['/ei8htplants', 'ei8htplants/', '//ei8htplants///'])
    def test_ei8htplants単独の旧URLだけをルートへ変換する(self, path):
        """ei8htplants単独の旧URLをトップページへ変換する。

        Args:
            path: 変換対象の旧パス。

        Returns:
            なし。
        """
        # 1. 旧ブランドトップの表記ゆれをルートへ統一する。
        assert normalize_legacy_path(path) == '/'

    @pytest.mark.parametrize('path,expected', [
        ('/brands', '/official/brands'),
        ('/brands/our-brands', '/official/brands/our-brands'),
        ('/events', '/official/events'),
        ('/events/plant-market', '/official/events/plant-market'),
        ('/shop/item', '/official/shop/item'),
        ('/journal/story', '/official/journal/story'),
        ('/order/complete', '/official/order/complete'),
        ('/gallery', '/official/gallery'),
        ('/concept', '/official/concept'),
        ('/contact', '/official/contact'),
        ('/stockists', '/official/stockists'),
        ('/collaborations', '/official/collaborations'),
        ('/media', '/official/media'),
        ('/legal', '/official/legal'),
        ('/privacy', '/official/privacy'),
        ('/chat', '/official/chat'),
        ('/reserve', '/official/reserve'),
        ('/cancel', '/official/cancel'),
        ('/checkout', '/official/checkout'),
    ])
    def test_旧公式サイトのルート群にofficialを付ける(self, path, expected):
        """旧公式サイトのルート群だけにofficial階層を付ける。

        Args:
            path: 変換対象の旧公式サイトパス。
            expected: 期待する新しい公式サイトパス。

        Returns:
            なし。
        """
        # 1. 旧公式URLを新しい公式サイト階層へ移し、既存の下位パスも保つ。
        assert normalize_legacy_path(path) == expected

    @pytest.mark.parametrize('path', [
        '/events-extra',
        '/events-extra/plant-market',
        '/brands-old',
        '/ei8htplants-extra',
        '/official',
        '/official/events',
        '/official/events/plant-market',
    ])
    def test_類似pathとofficial配下を誤変換しない(self, path):
        """旧ルートに似たパスや既にofficial配下のパスを再変換しない。

        Args:
            path: 変換境界を確認する入力パス。

        Returns:
            なし。
        """
        # 1. 完全なルート境界だけを旧URLと認識し、他のパスは正規化のみ行う。
        expected = '/' + path.strip('/')
        assert normalize_legacy_path(path) == expected


def _event(**over) -> dict:
    """テスト用のイベント行を返し、指定された項目を上書きする。

    Args:
        over: イベント行に追加または上書きするフィールド。

    Returns:
        イベント情報をまとめた辞書。
    """
    # 変数の内容: ev: テスト用イベントレコード。
    ev = {
        'id': EVENT_ID,
        'slug': 'plant-market',
        'name': 'Plant Market 2026',
        'start_date': '2026-11-03',
        'end_date': '2026-11-04',
        'time': '10:00〜17:00',
        'location': '代々木公園',
        'address': '東京都渋谷区',
        'page_content': {'hero': {'tagline': '植物の市'}},
        'daily_times': {'2026-11-04': '11:00〜16:00'},
    }
    ev.update(over)
    return ev


def _article(**over) -> dict:
    """テスト用の公開済み記事レコードを返す。

    Args:
        over: 記事レコードに追加または上書きするフィールド。

    Returns:
        記事情報をまとめた辞書。
    """
    # 変数の内容: a: テスト対象のレコード。
    a = {
        'id': ARTICLE_ID,
        'title': '記事A',
        'content': json.dumps([
            {'type': 'text', 'value': '本文です\n次の行'},
            {'type': 'image', 'url': 'https://cdn.example.com/hero.png'},
        ]),
        'image_urls': [],
        'published_at': '2026-01-02T00:00:00+00:00',
        'created_at': '2026-01-01T00:00:00+00:00',
    }
    a.update(over)
    return a


def _product(**over) -> dict:
    """テスト用の公開商品レコードを返す。

    Args:
        over: 商品レコードに追加または上書きするフィールド。

    Returns:
        商品情報をまとめた辞書。
    """
    # 変数の内容: p: テストデータの公開商品レコード。
    p = {
        'id': PRODUCT_ID,
        'name': 'アガベ',
        'description': '## 見出し\n説明文',
        'image_urls': ['https://cdn.example.com/p.jpg'],
        'created_at': '2026-02-01T00:00:00+00:00',
    }
    p.update(over)
    return p


class FakeDB:
    """supabase クライアントの代わり。table(...).select().eq().limit().order().execute() の連鎖を受ける。

    tables: テーブル名 → 行のリスト。eq の条件で行を絞り込む。
    errors: 例外を投げるテーブル名の集合。
    calls:  execute された (テーブル名, 条件) の記録（キャッシュの確認に使う）。
    """

    def __init__(self, tables=None, errors=None):
        """指定されたテーブルデータ・例外条件を保持するテスト用 Supabase モックを初期化する。

        引数:
            tables: テスト用テーブル名の一覧。
            errors: テストで例外を発生させるテーブル名の集合。"""
        # 変数の内容: self.calls: モックの呼び出し履歴、self.errors: テスト用の例外一覧、self.tables: DB モックが返すテーブル別データ。
        self.tables = tables or {}
        # 変数の内容: self.errors: モックが投げるテーブル別の例外。
        self.errors = set(errors or [])
        # 変数の内容: self.calls: モックの呼び出し履歴。
        self.calls = []

    def table(self, name):
        """指定したテーブル名に対応するクエリモックを返す。

        引数:
            name: FakeDB から取得するテーブル名。

        戻り値:
            指定されたテーブル名に対応するクエリモックを返す。"""
        return _FakeQuery(self, name)


class _FakeQuery:
    """FakeDB のクエリ1回分。"""

    def __init__(self, db, name):
        """指定されたテーブルデータ・例外条件を保持するテスト用 Supabase モックを初期化する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            name: このクエリモックが参照するテーブル名。"""
        # 変数の内容: self.db: このクエリが参照する DB モック、self.filters: DB モックへ渡す絞り込み条件、self.name: DB モックのテーブル名。
        self.db = db
        # 変数の内容: self.name: DB モックのテーブル名。
        self.name = name
        # 変数の内容: self.filters: DB モックへ渡す絞り込み条件。
        self.filters = {}

    def select(self, *a, **k):
        """select の引数を受け取り、クエリモック自身を返す。

        Args:
            *a: 選択対象の列など、クエリに渡された位置引数。
            **k: クエリに渡されたキーワード引数。

        Returns:
            クエリモック自身。
        """
        return self

    def eq(self, key, value):
        """テーブル行の絞り込み条件を記録し、連鎖呼び出し用に自身を返す。

        引数:
            key: 読み書き対象の設定キー。
            value: 設定キーに保存する値。

        戻り値:
            eq 条件を記録してクエリモック自身を返す。"""
        self.filters[key] = value
        return self

    def limit(self, *a, **k):
        """取得件数の引数を受け取り、クエリモック自身を返す。

        Args:
            *a: limit 件数など、クエリに渡された位置引数。
            **k: クエリに渡されたキーワード引数。

        Returns:
            クエリモック自身。
        """
        return self

    def order(self, *a, **k):
        """並び順の引数を受け取り、クエリモック自身を返す。

        Args:
            *a: 並び替え対象など、クエリに渡された位置引数。
            **k: 昇順・降順などのキーワード引数。

        Returns:
            クエリモック自身。
        """
        return self

    def execute(self):
        """設定したエラーまたは結果を返すクエリ実行関数を作る。

        戻り値:
            設定した PostgREST 例外またはデータを含む応答を返す。"""
        self.db.calls.append((self.name, dict(self.filters)))
        if self.name in self.db.errors:
            raise RuntimeError(f'{self.name} の読み取りに失敗')
        # 変数の内容: res: DB クエリの実行結果、rows: DB から取得した行の一覧。
        rows = [
            r for r in self.db.tables.get(self.name, [])
            if all(r.get(k) == v for k, v in self.filters.items())
        ]
        res = MagicMock()
        # 変数の内容: res.data: モックのクエリ応答に含めるデータ。
        res.data = [dict(r) for r in rows]
        return res


def _default_db(**over) -> FakeDB:
    """イベント・画像・記事・商品が1件ずつ入った FakeDB を返す。

    Args:
        over: FakeDB の初期データを上書きするテーブル別設定。

    Returns:
        テスト用データを格納した FakeDB。
    """
    # 変数の内容: tables: テスト用テーブルデータ。
    tables = {
        'events': [_event()],
        'event_images': [
            {'event_id': EVENT_ID, 'url': 'https://cdn.example.com/a.jpg'},
            {'event_id': EVENT_ID, 'url': 'blob:http://x/1'},
            {'event_id': EVENT_ID, 'url': '/img/b.jpg'},
        ],
        # 公開済みの記事と、非公開の記事
        'articles': [
            {**_article(), 'is_published': True},
            {**_article(id='44444444-4444-4444-4444-444444444444', title='下書き'), 'is_published': False},
        ],
        'products': [
            {**_product(), 'is_published': True},
            {**_product(id='55555555-5555-5555-5555-555555555555', name='非公開商品'), 'is_published': False},
        ],
    }
    tables.update(over)
    return FakeDB(tables)


@pytest.fixture(autouse=True)
def _clear_seo_cache():
    """各テストの前後でメモリキャッシュを空にする。

    Returns:
        なし。
    """
    seo.clear_cache()
    yield
    seo.clear_cache()


@pytest.fixture(autouse=True)
def _never_real_db():
    """どのテストでも seo の DB クライアントを空の FakeDB に差し替えておく（本番へ読み取りが飛ばないようにする保険）。

    db フィクスチャや各テストの patch はこの内側でさらに差し替える。

    Returns:
        なし。
    """
    # 変数の内容: empty: 空の応答または一覧。
    empty = FakeDB()
    with patch.object(seo, 'supabase', empty), patch.object(seo, 'admin_supabase', empty):
        yield


@pytest.fixture
def db():
    """seo の supabase / admin_supabase を FakeDB に差し替える。

    Returns:
        なし。
    """
    # 変数の内容: fake: テスト用の代替オブジェクト。
    fake = _default_db()
    with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
        yield fake


# serve_spa は dist があるときだけ登録される
HAS_DIST = os.path.isfile(os.path.join(app_main.DIST, 'index.html'))
needs_dist = pytest.mark.skipif(not HAS_DIST, reason='frontend/dist/index.html が無い')


def _head(text: str) -> str:
    """HTML の <head> 部分を返す。

    Args:
        text: 検証対象のテキスト。

    Returns:
        str を返す。
    """
    return text.split('</head>')[0]


def _meta(head: str, attr: str, name: str):
    """<meta {attr}="{name}" content="..."> の content（エスケープを戻した値）を返す。無ければ None。

    Args:
        head: 検証対象の HTML head 要素。
        attr: 検証対象の HTML 属性名。
        name: meta タグの name 属性値。

    Returns:
        指定した属性名と値に一致する meta タグの content を返し、見つからない場合は None を返す。
    """
    # 変数の内容: m: 正規表現の一致結果または対象モデル。
    m = re.search(rf'<meta {attr}="{re.escape(name)}" content="([^"]*)"', head)
    return html.unescape(m.group(1)) if m else None


def _title(head: str) -> str:
    """<title> の中身（エスケープを戻した値）を返す。

    Args:
        head: 検証対象の HTML head 要素。

    Returns:
        str を返す。
    """
    # 変数の内容: titles: 抽出したページタイトルの一覧。
    titles = re.findall(r'<title>(.*?)</title>', head, flags=re.S)
    assert len(titles) == 1, f'<title> が1つではない: {titles}'
    return html.unescape(titles[0])


def _canonical(head: str):
    """canonical リンクの URL を抽出し、無ければ None を返す。

    引数:
        head: 検証対象の HTML head 要素。

    戻り値:
        head 内の canonical link の URL を返す。"""
    m = re.search(r'<link rel="canonical" href="([^"]*)"', head)
    return html.unescape(m.group(1)) if m else None


def _json_ld(head: str) -> list:
    """<script type="application/ld+json"> の中身を JSON として読んだリストを返す。

    Args:
        head: 検証対象の HTML head 要素。

    Returns:
        list を返す。
    """
    return [json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', head, flags=re.S)]


# ---------------------------------------------------------------------------
# SPA の index.html へのメタ情報の埋め込み（GET /{path}）
# ---------------------------------------------------------------------------

@needs_dist
class TestServeSpaMeta:
    """パスごとに <head> の title・description・canonical・OGP・twitter・JSON-LD が入る。"""

    def test_トップページを開くとサイト名のタイトルとOrganizationの構造化データが入る(self, db):
        """トップページを開くとサイト名のタイトルとOrganizationの構造化データが入ることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/')
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('text/html')
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(resp.text)
        assert _title(head) == 'ei8ht plants'
        assert _meta(head, 'name', 'description') == seo.STATIC_PAGES['/'].description
        assert _canonical(head) == 'https://ei8htplants.com/'
        assert _meta(head, 'property', 'og:url') == 'https://ei8htplants.com/'
        assert _meta(head, 'property', 'og:image') == seo.DEFAULT_OG_IMAGE
        assert _meta(head, 'property', 'og:site_name') == 'ei8ht plants'
        assert _meta(head, 'property', 'og:locale') == 'ja_JP'
        assert _meta(head, 'property', 'og:type') == 'website'
        # 既定のロゴなので summary
        assert _meta(head, 'name', 'twitter:card') == 'summary'
        assert _meta(head, 'name', 'robots') is None
        # 変数の内容: lds: HTML から抽出した JSON-LD の一覧。
        lds = _json_ld(head)
        assert len(lds) == 1
        assert lds[0]['@type'] == 'Organization'
        assert lds[0]['url'] == 'https://ei8htplants.com/'
        assert lds[0]['logo'] == seo.LOGO_URL

    @pytest.mark.parametrize('host,path,title,canonical,site_name', [
        ('habitatoides.com', '/', 'Habitat Oides', 'https://habitatoides.com/', 'Habitat Oides'),
        ('habitatoides.com', '/workshop', 'Habitat Style Workshop | Habitat Oides', 'https://habitatoides.com/workshop', 'Habitat Oides'),
        ('habitatoides.com', '/collaborations', 'Collaborations | Habitat Oides', 'https://habitatoides.com/collaborations', 'Habitat Oides'),
        ('huebyei8htplants.com', '/', 'HUE by ei8ht plants', 'https://huebyei8htplants.com/', 'HUE by ei8ht plants'),
    ])
    def test_ブランド専用ドメインのトップと公開ページに専用SEO情報が入る(
        self, db, host, path, title, canonical, site_name,
    ):
        """ブランド専用ドメインのトップと公開ページに専用SEO情報が入ることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            host: 接続元として設定するホスト名。
            path: 検証対象のファイルパスまたは URL パス。
            title: ページまたは記事のタイトル。
            canonical: 検証する canonical URL。
            site_name: サイト識別名。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分、resp: API から返されたレスポンス。
        resp = TestClient(app).get(path, headers={'host': host})
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == title
        assert _canonical(head) == canonical
        assert _meta(head, 'property', 'og:url') == canonical
        assert _meta(head, 'property', 'og:site_name') == site_name
        assert _meta(head, 'name', 'robots') is None

    @pytest.mark.parametrize('path,title,desc,canonical', [
        ('/', 'ei8ht plants', 'アガベ・塊根植物・灌木などビザールプランツを専門に扱うラインです。', 'https://ei8htplants.com/'),
        ('/official/brands', 'Our Brands | ei8ht plants', '植物との向き合い方から生まれた、ei8ht plants の3つのブランドをご紹介します。', 'https://ei8htplants.com/official/brands'),
        ('/official', 'ei8ht plants', seo.DEFAULT_DESCRIPTION, 'https://ei8htplants.com/official'),
        ('/official/events', 'Events | ei8ht plants', 'ei8ht plants のイベント・出展情報。ワークショップ予約も受け付けています。', 'https://ei8htplants.com/official/events'),
        ('/official/gallery', 'Gallery | ei8ht plants', 'ei8ht plants、Habitat Oides、HUE の植物ギャラリー。', 'https://ei8htplants.com/official/gallery'),
        ('/official/contact', 'Contact | ei8ht plants', 'ei8ht plants へのお問い合わせはこちらから。', 'https://ei8htplants.com/official/contact'),
        ('/official/chat', 'AI コンシェルジュ | ei8ht plants', '植物の育て方・管理のご相談や、ワークショップ・予約に関するご質問にAIがお答えします。', 'https://ei8htplants.com/official/chat'),
        ('/official/privacy', 'プライバシーポリシー | ei8ht plants', 'ei8ht plants のプライバシーポリシー（個人情報の取り扱い・アクセス解析について）', 'https://ei8htplants.com/official/privacy'),
    ])
    def test_固定ページを開くと決まったタイトルと説明が入る(self, db, path, title, desc, canonical):
        """固定ページを開くと決まったタイトルと説明が入ることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            path: 検証対象のファイルパスまたは URL パス。
            title: ページまたは記事のタイトル。
            desc: 説明文。
            canonical: 検証する canonical URL。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get(path).text)
        assert _title(head) == title
        assert _meta(head, 'property', 'og:title') == title
        assert _meta(head, 'name', 'twitter:title') == title
        assert _meta(head, 'name', 'description') == desc
        assert _meta(head, 'property', 'og:description') == desc
        assert _meta(head, 'name', 'twitter:description') == desc
        assert _canonical(head) == canonical
        assert _meta(head, 'name', 'robots') is None
        # トップでは Organization の JSON-LD を出し、その他の固定ページには付けない
        if path in {'/', '/official'}:
            assert len(_json_ld(head)) == 1
        else:
            assert _json_ld(head) == []

    def test_チャットのタイトルはサイト名が二重にならない(self, db):
        """チャットのタイトルはサイト名が二重にならないことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get('/chat').text)
        assert _title(head) == 'AI コンシェルジュ | ei8ht plants'
        assert _title(head).count('ei8ht plants') == 1

    def test_末尾スラッシュ付きでも同じ固定ページの値になりcanonicalはスラッシュなし(self, db):
        """末尾スラッシュ付きでも同じ固定ページの値になりcanonicalはスラッシュなしことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get('/official/gallery/').text)
        assert _title(head) == 'Gallery | ei8ht plants'
        assert _canonical(head) == 'https://ei8htplants.com/official/gallery'

    def test_固有画像のある固定ページはtwitter_cardがsummary_large_imageになる(self, db):
        """固有画像のある固定ページはtwitter cardがsummary large imageになることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get('/habitatoides').text)
        assert _meta(head, 'property', 'og:image') == 'https://ei8htplants.com/img/habitatOides/habitat_oides_hero.jpg'
        assert _meta(head, 'name', 'twitter:image') == 'https://ei8htplants.com/img/habitatOides/habitat_oides_hero.jpg'
        assert _meta(head, 'name', 'twitter:card') == 'summary_large_image'

    def test_events_page_pastを開くとタイトルがPast_Eventsになる(self, db):
        """events page pastを開くとタイトルがPast Eventsになることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get('/events?page=past').text)
        assert _title(head) == 'Past Events | ei8ht plants'

    def test_イベントをslugで開くとイベント名と説明と画像と構造化データが入る(self, db):
        """イベントをslugで開くとイベント名と説明と画像と構造化データが入ることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分、resp: API から返されたレスポンス。
        resp = TestClient(app).get('/events/plant-market')
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == 'Plant Market 2026 | ei8ht plants'
        assert _meta(head, 'name', 'description') == '植物の市'
        # blob: は除外され、1枚目の絶対 URL が使われる
        assert _meta(head, 'property', 'og:image') == 'https://cdn.example.com/a.jpg'
        assert _meta(head, 'name', 'twitter:card') == 'summary_large_image'
        assert _canonical(head) == 'https://ei8htplants.com/official/events/plant-market'
        # 変数の内容: ld: JSON-LD の構造化データ、lds: HTML から抽出した JSON-LD の一覧。
        lds = _json_ld(head)
        assert len(lds) == 1
        ld = lds[0]
        assert ld['@context'] == 'https://schema.org'
        assert ld['@type'] == 'Event'
        assert ld['name'] == 'Plant Market 2026'
        # 開始日は time の最初の時刻、終了日は daily_times の値の2つ目の時刻
        assert ld['startDate'] == '2026-11-03T10:00:00+09:00'
        assert ld['endDate'] == '2026-11-04T16:00:00+09:00'
        assert ld['eventStatus'] == 'https://schema.org/EventScheduled'
        assert ld['eventAttendanceMode'] == 'https://schema.org/OfflineEventAttendanceMode'
        assert ld['location'] == {
            '@type': 'Place', 'name': '代々木公園',
            'address': {'@type': 'PostalAddress', 'streetAddress': '東京都渋谷区', 'addressCountry': 'JP'},
        }
        # "/img/b.jpg" はサイトの絶対 URL になる。blob: は入らない
        assert ld['image'] == ['https://cdn.example.com/a.jpg', 'https://ei8htplants.com/img/b.jpg']
        assert ld['url'] == 'https://ei8htplants.com/official/events/plant-market'
        assert ld['description'] == '植物の市'
        assert ld['organizer']['@type'] == 'Organization'

    def test_slugのあるイベントをUUIDで開くとcanonicalとog_urlとJSON_LDのurlがslugのURLになる(self, db):
        """slugのあるイベントをUUIDで開くとcanonicalとog urlとJSON LDのurlがslugのURLになることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get(f'/events/{EVENT_ID}').text)
        assert _title(head) == 'Plant Market 2026 | ei8ht plants'
        assert _canonical(head) == 'https://ei8htplants.com/official/events/plant-market'
        assert _meta(head, 'property', 'og:url') == 'https://ei8htplants.com/official/events/plant-market'
        # 変数の内容: ld: JSON-LD の構造化データ。
        ld = _json_ld(head)[0]
        assert ld['@type'] == 'Event'
        assert ld['url'] == 'https://ei8htplants.com/official/events/plant-market'
        assert _meta(head, 'name', 'robots') is None

    def test_slugの無いイベントをUUIDで開くとcanonicalはUUIDのURLのまま(self):
        """slugの無いイベントをUUIDで開くとcanonicalはUUIDのURLのままことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(slug=None)])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: head: 解析対象の HTML head 部分。
            head = _head(TestClient(app).get(f'/events/{EVENT_ID}').text)
        assert _canonical(head) == f'https://ei8htplants.com/official/events/{EVENT_ID}'
        assert _meta(head, 'property', 'og:url') == f'https://ei8htplants.com/official/events/{EVENT_ID}'
        assert _json_ld(head)[0]['url'] == f'https://ei8htplants.com/official/events/{EVENT_ID}'

    def test_日本語のslugのイベントはcanonicalでパーセントエンコードされる(self):
        """日本語のslugのイベントはcanonicalでパーセントエンコードされることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(slug='植物')])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: head: 解析対象の HTML head 部分。
            head = _head(TestClient(app).get('/events/植物').text)
        assert _title(head) == 'Plant Market 2026 | ei8ht plants'
        assert _canonical(head) == 'https://ei8htplants.com/official/events/%E6%A4%8D%E7%89%A9'
        assert _meta(head, 'property', 'og:url') == 'https://ei8htplants.com/official/events/%E6%A4%8D%E7%89%A9'

    def test_時刻のないイベントは構造化データの日付が日付だけになる(self):
        """時刻のないイベントは構造化データの日付が日付だけになることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(time=None, daily_times=None, end_date=None)])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: head: 解析対象の HTML head 部分。
            head = _head(TestClient(app).get('/events/plant-market').text)
        # 変数の内容: ld: JSON-LD の構造化データ。
        ld = _json_ld(head)[0]
        assert ld['startDate'] == '2026-11-03'
        assert ld['endDate'] == '2026-11-03'

    def test_住所の無いイベントは構造化データを出さないがメタ情報は入る(self):
        """住所の無いイベントは構造化データを出さないがメタ情報は入ることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(address=None, page_content={'hero': {'tagline': '植物の市'}})])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: head: 解析対象の HTML head 部分。
            head = _head(TestClient(app).get('/events/plant-market').text)
        assert _json_ld(head) == []
        assert _title(head) == 'Plant Market 2026 | ei8ht plants'
        assert _canonical(head) == 'https://ei8htplants.com/official/events/plant-market'
        assert _meta(head, 'name', 'robots') is None

    def test_eventsのaddressが無くても会場ページの住所があれば構造化データを出す(self):
        """eventsのaddressが無くても会場ページの住所があれば構造化データを出すことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(address='  ', page_content={'venue': {'address': '大阪府大阪市'}})])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: head: 解析対象の HTML head 部分。
            head = _head(TestClient(app).get('/events/plant-market').text)
        # 変数の内容: ld: JSON-LD の構造化データ。
        ld = _json_ld(head)[0]
        assert ld['location']['address']['streetAddress'] == '大阪府大阪市'

    @pytest.mark.parametrize('time_value,daily,expected_start,expected_end', [
        # 開始・終了の両方の時刻が分かる → 両方とも日時
        ('10:00〜17:00', None, '2026-11-03T10:00:00+09:00', '2026-11-04T17:00:00+09:00'),
        # 開始時刻だけ分かる → 両方とも日付だけ
        ('10:00〜', None, '2026-11-03', '2026-11-04'),
        # 終了日の時刻が開始時刻だけ → 両方とも日付だけ
        ('10:00〜17:00', {'2026-11-04': '11:00'}, '2026-11-03', '2026-11-04'),
        # 開始日は時刻なし・終了日だけ時間帯あり → 両方とも日付だけ
        ('', {'2026-11-04': '11:00〜16:00'}, '2026-11-03', '2026-11-04'),
        # 時刻の表記が無い → 両方とも日付だけ
        ('終日', None, '2026-11-03', '2026-11-04'),
    ])
    def test_構造化データの開始と終了は同じ形式になる(self, time_value, daily, expected_start, expected_end):
        """構造化データの開始と終了は同じ形式になることを確認する。

        引数:
            time_value: 検証対象の時刻。
            daily: 日別の集計値。
            expected_start: 期待する開始日時。
            expected_end: 期待する終了日時。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(time=time_value, daily_times=daily)])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: head: 解析対象の HTML head 部分。
            head = _head(TestClient(app).get('/events/plant-market').text)
        # 変数の内容: ld: JSON-LD の構造化データ。
        ld = _json_ld(head)[0]
        assert ld['startDate'] == expected_start
        assert ld['endDate'] == expected_end
        # 片方だけ日時になることはない
        assert ('T' in ld['startDate']) == ('T' in ld['endDate'])

    def test_説明の無いイベントは開催日と会場が説明になる(self):
        """説明の無いイベントは開催日と会場が説明になることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(page_content=None)], event_images=[])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: head: 解析対象の HTML head 部分。
            head = _head(TestClient(app).get('/events/plant-market').text)
        assert _meta(head, 'name', 'description') == '2026年11月3日〜4日 / 代々木公園'
        # 画像が無いときは既定のロゴと summary
        assert _meta(head, 'property', 'og:image') == seo.DEFAULT_OG_IMAGE
        assert _meta(head, 'name', 'twitter:card') == 'summary'
        assert _json_ld(head)[0]['image'] == [seo.DEFAULT_OG_IMAGE]

    def test_長いイベント説明は120文字で切られて末尾に省略記号が付く(self):
        """長いイベント説明は120文字で切られて末尾に省略記号が付くことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト、long: 上限超過を確認する長文。
        long = 'あ' * 300
        fake = _default_db(events=[_event(page_content={'concept': long})])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: head: 解析対象の HTML head 部分。
            head = _head(TestClient(app).get('/events/plant-market').text)
        # 変数の内容: desc: ページ説明文。
        desc = _meta(head, 'name', 'description')
        assert len(desc) == 120
        assert desc.endswith('…')

    @pytest.mark.parametrize('path', ['/events/nope', f'/events/{MISSING_ID}', '/events/%3Cscript%3E'])
    def test_存在しないイベントは既定値で200を返しnoindexでcanonicalなし構造化データなし(self, db, path):
        """存在しないイベントは既定値で200を返しnoindexでcanonicalなし構造化データなしことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分、resp: API から返されたレスポンス。
        resp = TestClient(app).get(path)
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == 'ei8ht plants'
        assert _meta(head, 'name', 'description') == seo.DEFAULT_DESCRIPTION
        assert _json_ld(head) == []
        # ソフト 404 対策: noindex を入れ、canonical は入れない（og:url は残る）
        assert _meta(head, 'name', 'robots') == 'noindex'
        assert _canonical(head) is None
        assert _meta(head, 'property', 'og:url', ).startswith('https://ei8htplants.com/official/events/')

    def test_UUIDでないイベントキーはidでの検索をしない(self, db):
        """UUIDでないイベントキーはidでの検索をしないことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        TestClient(app).get('/events/nope')
        # 変数の内容: event_calls: イベントテーブルの DB 呼び出し記録。
        event_calls = [c for c in db.calls if c[0] == 'events']
        assert event_calls == [('events', {'slug': 'nope'})]

    def test_公開済みの記事を開くと記事名とJournalのタイトルと本文の冒頭と画像が入る(self, db):
        """公開済みの記事を開くと記事名とJournalのタイトルと本文の冒頭と画像が入ることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get(f'/journal/{ARTICLE_ID}').text)
        assert _title(head) == '記事A | Journal | ei8ht plants'
        assert _meta(head, 'name', 'description') == '本文です 次の行'
        assert _meta(head, 'property', 'og:image') == 'https://cdn.example.com/hero.png'
        assert _canonical(head) == f'https://ei8htplants.com/official/journal/{ARTICLE_ID}'
        assert _json_ld(head) == []

    @pytest.mark.parametrize('path', [
        '/journal/44444444-4444-4444-4444-444444444444',  # 非公開
        f'/journal/{MISSING_ID}',  # 存在しない
        '/journal/not-a-uuid',  # 不正な ID
    ])
    def test_非公開や存在しない記事は既定値で200を返しnoindexでcanonicalなし(self, db, path):
        """非公開や存在しない記事は既定値で200を返しnoindexでcanonicalなしことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分、resp: API から返されたレスポンス。
        resp = TestClient(app).get(path)
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == 'ei8ht plants'
        assert _meta(head, 'name', 'robots') == 'noindex'
        assert _canonical(head) is None
        assert '下書き' not in resp.text

    def test_不正な記事IDではDBを読まない(self, db):
        """不正な記事IDではDBを読まないことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        TestClient(app).get('/journal/not-a-uuid')
        assert [c for c in db.calls if c[0] == 'articles'] == []

    def test_公開中の商品を開くと商品名とShopのタイトルと説明と画像が入る(self, db):
        """公開中の商品を開くと商品名とShopのタイトルと説明と画像が入ることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get(f'/shop/{PRODUCT_ID}').text)
        assert _title(head) == 'アガベ | Shop | ei8ht plants'
        # 古いテキスト形式（## 見出し）も読める
        assert _meta(head, 'name', 'description') == '見出し 説明文'
        assert _meta(head, 'property', 'og:image') == 'https://cdn.example.com/p.jpg'

    @pytest.mark.parametrize('path', [
        '/shop/55555555-5555-5555-5555-555555555555',  # 非公開
        f'/shop/{MISSING_ID}',
        '/shop/not-uuid',
    ])
    def test_非公開や存在しない商品は既定値で200を返しnoindexでcanonicalなし(self, db, path):
        """非公開や存在しない商品は既定値で200を返しnoindexでcanonicalなしことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分、resp: API から返されたレスポンス。
        resp = TestClient(app).get(path)
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == 'ei8ht plants'
        assert _meta(head, 'name', 'robots') == 'noindex'
        assert _canonical(head) is None
        assert '非公開商品' not in resp.text

    @pytest.mark.parametrize('path', [
        '/admin', '/admin/events', '/admin/events/abc/edit',
        '/cancel', '/cancel/xyz', '/checkout', '/order/complete',
    ])
    def test_管理画面や手続きのページにはnoindexが入る(self, db, path):
        """管理画面や手続きのページにはnoindexが入ることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分、resp: API から返されたレスポンス。
        resp = TestClient(app).get(path)
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _meta(head, 'name', 'robots') == 'noindex'

    @pytest.mark.parametrize('path', ['/admin', '/admin/events', '/admin/events/abc/edit'])
    def test_管理画面にはcanonicalが入らない(self, db, path):
        """管理画面にはcanonicalが入らないことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get(path).text)
        assert _canonical(head) is None

    @pytest.mark.parametrize('path', ['/official/cancel', '/official/checkout', '/official/order/complete'])
    def test_現行の手続き画面はnoindexで正規URLのcanonicalが入る(self, db, path):
        """現行の手続き画面はnoindexで正規URLのcanonicalが入ることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get(path).text)
        assert _meta(head, 'name', 'robots') == 'noindex'
        assert _canonical(head) == f'https://ei8htplants.com{path}'


    @pytest.mark.parametrize('path', ['/administrator', '/orders-info', '/cancellation', '/checkouts', '/admins/x'])
    def test_接頭辞が似ているだけのパスは除外対象と判定されない(self, path):
        # 不明なパスはどのみちソフト 404 として noindex になるので、判定の関数そのもので確かめる
        """接頭辞が似ているだけのパスは除外対象と判定されないことを確認する。

        引数:
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        assert seo._is_noindex(path) is False

    @pytest.mark.parametrize('path', ['/admin', '/admin/x', '/cancel', '/cancel/abc', '/checkout', '/order', '/order/complete'])
    def test_除外対象のパスと配下は除外対象と判定される(self, path):
        """除外対象のパスと配下は除外対象と判定されることを確認する。

        引数:
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        assert seo._is_noindex(path) is True

    def test_不明なパスは既定のタイトルと説明で200を返しnoindexでcanonicalなし(self, db):
        """不明なパスは既定のタイトルと説明で200を返しnoindexでcanonicalなしことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分、resp: API から返されたレスポンス。
        resp = TestClient(app).get('/unknown/page/here')
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == 'ei8ht plants'
        assert _meta(head, 'name', 'description') == seo.DEFAULT_DESCRIPTION
        assert _meta(head, 'name', 'robots') == 'noindex'
        assert _canonical(head) is None
        assert _meta(head, 'property', 'og:url') == 'https://ei8htplants.com/unknown/page/here'

    def test_元のindex_htmlのtitleは置き換えられて1つだけになる(self, db):
        """元のindex htmlのtitleは置き換えられて1つだけになることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: text: 生成または解析する本文。
        text = TestClient(app).get('/events').text
        assert text.count('<title>') == 1
        # 元の index.html の script などは残る
        assert '<div id="root">' in text

    def test_イベント名や説明に含まれる記号はHTMLエスケープされる(self):
        """イベント名や説明に含まれる記号はHTMLエスケープされることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(
            name=DANGEROUS_NAME,
            page_content={'hero': {'tagline': '植物の市 </script><script>alert(1)</script>'}},
        )])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: text: 生成または解析する本文。
            text = TestClient(app).get('/events/plant-market').text
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(text)
        # 生の値はどこにも出ない
        assert '<Market>' not in head
        assert '<script>alert(1)' not in head
        assert 'alert(1)</script>' not in head
        # title はエスケープされた形で入る
        assert '<title>Plant &lt;Market&gt; &quot;2026&quot; &amp; &#x27;x&#x27;&lt;/script&gt; | ei8ht plants</title>' in head
        # 属性値の中にエスケープされていない " が無い（属性が途中で閉じない）
        assert _meta(head, 'property', 'og:title') == f'{DANGEROUS_NAME} | ei8ht plants'
        assert _meta(head, 'name', 'description').startswith('植物の市 </script>')

    def test_構造化データはscriptを閉じる文字列を含まず読み戻すと元の値になる(self):
        """構造化データはscriptを閉じる文字列を含まず読み戻すと元の値になることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(
            name=DANGEROUS_NAME + '\u2028\u2029<!--',
            page_content={'hero': {'tagline': '</script><script>alert(1)</script>'}},
        )])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: head: 解析対象の HTML head 部分。
            head = _head(TestClient(app).get('/events/plant-market').text)
        # 変数の内容: body: リクエスト本文、raw: エスケープ前または加工前の値。
        raw = re.findall(r'<script type="application/ld\+json">(.*?)</script>', head, flags=re.S)
        assert len(raw) == 1
        body = raw[0]
        # < > & と U+2028/2029 は生で入らない
        for ch in ('<', '>', '&', '\u2028', '\u2029'):
            assert ch not in body
        assert '\\u003c' in body and '\\u003e' in body and '\\u0026' in body
        assert '\\u2028' in body and '\\u2029' in body
        # 変数の内容: ld: JSON-LD の構造化データ。
        ld = json.loads(body)
        assert ld['name'] == DANGEROUS_NAME + '\u2028\u2029<!--'
        assert ld['description'].startswith('</script><script>alert(1)')

    def test_日本語を含む存在しないパスはog_urlでパーセントエンコードされる(self, db):
        """日本語を含む存在しないパスはog urlでパーセントエンコードされることを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分。
        head = _head(TestClient(app).get('/events/植物').text)
        assert _meta(head, 'property', 'og:url') == 'https://ei8htplants.com/official/events/%E6%A4%8D%E7%89%A9'
        assert _canonical(head) is None

    def test_HTMLにはキャッシュ制御とセキュリティヘッダーが付く(self, db):
        """HTMLにはキャッシュ制御とセキュリティヘッダーが付くことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/events/plant-market')
        assert resp.headers['cache-control'] == 'public, s-maxage=60, max-age=0, must-revalidate'
        assert resp.headers['x-frame-options'] == 'SAMEORIGIN'
        assert resp.headers['x-content-type-options'] == 'nosniff'
        assert resp.headers['strict-transport-security'] == 'max-age=31536000'

    def test_distにある静的ファイルはそのまま返す(self, db):
        """distにある静的ファイルはそのまま返すことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/manifest.webmanifest')
        assert resp.status_code == 200
        assert '<title>' not in resp.text
        assert db.calls == []

    def test_DBの読み取りで例外が出たら既定値のメタ情報で200を返す(self):
        """DBの読み取りで例外が出たら既定値のメタ情報で200を返すことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = FakeDB(errors={'events', 'articles', 'products'})
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: client: テスト対象の API クライアント。
            client = TestClient(app)
            # 変数の内容: path: 現在処理するファイルまたは URL パス。
            for path in ('/events/plant-market', f'/journal/{ARTICLE_ID}', f'/shop/{PRODUCT_ID}'):
                # 変数の内容: head: 解析対象の HTML head 部分、resp: API から返されたレスポンス。
                resp = client.get(path)
                assert resp.status_code == 200
                head = _head(resp.text)
                assert _title(head) == 'ei8ht plants'
                assert _meta(head, 'name', 'description') == seo.DEFAULT_DESCRIPTION
                # 一時的な失敗なので noindex は付けず、canonical は入れる
                assert _meta(head, 'name', 'robots') is None
                assert _canonical(head) == f'https://ei8htplants.com/official{path}'

    def test_埋め込み処理で例外が出たらindex_htmlをそのまま返す(self, db):
        """埋め込み処理で例外が出たらindex htmlをそのまま返すことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: f: 読み書きするファイルまたは応答。
        with open(app_main.INDEX_HTML, encoding='utf-8') as f:
            # 変数の内容: original: 変更前の元データ。
            original = f.read()
        with patch.object(seo, 'render_spa_index', side_effect=RuntimeError('boom')):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/events/plant-market')
        assert resp.status_code == 200
        assert resp.text == original
        assert resp.headers['content-type'].startswith('text/html')


# ---------------------------------------------------------------------------
# メモリキャッシュ
# ---------------------------------------------------------------------------

@needs_dist
class TestLegacyStructuredDataConstants:
    """seo.py に残す互換定数の差し替えが関数ラッパーへ反映される。"""

    @pytest.mark.parametrize('limit,expected', [
        (1, '…'),
        (2, 'あ…'),
        (5, 'あいうえ…'),
        (10, 'あいうえおかきくけ…'),
    ])
    def test_DESCRIPTION_MAX_LENを差し替えるとイベント説明の長さに反映される(
        self, monkeypatch, limit, expected,
    ):
        """DESCRIPTION MAX LENを差し替えるとイベント説明の長さに反映されることを確認する。

        引数:
            monkeypatch: 環境変数や属性を一時差し替えする pytest フィクスチャ。
            limit: 取得件数または許容上限。
            expected: 検証する期待値。

        戻り値:
            なし。"""
        monkeypatch.setattr(seo, 'DESCRIPTION_MAX_LEN', limit)
        # 変数の内容: event: 処理対象のイベント。
        event = {'page_content': {'hero': {'tagline': 'あいうえおかきくけこさしすせそ'}}}
        assert seo._event_description(event) == expected

    @pytest.mark.parametrize('max_images,expected_count', [
        (0, 1),
        (1, 1),
        (3, 3),
        (7, 7),
    ])
    def test_EVENT_JSONLD_MAX_IMAGESを差し替えると画像の上限に反映される(
        self, monkeypatch, max_images, expected_count,
    ):
        """EVENT JSONLD MAX IMAGESを差し替えると画像の上限に反映されることを確認する。

        引数:
            monkeypatch: 環境変数や属性を一時差し替えする pytest フィクスチャ。
            max_images: 許可する画像の最大数。
            expected_count: 期待する件数。

        戻り値:
            なし。"""
        monkeypatch.setattr(seo, 'EVENT_JSONLD_MAX_IMAGES', max_images)
        # 変数の内容: event: 処理対象のイベント、images: 対象画像の一覧、ld: JSON-LD の構造化データ、meta: ページの title・description・画像などの SEO 情報。
        images = [f'https://cdn.example.com/{index}.jpg' for index in range(7)]
        event = _event(image_urls=images)
        meta = seo.PageMeta(
            title='Plant Market | ei8ht plants',
            description='イベント説明',
            image=images[0],
            url='https://ei8htplants.com/official/events/plant-market',
        )
        ld = seo._event_json_ld(event, meta)
        assert ld is not None
        assert len(ld['image']) == expected_count
        if max_images == 0:
            assert ld['image'] == [seo.DEFAULT_OG_IMAGE]

    @pytest.mark.parametrize('pattern,time_text,expected_start,expected_end', [
        (r'(\d{2})h(\d{2})', '09h15〜17h30', '2026-11-03T09:15:00+09:00', '2026-11-04T17:30:00+09:00'),
        (r'(\d{1,2})時(\d{2})分', '9時05分〜17時10分', '2026-11-03T09:05:00+09:00', '2026-11-04T17:10:00+09:00'),
        (r'(\d{2})\.(\d{2})', '09.20〜16.40', '2026-11-03T09:20:00+09:00', '2026-11-04T16:40:00+09:00'),
        (r'(\d{2})_(\d{2})', '10_00〜18_15', '2026-11-03T10:00:00+09:00', '2026-11-04T18:15:00+09:00'),
        (r'(\d{2})-(\d{2})', '09-30〜17-00', '2026-11-03T09:30:00+09:00', '2026-11-04T17:00:00+09:00'),
    ])
    def test_TIME_REを差し替えるとEventの開始終了時刻に反映される(
        self, monkeypatch, pattern, time_text, expected_start, expected_end,
    ):
        """TIME REを差し替えるとEventの開始終了時刻に反映されることを確認する。

        引数:
            monkeypatch: 環境変数や属性を一時差し替えする pytest フィクスチャ。
            pattern: 検証に使う正規表現パターン。
            time_text: 時刻を表す文字列。
            expected_start: 期待する開始日時。
            expected_end: 期待する終了日時。

        戻り値:
            なし。"""
        monkeypatch.setattr(seo, '_TIME_RE', re.compile(pattern))
        # 変数の内容: event: 処理対象のイベント、ld: JSON-LD の構造化データ、meta: ページの title・description・画像などの SEO 情報。
        event = _event(time=time_text, daily_times=None)
        meta = seo.PageMeta(
            title='Plant Market | ei8ht plants',
            description='イベント説明',
            image=seo.DEFAULT_OG_IMAGE,
            url='https://ei8htplants.com/official/events/plant-market',
        )
        ld = seo._event_json_ld(event, meta)
        assert ld is not None
        assert ld['startDate'] == expected_start
        assert ld['endDate'] == expected_end


class TestSeoCache:
    """イベント・記事・商品の読み取りは 60 秒キャッシュされる。"""

    def test_同じイベントを2回開いてもDBは1回しか読まない(self, db):
        """同じイベントを2回開いてもDBは1回しか読まないことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: client: API 応答を取得する TestClient、n: Supabase モックの呼び出し回数。
        client = TestClient(app)
        client.get('/events/plant-market')
        n = len(db.calls)
        assert n > 0
        client.get('/events/plant-market')
        assert len(db.calls) == n

    def test_存在しないイベントも覚えておき2回目はDBを読まない(self, db):
        """存在しないイベントも覚えておき2回目はDBを読まないことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: client: API 応答を取得する TestClient、n: Supabase モックの呼び出し回数。
        client = TestClient(app)
        client.get('/events/nope')
        n = len(db.calls)
        client.get('/events/nope')
        assert len(db.calls) == n

    def test_clear_cacheを呼ぶとDBの最新の値を読み直す(self, db):
        """clear cacheを呼ぶとDBの最新の値を読み直すことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: client: テスト対象の API クライアント。
        client = TestClient(app)
        client.get('/events/plant-market')
        db.tables['events'] = [_event(name='名前を変更')]
        # キャッシュ中は古い名前のまま
        assert _title(_head(client.get('/events/plant-market').text)) == 'Plant Market 2026 | ei8ht plants'
        seo.clear_cache()
        assert _title(_head(client.get('/events/plant-market').text)) == '名前を変更 | ei8ht plants'

    def test_期限の60秒を過ぎるとDBを読み直す(self, db):
        """期限の60秒を過ぎるとDBを読み直すことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: client: テスト対象の API クライアント。
        client = TestClient(app)
        with patch.object(seo.time, 'monotonic', return_value=1000.0):
            client.get(f'/journal/{ARTICLE_ID}')
        # 変数の内容: n: Supabase モックの呼び出し回数。
        n = len(db.calls)
        with patch.object(seo.time, 'monotonic', return_value=1059.0):
            client.get(f'/journal/{ARTICLE_ID}')
        assert len(db.calls) == n
        with patch.object(seo.time, 'monotonic', return_value=1061.0):
            client.get(f'/journal/{ARTICLE_ID}')
        assert len(db.calls) == n + 1

    def test_キャッシュの件数は上限を超えない(self):
        """キャッシュの件数は上限を超えないことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: cache: 対象キャッシュの値。
        cache = seo._TTLCache(ttl=60, max_entries=3)
        # 変数の内容: i: 現在処理する一覧要素の番号。
        for i in range(10):
            cache.set(i, i)
        assert len(cache._data) <= 3
        # 最後に入れたものは残る
        assert cache.get(9) == (True, 9)
        assert cache.get(0) == (False, None)

    def test_Noneの値も見つかったものとして返す(self):
        """Noneの値も見つかったものとして返すことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: cache: 対象キャッシュの値。
        cache = seo._TTLCache(ttl=60, max_entries=10)
        cache.set('k', None)
        assert cache.get('k') == (True, None)
        assert cache.get('other') == (False, None)


# ---------------------------------------------------------------------------
# 埋め込みの部品（dist が無くても動く）
# ---------------------------------------------------------------------------

class TestSeoHelpers:
    """inject_head・_json_for_script の単体の動き。"""

    def test_titleが無いindex_htmlではhead閉じタグの前に入れる(self):
        """titleが無いindex htmlではhead閉じタグの前に入れることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: meta: ページの title・description・画像などの SEO 情報、out: 組み立てた出力内容。
        meta = seo._make_meta('/gallery', 'Gallery', None, None)
        out = seo.inject_head('<html><head><meta charset="utf-8"></head><body></body></html>', meta)
        assert '<title>Gallery | ei8ht plants</title>' in out
        assert out.index('<title>') < out.index('</head>')

    def test_置き換え文字列のバックスラッシュが正規表現として解釈されない(self):
        """置き換え文字列のバックスラッシュが正規表現として解釈されないことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: meta: ページの title・description・画像などの SEO 情報、out: 組み立てた出力内容。
        meta = seo._make_meta('/x', 'a\\1\\g<0>', None, None)
        out = seo.inject_head('<head><title>old</title></head>', meta)
        assert '<title>a\\1\\g&lt;0&gt; | ei8ht plants</title>' in out
        assert 'old' not in out

    def test_json_for_scriptは危険な文字をすべてエスケープする(self):
        """json for scriptは危険な文字をすべてエスケープすることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: s: 現在処理する行または文字列。
        s = seo._json_for_script({'v': '</script><!-- & \u2028\u2029'})
        assert s == '{"v":"\\u003c/script\\u003e\\u003c!-- \\u0026 \\u2028\\u2029"}'
        assert json.loads(s) == {'v': '</script><!-- & \u2028\u2029'}


# ---------------------------------------------------------------------------
# robots.txt
# ---------------------------------------------------------------------------

class TestRobotsTxt:
    """GET /robots.txt"""

    def test_robots_txtはtext_plainで管理画面などをDisallowしSitemap行を含む(self):
        """robots txtはtext plainで管理画面などをDisallowしSitemap行を含むことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/robots.txt')
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('text/plain')
        # 変数の内容: lines: 本文や応答に使う行の一覧。
        lines = resp.text.splitlines()
        assert 'User-agent: *' in lines
        assert 'Allow: /' in lines
        # 変数の内容: p: robots.txt で拒否対象として検証する URL パス。
        for p in ('/admin', '/cancel', '/checkout', '/order'):
            assert f'Disallow: {p}' in lines
        assert 'Sitemap: https://ei8htplants.com/sitemap.xml' in lines

    def test_robots_txtはapiをDisallowしない(self):
        """robots txtはapiをDisallowしないことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: disallows: robots.txt から抽出した除外パス一覧、text: 生成または解析する本文。
        text = TestClient(app).get('/robots.txt').text
        assert 'Disallow: /api' not in text
        disallows = [l for l in text.splitlines() if l.startswith('Disallow:')]
        assert disallows == [f'Disallow: {path}' for path in seo.ROBOTS_DISALLOW]

    def test_robots_txtはindex_htmlではない(self):
        """robots txtはindex htmlではないことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: text: 生成または解析する本文。
        text = TestClient(app).get('/robots.txt').text
        assert '<html' not in text.lower()

    @pytest.mark.parametrize('host,origin', [
        ('habitatoides.com', 'https://habitatoides.com'),
        ('www.habitatoides.com', 'https://habitatoides.com'),
        ('huebyei8htplants.com', 'https://huebyei8htplants.com'),
        ('www.huebyei8htplants.com', 'https://huebyei8htplants.com'),
    ])
    def test_ブランドドメインのrobotsは同じブランドのsitemapを案内する(self, host, origin):
        """ブランドドメインのrobotsは同じブランドのsitemapを案内することを確認する。

        引数:
            host: 接続元として設定するホスト名。
            origin: リクエスト元または生成 URL の origin。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/robots.txt', headers={'host': host})
        assert resp.status_code == 200
        assert f'Sitemap: {origin}/sitemap.xml' in resp.text.splitlines()


class TestRobotsTxtPureFunctions:
    """robots.txt のホスト解決と本文生成を行う純関数。"""

    @pytest.mark.parametrize('hostname,origin', [
        ('habitatoides.com', 'https://habitatoides.com'),
        ('www.habitatoides.com', 'https://habitatoides.com'),
        ('huebyei8htplants.com', 'https://huebyei8htplants.com'),
        ('www.huebyei8htplants.com', 'https://huebyei8htplants.com'),
        ('WWW.HABITATOIDES.COM:443', 'https://habitatoides.com'),
    ])
    def test_許可されたブランドホストはwwwの有無にかかわらず正規sitemapを案内する(self, hostname, origin):
        """許可されたブランドのホスト名から対応する正規 Sitemap URL を選ぶことを確認する。

        引数:
            hostname: robots.txt の Sitemap 選択に使う Host 名。
            origin: 期待するブランドの正規 origin。

        戻り値:
            なし。
        """
        # 変数の内容: text: pure function が生成する robots.txt 本文。
        text = seo_robots.build_robots_txt(
            hostname, seo.ROBOTS_DISALLOW, seo.BRAND_DOMAINS, seo.SITE_ORIGIN,
        )
        assert f'Sitemap: {origin}/sitemap.xml' in text.splitlines()

    @pytest.mark.parametrize('hostname', [
        'unknown.example',
        'www.habitatoides.com.attacker.example',
        'habitatoides.com:garbage',
        'habitatoides.com:443.attacker.example',
        'habitatoides.com:65536',
        '',
    ])
    def test_未知のホストは本体サイトのsitemapへfallbackする(self, hostname):
        """許可リストにないホストを Sitemap URL に使わないことを確認する。

        引数:
            hostname: 許可リストにない Host 名。

        戻り値:
            なし。
        """
        # 変数の内容: text: pure function が生成する robots.txt 本文。
        text = seo_robots.build_robots_txt(
            hostname, seo.ROBOTS_DISALLOW, seo.BRAND_DOMAINS, seo.SITE_ORIGIN,
        )
        assert f'Sitemap: {seo.SITE_ORIGIN}/sitemap.xml' in text.splitlines()
        assert 'Sitemap: https://habitatoides.com/sitemap.xml' not in text.splitlines()

    def test_本文はdirectiveの順序と完全なDisallow一覧を保ちapiを除外せず末尾改行を付ける(self):
        """robots.txt 本文の directive、拒否対象、API の扱い、末尾改行を確認する。

        戻り値:
            なし。
        """
        # 変数の内容: origin: Sitemap の案内先に使う正規 origin。
        origin = 'https://habitatoides.com'
        # 変数の内容: expected_lines: 生成本文に含める行を仕様順に並べた一覧。
        expected_lines = [
            'User-agent: *',
            'Allow: /',
            *[f'Disallow: {path}' for path in seo.ROBOTS_DISALLOW],
            '',
            f'Sitemap: {origin}/sitemap.xml',
        ]

        # 1. 先頭から Sitemap までの directive と順番を確認する。
        # 2. 末尾改行と /api を拒否対象に含めない仕様を確認する。
        text = seo_robots.build_robots_txt(
            'www.habitatoides.com', seo.ROBOTS_DISALLOW, seo.BRAND_DOMAINS, seo.SITE_ORIGIN,
        )
        assert text == '\n'.join(expected_lines) + '\n'
        assert [line for line in text.splitlines() if line.startswith('Disallow:')] == [
            f'Disallow: {path}' for path in seo.ROBOTS_DISALLOW
        ]
        assert 'Disallow: /api' not in text.splitlines()
        assert text.splitlines()[0:2] == ['User-agent: *', 'Allow: /']


# ---------------------------------------------------------------------------
# sitemap.xml
# ---------------------------------------------------------------------------

def _locs(xml: str) -> list:
    """サイトマップ XML から loc 要素の値を抽出する。

    引数:
        xml: 解析対象の sitemap XML。

    戻り値:
        サイトマップ XML に含まれる loc URL の一覧を返す。"""
    return re.findall(r'<loc>(.*?)</loc>', xml)


class TestSitemapXml:
    """GET /sitemap.xml"""

    def test_sitemapは固定ページとイベントと公開記事と公開商品を含む(self, db):
        """sitemapは固定ページとイベントと公開記事と公開商品を含むことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/sitemap.xml')
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('application/xml')
        # 変数の内容: xml: 生成した sitemap XML。
        xml = resp.text
        assert xml.startswith('<?xml version="1.0" encoding="UTF-8"?>')
        assert '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' in xml
        # 変数の内容: locs: サイトマップから抽出した URL 一覧。
        locs = _locs(xml)
        # 変数の内容: p: sitemap に含める固定ページの URL パス。
        for p in seo.SITEMAP_STATIC_PATHS:
            assert f'https://ei8htplants.com{p}' in locs
        # ブランド専用ドメインへ転送する旧URLは載せず、現在のブランド階層を掲載する。
        assert all(f'https://ei8htplants.com{p}' not in locs for p in ('/habitatoides', '/habitatoides/workshop', '/hue'))
        assert all(f'https://ei8htplants.com{p}' in locs for p in ('/', '/about', '/plants', '/official', '/official/brands'))
        # 公開ページ以外・予約は入らない
        for p in ('/admin', '/cancel', '/checkout', '/reserve', '/order/complete'):
            assert f'https://ei8htplants.com{p}' not in locs
        assert 'https://ei8htplants.com/official/events/plant-market' in locs
        assert f'https://ei8htplants.com/official/journal/{ARTICLE_ID}' in locs
        assert f'https://ei8htplants.com/official/shop/{PRODUCT_ID}' in locs
        # 非公開は入らない
        assert 'https://ei8htplants.com/official/journal/44444444-4444-4444-4444-444444444444' not in locs
        assert 'https://ei8htplants.com/official/shop/55555555-5555-5555-5555-555555555555' not in locs

    def test_記事と商品にはlastmodの日付が付く(self, db):
        """記事と商品にはlastmodの日付が付くことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: xml: 生成した sitemap XML。
        xml = TestClient(app).get('/sitemap.xml').text
        assert f'<loc>https://ei8htplants.com/official/journal/{ARTICLE_ID}</loc><lastmod>2026-01-02</lastmod>' in xml
        assert f'<loc>https://ei8htplants.com/official/shop/{PRODUCT_ID}</loc><lastmod>2026-02-01</lastmod>' in xml

    def test_slugの無いイベントはidのURLになる(self):
        """slugの無いイベントはidのURLになることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(slug=None)])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: locs: サイトマップから抽出した URL 一覧。
            locs = _locs(TestClient(app).get('/sitemap.xml').text)
        assert f'https://ei8htplants.com/official/events/{EVENT_ID}' in locs

    def test_URLに入る記号はXMLエスケープされる(self):
        """URLに入る記号はXMLエスケープされることを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db(events=[_event(slug='a&b')])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: xml: 生成した sitemap XML。
            xml = TestClient(app).get('/sitemap.xml').text
        assert '<loc>https://ei8htplants.com/official/events/a%26b</loc>' in xml or \
            '<loc>https://ei8htplants.com/official/events/a&amp;b</loc>' in xml
        assert 'a&b' not in xml

    def test_sitemapは60秒キャッシュされ2回目はDBを読まない(self, db):
        """sitemapは60秒キャッシュされ2回目はDBを読まないことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: client: API 応答を取得する TestClient、n: Supabase モックの呼び出し回数。
        client = TestClient(app)
        client.get('/sitemap.xml')
        n = len(db.calls)
        client.get('/sitemap.xml')
        assert len(db.calls) == n

    def test_一部の読み取りに失敗しても読めた分を返しキャッシュしない(self):
        """一部の読み取りに失敗しても読めた分を返しキャッシュしないことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = _default_db()
        # 変数の内容: fake.errors: テスト用の例外一覧。
        fake.errors = {'articles'}
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: client: テスト対象の API クライアント、locs: サイトマップから抽出した URL 一覧、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/sitemap.xml')
            assert resp.status_code == 200
            locs = _locs(resp.text)
            assert 'https://ei8htplants.com/official/events/plant-market' in locs
            assert f'https://ei8htplants.com/official/shop/{PRODUCT_ID}' in locs
            assert not any('/official/journal/' in l for l in locs)
            # キャッシュされていないので、失敗が直ると次で記事も入る
            fake.errors = set()
            # 変数の内容: locs2: 別応答から抽出した sitemap URL 一覧。
            locs2 = _locs(client.get('/sitemap.xml').text)
            assert f'https://ei8htplants.com/official/journal/{ARTICLE_ID}' in locs2

    def test_全部の読み取りに失敗しても固定ページだけで返す(self):
        """全部の読み取りに失敗しても固定ページだけで返すことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: fake: テスト用の代替オブジェクト。
        fake = FakeDB(errors={'events', 'articles', 'products'})
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/sitemap.xml')
        assert resp.status_code == 200
        assert len(_locs(resp.text)) == len(seo.SITEMAP_STATIC_PATHS)

    @pytest.mark.parametrize('host,origin,paths', [
        ('habitatoides.com', 'https://habitatoides.com', ('/', '/workshop', '/collaborations')),
        ('huebyei8htplants.com', 'https://huebyei8htplants.com', ('/', '/about', '/choose', '/living')),
    ])
    def test_ブランド専用サイトのsitemapは自ブランドの公開URLだけを含む(self, host, origin, paths):
        """ブランド専用サイトのsitemapは自ブランドの公開URLだけを含むことを確認する。

        引数:
            host: 接続元として設定するホスト名。
            origin: リクエスト元または生成 URL の origin。
            paths: 検証対象のファイルパス一覧。

        戻り値:
            なし。"""
        # 変数の内容: locs: サイトマップから抽出した URL 一覧、resp: API から返されたレスポンス。
        resp = TestClient(app).get('/sitemap.xml', headers={'host': host})
        assert resp.status_code == 200
        locs = _locs(resp.text)
        assert locs == [f'{origin}{path}' for path in paths]
        assert all(not loc.startswith('https://ei8htplants.com/') for loc in locs)

    @pytest.mark.parametrize('path,title', [
        ('/about', 'HUEについて | HUE by ei8ht plants'),
        ('/choose', '一鉢の選び方 | HUE by ei8ht plants'),
        ('/living', '植物のある部屋 | HUE by ei8ht plants'),
    ])
    def test_HUEの各編集ページに正規canonicalと個別メタ情報を返す(self, db, path, title):
        """HUEの各編集ページに正規canonicalと個別メタ情報を返すことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            path: 検証対象のファイルパスまたは URL パス。
            title: ページまたは記事のタイトル。

        戻り値:
            なし。"""
        # 変数の内容: head: 解析対象の HTML head 部分、resp: API から返されたレスポンス。
        resp = TestClient(app).get(path, headers={'host': 'huebyei8htplants.com'})
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == title
        assert _canonical(head) == f'https://huebyei8htplants.com{path}'
        assert _meta(head, 'property', 'og:url') == f'https://huebyei8htplants.com{path}'
        assert _meta(head, 'name', 'robots') is None


@needs_dist
class TestLegacyBrandRedirects:
    """既存ドメインのブランド旧URLを正規ドメインへ転送する。"""

    @pytest.mark.parametrize('path,destination', [
        ('/habitatoides', 'https://habitatoides.com/'),
        ('/habitatoides/workshop', 'https://habitatoides.com/workshop'),
        ('/collaborations', 'https://habitatoides.com/collaborations'),
        ('/hue', 'https://huebyei8htplants.com/'),
    ])
    def test_旧ブランドURLは専用ドメインへ301転送する(self, path, destination):
        """旧ブランドURLは専用ドメインへ301転送することを確認する。

        引数:
            path: 検証対象のファイルパスまたは URL パス。
            destination: ファイルの保存先。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get(path, headers={'host': 'ei8htplants.com'}, follow_redirects=False)
        assert resp.status_code == 301
        assert resp.headers['location'] == destination

    def test_旧ブランドURLのクエリ文字列を転送先へ引き継ぐ(self):
        """旧ブランドURLのクエリ文字列を転送先へ引き継ぐことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get(
            '/habitatoides/workshop?source=legacy&lang=en',
            headers={'host': 'www.ei8htplants.com'}, follow_redirects=False,
        )
        assert resp.status_code == 301
        assert resp.headers['location'] == 'https://habitatoides.com/workshop?source=legacy&lang=en'

    def test_独立ブランド以外の既存URLは転送しない(self):
        """独立ブランド以外の既存URLは転送しないことを確認する。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/events', headers={'host': 'ei8htplants.com'}, follow_redirects=False)
        assert resp.status_code == 200

    @pytest.mark.parametrize('host', [
        'habitatoides.com', 'www.habitatoides.com',
        'huebyei8htplants.com', 'www.huebyei8htplants.com',
    ])
    @pytest.mark.parametrize('path', ['/admin', '/admin/site-images'])
    def test_ブランドドメインから管理画面を本体ドメインへ転送する(self, host, path):
        """ブランドドメインから管理画面を本体ドメインへ転送することを確認する。

        引数:
            host: 接続元として設定するホスト名。
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get(
            f'{path}?from=brand', headers={'host': host}, follow_redirects=False,
        )
        assert resp.status_code == 301
        assert resp.headers['location'] == f'https://ei8htplants.com{path}?from=brand'
        assert 'no-store' in resp.headers['cache-control']

    @pytest.mark.parametrize('host', ['habitatoides.com', 'www.habitatoides.com'])
    def test_HabitatドメインのhueパスはHUE専用ドメインへ301転送する(self, host):
        """HabitatドメインのhueパスはHUE専用ドメインへ301転送することを確認する。

        引数:
            host: 接続元として設定するホスト名。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/hue?from=habitat', headers={'host': host}, follow_redirects=False)
        assert resp.status_code == 301
        assert resp.headers['location'] == 'https://huebyei8htplants.com/?from=habitat'

    @pytest.mark.parametrize('host', ['habitatoides.com', 'huebyei8htplants.com'])
    def test_ブランドドメインの旧PWA登録スクリプトは解除用に差し替わりキャッシュしない(self, host):
        """ブランドドメインの旧PWA登録スクリプトは解除用に差し替わりキャッシュしないことを確認する。

        引数:
            host: 接続元として設定するホスト名。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/registerSW.js', headers={'host': host})
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('application/javascript')
        assert 'serviceWorker.register(\'/sw.js\'' in resp.text
        assert 'no-store' in resp.headers.get('cache-control', '')

    @pytest.mark.parametrize('host', ['habitatoides.com', 'huebyei8htplants.com'])
    def test_ブランドドメインの旧ServiceWorkerはキャッシュ削除と自身の登録解除を行う(self, host):
        """ブランドドメインの旧ServiceWorkerはキャッシュ削除と自身の登録解除を行うことを確認する。

        引数:
            host: 接続元として設定するホスト名。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/sw.js', headers={'host': host})
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('application/javascript')
        assert 'caches.keys()' in resp.text
        assert 'caches.delete(key)' in resp.text
        assert 'registration.unregister()' in resp.text
        assert 'client.navigate(client.url)' in resp.text
        assert 'no-store' in resp.headers.get('cache-control', '')

    @pytest.mark.parametrize('host', ['habitatoides.com', 'huebyei8htplants.com'])
    def test_ブランドトップHTMLはPWAを登録せず既存登録とキャッシュを解除する(self, db, host):
        """ブランドトップHTMLはPWAを登録せず既存登録とキャッシュを解除することを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            host: 接続元として設定するホスト名。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/', headers={'host': host})
        assert resp.status_code == 200
        assert 'no-store' in resp.headers.get('cache-control', '')
        assert not re.search(r'<link\s+rel="manifest"', resp.text, flags=re.I)
        assert 'vite-plugin-pwa:register-sw' not in resp.text
        assert 'getRegistrations()' in resp.text
        assert 'items.map(function(item){return item.unregister()})' in resp.text
        assert 'caches.delete(key)' in resp.text

    @pytest.mark.parametrize('host,expected_title', [
        ('habitatoides.com', 'Habitat Oides'),
        ('huebyei8htplants.com', 'HUE by ei8ht plants'),
    ])
    def test_ブランド専用ドメインのappleタイトルは自ブランド名になる(self, db, host, expected_title):
        """ブランド専用ドメインではApple向けホーム画面タイトルを自ブランド名にする。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            host: 接続元として設定するブランド専用ホスト名。
            expected_title: apple-mobile-web-app-title に表示するブランド名。

        戻り値:
            なし。"""
        # 変数の内容: resp: ブランド専用ドメインでトップページを開いたレスポンス。
        resp = TestClient(app).get('/', headers={'host': host})
        assert resp.status_code == 200
        assert _meta(_head(resp.text), 'name', 'apple-mobile-web-app-title') == expected_title

    def test_本体ドメインのトップHTMLはPWA要素とAppleタイトルを維持し後始末scriptを加えない(self, db):
        """本体ドメインでは既存のPWA要素とAppleタイトルを保ち、ブランド用後始末を加えない。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: resp: ei8htplants.com でトップページを開いたレスポンス。
        resp = TestClient(app).get('/', headers={'host': 'ei8htplants.com'})
        assert resp.status_code == 200
        # 変数の内容: head: レスポンスHTMLから切り出したhead要素。
        head = _head(resp.text)
        assert _meta(head, 'name', 'apple-mobile-web-app-title') == 'ei8ht Admin'
        assert re.search(r'<link\s+rel="manifest"\s+href="/manifest\.webmanifest"\s*/?>', head)
        assert re.search(r'<script\s+id="vite-plugin-pwa:register-sw"\s+src="/registerSW\.js"\s*>', head)
        assert 'getRegistrations()' not in resp.text
        assert 'caches.delete(key)' not in resp.text


# ---------------------------------------------------------------------------
# serve_spa のパストラバーサル対策（main.py）
# ---------------------------------------------------------------------------

@needs_dist
class TestServeSpaPathTraversal:
    """dist の外を指すパスでは、外のファイルの中身を返さず SPA の index.html を返す。"""

    @pytest.mark.parametrize('raw_path', [
        '/..%2F.env',
        '/..%2F..%2F.env',
        '/..%2F..%2Fbackend%2F.env',
        '/..%2F..%2Fbackend%2Fapp%2Fmain.py',
        '/..%2Fpackage.json',
        '/%2Fetc%2Fpasswd',
        '/%2Fetc%2Fhosts',
        '/foo%2F..%2F..%2F..%2Fbackend%2Frequirements.txt',
    ])
    def test_distの外を指すパスではSPAのindex_htmlを返し外のファイルの中身を返さない(self, db, raw_path):
        # 1. パスがそのまま serve_spa に届いたことを確かめるため、render_spa_index に渡ったパスを記録する
        """distの外を指すパスではSPAのindex htmlを返し外のファイルの中身を返さないことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            raw_path: クエリ文字列を含まない元の URL パス。

        戻り値:
            なし。"""
        # 変数の内容: original: 変更前の元データ、seen: 既に確認済みの項目集合。
        seen = []
        original = seo.render_spa_index

        def spy(index_path, path, query=None):
            """呼び出しを記録して元の関数を実行するスパイを作る。

            引数:
                index_path: SPA の index.html のパス。
                path: 検証対象のファイルパスまたは URL パス。
                query: 検索クエリ文字列。

            戻り値:
                指定属性の呼び出しを記録する spy を作成する。"""
            seen.append(path)
            return original(index_path, path, query)

        with patch.object(seo, 'render_spa_index', side_effect=spy):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get(raw_path)
        # 2. SPA の index.html（メタ情報入り）が返る
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('text/html')
        assert '<div id="root">' in resp.text
        # パーセントエンコードが戻された形（例 '../.env'）で serve_spa に届いている
        assert seen == [unquote(raw_path[1:])]
        # 3. 外のファイルの中身が混ざっていない
        for marker in ('root:', 'SUPABASE', 'FastAPI', 'fastapi', '"dependencies"', 'localhost'):
            assert marker not in resp.text

    @pytest.mark.parametrize('raw_path,outside', [
        ('/..%2F..%2Fbackend%2Fapp%2Fmain.py', '../../backend/app/main.py'),
        ('/foo%2F..%2F..%2F..%2Fbackend%2Frequirements.txt', '../../backend/requirements.txt'),
    ])
    def test_distの外に実在するファイルを指しても中身は返らない(self, db, raw_path, outside):
        # 1. 対策が無ければ返ってしまうファイルが実在することを先に確かめる（テストが空振りしないように）
        """distの外に実在するファイルを指しても中身は返らないことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            raw_path: クエリ文字列を含まない元の URL パス。
            outside: 対象ディレクトリ外を示すパス。

        戻り値:
            なし。"""
        # 変数の内容: target: 処理対象のファイルまたは値。
        target = os.path.join(app_main.DIST, outside)
        assert os.path.isfile(target)
        # 変数の内容: f: 読み書きするファイルまたは応答。
        with open(target, 'rb') as f:
            # 変数の内容: secret: ログに出てはいけない秘密テスト値。
            secret = f.read()
        # 2. 返るのは SPA の index.html で、そのファイルの中身ではない
        resp = TestClient(app).get(raw_path)
        assert resp.status_code == 200
        assert '<div id="root">' in resp.text
        assert resp.content != secret
        assert secret[:200] not in resp.content

    def test_distの中を指す相対パスなら正規の静的ファイルを返す(self, db):
        """dist/foo/../manifest.webmanifest のように dist の中で完結するパスはそのまま返す。

        Args:
            db: テスト対象が使う Supabase クライアントのモック。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/nothing%2F..%2Fmanifest.webmanifest')
        assert resp.status_code == 200
        assert '<div id="root">' not in resp.text

    @pytest.mark.parametrize('path', ['/manifest.webmanifest', '/registerSW.js', '/sw.js'])
    def test_dist直下の静的ファイルはそのまま返す(self, db, path):
        """dist直下の静的ファイルはそのまま返すことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。
            path: 検証対象のファイルパスまたは URL パス。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get(path)
        assert resp.status_code == 200
        assert '<div id="root">' not in resp.text
        # 変数の内容: f: 読み書きするファイルまたは応答。
        with open(os.path.join(app_main.DIST, path.lstrip('/')), 'rb') as f:
            assert resp.content == f.read()

    def test_distそのものを指すパスはindex_htmlのメタ情報入りを返す(self, db):
        """distそのものを指すパスはindex htmlのメタ情報入りを返すことを確認する。

        引数:
            db: テスト対象が使う Supabase クライアントのモック。

        戻り値:
            なし。"""
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/.')
        assert resp.status_code == 200
        assert '<div id="root">' in resp.text
