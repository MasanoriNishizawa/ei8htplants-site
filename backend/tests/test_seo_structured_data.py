"""SEO の説明文・日付・JSON-LD を作る純粋関数の境界テスト。"""
from datetime import date

import pytest

from app.routes import seo_structured_data as structured


BASE_EVENT = {
    'id': 'event-1',
    'name': 'Plant Market',
    'start_date': '2026-11-03',
    'end_date': '2026-11-04',
    'time': '10:00〜17:00',
    'location': '代々木公園',
    'address': '東京都渋谷区',
    'image_urls': ['https://cdn.example.com/plant.jpg'],
}
JSON_LD_OPTIONS = {
    'description': '植物の市',
    'url': 'https://ei8htplants.com/official/events/plant-market',
    'site_name': 'ei8ht plants',
    'site_origin': 'https://ei8htplants.com',
    'default_image': 'https://ei8htplants.com/img/logo.png',
}


class TestParseDate:
    """日付文字列の読み取りと不正値の扱いを確認する。"""

    @pytest.mark.parametrize('value,expected', [
        ('2026-11-03', date(2026, 11, 3)),
        ('2026-11-03T10:00:00+09:00', date(2026, 11, 3)),
        ('2026-02-30', None),
        ('not-a-date', None),
        (None, None),
        (20261103, None),
    ])
    def test_ISO日付の先頭を読み取り不正値はNoneにする(self, value, expected):
        assert structured.parse_date(value) == expected


class TestFormatDateLabel:
    """開始日・終了日から開催日のラベルを作る境界を確認する。"""

    @pytest.mark.parametrize('start,end,expected', [
        ('2026-11-03', None, '2026年11月3日'),
        ('2026-11-03', '2026-11-03', '2026年11月3日'),
        ('2026-11-03', '2026-11-04', '2026年11月3日〜4日'),
        ('2026-11-30', '2026-12-01', '2026年11月30日〜2026年12月1日'),
        ('2026-12-31', '2027-01-01', '2026年12月31日〜2027年1月1日'),
        ('invalid', '2026-11-04', ''),
    ])
    def test_開催日を同月または別月の表記にして開始日不正は空にする(self, start, end, expected):
        assert structured.format_date_label(start, end) == expected


class TestTimesIn:
    """イベント時間文字列から有効な時刻だけを抽出する。"""

    @pytest.mark.parametrize('text,expected', [
        ('9:05〜17:00', ['09:05', '17:00']),
        ('24:00 12:60 8:30', ['08:30']),
        ('終日・時間未定', []),
        ('', []),
    ])
    def test_時刻をゼロ埋めして範囲外や時刻のない文字列を除外する(self, text, expected):
        assert structured.times_in(text) == expected


class TestEventDescription:
    """イベント本文からSEO向けの説明文を組み立てる。"""

    def test_heroとconceptを順に連結して改行や余分な空白を一つにまとめる(self):
        event = {'page_content': {
            'hero': {'tagline': ' 葉の色 ', 'subtitle': '朝の光\nを楽しむ'},
            'concept': '植物と暮らす',
        }}
        assert structured.event_description(event, default_description='既定説明') == '葉の色 朝の光 を楽しむ 植物と暮らす'

    def test_説明が無ければ開催日と会場を使う(self):
        event = {'start_date': '2026-11-03', 'end_date': '2026-11-04', 'location': '代々木公園'}
        assert structured.event_description(event, default_description='既定説明') == '2026年11月3日〜4日 / 代々木公園'

    def test_本文も開催情報も無ければ既定文を返す(self):
        assert structured.event_description({}, default_description='イベント情報') == 'イベント情報'

    def test_説明を指定上限に切り詰めて末尾に省略記号を付ける(self):
        event = {'page_content': {'concept': '  植物と暮らす時間  '}}
        assert structured.event_description(event, default_description='既定', description_max_len=6) == '植物と暮ら…'


class TestEventJsonLd:
    """Event JSON-LD の必須情報、fallback、複数画像の上限を確認する。"""

    def test_開始日を読めない場合はEventを返さない(self):
        assert structured.event_json_ld({**BASE_EVENT, 'start_date': 'invalid'}, **JSON_LD_OPTIONS) is None

    def test_住所が無い場合はEventを返さない(self):
        assert structured.event_json_ld({**BASE_EVENT, 'address': '  '}, **JSON_LD_OPTIONS) is None

    def test_不正な終了日は開始日に置き換え住所はvenueから補う(self):
        event = {
            **BASE_EVENT,
            'end_date': 'invalid',
            'address': None,
            'page_content': {'venue': {'address': '大阪府大阪市'}},
            'location': '',
        }
        ld = structured.event_json_ld(event, **JSON_LD_OPTIONS)
        assert ld is not None
        assert ld['startDate'] == '2026-11-03T10:00:00+09:00'
        assert ld['endDate'] == '2026-11-03T17:00:00+09:00'
        assert ld['location']['name'] == 'ei8ht plants'
        assert ld['location']['address']['streetAddress'] == '大阪府大阪市'

    def test_daily_timesが辞書以外ならイベント共通の時刻を使う(self):
        event = {**BASE_EVENT, 'daily_times': ['10:00〜17:00']}
        ld = structured.event_json_ld(event, **JSON_LD_OPTIONS)
        assert ld is not None
        assert (ld['startDate'], ld['endDate']) == ('2026-11-03T10:00:00+09:00', '2026-11-04T17:00:00+09:00')

    def test_日別時間帯があればイベント共通時刻より優先する(self):
        event = {**BASE_EVENT, 'daily_times': {'2026-11-03': '09:30〜12:30', '2026-11-04': '13:00〜16:15'}}
        ld = structured.event_json_ld(event, **JSON_LD_OPTIONS)
        assert ld is not None
        assert (ld['startDate'], ld['endDate']) == ('2026-11-03T09:30:00+09:00', '2026-11-04T16:15:00+09:00')

    def test_画像が無ければ既定画像を使い最大5枚までに制限する(self):
        images = [f'https://cdn.example.com/{index}.jpg' for index in range(7)]
        ld = structured.event_json_ld({**BASE_EVENT, 'image_urls': images}, **JSON_LD_OPTIONS)
        assert ld is not None
        assert ld['image'] == images[:5]
        fallback = structured.event_json_ld({**BASE_EVENT, 'image_urls': []}, **JSON_LD_OPTIONS)
        assert fallback is not None
        assert fallback['image'] == [JSON_LD_OPTIONS['default_image']]

    def test_組織情報とページ固有情報をJSON_LDに入れる(self):
        ld = structured.event_json_ld(BASE_EVENT, **JSON_LD_OPTIONS)
        assert ld is not None
        assert ld['@context'] == 'https://schema.org'
        assert ld['@type'] == 'Event'
        assert ld['name'] == 'Plant Market'
        assert ld['description'] == JSON_LD_OPTIONS['description']
        assert ld['url'] == JSON_LD_OPTIONS['url']
        assert ld['organizer'] == {'@type': 'Organization', 'name': 'ei8ht plants', 'url': 'https://ei8htplants.com'}


def test_Organizationのサイト名URLロゴを引数から作る():
    assert structured.organization_json_ld(
        site_name='HUE by ei8ht plants',
        site_origin='https://huebyei8htplants.com',
        logo_url='https://huebyei8htplants.com/logo.png',
    ) == {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        'name': 'HUE by ei8ht plants',
        'url': 'https://huebyei8htplants.com/',
        'logo': 'https://huebyei8htplants.com/logo.png',
    }
