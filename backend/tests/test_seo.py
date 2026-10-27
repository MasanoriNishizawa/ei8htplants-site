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


def _event(**over) -> dict:
    """テスト用のイベント行を返す（over で項目を上書きする）。"""
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
    """テスト用の公開済み記事の行を返す。"""
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
    """テスト用の公開中の商品の行を返す。"""
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
        self.tables = tables or {}
        self.errors = set(errors or [])
        self.calls = []

    def table(self, name):
        return _FakeQuery(self, name)


class _FakeQuery:
    """FakeDB のクエリ1回分。"""

    def __init__(self, db, name):
        self.db = db
        self.name = name
        self.filters = {}

    def select(self, *a, **k):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def execute(self):
        self.db.calls.append((self.name, dict(self.filters)))
        if self.name in self.db.errors:
            raise RuntimeError(f'{self.name} の読み取りに失敗')
        rows = [
            r for r in self.db.tables.get(self.name, [])
            if all(r.get(k) == v for k, v in self.filters.items())
        ]
        res = MagicMock()
        res.data = [dict(r) for r in rows]
        return res


def _default_db(**over) -> FakeDB:
    """イベント・画像・記事・商品が1件ずつ入った FakeDB を返す。"""
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
    """各テストの前後でメモリキャッシュを空にする。"""
    seo.clear_cache()
    yield
    seo.clear_cache()


@pytest.fixture(autouse=True)
def _never_real_db():
    """どのテストでも seo の DB クライアントを空の FakeDB に差し替えておく（本番へ読み取りが飛ばないようにする保険）。

    db フィクスチャや各テストの patch はこの内側でさらに差し替える。
    """
    empty = FakeDB()
    with patch.object(seo, 'supabase', empty), patch.object(seo, 'admin_supabase', empty):
        yield


@pytest.fixture
def db():
    """seo の supabase / admin_supabase を FakeDB に差し替える。"""
    fake = _default_db()
    with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
        yield fake


# serve_spa は dist があるときだけ登録される
HAS_DIST = os.path.isfile(os.path.join(app_main.DIST, 'index.html'))
needs_dist = pytest.mark.skipif(not HAS_DIST, reason='frontend/dist/index.html が無い')


def _head(text: str) -> str:
    """HTML の <head> 部分を返す。"""
    return text.split('</head>')[0]


def _meta(head: str, attr: str, name: str):
    """<meta {attr}="{name}" content="..."> の content（エスケープを戻した値）を返す。無ければ None。"""
    m = re.search(rf'<meta {attr}="{re.escape(name)}" content="([^"]*)"', head)
    return html.unescape(m.group(1)) if m else None


def _title(head: str) -> str:
    """<title> の中身（エスケープを戻した値）を返す。"""
    titles = re.findall(r'<title>(.*?)</title>', head, flags=re.S)
    assert len(titles) == 1, f'<title> が1つではない: {titles}'
    return html.unescape(titles[0])


def _canonical(head: str):
    m = re.search(r'<link rel="canonical" href="([^"]*)"', head)
    return html.unescape(m.group(1)) if m else None


def _json_ld(head: str) -> list:
    """<script type="application/ld+json"> の中身を JSON として読んだリストを返す。"""
    return [json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', head, flags=re.S)]


# ---------------------------------------------------------------------------
# SPA の index.html へのメタ情報の埋め込み（GET /{path}）
# ---------------------------------------------------------------------------

@needs_dist
class TestServeSpaMeta:
    """パスごとに <head> の title・description・canonical・OGP・twitter・JSON-LD が入る。"""

    def test_トップページを開くとサイト名のタイトルとOrganizationの構造化データが入る(self, db):
        resp = TestClient(app).get('/')
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('text/html')
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
        head = _head(TestClient(app).get('/chat').text)
        assert _title(head) == 'AI コンシェルジュ | ei8ht plants'
        assert _title(head).count('ei8ht plants') == 1

    def test_末尾スラッシュ付きでも同じ固定ページの値になりcanonicalはスラッシュなし(self, db):
        head = _head(TestClient(app).get('/official/gallery/').text)
        assert _title(head) == 'Gallery | ei8ht plants'
        assert _canonical(head) == 'https://ei8htplants.com/official/gallery'

    def test_固有画像のある固定ページはtwitter_cardがsummary_large_imageになる(self, db):
        head = _head(TestClient(app).get('/habitatoides').text)
        assert _meta(head, 'property', 'og:image') == 'https://ei8htplants.com/img/habitatOides/habitat_oides_hero.jpg'
        assert _meta(head, 'name', 'twitter:image') == 'https://ei8htplants.com/img/habitatOides/habitat_oides_hero.jpg'
        assert _meta(head, 'name', 'twitter:card') == 'summary_large_image'

    def test_events_page_pastを開くとタイトルがPast_Eventsになる(self, db):
        head = _head(TestClient(app).get('/events?page=past').text)
        assert _title(head) == 'Past Events | ei8ht plants'

    def test_イベントをslugで開くとイベント名と説明と画像と構造化データが入る(self, db):
        resp = TestClient(app).get('/events/plant-market')
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == 'Plant Market 2026 | ei8ht plants'
        assert _meta(head, 'name', 'description') == '植物の市'
        # blob: は除外され、1枚目の絶対 URL が使われる
        assert _meta(head, 'property', 'og:image') == 'https://cdn.example.com/a.jpg'
        assert _meta(head, 'name', 'twitter:card') == 'summary_large_image'
        assert _canonical(head) == 'https://ei8htplants.com/official/events/plant-market'
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
        head = _head(TestClient(app).get(f'/events/{EVENT_ID}').text)
        assert _title(head) == 'Plant Market 2026 | ei8ht plants'
        assert _canonical(head) == 'https://ei8htplants.com/official/events/plant-market'
        assert _meta(head, 'property', 'og:url') == 'https://ei8htplants.com/official/events/plant-market'
        ld = _json_ld(head)[0]
        assert ld['@type'] == 'Event'
        assert ld['url'] == 'https://ei8htplants.com/official/events/plant-market'
        assert _meta(head, 'name', 'robots') is None

    def test_slugの無いイベントをUUIDで開くとcanonicalはUUIDのURLのまま(self):
        fake = _default_db(events=[_event(slug=None)])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            head = _head(TestClient(app).get(f'/events/{EVENT_ID}').text)
        assert _canonical(head) == f'https://ei8htplants.com/official/events/{EVENT_ID}'
        assert _meta(head, 'property', 'og:url') == f'https://ei8htplants.com/official/events/{EVENT_ID}'
        assert _json_ld(head)[0]['url'] == f'https://ei8htplants.com/official/events/{EVENT_ID}'

    def test_日本語のslugのイベントはcanonicalでパーセントエンコードされる(self):
        fake = _default_db(events=[_event(slug='植物')])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            head = _head(TestClient(app).get('/events/植物').text)
        assert _title(head) == 'Plant Market 2026 | ei8ht plants'
        assert _canonical(head) == 'https://ei8htplants.com/official/events/%E6%A4%8D%E7%89%A9'
        assert _meta(head, 'property', 'og:url') == 'https://ei8htplants.com/official/events/%E6%A4%8D%E7%89%A9'

    def test_時刻のないイベントは構造化データの日付が日付だけになる(self):
        fake = _default_db(events=[_event(time=None, daily_times=None, end_date=None)])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            head = _head(TestClient(app).get('/events/plant-market').text)
        ld = _json_ld(head)[0]
        assert ld['startDate'] == '2026-11-03'
        assert ld['endDate'] == '2026-11-03'

    def test_住所の無いイベントは構造化データを出さないがメタ情報は入る(self):
        fake = _default_db(events=[_event(address=None, page_content={'hero': {'tagline': '植物の市'}})])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            head = _head(TestClient(app).get('/events/plant-market').text)
        assert _json_ld(head) == []
        assert _title(head) == 'Plant Market 2026 | ei8ht plants'
        assert _canonical(head) == 'https://ei8htplants.com/official/events/plant-market'
        assert _meta(head, 'name', 'robots') is None

    def test_eventsのaddressが無くても会場ページの住所があれば構造化データを出す(self):
        fake = _default_db(events=[_event(address='  ', page_content={'venue': {'address': '大阪府大阪市'}})])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            head = _head(TestClient(app).get('/events/plant-market').text)
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
        fake = _default_db(events=[_event(time=time_value, daily_times=daily)])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            head = _head(TestClient(app).get('/events/plant-market').text)
        ld = _json_ld(head)[0]
        assert ld['startDate'] == expected_start
        assert ld['endDate'] == expected_end
        # 片方だけ日時になることはない
        assert ('T' in ld['startDate']) == ('T' in ld['endDate'])

    def test_説明の無いイベントは開催日と会場が説明になる(self):
        fake = _default_db(events=[_event(page_content=None)], event_images=[])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            head = _head(TestClient(app).get('/events/plant-market').text)
        assert _meta(head, 'name', 'description') == '2026年11月3日〜4日 / 代々木公園'
        # 画像が無いときは既定のロゴと summary
        assert _meta(head, 'property', 'og:image') == seo.DEFAULT_OG_IMAGE
        assert _meta(head, 'name', 'twitter:card') == 'summary'
        assert _json_ld(head)[0]['image'] == [seo.DEFAULT_OG_IMAGE]

    def test_長いイベント説明は120文字で切られて末尾に省略記号が付く(self):
        long = 'あ' * 300
        fake = _default_db(events=[_event(page_content={'concept': long})])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            head = _head(TestClient(app).get('/events/plant-market').text)
        desc = _meta(head, 'name', 'description')
        assert len(desc) == 120
        assert desc.endswith('…')

    @pytest.mark.parametrize('path', ['/events/nope', f'/events/{MISSING_ID}', '/events/%3Cscript%3E'])
    def test_存在しないイベントは既定値で200を返しnoindexでcanonicalなし構造化データなし(self, db, path):
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
        TestClient(app).get('/events/nope')
        event_calls = [c for c in db.calls if c[0] == 'events']
        assert event_calls == [('events', {'slug': 'nope'})]

    def test_公開済みの記事を開くと記事名とJournalのタイトルと本文の冒頭と画像が入る(self, db):
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
        resp = TestClient(app).get(path)
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == 'ei8ht plants'
        assert _meta(head, 'name', 'robots') == 'noindex'
        assert _canonical(head) is None
        assert '下書き' not in resp.text

    def test_不正な記事IDではDBを読まない(self, db):
        TestClient(app).get('/journal/not-a-uuid')
        assert [c for c in db.calls if c[0] == 'articles'] == []

    def test_公開中の商品を開くと商品名とShopのタイトルと説明と画像が入る(self, db):
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
        resp = TestClient(app).get(path)
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _meta(head, 'name', 'robots') == 'noindex'

    @pytest.mark.parametrize('path', ['/admin', '/admin/events', '/admin/events/abc/edit'])
    def test_管理画面にはcanonicalが入らない(self, db, path):
        head = _head(TestClient(app).get(path).text)
        assert _canonical(head) is None

    @pytest.mark.parametrize('path', ['/official/cancel', '/official/checkout', '/official/order/complete'])
    def test_現行の手続き画面はnoindexで正規URLのcanonicalが入る(self, db, path):
        head = _head(TestClient(app).get(path).text)
        assert _meta(head, 'name', 'robots') == 'noindex'
        assert _canonical(head) == f'https://ei8htplants.com{path}'


    @pytest.mark.parametrize('path', ['/administrator', '/orders-info', '/cancellation', '/checkouts', '/admins/x'])
    def test_接頭辞が似ているだけのパスは除外対象と判定されない(self, path):
        # 不明なパスはどのみちソフト 404 として noindex になるので、判定の関数そのもので確かめる
        assert seo._is_noindex(path) is False

    @pytest.mark.parametrize('path', ['/admin', '/admin/x', '/cancel', '/cancel/abc', '/checkout', '/order', '/order/complete'])
    def test_除外対象のパスと配下は除外対象と判定される(self, path):
        assert seo._is_noindex(path) is True

    def test_不明なパスは既定のタイトルと説明で200を返しnoindexでcanonicalなし(self, db):
        resp = TestClient(app).get('/unknown/page/here')
        assert resp.status_code == 200
        head = _head(resp.text)
        assert _title(head) == 'ei8ht plants'
        assert _meta(head, 'name', 'description') == seo.DEFAULT_DESCRIPTION
        assert _meta(head, 'name', 'robots') == 'noindex'
        assert _canonical(head) is None
        assert _meta(head, 'property', 'og:url') == 'https://ei8htplants.com/unknown/page/here'

    def test_元のindex_htmlのtitleは置き換えられて1つだけになる(self, db):
        text = TestClient(app).get('/events').text
        assert text.count('<title>') == 1
        # 元の index.html の script などは残る
        assert '<div id="root">' in text

    def test_イベント名や説明に含まれる記号はHTMLエスケープされる(self):
        fake = _default_db(events=[_event(
            name=DANGEROUS_NAME,
            page_content={'hero': {'tagline': '植物の市 </script><script>alert(1)</script>'}},
        )])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            text = TestClient(app).get('/events/plant-market').text
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
        fake = _default_db(events=[_event(
            name=DANGEROUS_NAME + '\u2028\u2029<!--',
            page_content={'hero': {'tagline': '</script><script>alert(1)</script>'}},
        )])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            head = _head(TestClient(app).get('/events/plant-market').text)
        raw = re.findall(r'<script type="application/ld\+json">(.*?)</script>', head, flags=re.S)
        assert len(raw) == 1
        body = raw[0]
        # < > & と U+2028/2029 は生で入らない
        for ch in ('<', '>', '&', '\u2028', '\u2029'):
            assert ch not in body
        assert '\\u003c' in body and '\\u003e' in body and '\\u0026' in body
        assert '\\u2028' in body and '\\u2029' in body
        ld = json.loads(body)
        assert ld['name'] == DANGEROUS_NAME + '\u2028\u2029<!--'
        assert ld['description'].startswith('</script><script>alert(1)')

    def test_日本語を含む存在しないパスはog_urlでパーセントエンコードされる(self, db):
        head = _head(TestClient(app).get('/events/植物').text)
        assert _meta(head, 'property', 'og:url') == 'https://ei8htplants.com/official/events/%E6%A4%8D%E7%89%A9'
        assert _canonical(head) is None

    def test_HTMLにはキャッシュ制御とセキュリティヘッダーが付く(self, db):
        resp = TestClient(app).get('/events/plant-market')
        assert resp.headers['cache-control'] == 'public, s-maxage=60, max-age=0, must-revalidate'
        assert resp.headers['x-frame-options'] == 'SAMEORIGIN'
        assert resp.headers['x-content-type-options'] == 'nosniff'
        assert resp.headers['strict-transport-security'] == 'max-age=31536000'

    def test_distにある静的ファイルはそのまま返す(self, db):
        resp = TestClient(app).get('/manifest.webmanifest')
        assert resp.status_code == 200
        assert '<title>' not in resp.text
        assert db.calls == []

    def test_DBの読み取りで例外が出たら既定値のメタ情報で200を返す(self):
        fake = FakeDB(errors={'events', 'articles', 'products'})
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            client = TestClient(app)
            for path in ('/events/plant-market', f'/journal/{ARTICLE_ID}', f'/shop/{PRODUCT_ID}'):
                resp = client.get(path)
                assert resp.status_code == 200
                head = _head(resp.text)
                assert _title(head) == 'ei8ht plants'
                assert _meta(head, 'name', 'description') == seo.DEFAULT_DESCRIPTION
                # 一時的な失敗なので noindex は付けず、canonical は入れる
                assert _meta(head, 'name', 'robots') is None
                assert _canonical(head) == f'https://ei8htplants.com/official{path}'

    def test_埋め込み処理で例外が出たらindex_htmlをそのまま返す(self, db):
        with open(app_main.INDEX_HTML, encoding='utf-8') as f:
            original = f.read()
        with patch.object(seo, 'render_spa_index', side_effect=RuntimeError('boom')):
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
        monkeypatch.setattr(seo, 'DESCRIPTION_MAX_LEN', limit)
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
        monkeypatch.setattr(seo, 'EVENT_JSONLD_MAX_IMAGES', max_images)
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
        monkeypatch.setattr(seo, '_TIME_RE', re.compile(pattern))
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
        client = TestClient(app)
        client.get('/events/plant-market')
        n = len(db.calls)
        assert n > 0
        client.get('/events/plant-market')
        assert len(db.calls) == n

    def test_存在しないイベントも覚えておき2回目はDBを読まない(self, db):
        client = TestClient(app)
        client.get('/events/nope')
        n = len(db.calls)
        client.get('/events/nope')
        assert len(db.calls) == n

    def test_clear_cacheを呼ぶとDBの最新の値を読み直す(self, db):
        client = TestClient(app)
        client.get('/events/plant-market')
        db.tables['events'] = [_event(name='名前を変更')]
        # キャッシュ中は古い名前のまま
        assert _title(_head(client.get('/events/plant-market').text)) == 'Plant Market 2026 | ei8ht plants'
        seo.clear_cache()
        assert _title(_head(client.get('/events/plant-market').text)) == '名前を変更 | ei8ht plants'

    def test_期限の60秒を過ぎるとDBを読み直す(self, db):
        client = TestClient(app)
        with patch.object(seo.time, 'monotonic', return_value=1000.0):
            client.get(f'/journal/{ARTICLE_ID}')
        n = len(db.calls)
        with patch.object(seo.time, 'monotonic', return_value=1059.0):
            client.get(f'/journal/{ARTICLE_ID}')
        assert len(db.calls) == n
        with patch.object(seo.time, 'monotonic', return_value=1061.0):
            client.get(f'/journal/{ARTICLE_ID}')
        assert len(db.calls) == n + 1

    def test_キャッシュの件数は上限を超えない(self):
        cache = seo._TTLCache(ttl=60, max_entries=3)
        for i in range(10):
            cache.set(i, i)
        assert len(cache._data) <= 3
        # 最後に入れたものは残る
        assert cache.get(9) == (True, 9)
        assert cache.get(0) == (False, None)

    def test_Noneの値も見つかったものとして返す(self):
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
        meta = seo._make_meta('/gallery', 'Gallery', None, None)
        out = seo.inject_head('<html><head><meta charset="utf-8"></head><body></body></html>', meta)
        assert '<title>Gallery | ei8ht plants</title>' in out
        assert out.index('<title>') < out.index('</head>')

    def test_置き換え文字列のバックスラッシュが正規表現として解釈されない(self):
        meta = seo._make_meta('/x', 'a\\1\\g<0>', None, None)
        out = seo.inject_head('<head><title>old</title></head>', meta)
        assert '<title>a\\1\\g&lt;0&gt; | ei8ht plants</title>' in out
        assert 'old' not in out

    def test_json_for_scriptは危険な文字をすべてエスケープする(self):
        s = seo._json_for_script({'v': '</script><!-- & \u2028\u2029'})
        assert s == '{"v":"\\u003c/script\\u003e\\u003c!-- \\u0026 \\u2028\\u2029"}'
        assert json.loads(s) == {'v': '</script><!-- & \u2028\u2029'}


# ---------------------------------------------------------------------------
# robots.txt
# ---------------------------------------------------------------------------

class TestRobotsTxt:
    """GET /robots.txt"""

    def test_robots_txtはtext_plainで管理画面などをDisallowしSitemap行を含む(self):
        resp = TestClient(app).get('/robots.txt')
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('text/plain')
        lines = resp.text.splitlines()
        assert 'User-agent: *' in lines
        assert 'Allow: /' in lines
        for p in ('/admin', '/cancel', '/checkout', '/order'):
            assert f'Disallow: {p}' in lines
        assert 'Sitemap: https://ei8htplants.com/sitemap.xml' in lines

    def test_robots_txtはapiをDisallowしない(self):
        text = TestClient(app).get('/robots.txt').text
        assert 'Disallow: /api' not in text
        disallows = [l for l in text.splitlines() if l.startswith('Disallow:')]
        assert disallows == [f'Disallow: {path}' for path in seo.ROBOTS_DISALLOW]

    def test_robots_txtはindex_htmlではない(self):
        text = TestClient(app).get('/robots.txt').text
        assert '<html' not in text.lower()

    @pytest.mark.parametrize('host,origin', [
        ('habitatoides.com', 'https://habitatoides.com'),
        ('www.habitatoides.com', 'https://habitatoides.com'),
        ('huebyei8htplants.com', 'https://huebyei8htplants.com'),
        ('www.huebyei8htplants.com', 'https://huebyei8htplants.com'),
    ])
    def test_ブランドドメインのrobotsは同じブランドのsitemapを案内する(self, host, origin):
        resp = TestClient(app).get('/robots.txt', headers={'host': host})
        assert resp.status_code == 200
        assert f'Sitemap: {origin}/sitemap.xml' in resp.text.splitlines()


# ---------------------------------------------------------------------------
# sitemap.xml
# ---------------------------------------------------------------------------

def _locs(xml: str) -> list:
    return re.findall(r'<loc>(.*?)</loc>', xml)


class TestSitemapXml:
    """GET /sitemap.xml"""

    def test_sitemapは固定ページとイベントと公開記事と公開商品を含む(self, db):
        resp = TestClient(app).get('/sitemap.xml')
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('application/xml')
        xml = resp.text
        assert xml.startswith('<?xml version="1.0" encoding="UTF-8"?>')
        assert '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' in xml
        locs = _locs(xml)
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
        xml = TestClient(app).get('/sitemap.xml').text
        assert f'<loc>https://ei8htplants.com/official/journal/{ARTICLE_ID}</loc><lastmod>2026-01-02</lastmod>' in xml
        assert f'<loc>https://ei8htplants.com/official/shop/{PRODUCT_ID}</loc><lastmod>2026-02-01</lastmod>' in xml

    def test_slugの無いイベントはidのURLになる(self):
        fake = _default_db(events=[_event(slug=None)])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            locs = _locs(TestClient(app).get('/sitemap.xml').text)
        assert f'https://ei8htplants.com/official/events/{EVENT_ID}' in locs

    def test_URLに入る記号はXMLエスケープされる(self):
        fake = _default_db(events=[_event(slug='a&b')])
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            xml = TestClient(app).get('/sitemap.xml').text
        assert '<loc>https://ei8htplants.com/official/events/a%26b</loc>' in xml or \
            '<loc>https://ei8htplants.com/official/events/a&amp;b</loc>' in xml
        assert 'a&b' not in xml

    def test_sitemapは60秒キャッシュされ2回目はDBを読まない(self, db):
        client = TestClient(app)
        client.get('/sitemap.xml')
        n = len(db.calls)
        client.get('/sitemap.xml')
        assert len(db.calls) == n

    def test_一部の読み取りに失敗しても読めた分を返しキャッシュしない(self):
        fake = _default_db()
        fake.errors = {'articles'}
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            client = TestClient(app)
            resp = client.get('/sitemap.xml')
            assert resp.status_code == 200
            locs = _locs(resp.text)
            assert 'https://ei8htplants.com/official/events/plant-market' in locs
            assert f'https://ei8htplants.com/official/shop/{PRODUCT_ID}' in locs
            assert not any('/official/journal/' in l for l in locs)
            # キャッシュされていないので、失敗が直ると次で記事も入る
            fake.errors = set()
            locs2 = _locs(client.get('/sitemap.xml').text)
            assert f'https://ei8htplants.com/official/journal/{ARTICLE_ID}' in locs2

    def test_全部の読み取りに失敗しても固定ページだけで返す(self):
        fake = FakeDB(errors={'events', 'articles', 'products'})
        with patch.object(seo, 'supabase', fake), patch.object(seo, 'admin_supabase', fake):
            resp = TestClient(app).get('/sitemap.xml')
        assert resp.status_code == 200
        assert len(_locs(resp.text)) == len(seo.SITEMAP_STATIC_PATHS)

    @pytest.mark.parametrize('host,origin,paths', [
        ('habitatoides.com', 'https://habitatoides.com', ('/', '/workshop', '/collaborations')),
        ('huebyei8htplants.com', 'https://huebyei8htplants.com', ('/', '/about', '/choose', '/living')),
    ])
    def test_ブランド専用サイトのsitemapは自ブランドの公開URLだけを含む(self, host, origin, paths):
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
        resp = TestClient(app).get(path, headers={'host': 'ei8htplants.com'}, follow_redirects=False)
        assert resp.status_code == 301
        assert resp.headers['location'] == destination

    def test_旧ブランドURLのクエリ文字列を転送先へ引き継ぐ(self):
        resp = TestClient(app).get(
            '/habitatoides/workshop?source=legacy&lang=en',
            headers={'host': 'www.ei8htplants.com'}, follow_redirects=False,
        )
        assert resp.status_code == 301
        assert resp.headers['location'] == 'https://habitatoides.com/workshop?source=legacy&lang=en'

    def test_独立ブランド以外の既存URLは転送しない(self):
        resp = TestClient(app).get('/events', headers={'host': 'ei8htplants.com'}, follow_redirects=False)
        assert resp.status_code == 200

    @pytest.mark.parametrize('host', [
        'habitatoides.com', 'www.habitatoides.com',
        'huebyei8htplants.com', 'www.huebyei8htplants.com',
    ])
    @pytest.mark.parametrize('path', ['/admin', '/admin/site-images'])
    def test_ブランドドメインから管理画面を本体ドメインへ転送する(self, host, path):
        resp = TestClient(app).get(
            f'{path}?from=brand', headers={'host': host}, follow_redirects=False,
        )
        assert resp.status_code == 301
        assert resp.headers['location'] == f'https://ei8htplants.com{path}?from=brand'
        assert 'no-store' in resp.headers['cache-control']

    @pytest.mark.parametrize('host', ['habitatoides.com', 'www.habitatoides.com'])
    def test_HabitatドメインのhueパスはHUE専用ドメインへ301転送する(self, host):
        resp = TestClient(app).get('/hue?from=habitat', headers={'host': host}, follow_redirects=False)
        assert resp.status_code == 301
        assert resp.headers['location'] == 'https://huebyei8htplants.com/?from=habitat'

    @pytest.mark.parametrize('host', ['habitatoides.com', 'huebyei8htplants.com'])
    def test_ブランドドメインの旧PWA登録スクリプトは解除用に差し替わりキャッシュしない(self, host):
        resp = TestClient(app).get('/registerSW.js', headers={'host': host})
        assert resp.status_code == 200
        assert resp.headers['content-type'].startswith('application/javascript')
        assert 'serviceWorker.register(\'/sw.js\'' in resp.text
        assert 'no-store' in resp.headers.get('cache-control', '')

    @pytest.mark.parametrize('host', ['habitatoides.com', 'huebyei8htplants.com'])
    def test_ブランドドメインの旧ServiceWorkerはキャッシュ削除と自身の登録解除を行う(self, host):
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
        resp = TestClient(app).get('/', headers={'host': host})
        assert resp.status_code == 200
        assert 'no-store' in resp.headers.get('cache-control', '')
        assert not re.search(r'<link\s+rel="manifest"', resp.text, flags=re.I)
        assert 'vite-plugin-pwa:register-sw' not in resp.text
        assert 'getRegistrations()' in resp.text
        assert 'items.map(function(item){return item.unregister()})' in resp.text
        assert 'caches.delete(key)' in resp.text


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
        seen = []
        original = seo.render_spa_index

        def spy(index_path, path, query=None):
            seen.append(path)
            return original(index_path, path, query)

        with patch.object(seo, 'render_spa_index', side_effect=spy):
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
        target = os.path.join(app_main.DIST, outside)
        assert os.path.isfile(target)
        with open(target, 'rb') as f:
            secret = f.read()
        # 2. 返るのは SPA の index.html で、そのファイルの中身ではない
        resp = TestClient(app).get(raw_path)
        assert resp.status_code == 200
        assert '<div id="root">' in resp.text
        assert resp.content != secret
        assert secret[:200] not in resp.content

    def test_distの中を指す相対パスなら正規の静的ファイルを返す(self, db):
        """dist/foo/../manifest.webmanifest のように dist の中で完結するパスはそのまま返す。"""
        resp = TestClient(app).get('/nothing%2F..%2Fmanifest.webmanifest')
        assert resp.status_code == 200
        assert '<div id="root">' not in resp.text

    @pytest.mark.parametrize('path', ['/manifest.webmanifest', '/registerSW.js', '/sw.js'])
    def test_dist直下の静的ファイルはそのまま返す(self, db, path):
        resp = TestClient(app).get(path)
        assert resp.status_code == 200
        assert '<div id="root">' not in resp.text
        with open(os.path.join(app_main.DIST, path.lstrip('/')), 'rb') as f:
            assert resp.content == f.read()

    def test_distそのものを指すパスはindex_htmlのメタ情報入りを返す(self, db):
        resp = TestClient(app).get('/.')
        assert resp.status_code == 200
        assert '<div id="root">' in resp.text
