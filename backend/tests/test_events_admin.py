"""
events.py の管理者向けエンドポイントのテスト。

- admin_supabase (書き込み操作) と supabase (読み取り) の両方をパッチする
- require_auth は app.dependency_overrides でバイパスする
- テスト後は dependency_overrides を必ずクリアする
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_auth


# ---------------------------------------------------------------------------
# ヘルパー: テスト用のイベントデータを返す
# ---------------------------------------------------------------------------

def _event_data(event_id: str = 'evt-1', name: str = 'テストイベント') -> dict:
    """テスト用のイベントレコードを生成して返す。"""
    return {
        'id': event_id,
        'name': name,
        'slug': None,
        'start_date': '2099-01-01',
        'end_date': None,
        'location': '東京',
        'brands': [],
        'has_workshop': False,
    }


def _make_public_sb_mock(events_data: list) -> MagicMock:
    """公開向け supabase のモック（get_event 内の読み取り用）を返す。"""
    mock_sb = MagicMock()
    # table('events').select('*').eq(...).execute().data
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = events_data
    # table('event_images').select('*').in_(...).order(...).execute().data
    mock_sb.table.return_value.select.return_value.in_.return_value.order.return_value.execute.return_value.data = []
    return mock_sb


# ---------------------------------------------------------------------------
# クラス: イベント作成・更新・削除
# ---------------------------------------------------------------------------

class TestEventCRUD:
    """イベントの作成・更新・削除エンドポイントのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。"""
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットして他のテストに影響しないようにする。"""
        app.dependency_overrides.clear()

    def test_イベント作成成功(self):
        """POST /api/events でイベントが正常に作成されて 200 が返る。"""
        event = _event_data('new-evt')
        mock_admin_sb = MagicMock()
        mock_sb = _make_public_sb_mock([event])

        # insert().execute().data[0] の戻り値を設定
        mock_admin_sb.table.return_value.insert.return_value.execute.return_value.data = [event]

        with patch('app.routes.events.admin_supabase', mock_admin_sb), \
             patch('app.routes.events.supabase', mock_sb):
            client = TestClient(app)
            resp = client.post('/api/events', json={
                'name': 'テストイベント',
                'start_date': '2099-01-01',
                'location': '東京',
            })

        assert resp.status_code == 200
        assert resp.json()['name'] == 'テストイベント'

    def test_イベント作成_認証なし_401(self):
        """POST /api/events で Authorization ヘッダーがない場合 401 が返る。"""
        # 認証バイパスをクリアして実際の require_auth を使う
        app.dependency_overrides.clear()

        client = TestClient(app)
        resp = client.post('/api/events', json={
            'name': 'テストイベント',
            'start_date': '2099-01-01',
            'location': '東京',
        })

        assert resp.status_code == 401

    def test_イベント更新成功(self):
        """PUT /api/events/:id でイベントが正常に更新されて 200 が返る。"""
        event = _event_data('evt-1', '更新後イベント')
        mock_admin_sb = MagicMock()
        mock_sb = _make_public_sb_mock([event])

        with patch('app.routes.events.admin_supabase', mock_admin_sb), \
             patch('app.routes.events.supabase', mock_sb):
            client = TestClient(app)
            resp = client.put('/api/events/evt-1', json={
                'name': '更新後イベント',
                'start_date': '2099-01-01',
                'location': '大阪',
            })

        assert resp.status_code == 200
        assert resp.json()['name'] == '更新後イベント'

    def test_イベント削除成功(self):
        """DELETE /api/events/:id でイベントが削除されて { ok: True } が返る。"""
        mock_admin_sb = MagicMock()

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.delete('/api/events/evt-1')

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    def test_イベント削除_認証なし_401(self):
        """DELETE /api/events/:id で Authorization ヘッダーがない場合 401 が返る。"""
        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.delete('/api/events/evt-1')
        # teardown で再設定するために戻す
        app.dependency_overrides[require_auth] = lambda: None
        assert resp.status_code == 401

    def test_イベント1件取得成功(self):
        """GET /api/events/:id でイベントが slug または UUID で取得できる。"""
        event = _event_data('evt-1')
        mock_sb = _make_public_sb_mock([event])

        with patch('app.routes.events.supabase', mock_sb):
            client = TestClient(app)
            resp = client.get('/api/events/evt-1')

        assert resp.status_code == 200
        assert resp.json()['id'] == 'evt-1'

    def test_イベント1件取得_存在しない場合_404(self):
        """GET /api/events/:id で対象が見つからない場合 404 が返る。"""
        mock_sb = _make_public_sb_mock([])
        # id 検索でも空を返すよう設定（slug→id の両方が空）
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []

        with patch('app.routes.events.supabase', mock_sb):
            client = TestClient(app)
            resp = client.get('/api/events/nonexistent')

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# クラス: 収支管理
# ---------------------------------------------------------------------------

class TestEventFinances:
    """収支情報の取得・保存エンドポイントのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。"""
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。"""
        app.dependency_overrides.clear()

    def test_全収支一覧取得成功(self):
        """GET /api/events/finances で全イベントの収支一覧が返る。"""
        finances_list = [
            {'id': 'fin-1', 'event_id': 'evt-1', 'sales': 50000},
            {'id': 'fin-2', 'event_id': 'evt-2', 'sales': 30000},
        ]
        mock_admin_sb = MagicMock()
        mock_admin_sb.table.return_value.select.return_value.execute.return_value.data = finances_list

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.get('/api/events/finances')

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]['sales'] == 50000

    def test_全収支一覧取得_認証なし_401(self):
        """GET /api/events/finances で Authorization ヘッダーがない場合 401 が返る。"""
        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.get('/api/events/finances')
        app.dependency_overrides[require_auth] = lambda: None
        assert resp.status_code == 401

    def test_個別収支取得_既存レコードあり(self):
        """GET /api/events/:id/finances で既存レコードがある場合はそのデータを返す。"""
        finance = {'id': 'fin-1', 'event_id': 'evt-1', 'sales': 80000, 'booth_fee': 10000}
        mock_admin_sb = MagicMock()
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [finance]

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.get('/api/events/evt-1/finances')

        assert resp.status_code == 200
        assert resp.json()['sales'] == 80000

    def test_個別収支取得_未登録の場合デフォルト値(self):
        """GET /api/events/:id/finances でレコードがない場合はデフォルト値を返す。"""
        mock_admin_sb = MagicMock()
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.get('/api/events/evt-new/finances')

        assert resp.status_code == 200
        data = resp.json()
        # デフォルト値が設定されていること
        assert data['sales'] == 0
        assert data['payment_flag'] is False
        assert data['event_id'] == 'evt-new'

    def test_収支保存_新規insert(self):
        """PUT /api/events/:id/finances で既存レコードがない場合は insert される。"""
        saved = {'id': 'fin-new', 'event_id': 'evt-1', 'sales': 100000}
        mock_admin_sb = MagicMock()
        # 既存レコード検索で空を返す
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        # insert の戻り値
        mock_admin_sb.table.return_value.insert.return_value.execute.return_value.data = [saved]

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/finances', json={'sales': 100000})

        assert resp.status_code == 200
        assert resp.json()['sales'] == 100000

    def test_収支保存_既存update(self):
        """PUT /api/events/:id/finances で既存レコードがある場合は update される。"""
        existing = [{'id': 'fin-1'}]
        updated = {'id': 'fin-1', 'event_id': 'evt-1', 'sales': 120000}
        mock_admin_sb = MagicMock()
        # 既存レコード検索でデータを返す
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = existing
        # update の戻り値
        mock_admin_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [updated]

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/finances', json={'sales': 120000})

        assert resp.status_code == 200
        assert resp.json()['sales'] == 120000


# ---------------------------------------------------------------------------
# クラス: セッション管理
# ---------------------------------------------------------------------------

class TestEventSessions:
    """セッション取得・保存エンドポイントのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。"""
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。"""
        app.dependency_overrides.clear()

    def test_セッション取得成功(self):
        """GET /api/events/:id/sessions でセッション一覧と予約数が返る。"""
        sessions = [
            {'id': 'ses-1', 'event_id': 'evt-1', 'time_label': '10:00', 'max_participants': 5},
            {'id': 'ses-2', 'event_id': 'evt-1', 'time_label': '14:00', 'max_participants': 5},
        ]
        mock_admin_sb = MagicMock()

        # セッション取得チェーン
        def table_side_effect(name: str):
            """テーブル名に応じて異なるモックを返す。"""
            tbl_mock = MagicMock()
            if name == 'ws_sessions':
                tbl_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = sessions
            elif name == 'workshop_reservations':
                # 予約なし
                tbl_mock.select.return_value.eq.return_value.neq.return_value.execute.return_value.data = []
            return tbl_mock

        mock_admin_sb.table.side_effect = table_side_effect

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.get('/api/events/evt-1/sessions')

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        # 予約なしなので reserved_count は 0
        assert data[0]['reserved_count'] == 0

    def test_セッション取得_空の場合空リスト(self):
        """GET /api/events/:id/sessions でセッションがない場合は空リストを返す。"""
        mock_admin_sb = MagicMock()
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.get('/api/events/evt-1/sessions')

        assert resp.status_code == 200
        assert resp.json() == []

    def test_セッション保存成功(self):
        """PUT /api/events/:id/sessions でセッションが保存されて最新の一覧が返る。"""
        mock_admin_sb = MagicMock()

        # 既存セッションなし（新規挿入になる）
        existing_sessions_mock = MagicMock()
        existing_sessions_mock.data = []

        # 保存後のセッション一覧
        saved_sessions = [
            {'id': 'ses-new', 'event_id': 'evt-1', 'time_label': '11:00', 'max_participants': 8},
        ]

        call_count = {'n': 0}

        def table_side_effect(name: str):
            """テーブル名に応じて適切なモックを返す。"""
            tbl_mock = MagicMock()
            if name == 'ws_sessions':
                # 既存セッション取得（select で id/time_label だけ）
                tbl_mock.select.return_value.eq.return_value.execute.return_value.data = []
                # 保存後の select * 取得
                tbl_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = saved_sessions
                # insert の戻り値
                tbl_mock.insert.return_value.execute.return_value.data = [{'id': 'ses-new'}]
            elif name == 'workshop_reservations':
                tbl_mock.select.return_value.eq.return_value.neq.return_value.execute.return_value.data = []
            return tbl_mock

        mock_admin_sb.table.side_effect = table_side_effect

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/sessions', json={
                'sessions': [{'time_label': '11:00', 'max_participants': 8}]
            })

        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# クラス: ページコンテンツ保存
# ---------------------------------------------------------------------------

class TestPageContent:
    """ページコンテンツ保存エンドポイントのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。"""
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。"""
        app.dependency_overrides.clear()

    def test_ページコンテンツ保存成功(self):
        """PATCH /api/events/:id/page でページコンテンツが更新されてイベントが返る。"""
        event = _event_data('evt-1')
        mock_admin_sb = MagicMock()
        mock_sb = _make_public_sb_mock([event])

        with patch('app.routes.events.admin_supabase', mock_admin_sb), \
             patch('app.routes.events.supabase', mock_sb):
            client = TestClient(app)
            resp = client.patch('/api/events/evt-1/page', json={
                'page_content': {'sections': [{'type': 'text', 'body': 'こんにちは'}]}
            })

        assert resp.status_code == 200
        assert resp.json()['id'] == 'evt-1'

    def test_ページコンテンツ保存_認証なし_401(self):
        """PATCH /api/events/:id/page で Authorization ヘッダーがない場合 401 が返る。"""
        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.patch('/api/events/evt-1/page', json={
            'page_content': {}
        })
        app.dependency_overrides[require_auth] = lambda: None
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# クラス: 管理情報（admin-info）
# ---------------------------------------------------------------------------

class TestEventAdminInfo:
    """管理情報の取得・保存エンドポイントのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。"""
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。"""
        app.dependency_overrides.clear()

    def test_管理情報取得_admin_infoが返る(self):
        """GET /api/events/:id/admin-info で admin_info が返る。"""
        # 1. admin_info フィールドを持つイベントレコードをモックに設定する
        admin_info = {'carry_in_time': '9:00', 'hotel_name': 'テストホテル', 'booth_fee': 30000}
        mock_admin_sb = MagicMock()
        (mock_admin_sb.table.return_value
            .select.return_value
            .eq.return_value
            .single.return_value
            .execute.return_value
            .data) = {'admin_info': admin_info}

        # 2. エンドポイントを呼んでレスポンスを検証する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.get('/api/events/evt-1/admin-info')

        assert resp.status_code == 200
        data = resp.json()
        assert data['carry_in_time'] == '9:00'
        assert data['hotel_name'] == 'テストホテル'
        assert data['booth_fee'] == 30000

    def test_管理情報取得_admin_infoがnullのとき空dictを返す(self):
        """GET /api/events/:id/admin-info で admin_info が null のとき {} を返す。"""
        # 1. admin_info が None のレコードをモックに設定する
        mock_admin_sb = MagicMock()
        (mock_admin_sb.table.return_value
            .select.return_value
            .eq.return_value
            .single.return_value
            .execute.return_value
            .data) = {'admin_info': None}

        # 2. エンドポイントを呼んで空 dict が返ることを確認する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.get('/api/events/evt-1/admin-info')

        assert resp.status_code == 200
        assert resp.json() == {}

    def test_管理情報取得_認証なし_401(self):
        """GET /api/events/:id/admin-info で Authorization ヘッダーがない場合 401 が返る。"""
        # 1. 認証バイパスをクリアして実際の require_auth を使う
        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.get('/api/events/evt-1/admin-info')
        # 2. テスト後に認証バイパスを戻す（teardown_method が呼ばれるまでの補完）
        app.dependency_overrides[require_auth] = lambda: None

        assert resp.status_code == 401

    def test_管理情報保存_okが返る(self):
        """PUT /api/events/:id/admin-info で管理情報を保存して {"ok": True} が返る。"""
        # 1. admin_supabase の update チェーンをモックする
        mock_admin_sb = MagicMock()

        # 2. エンドポイントを呼んで {"ok": True} が返ることを確認する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/admin-info', json={
                'carry_in_time': '9:00',
                'hotel_name': 'テストホテル',
                'booth_fee': 30000,
            })

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    def test_管理情報保存_認証なし_401(self):
        """PUT /api/events/:id/admin-info で Authorization ヘッダーがない場合 401 が返る。"""
        # 1. 認証バイパスをクリアして実際の require_auth を使う
        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.put('/api/events/evt-1/admin-info', json={'carry_in_time': '9:00'})
        # 2. テスト後に認証バイパスを戻す
        app.dependency_overrides[require_auth] = lambda: None

        assert resp.status_code == 401

    def test_管理情報保存_DB更新失敗時に500を返す(self):
        """PUT /api/events/:id/admin-info で DB 更新が例外を投げたとき 500 が返る。"""
        # 1. admin_supabase の update チェーンが例外を投げるよう設定する
        mock_admin_sb = MagicMock()
        (mock_admin_sb.table.return_value
            .update.return_value
            .eq.return_value
            .execute.side_effect) = Exception('DB connection error')

        # 2. エンドポイントを呼んで 500 が返ることを確認する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/admin-info', json={'carry_in_time': '9:00'})

        assert resp.status_code == 500
