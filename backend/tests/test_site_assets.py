"""
サイト画像 API（/api/site-assets）のテスト。

Habitat Oides トップページの動きのある画像（habitat-hero-01〜05・
habitat-object-01〜06 の11個）とページの写真（habitat-world・habitat-workshop-photo・
habitat-workshop-main の3個）の1件取得・保存・一括取得と、管理画面から変えなくなった
サイン画像のキー（habitat-sign）が許可されない（404）ことと、ei8ht plants の各ページの画像
（ei8ht-hero・ei8ht-wordmark・ei8ht-about-hero）と /official 以下の公式サイトの画像
（official-hero・official-brand-*）と HUE の色見本画像（hue-color-*）の一括取得を確認する。
Supabase クライアントはモックに差し替え、本番 DB には接続しない。
"""
from unittest.mock import MagicMock, patch

import pytest

from fastapi.testclient import TestClient

from app.main import app
from app.routes.site_assets import (
    EDITABLE_KEYS,
    EI8HT_PAGE_KEYS,
    HABITAT_MOTION_KEYS,
    HABITAT_PAGE_KEYS,
    HUE_COLOR_KEYS,
    OFFICIAL_PAGE_KEYS,
)

from tests._helpers import as_admin

# 変数の内容: HABITAT_MOTION_KEYS_SORTED: Habitat Oides トップページの動きのある画像のキー11個（キー名の昇順）。
#   サイン画像（habitat-sign）はプロジェクト内のファイルで表示するため含まない。
HABITAT_MOTION_KEYS_SORTED = [
    'habitat-hero-01',
    'habitat-hero-02',
    'habitat-hero-03',
    'habitat-hero-04',
    'habitat-hero-05',
    'habitat-object-01',
    'habitat-object-02',
    'habitat-object-03',
    'habitat-object-04',
    'habitat-object-05',
    'habitat-object-06',
]

# 変数の内容: HABITAT_PAGE_KEYS_SORTED: Habitat Oides のページの写真のキー3個（キー名の昇順）。
HABITAT_PAGE_KEYS_SORTED = ['habitat-workshop-main', 'habitat-workshop-photo', 'habitat-world']

# 変数の内容: HABITAT_KEYS_SORTED: prefix 'habitat-' の一括取得で返るはずのキー14個（キー名の昇順）。
#   動きのある画像11個のあとに、ページの写真3個が続く。
HABITAT_KEYS_SORTED = HABITAT_MOTION_KEYS_SORTED + HABITAT_PAGE_KEYS_SORTED

# 変数の内容: EI8HT_KEYS_SORTED: 一括取得で返るはずの ei8ht plants の各ページのキー3個（キー名の昇順）。
EI8HT_KEYS_SORTED = ['ei8ht-about-hero', 'ei8ht-hero', 'ei8ht-wordmark']

# 変数の内容: OFFICIAL_KEYS_SORTED: 一括取得で返るはずの公式サイト（/official 以下）のキー4個（キー名の昇順）。
OFFICIAL_KEYS_SORTED = [
    'official-brand-ei8ht',
    'official-brand-habitat',
    'official-brand-hue',
    'official-hero',
]

# 変数の内容: HUE_KEYS_SORTED: 一括取得で返るはずの HUE の色見本キー7個（キー名の昇順）。
HUE_KEYS_SORTED = [
    'hue-color-01',
    'hue-color-02',
    'hue-color-03',
    'hue-color-04',
    'hue-color-05',
    'hue-color-06',
    'hue-color-study',
]


def _make_single_mock(rows: list) -> MagicMock:
    """1件取得のクエリ table().select().eq().limit().execute().data を設定したモックを返す。

    Args:
        rows: execute().data として返す行の一覧。

    Returns:
        公開用 Supabase クライアントのモック。
    """
    # 1. 1件取得のクエリチェーンに戻り値を設定する。
    # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = rows
    return mock_sb


def _make_upsert_mock(rows: list) -> MagicMock:
    """保存のクエリ table().upsert().execute().data を設定したモックを返す。

    Args:
        rows: execute().data として返す行の一覧。

    Returns:
        管理者用 Supabase クライアントのモック。
    """
    # 1. upsert のクエリチェーンに戻り値を設定する。
    # 変数の内容: mock_admin: 管理者用 Supabase クライアントのモック。
    mock_admin = MagicMock()
    mock_admin.table.return_value.upsert.return_value.execute.return_value.data = rows
    return mock_admin


def _make_in_mock(rows: list) -> MagicMock:
    """一括取得のクエリ table().select().in_().execute().data を設定したモックを返す。

    Args:
        rows: execute().data として返す行の一覧。

    Returns:
        公開用 Supabase クライアントのモック。
    """
    # 1. in_ を使う一括取得のクエリチェーンに戻り値を設定する。
    # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.in_.return_value.execute.return_value.data = rows
    return mock_sb


class TestHabitatKeys:
    """habitat 系キーの許可一覧を確認する。"""

    def test_habitatの11キーが許可一覧に入りhue系も残る(self):
        """habitat 系11キーが許可され、habitat-sign は含まれず、既存の hue 系キーも許可されたままであること。"""
        # 1. habitat 系の定数が仕様どおりの11個であることを確認する。
        assert sorted(HABITAT_MOTION_KEYS) == HABITAT_MOTION_KEYS_SORTED
        assert len(HABITAT_MOTION_KEYS) == 11
        # 2. サイン画像のキーは habitat 系にも許可一覧にも入っていないことを確認する。
        assert 'habitat-sign' not in HABITAT_MOTION_KEYS
        assert 'habitat-sign' not in EDITABLE_KEYS
        # 3. 許可一覧に habitat 系と既存の hue 系の両方が含まれることを確認する。
        assert HABITAT_MOTION_KEYS <= EDITABLE_KEYS
        assert 'hue-color-study' in EDITABLE_KEYS
        assert 'hue-color-01' in EDITABLE_KEYS
        assert 'hue-color-06' in EDITABLE_KEYS

    def test_habitatのページ写真3キーが許可一覧に入る(self):
        """habitat-world・habitat-workshop-photo・habitat-workshop-main が定数と許可一覧に入っていること。"""
        # 1. ページの写真の定数が仕様どおりの3個で、動きのある画像の定数とは重ならないことを確認する。
        assert sorted(HABITAT_PAGE_KEYS) == HABITAT_PAGE_KEYS_SORTED
        assert not (HABITAT_PAGE_KEYS & HABITAT_MOTION_KEYS)
        # 2. 許可一覧に含まれ、prefix 'habitat-' に当たる許可キーが合わせて14個であることを確認する。
        assert HABITAT_PAGE_KEYS <= EDITABLE_KEYS
        assert sorted(key for key in EDITABLE_KEYS if key.startswith('habitat-')) == HABITAT_KEYS_SORTED
        assert len(HABITAT_KEYS_SORTED) == 14


class TestEi8htPageKeys:
    """ei8ht plants の各ページのキーの許可一覧を確認する。"""

    def test_ei8htの3キーが許可一覧に入る(self):
        """ei8ht-hero・ei8ht-wordmark・ei8ht-about-hero が定数と許可一覧に入っていること。"""
        # 1. ei8ht 系の定数が仕様どおりの3個であることを確認する。
        assert sorted(EI8HT_PAGE_KEYS) == EI8HT_KEYS_SORTED
        # 2. 許可一覧に ei8ht 系が含まれ、既存の habitat 系・hue 系も残っていることを確認する。
        assert EI8HT_PAGE_KEYS <= EDITABLE_KEYS
        assert HABITAT_MOTION_KEYS <= EDITABLE_KEYS
        assert HABITAT_PAGE_KEYS <= EDITABLE_KEYS
        assert HUE_COLOR_KEYS <= EDITABLE_KEYS


class TestOfficialPageKeys:
    """/official 以下の公式サイトのページのキーの許可一覧を確認する。"""

    def test_officialの4キーが許可一覧に入る(self):
        """official-hero と official-brand-ei8ht・habitat・hue が定数と許可一覧に入っていること。"""
        # 1. official 系の定数が仕様どおりの4個であることを確認する。
        assert sorted(OFFICIAL_PAGE_KEYS) == OFFICIAL_KEYS_SORTED
        # 2. 許可一覧に含まれ、prefix 'official-' に当たる許可キーがこの4個だけであることを確認する。
        assert OFFICIAL_PAGE_KEYS <= EDITABLE_KEYS
        assert sorted(key for key in EDITABLE_KEYS if key.startswith('official-')) == OFFICIAL_KEYS_SORTED
        # 3. 既存のキーの集合も許可一覧に残っていることを確認する。
        assert EI8HT_PAGE_KEYS <= EDITABLE_KEYS
        assert HABITAT_MOTION_KEYS <= EDITABLE_KEYS
        assert HABITAT_PAGE_KEYS <= EDITABLE_KEYS
        assert HUE_COLOR_KEYS <= EDITABLE_KEYS

    def test_許可一覧は全部で28キー(self):
        """許可一覧が hue 7・habitat 14・ei8ht 3・official 4 の合計28キーで、余分なキーがないこと。"""
        # 1. 各集合の件数と、許可一覧の合計件数を確認する。
        assert len(HUE_COLOR_KEYS) == 7
        assert len(HABITAT_MOTION_KEYS) + len(HABITAT_PAGE_KEYS) == 14
        assert len(EI8HT_PAGE_KEYS) == 3
        assert len(OFFICIAL_PAGE_KEYS) == 4
        assert len(EDITABLE_KEYS) == 28


class TestGetSiteAsset:
    """1件取得 GET /api/site-assets/{key} を確認する。"""

    def test_habitatのキーで保存済みの画像URLを取得できる(self):
        """登録済みの habitat キーは DB の行をそのまま返すこと。"""
        # 1. DB にスライダー画像の行がある状態にする。
        mock_sb = _make_single_mock([{'key': 'habitat-hero-03', 'url': 'https://example.com/hero3.jpg'}])
        with patch('app.routes.site_assets.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/site-assets/habitat-hero-03')
        # 2. 200 で保存済みの URL が返ることを確認する。
        assert resp.status_code == 200
        assert resp.json() == {'key': 'habitat-hero-03', 'url': 'https://example.com/hero3.jpg'}

    def test_habitatのキーで未登録なら空URLを返す(self):
        """DB に行がない habitat キーは url を '' にして返すこと。"""
        # 1. DB に行がない状態にする。
        mock_sb = _make_single_mock([])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets/habitat-hero-01')
        # 2. 空 URL の初期値が返ることを確認する。
        assert resp.status_code == 200
        assert resp.json() == {'key': 'habitat-hero-01', 'url': ''}

    def test_許可していないhabitatキーの取得は404(self):
        """habitat-hero-06 のような許可外キーは DB を読まずに 404 を返すこと。"""
        # 1. 許可外キーで取得する。
        mock_sb = _make_single_mock([])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets/habitat-hero-06')
        # 2. 404 になり、DB を読んでいないことを確認する。
        assert resp.status_code == 404
        assert resp.json()['detail'] == 'Site asset not found'
        mock_sb.table.assert_not_called()

    def test_habitat_signの取得は404(self):
        """サイン画像は管理画面から変えなくなったため、habitat-sign は DB を読まずに 404 を返すこと。"""
        # 1. DB に古いサイン画像の行が残っている状態でも、許可外キーとして扱われるようにする。
        mock_sb = _make_single_mock([{'key': 'habitat-sign', 'url': 'https://example.com/sign.png'}])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets/habitat-sign')
        # 2. 404 になり、DB を読んでいないことを確認する。
        assert resp.status_code == 404
        assert resp.json()['detail'] == 'Site asset not found'
        mock_sb.table.assert_not_called()


class TestSaveSiteAsset:
    """保存 PUT /api/site-assets/{key} を確認する。"""

    def test_管理者はhabitatのキーに画像URLを保存できる(self):
        """認証つきの PUT で habitat キーを upsert し、保存結果を返すこと。"""
        # 1. upsert の結果として保存した行が返る状態にする。
        # 変数の内容: saved: 保存後に DB から返る行。
        saved = {'key': 'habitat-object-03', 'url': 'https://example.com/obj3.png'}
        mock_admin = _make_upsert_mock([saved])
        with patch('app.routes.site_assets.admin_supabase', mock_admin), as_admin():
            resp = TestClient(app).put(
                '/api/site-assets/habitat-object-03',
                json={'url': 'https://example.com/obj3.png'},
            )
        # 2. 200 で保存結果が返り、正しい値で upsert したことを確認する。
        assert resp.status_code == 200
        assert resp.json() == saved
        mock_admin.table.assert_called_with('site_assets')
        mock_admin.table.return_value.upsert.assert_called_once_with(saved)

    def test_未ログインではhabitatのキーを保存できない(self):
        """認証なしの PUT は 401 か 403 になり、DB に書き込まないこと。"""
        # 1. 管理者ログインなしで保存する。
        mock_admin = _make_upsert_mock([])
        with patch('app.routes.site_assets.admin_supabase', mock_admin):
            resp = TestClient(app).put(
                '/api/site-assets/habitat-object-01',
                json={'url': 'https://example.com/obj1.png'},
            )
        # 2. 認証エラーになり、upsert を呼んでいないことを確認する。
        assert resp.status_code in (401, 403)
        mock_admin.table.return_value.upsert.assert_not_called()

    def test_許可していないhabitatキーの保存は404(self):
        """管理者でも habitat-hero-06 のような許可外キーは 404 で、DB に書き込まないこと。"""
        # 1. 管理者として許可外キーを保存する。
        mock_admin = _make_upsert_mock([])
        with patch('app.routes.site_assets.admin_supabase', mock_admin), as_admin():
            resp = TestClient(app).put(
                '/api/site-assets/habitat-hero-06',
                json={'url': 'https://example.com/x.png'},
            )
        # 2. 404 になり、DB を触っていないことを確認する。
        assert resp.status_code == 404
        mock_admin.table.assert_not_called()

    def test_habitat_signの保存は404(self):
        """管理者でも habitat-sign は許可外キーとして 404 を返し、DB に書き込まないこと。"""
        # 1. 管理者としてサイン画像のキーに保存する。
        mock_admin = _make_upsert_mock([])
        with patch('app.routes.site_assets.admin_supabase', mock_admin), as_admin():
            resp = TestClient(app).put(
                '/api/site-assets/habitat-sign',
                json={'url': 'https://example.com/sign.png'},
            )
        # 2. 404 になり、DB を触っていないことを確認する。
        assert resp.status_code == 404
        assert resp.json()['detail'] == 'Site asset not found'
        mock_admin.table.assert_not_called()


# 変数の内容: NEW_PAGE_KEYS: ページ画像編集の拡張で追加したキー8個
#   （ei8ht plants の About ページ1個、Habitat Oides のページの写真3個、公式サイトの写真4個の計8個）。
NEW_PAGE_KEYS = [
    'ei8ht-about-hero',
    'habitat-world',
    'habitat-workshop-photo',
    'habitat-workshop-main',
    'official-hero',
    'official-brand-ei8ht',
    'official-brand-habitat',
    'official-brand-hue',
]


class TestNewPageKeys:
    """トップ以外のページ画像として追加したキーの1件取得・保存を確認する。"""

    @pytest.mark.parametrize('key', NEW_PAGE_KEYS)
    def test_追加したページ画像のキーで保存済みの画像URLを取得できる(self, key):
        """追加したキーは 404 にならず、DB の行をそのまま返すこと。

        Args:
            key: 確かめる追加キー。
        """
        # 1. DB にそのキーの行がある状態にする。
        # 変数の内容: row: DB に保存されている行。
        row = {'key': key, 'url': f'https://example.com/{key}.jpg'}
        mock_sb = _make_single_mock([row])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get(f'/api/site-assets/{key}')
        # 2. 200 で保存済みの URL が返り、そのキーで DB を読んだことを確認する。
        assert resp.status_code == 200
        assert resp.json() == row
        mock_sb.table.return_value.select.return_value.eq.assert_called_once_with('key', key)

    @pytest.mark.parametrize('key', NEW_PAGE_KEYS)
    def test_追加したページ画像のキーで未登録なら空URLを返す(self, key):
        """追加したキーに DB の行がないときは url を '' にして返すこと。

        Args:
            key: 確かめる追加キー。
        """
        # 1. DB に行がない状態にする。
        mock_sb = _make_single_mock([])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get(f'/api/site-assets/{key}')
        # 2. 空 URL の初期値が返ることを確認する。
        assert resp.status_code == 200
        assert resp.json() == {'key': key, 'url': ''}

    @pytest.mark.parametrize('key', NEW_PAGE_KEYS)
    def test_管理者は追加したページ画像のキーに画像URLを保存できる(self, key):
        """認証つきの PUT で追加したキーを upsert し、保存結果を返すこと。

        Args:
            key: 確かめる追加キー。
        """
        # 1. upsert の結果として保存した行が返る状態にする。
        # 変数の内容: saved: 保存後に DB から返る行。
        saved = {'key': key, 'url': f'https://example.com/{key}.jpg'}
        mock_admin = _make_upsert_mock([saved])
        with patch('app.routes.site_assets.admin_supabase', mock_admin), as_admin():
            resp = TestClient(app).put(f'/api/site-assets/{key}', json={'url': saved['url']})
        # 2. 200 で保存結果が返り、正しい値で upsert したことを確認する。
        assert resp.status_code == 200
        assert resp.json() == saved
        mock_admin.table.return_value.upsert.assert_called_once_with(saved)

    @pytest.mark.parametrize('key', NEW_PAGE_KEYS)
    def test_未ログインでは追加したページ画像のキーを保存できない(self, key):
        """認証なしの PUT は 401 か 403 になり、DB に書き込まないこと。

        Args:
            key: 確かめる追加キー。
        """
        # 1. 管理者ログインなしで保存する。
        mock_admin = _make_upsert_mock([])
        with patch('app.routes.site_assets.admin_supabase', mock_admin):
            resp = TestClient(app).put(f'/api/site-assets/{key}', json={'url': 'https://example.com/x.jpg'})
        # 2. 認証エラーになり、upsert を呼んでいないことを確認する。
        assert resp.status_code in (401, 403)
        mock_admin.table.return_value.upsert.assert_not_called()


class TestListSiteAssets:
    """一括取得 GET /api/site-assets?prefix=... を確認する。"""

    def test_habitatのprefixで14件が昇順に返りDBにない行は空URLになる(self):
        """登録済みの行は URL を、未登録のキーは '' を入れて14件をキー名の昇順で返し、habitat-sign は含めないこと。"""
        # 1. DB には3件だけ行がある状態にする（返る順番は順不同にしておく）。
        mock_sb = _make_in_mock([
            {'key': 'habitat-world', 'url': 'https://example.com/world.jpg'},
            {'key': 'habitat-object-04', 'url': 'https://example.com/obj4.png'},
            {'key': 'habitat-hero-02', 'url': 'https://example.com/hero2.jpg'},
        ])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets', params={'prefix': 'habitat-'})

        # 2. 14件がキー名の昇順で返り、habitat-sign が含まれないことを確認する。
        assert resp.status_code == 200
        # 変数の内容: body: 一括取得の応答本文（key と url の辞書の一覧）。
        body = resp.json()
        assert [item['key'] for item in body] == HABITAT_KEYS_SORTED
        assert 'habitat-sign' not in [item['key'] for item in body]

        # 3. 登録済みの行は URL、未登録のキーは '' になることを確認する。
        # 変数の内容: url_by_key: 応答のキーから URL を引く辞書。
        url_by_key = {item['key']: item['url'] for item in body}
        assert url_by_key['habitat-object-04'] == 'https://example.com/obj4.png'
        assert url_by_key['habitat-hero-02'] == 'https://example.com/hero2.jpg'
        assert url_by_key['habitat-hero-01'] == ''
        assert url_by_key['habitat-object-06'] == ''
        assert url_by_key['habitat-world'] == 'https://example.com/world.jpg'
        assert url_by_key['habitat-workshop-photo'] == ''
        assert url_by_key['habitat-workshop-main'] == ''

        # 4. DB の読み取りは in_ を使った1回のクエリで、対象14キーを渡していることを確認する。
        mock_sb.table.assert_called_once_with('site_assets')
        mock_sb.table.return_value.select.return_value.in_.assert_called_once_with(
            'key', HABITAT_KEYS_SORTED
        )

    def test_prefixを省略したときは404(self):
        """prefix がないときは全件取得にせず 404 を返し、DB を読まないこと。"""
        # 1. prefix なしで一括取得する。
        mock_sb = _make_in_mock([])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets')
        # 2. 404 になり、DB を読んでいないことを確認する。
        assert resp.status_code == 404
        assert resp.json()['detail'] == 'Site asset not found'
        mock_sb.table.assert_not_called()

    def test_prefixが空文字のときは404(self):
        """prefix= のように空文字を渡したときも 404 を返すこと。"""
        # 1. 空の prefix で一括取得する。
        mock_sb = _make_in_mock([])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets', params={'prefix': ''})
        # 2. 404 になり、DB を読んでいないことを確認する。
        assert resp.status_code == 404
        assert resp.json()['detail'] == 'Site asset not found'
        mock_sb.table.assert_not_called()

    def test_当てはまるキーがないprefixは404(self):
        """許可キーに1つも当てはまらない prefix は 404 を返すこと。"""
        # 1. どの許可キーにも当てはまらない prefix で一括取得する。
        mock_sb = _make_in_mock([])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets', params={'prefix': 'unknown-'})
        # 2. 404 になり、DB を読んでいないことを確認する。
        assert resp.status_code == 404
        assert resp.json()['detail'] == 'Site asset not found'
        mock_sb.table.assert_not_called()

    def test_一括取得の応答はno_storeになる(self):
        """保存した画像がすぐ反映されるよう、一括取得の応答は CDN を含めて保存しないこと。"""
        # 1. habitat の一括取得を呼ぶ。
        mock_sb = _make_in_mock([])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets', params={'prefix': 'habitat-'})
        # 2. ミドルウェアが no-store を付けていることを確認する。
        assert resp.status_code == 200
        assert resp.headers['Cache-Control'] == 'no-store'
        assert resp.headers['CDN-Cache-Control'] == 'no-store'

    def test_ei8htのprefixで3件が昇順に返りDBにない行は空URLになる(self):
        """prefix=ei8ht- で ei8ht-about-hero・ei8ht-hero・ei8ht-wordmark の3件だけを昇順で返すこと。"""
        # 1. DB には ei8ht-wordmark の行だけがある状態にする。
        mock_sb = _make_in_mock([
            {'key': 'ei8ht-wordmark', 'url': 'https://example.com/wordmark.png'},
        ])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets', params={'prefix': 'ei8ht-'})

        # 2. 3件がキー名の昇順で返ることを確認する。
        assert resp.status_code == 200
        # 変数の内容: body: 一括取得の応答本文（key と url の辞書の一覧）。
        body = resp.json()
        assert [item['key'] for item in body] == EI8HT_KEYS_SORTED

        # 3. 登録済みの行は URL、未登録のキーは '' になることを確認する。
        # 変数の内容: url_by_key: 応答のキーから URL を引く辞書。
        url_by_key = {item['key']: item['url'] for item in body}
        assert url_by_key['ei8ht-wordmark'] == 'https://example.com/wordmark.png'
        assert url_by_key['ei8ht-hero'] == ''
        assert url_by_key['ei8ht-about-hero'] == ''

        # 4. DB の読み取りは in_ を使った1回のクエリで、対象3キーを渡していることを確認する。
        mock_sb.table.assert_called_once_with('site_assets')
        mock_sb.table.return_value.select.return_value.in_.assert_called_once_with(
            'key', EI8HT_KEYS_SORTED
        )

    def test_officialのprefixで4件が昇順に返りDBにない行は空URLになる(self):
        """prefix=official- で公式サイトの4キーだけをキー名の昇順で返すこと。"""
        # 1. DB には official-hero と official-brand-hue の行だけがある状態にする（順不同）。
        mock_sb = _make_in_mock([
            {'key': 'official-hero', 'url': 'https://example.com/official-hero.jpg'},
            {'key': 'official-brand-hue', 'url': '/img/official/hue.jpg'},
        ])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets', params={'prefix': 'official-'})

        # 2. 4件がキー名の昇順で返ることを確認する。
        assert resp.status_code == 200
        # 変数の内容: body: 一括取得の応答本文（key と url の辞書の一覧）。
        body = resp.json()
        assert [item['key'] for item in body] == OFFICIAL_KEYS_SORTED

        # 3. 登録済みの行は URL、未登録のキーは '' になることを確認する。
        # 変数の内容: url_by_key: 応答のキーから URL を引く辞書。
        url_by_key = {item['key']: item['url'] for item in body}
        assert url_by_key['official-hero'] == 'https://example.com/official-hero.jpg'
        assert url_by_key['official-brand-hue'] == '/img/official/hue.jpg'
        assert url_by_key['official-brand-ei8ht'] == ''
        assert url_by_key['official-brand-habitat'] == ''

        # 4. DB の読み取りは in_ を使った1回のクエリで、対象4キーを渡していることを確認する。
        mock_sb.table.assert_called_once_with('site_assets')
        mock_sb.table.return_value.select.return_value.in_.assert_called_once_with(
            'key', OFFICIAL_KEYS_SORTED
        )

    def test_hue_colorのprefixで7件が昇順に返る(self):
        """prefix=hue-color- で HUE の色見本7キーを昇順で返すこと（編集画面で使う）。"""
        # 1. DB には hue-color-study の行だけがある状態にする。
        mock_sb = _make_in_mock([
            {'key': 'hue-color-study', 'url': 'https://example.com/study.jpg'},
        ])
        with patch('app.routes.site_assets.supabase', mock_sb):
            resp = TestClient(app).get('/api/site-assets', params={'prefix': 'hue-color-'})

        # 2. 7件がキー名の昇順で返ることを確認する。
        assert resp.status_code == 200
        # 変数の内容: body: 一括取得の応答本文（key と url の辞書の一覧）。
        body = resp.json()
        assert [item['key'] for item in body] == HUE_KEYS_SORTED

        # 3. 登録済みの行は URL、未登録のキーは '' になることを確認する。
        # 変数の内容: url_by_key: 応答のキーから URL を引く辞書。
        url_by_key = {item['key']: item['url'] for item in body}
        assert url_by_key['hue-color-study'] == 'https://example.com/study.jpg'
        assert url_by_key['hue-color-01'] == ''

        # 4. DB には対象7キーを渡して1回だけ読んでいることを確認する。
        mock_sb.table.return_value.select.return_value.in_.assert_called_once_with(
            'key', HUE_KEYS_SORTED
        )


class TestSaveSiteAssetUrlShape:
    """保存 PUT /api/site-assets/{key} の url の形の確認（受け付ける形と拒否する形）。"""

    def _put(self, url: str, key: str = 'hue-color-01'):
        """管理者として url を保存し、レスポンスと管理者用クライアントのモックを返す。

        Args:
            url: 保存する url。
            key: 保存先のキー（既定は HUE の色見本 'hue-color-01'）。

        Returns:
            (レスポンス, 管理者用 Supabase クライアントのモック) の組。
        """
        # 1. upsert が入力どおりの行を返す状態にして、管理者として PUT する。
        mock_admin = _make_upsert_mock([{'key': key, 'url': url.strip()}])
        with patch('app.routes.site_assets.admin_supabase', mock_admin), as_admin():
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).put(f'/api/site-assets/{key}', json={'url': url})
        return resp, mock_admin

    def test_空文字は画像を外す操作として保存できる(self):
        """url が '' のときは 200 で、'' のまま upsert すること。"""
        # 1. 空文字で保存する。
        resp, mock_admin = self._put('')
        # 2. 200 で、空文字のまま保存したことを確認する。
        assert resp.status_code == 200
        mock_admin.table.return_value.upsert.assert_called_once_with({'key': 'hue-color-01', 'url': ''})

    def test_スラッシュで始まるサイト内のパスは保存できる(self):
        """'/img/...' のようなサイト内のパスは 200 で保存できること。"""
        # 1. サイト内のパスで保存する。
        resp, mock_admin = self._put('/img/habitatOides/motion/hero-01.jpg', key='habitat-hero-01')
        # 2. 200 で、そのままの値で保存したことを確認する。
        assert resp.status_code == 200
        mock_admin.table.return_value.upsert.assert_called_once_with(
            {'key': 'habitat-hero-01', 'url': '/img/habitatOides/motion/hero-01.jpg'}
        )

    def test_アップロードAPIが返すhttpsのURLはHUEの画像として保存できる(self):
        """Supabase Storage の公開 URL（https）は、これまでどおり HUE の画像として保存できること。"""
        # 1. アップロード API（get_public_url）が返す形の URL で保存する。
        # 変数の内容: storage_url: Supabase Storage の公開 URL の例（末尾に '?' が付くこともある）。
        storage_url = 'https://abcdefgh.supabase.co/storage/v1/object/public/images/1b2c3d4e-0000-4000-8000-000000000000.jpg?'
        resp, mock_admin = self._put(storage_url, key='hue-color-study')
        # 2. 200 で、そのままの値で保存したことを確認する。
        assert resp.status_code == 200
        mock_admin.table.return_value.upsert.assert_called_once_with(
            {'key': 'hue-color-study', 'url': storage_url}
        )

    def test_前後の空白は取り除いてから保存する(self):
        """前後に空白や改行がある url は、取り除いた値で保存すること。"""
        # 1. 前後に空白と改行を付けた https の URL で保存する。
        resp, mock_admin = self._put('  https://example.com/a.png\n')
        # 2. 200 で、空白を取り除いた値で保存したことを確認する。
        assert resp.status_code == 200
        mock_admin.table.return_value.upsert.assert_called_once_with(
            {'key': 'hue-color-01', 'url': 'https://example.com/a.png'}
        )

    def test_空白だけのurlは空文字として保存する(self):
        """空白だけの url は取り除くと '' になるため、画像を外す操作として保存すること。"""
        # 1. 空白だけの url で保存する。
        resp, mock_admin = self._put('   ')
        # 2. 200 で、空文字として保存したことを確認する。
        assert resp.status_code == 200
        mock_admin.table.return_value.upsert.assert_called_once_with({'key': 'hue-color-01', 'url': ''})

    def test_javascriptのURLは422(self):
        """'javascript:' で始まる url は 422 で、DB に書き込まないこと。"""
        resp, mock_admin = self._put('javascript:alert(1)')
        assert resp.status_code == 422
        mock_admin.table.assert_not_called()

    def test_httpのURLは422(self):
        """暗号化しない 'http://' の url は 422 で、DB に書き込まないこと。"""
        resp, mock_admin = self._put('http://example.com/a.png')
        assert resp.status_code == 422
        mock_admin.table.assert_not_called()

    def test_dataのURLは422(self):
        """'data:' で始まる url は 422 で、DB に書き込まないこと。"""
        resp, mock_admin = self._put('data:image/png;base64,iVBORw0KGgo=')
        assert resp.status_code == 422
        mock_admin.table.assert_not_called()

    def test_スラッシュ2つで始まる別サイトのURLは422(self):
        """'//evil.example' のように別サイトを指す url は 422 で、DB に書き込まないこと。"""
        resp, mock_admin = self._put('//evil.example/a.png')
        assert resp.status_code == 422
        mock_admin.table.assert_not_called()

    def test_前に空白を付けたjavascriptのURLも422(self):
        """前後の空白を取り除いたあとで確かめるため、'  javascript:' も 422 になること。"""
        resp, mock_admin = self._put('  javascript:alert(1)')
        assert resp.status_code == 422
        mock_admin.table.assert_not_called()

    def test_バックスラッシュやタブで別サイトに読み替えられるパスは422(self):
        """ブラウザが '//evil.example' と読む '/\\evil.example' や '/<タブ>/evil.example' は 422 になること。"""
        # 1. バックスラッシュを使ったパスと、途中にタブを入れたパスをそれぞれ保存する。
        for url in ['/\\evil.example/a.png', '/\t/evil.example/a.png']:
            resp, mock_admin = self._put(url)
            # 2. どちらも 422 で、DB に書き込まないことを確認する。
            assert resp.status_code == 422, url
            mock_admin.table.assert_not_called()

    def test_大文字のHTTPSや相対パスや文字列以外は422(self):
        """'HTTPS://'・'img/a.png'（'/' で始まらない）・数値は 422 になること。"""
        # 1. 受け付けない形の値をそれぞれ保存する。
        for url in ['HTTPS://example.com/a.png', 'img/a.png', 123]:
            mock_admin = _make_upsert_mock([])
            with patch('app.routes.site_assets.admin_supabase', mock_admin), as_admin():
                resp = TestClient(app).put('/api/site-assets/hue-color-01', json={'url': url})
            # 2. どれも 422 で、DB に書き込まないことを確認する。
            assert resp.status_code == 422, url
            mock_admin.table.assert_not_called()

    def test_2048文字を超えるURLは422(self):
        """max_length=2048 を残しているため、2049 文字の url は 422 になること。"""
        # 1. 'https://' に続けて合計 2049 文字になる url を作って保存する。
        # 変数の内容: long_url: 2049 文字の https の URL。
        long_url = 'https://' + 'a' * (2049 - len('https://'))
        resp, mock_admin = self._put(long_url)
        # 2. 422 で、DB に書き込まないことを確認する。
        assert resp.status_code == 422
        mock_admin.table.assert_not_called()
        # 3. ちょうど 2048 文字なら保存できることも確認する。
        resp_ok, _ = self._put(long_url[:-1])
        assert resp_ok.status_code == 200
