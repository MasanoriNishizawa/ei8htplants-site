"""
events.py の管理者向けエンドポイントのテスト。

- admin_supabase (書き込み操作) と supabase (読み取り) の両方をパッチする
- require_auth は app.dependency_overrides でバイパスする
- テスト後は dependency_overrides を必ずクリアする
"""
import pytest
from unittest.mock import MagicMock, call, patch
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_auth


# ---------------------------------------------------------------------------
# ヘルパー: テスト用のイベントデータを返す
# ---------------------------------------------------------------------------

def _event_data(event_id: str = 'evt-1', name: str = 'テストイベント') -> dict:
    """テスト用のイベントレコードを生成して返す。

    Args:
        event_id: イベント ID。
        name: イベント名。

    Returns:
        dict を返す。
    """
    # 1. テスト用のイベントレコードを生成して返す。
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
    """公開向け supabase のモック（get_event 内の読み取り用）を返す。

    Args:
        events_data: イベント一覧 API が返すテスト用イベント行。

    Returns:
        MagicMock を返す。
    """
    # 1. 公開イベント・画像クエリに対する Supabase モックの返却値を設定する。
    # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    # table('events').select('*').eq(...).execute().data
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = events_data
    # table('event_images').select('*').in_(...).order(...).execute().data
    mock_sb.table.return_value.select.return_value.in_.return_value.order.return_value.execute.return_value.data = []
    return mock_sb


def _make_sessions_admin_mocks(existing_sessions: list) -> tuple[MagicMock, MagicMock, MagicMock]:
    """セッション保存テスト用にイベント・セッション表のDBモックを分けて返す。

    Args:
        existing_sessions: 保存前の ws_sessions.select が返す既存セッション一覧。

    Returns:
        (Supabase クライアント、events テーブルモック、ws_sessions テーブルモック)。
    """
    # 変数の内容: event_id: テスト用UUID、events_table: 存在確認用表、sessions_table: 保存対象表、reservations_table: 予約数取得用表。
    event_id = '11111111-1111-1111-1111-111111111111'
    events_table = MagicMock()
    sessions_table = MagicMock()
    reservations_table = MagicMock()
    # 1. イベント存在確認は成功させ、既存セッションの読み取り結果を指定する。
    events_table.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {'id': event_id}
    sessions_table.select.return_value.eq.return_value.execute.return_value.data = existing_sessions
    sessions_table.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    reservations_table.select.return_value.eq.return_value.neq.return_value.execute.return_value.data = []
    # 2. テーブル名に応じたモックを返し、想定外テーブルの使用を失敗させる。
    tables = {
        'events': events_table,
        'ws_sessions': sessions_table,
        'workshop_reservations': reservations_table,
    }

    def table_side_effect(name: str):
        """指定されたテーブルに対応するモックを返す。

        Args:
            name: Supabase のテーブル名。

        Returns:
            指定テーブルに対応する MagicMock。
        """
        # 1. テストで許可したテーブル名だけを返し、想定外のDBアクセスを検知する。
        assert name in tables, f'想定外のテーブルにアクセスした: {name}'
        return tables[name]

    # 変数の内容: mock_admin_sb: テーブル別の応答を返す管理用Supabaseクライアント。
    mock_admin_sb = MagicMock()
    mock_admin_sb.table.side_effect = table_side_effect
    return mock_admin_sb, events_table, sessions_table


# ---------------------------------------------------------------------------
# クラス: イベント作成・更新・削除
# ---------------------------------------------------------------------------

class TestEventCRUD:
    """イベントの作成・更新・削除エンドポイントのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。

        Returns:
            なし。
        """
        # 1. 認証をバイパスするよう設定する。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットして他のテストに影響しないようにする。

        Returns:
            なし。
        """
        # 1. dependency_overrides をリセットして他のテストに影響しないようにする。
        app.dependency_overrides.clear()

    def test_イベント作成成功(self):
        """POST /api/events でイベントが正常に作成されて 200 が返る。

        Returns:
            なし。
        """
        # 変数の内容: event: 処理対象のイベント、mock_admin_sb: 管理用 Supabase クライアントのモック、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 作成用のイベントデータを組み立て、POST /api/events へ送信する。
        event = _event_data('new-evt')
        mock_admin_sb = MagicMock()
        mock_sb = _make_public_sb_mock([event])

        # insert().execute().data[0] の戻り値を設定
        mock_admin_sb.table.return_value.insert.return_value.execute.return_value.data = [event]

        with patch('app.routes.events.admin_supabase', mock_admin_sb), \
             patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.post('/api/events', json={
                'name': 'テストイベント',
                'start_date': '2099-01-01',
                'location': '東京',
            })

        assert resp.status_code == 200
        assert resp.json()['name'] == 'テストイベント'

    def test_イベント作成_画像を順番に保存して公開読戻しにも含める(self):
        """画像付きイベントを作成し、表示順を保った公開応答を返す。

        Returns:
            なし。
        """
        # 変数の内容: event: events INSERT と公開読戻しが返す作成イベント、image_urls: 指定順の画像URL、image_rows: event_images の保存行、admin/public各モック: 管理書込・公開読戻しの記録用。
        event = _event_data('11111111-1111-1111-1111-111111111111', '画像付きイベント')
        image_urls = ['https://example.com/first.jpg', 'https://example.com/second.jpg']
        image_rows = [
            {'event_id': event['id'], 'url': image_urls[0], 'display_order': 0},
            {'event_id': event['id'], 'url': image_urls[1], 'display_order': 1},
        ]
        event_table = MagicMock()
        admin_images_table = MagicMock()
        public_event_table = MagicMock()
        public_images_table = MagicMock()
        # 1. 管理側のイベント INSERT と画像 INSERT が成功する応答を設定する。
        event_table.insert.return_value.execute.return_value.data = [event]
        # 変数の内容: admin_images_table の INSERT は成功だけ記録し、公開読戻し用の画像行は別モックで返す。
        mock_admin_sb = MagicMock()
        mock_admin_sb.attach_mock(event_table, 'events_table')
        mock_admin_sb.attach_mock(admin_images_table, 'event_images_table')
        mock_admin_sb.table.side_effect = [event_table, admin_images_table]
        admin_images_table.insert.return_value.execute.return_value.data = image_rows

        # 2. 公開側では作成イベントと表示順の画像行を返し、POST 応答を組み立てさせる。
        mock_public_sb = MagicMock()
        # slug 検索は未登録、UUID の id 検索では作成イベントが見つかる応答に分ける。
        slug_query = MagicMock()
        slug_query.execute.return_value.data = []
        id_query = MagicMock()
        id_query.execute.return_value.data = [event]
        public_event_table.select.return_value.eq.side_effect = [slug_query, id_query]

        def read_saved_images():
            """画像の公開読戻しより先に管理側 INSERT が完了したことを確かめる。

            Returns:
                管理側で保存した表示順付き画像行。
            """
            # 1. API が公開側の画像取得へ進む前に、管理側の画像 INSERT が実行済みか確認する。
            admin_images_table.insert.return_value.execute.assert_called_once()
            # 2. Supabase の execute 応答と同じ data 属性に、保存済み画像行を設定して返す。
            response = MagicMock()
            response.data = image_rows
            return response

        public_images_table.select.return_value.in_.return_value.order.return_value.execute.side_effect = read_saved_images
        mock_public_sb.table.side_effect = [public_event_table, public_event_table, public_images_table]

        with patch('app.routes.events.admin_supabase', mock_admin_sb), \
             patch('app.routes.events.supabase', mock_public_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: 画像付き POST の応答。
            client = TestClient(app)
            resp = client.post('/api/events', json={
                'name': '画像付きイベント',
                'start_date': '2099-01-01',
                'location': '東京',
                'image_urls': image_urls,
            })

        # 3. イベント保存→画像保存の順、display_order、公開応答の images 順を確認する。
        assert resp.status_code == 200
        assert resp.json()['id'] == event['id']
        assert [item['url'] for item in resp.json()['images']] == image_urls
        assert [item['display_order'] for item in resp.json()['images']] == [0, 1]
        # 変数の内容: executed_operations: 管理DBで実行されたイベント本体・画像保存の順序。
        executed_operations = [
            item[0]
            for item in mock_admin_sb.mock_calls
            if item[0] in {'events_table.insert().execute', 'event_images_table.insert().execute'}
        ]
        assert executed_operations == ['events_table.insert().execute', 'event_images_table.insert().execute']
        event_table.insert.return_value.execute.assert_called_once()
        admin_images_table.insert.assert_called_once_with([
            {'event_id': event['id'], 'url': image_urls[0], 'display_order': 0},
            {'event_id': event['id'], 'url': image_urls[1], 'display_order': 1},
        ])
        admin_images_table.insert.return_value.execute.assert_called_once()
        assert public_event_table.select.return_value.eq.call_args_list == [
            call('slug', event['id']),
            call('id', event['id']),
        ]
        slug_query.execute.assert_called_once()
        id_query.execute.assert_called_once()
        public_images_table.select.return_value.in_.return_value.order.return_value.execute.assert_called_once()
        public_images_table.select.return_value.in_.assert_called_once_with('event_id', [event['id']])
        public_images_table.select.return_value.in_.return_value.order.assert_called_once_with('display_order')

    def test_イベント作成_eventsのinsert失敗時は画像保存へ進まず500(self):
        """イベント本体の INSERT 失敗は 500 となり画像テーブルを呼ばない。

        Returns:
            なし。
        """
        # 変数の内容: event_table: events テーブルの書き込みモック、images_table: event_images テーブルの書き込みモック。
        event_table = MagicMock()
        images_table = MagicMock()
        # 1. events.insert の実行時に例外を発生させ、テーブル別モックを管理用クライアントへ結び付ける。
        event_table.insert.return_value.execute.side_effect = RuntimeError('events insert failed')
        # 変数の内容: mock_admin_sb: テーブル別モックを順番に返す管理用Supabaseクライアント。
        mock_admin_sb = MagicMock()
        mock_admin_sb.table.side_effect = [event_table, images_table]

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: 例外をHTTP 500応答として受け取るAPIクライアント、resp: POST応答。
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post('/api/events', json={
                'name': 'テストイベント',
                'start_date': '2099-01-01',
                'location': '東京',
                'image_urls': ['https://example.com/event.jpg'],
            })

        # 2. 失敗応答と、イベント INSERT だけが呼ばれたことを確認する。
        assert resp.status_code == 500
        mock_admin_sb.table.assert_called_once_with('events')
        event_table.insert.assert_called_once()
        event_table.insert.return_value.execute.assert_called_once()
        images_table.insert.assert_not_called()

    def test_イベント作成_event_imagesのinsert失敗時はイベント登録後に500(self):
        """画像 INSERT 失敗は 500 となり、イベント本体 INSERT は先に実行されている。

        Returns:
            なし。
        """
        # 変数の内容: event: イベント INSERT で返す作成済み行、event_table: events モック、images_table: 画像モック。
        event = _event_data('new-evt')
        event_table = MagicMock()
        images_table = MagicMock()
        # 1. イベント INSERT は成功させ、画像 INSERT の実行だけを失敗させる。
        event_table.insert.return_value.execute.return_value.data = [event]
        images_table.insert.return_value.execute.side_effect = RuntimeError('event_images insert failed')
        # 変数の内容: mock_admin_sb: テーブル別モックを順番に返す管理用Supabaseクライアント。
        mock_admin_sb = MagicMock()
        mock_admin_sb.table.side_effect = [event_table, images_table]

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: 例外をHTTP 500応答として受け取るAPIクライアント、resp: POST応答。
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post('/api/events', json={
                'name': 'テストイベント',
                'start_date': '2099-01-01',
                'location': '東京',
                'image_urls': ['https://example.com/event.jpg'],
            })

        # 2. イベントと画像の両方で INSERT を試みたこと、テーブル呼び出し順、500応答を確認する。
        assert resp.status_code == 500
        assert [args.args[0] for args in mock_admin_sb.table.call_args_list] == ['events', 'event_images']
        event_table.insert.assert_called_once()
        event_table.insert.return_value.execute.assert_called_once()
        images_table.insert.assert_called_once()
        images_table.insert.return_value.execute.assert_called_once()

    def test_イベント作成_認証なし_401(self):
        """POST /api/events で Authorization ヘッダーがない場合 401 が返る。

        Returns:
            なし。
        """
        # 認証バイパスをクリアして実際の require_auth を使う
        # 1. 認証バイパスを解除し、Authorization ヘッダーなしで POST /api/events を送る。
        app.dependency_overrides.clear()

        # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
        client = TestClient(app)
        resp = client.post('/api/events', json={
            'name': 'テストイベント',
            'start_date': '2099-01-01',
            'location': '東京',
        })

        assert resp.status_code == 401

    def test_イベント更新成功(self):
        """PUT /api/events/:id でイベントが正常に更新されて 200 が返る。

        Returns:
            なし。
        """
        # 変数の内容: event: 処理対象のイベント、mock_admin_sb: 管理用 Supabase クライアントのモック、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 更新後のイベントデータを組み立て、PUT /api/events/:id へ送信する。
        event = _event_data('evt-1', '更新後イベント')
        mock_admin_sb = MagicMock()
        mock_sb = _make_public_sb_mock([event])

        with patch('app.routes.events.admin_supabase', mock_admin_sb), \
             patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1', json={
                'name': '更新後イベント',
                'start_date': '2099-01-01',
                'location': '大阪',
            })

        assert resp.status_code == 200
        assert resp.json()['name'] == '更新後イベント'

    def test_イベント更新_画像をdisplay_order付きで入れ直す(self):
        """イベント更新後に全画像を削除し、指定順でURLを保存してイベントを返す。

        Returns:
            なし。
        """
        # 変数の内容: event: 読み直し行、event_table: 存在確認・更新用、images_table: 画像操作用、mock_admin_sb/mock_sb: 管理・公開DBモック、image_urls: 保存順の画像URL。
        event = _event_data('evt-1', '更新後イベント')
        event_table = MagicMock()
        images_table = MagicMock()
        mock_admin_sb = MagicMock()
        mock_sb = _make_public_sb_mock([event])
        # 1. テーブルごとのモックを関連付け、同一イベント表の存在確認と更新を順番に受け取る。
        mock_admin_sb.attach_mock(event_table, 'events_table')
        mock_admin_sb.attach_mock(images_table, 'event_images_table')
        mock_admin_sb.table.side_effect = [event_table, event_table, images_table, images_table]
        image_urls = ['https://example.com/first.jpg', 'https://example.com/second.jpg']

        with patch('app.routes.events.admin_supabase', mock_admin_sb), \
             patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: 更新後のAPI応答。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1', json={
                'name': '更新後イベント',
                'start_date': '2099-01-01',
                'location': '大阪',
                'image_urls': image_urls,
            })

        # 2. 更新成功と、各DBクエリが execute される順を確認する。
        assert resp.status_code == 200
        assert resp.json()['name'] == '更新後イベント'
        execution_names = [
            item[0]
            for item in mock_admin_sb.mock_calls
            if item[0] in {
                'events_table.update().eq().execute',
                'event_images_table.delete().eq().execute',
                'event_images_table.insert().execute',
            }
        ]
        assert execution_names == [
            'events_table.update().eq().execute',
            'event_images_table.delete().eq().execute',
            'event_images_table.insert().execute',
        ]
        event_table.update.return_value.eq.return_value.execute.assert_called_once()
        images_table.delete.return_value.eq.return_value.execute.assert_called_once()
        images_table.insert.return_value.execute.assert_called_once()
        images_table.insert.assert_called_once_with([
            {'event_id': 'evt-1', 'url': image_urls[0], 'display_order': 0},
            {'event_id': 'evt-1', 'url': image_urls[1], 'display_order': 1},
        ])

    def test_イベント更新_認証なし_401でDB書き込みしない(self):
        """PUT /api/events/:id は未認証なら401となりDBへ書き込まない。

        Returns:
            なし。
        """
        # 1. 認証をバイパスする設定を解除し、DB呼び出しを記録するモックを用意する。
        app.dependency_overrides.clear()
        mock_admin_sb = MagicMock()

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: 未認証のまま更新要求を送るAPIクライアント、resp: PUT応答。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1', json={
                'name': '更新後イベント',
                'start_date': '2099-01-01',
                'location': '大阪',
                'image_urls': ['https://example.com/event.jpg'],
            })

        # 2. 未認証応答で終わり、イベントや画像テーブルにアクセスしていないことを確認する。
        assert resp.status_code == 401
        mock_admin_sb.table.assert_not_called()
        app.dependency_overrides[require_auth] = lambda: None

    def test_イベント削除成功(self):
        """DELETE /api/events/:id でイベントが削除されて { ok: True } が返る。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 管理用DBモックを差し替え、DELETE /api/events/:id を送信する。
        mock_admin_sb = MagicMock()

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.delete('/api/events/evt-1')

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    def test_イベント削除のDB失敗時は500(self):
        """events.delete の実行失敗は既存API契約どおり HTTP 500 になる。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: DELETE の実行時だけ例外を返す管理用DBモック。
        mock_admin_sb = MagicMock()
        mock_admin_sb.table.return_value.delete.return_value.eq.return_value.execute.side_effect = RuntimeError('events delete failed')

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: 例外をHTTP 500応答として受け取るAPIクライアント、resp: DELETE応答。
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.delete('/api/events/evt-1')

        # 1. status=500 と削除クエリの実行を確認し、成功応答にならないことを確かめる。
        assert resp.status_code == 500
        mock_admin_sb.table.assert_called_once_with('events')
        mock_admin_sb.table.return_value.delete.assert_called_once_with()
        mock_admin_sb.table.return_value.delete.return_value.eq.assert_called_once_with('id', 'evt-1')
        mock_admin_sb.table.return_value.delete.return_value.eq.return_value.execute.assert_called_once_with()

    def test_イベント削除_認証なし_401(self):
        """DELETE /api/events/:id で Authorization ヘッダーがない場合 401 が返る。

        Returns:
            なし。
        """
        # 1. 認証バイパスを解除し、Authorization ヘッダーなしで削除要求を送る。
        app.dependency_overrides.clear()
        # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
        client = TestClient(app)
        resp = client.delete('/api/events/evt-1')
        # teardown で再設定するために戻す
        app.dependency_overrides[require_auth] = lambda: None
        assert resp.status_code == 401

    def test_イベント1件取得成功(self):
        """GET /api/events/:id でイベントが slug または UUID で取得できる。

        Returns:
            なし。
        """
        # 変数の内容: event: 処理対象のイベント、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 公開用DBモックに対象イベントを設定し、そのIDで取得要求を送る。
        event = _event_data('evt-1')
        mock_sb = _make_public_sb_mock([event])

        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/evt-1')

        assert resp.status_code == 200
        assert resp.json()['id'] == 'evt-1'

    def test_イベント1件取得_存在しない場合_404(self):
        """GET /api/events/:id で対象が見つからない場合 404 が返る。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 公開用DBモックを空にし、存在しないIDで取得要求を送る。
        mock_sb = _make_public_sb_mock([])
        # id 検索でも空を返すよう設定（slug→id の両方が空）
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []

        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/nonexistent')

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# クラス: 収支管理
# ---------------------------------------------------------------------------

class TestEventFinances:
    """収支情報の取得・保存エンドポイントのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。

        Returns:
            なし。
        """
        # 1. 認証をバイパスするよう設定する。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。

        Returns:
            なし。
        """
        # 1. dependency_overrides をリセットする。
        app.dependency_overrides.clear()

    def test_全収支一覧取得成功(self):
        """GET /api/events/finances で全イベントの収支一覧が返る。

        Returns:
            なし。
        """
        # 変数の内容: finances_list: イベント収支一覧の API 応答、mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 管理用DBモックに複数の収支行を設定し、一覧を取得する。
        finances_list = [
            {'id': 'fin-1', 'event_id': 'evt-1', 'sales': 50000},
            {'id': 'fin-2', 'event_id': 'evt-2', 'sales': 30000},
        ]
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.select.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_admin_sb.table.return_value.select.return_value.execute.return_value.data = finances_list

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/finances')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返すイベント収支レコード一覧。。
        data = resp.json()
        assert len(data) == 2
        assert data[0]['sales'] == 50000

    def test_全収支一覧取得_認証なし_401(self):
        """GET /api/events/finances で Authorization ヘッダーがない場合 401 が返る。

        Returns:
            なし。
        """
        # 1. 認証バイパスを解除し、Authorization ヘッダーなしで一覧を要求する。
        app.dependency_overrides.clear()
        # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
        client = TestClient(app)
        resp = client.get('/api/events/finances')
        app.dependency_overrides[require_auth] = lambda: None
        assert resp.status_code == 401

    def test_個別収支取得_既存レコードあり(self):
        """GET /api/events/:id/finances で既存レコードがある場合はそのデータを返す。

        Returns:
            なし。
        """
        # 変数の内容: finance: 対象イベントの収支データ、mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 対象イベントの収支行を管理用DBモックに設定して取得する。
        finance = {'id': 'fin-1', 'event_id': 'evt-1', 'sales': 80000, 'booth_fee': 10000}
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [finance]

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/evt-1/finances')

        assert resp.status_code == 200
        assert resp.json()['sales'] == 80000

    def test_個別収支取得_未登録の場合デフォルト値(self):
        """GET /api/events/:id/finances でレコードがない場合はデフォルト値を返す。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 収支行が存在しない応答を管理用DBモックに設定して取得する。
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/evt-new/finances')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す既存収支レコード。。
        data = resp.json()
        # デフォルト値が設定されていること
        assert data['sales'] == 0
        assert data['payment_flag'] is False
        assert data['event_id'] == 'evt-new'

    def test_収支保存はevent_idを競合キーにしたupsertで保存される(self):
        """PUT /api/events/:id/finances は event_id を on_conflict にした upsert 1 回で保存し、保存した行を返す。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、saved: DB への保存が成功したかを示す値。
        saved = {'id': 'fin-new', 'event_id': 'evt-1', 'sales': 100000}
        mock_admin_sb = MagicMock()
        # upsert の戻り値
        mock_admin_sb.table.return_value.upsert.return_value.execute.return_value.data = [saved]

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/finances', json={'sales': 100000})

        # 1. 応答は保存した行
        assert resp.status_code == 200
        assert resp.json()['sales'] == 100000
        # 2. upsert に event_id と on_conflict='event_id' が渡る
        args, kwargs = mock_admin_sb.table.return_value.upsert.call_args
        assert args[0]['event_id'] == 'evt-1'
        assert args[0]['sales'] == 100000
        assert 'updated_at' in args[0]
        assert kwargs.get('on_conflict') == 'event_id'
        # 3. 読んでから insert / update する古い流れは使わない
        mock_admin_sb.table.return_value.insert.assert_not_called()
        mock_admin_sb.table.return_value.update.assert_not_called()

    def test_収支保存は既存の行があっても同じupsertで上書きされる(self):
        """PUT /api/events/:id/finances は既存の行があっても upsert で上書きし、更新後の行を返す。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、updated: 更新後の DB レコード。
        # 1. 既存行を持つDBモックへ収支データを送信し、upsert結果を受け取る。
        updated = {'id': 'fin-1', 'event_id': 'evt-1', 'sales': 120000}
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.upsert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_admin_sb.table.return_value.upsert.return_value.execute.return_value.data = [updated]

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/finances', json={'sales': 120000})

        assert resp.status_code == 200
        assert resp.json()['sales'] == 120000
        assert mock_admin_sb.table.return_value.upsert.call_count == 1


# ---------------------------------------------------------------------------
# クラス: セッション管理
# ---------------------------------------------------------------------------

class TestEventSessions:
    """セッション取得・保存エンドポイントのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。

        Returns:
            なし。
        """
        # 1. 認証をバイパスするよう設定する。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。

        Returns:
            なし。
        """
        # 1. dependency_overrides をリセットする。
        app.dependency_overrides.clear()

    def test_セッション取得成功(self):
        """GET /api/events/:id/sessions でセッション一覧と予約数が返る。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、sessions: 対象となる予約時間枠の一覧。
        # 1. セッションと予約数をDBモックへ設定し、対象イベントの一覧を取得する。
        sessions = [
            {'id': 'ses-1', 'event_id': 'evt-1', 'time_label': '10:00', 'max_participants': 5},
            {'id': 'ses-2', 'event_id': 'evt-1', 'time_label': '14:00', 'max_participants': 5},
        ]
        mock_admin_sb = MagicMock()

        # セッション取得チェーン
        def table_side_effect(name: str):
            """テーブル名に応じて異なるモックを返す。

            Args:
                name: Supabase のテーブル名。

            Returns:
                なし。
            """
            # 変数の内容: tbl_mock: 対象テーブルのクエリモック。
            tbl_mock = MagicMock()
            if name == 'ws_sessions':
                # 変数の内容: tbl_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
                tbl_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = sessions
            elif name == 'workshop_reservations':
                # 予約なし
                tbl_mock.select.return_value.eq.return_value.neq.return_value.execute.return_value.data = []
            return tbl_mock

        # 変数の内容: mock_admin_sb.table.side_effect: モック呼び出し時に返す例外または副作用。
        mock_admin_sb.table.side_effect = table_side_effect

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/11111111-1111-1111-1111-111111111111/sessions')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返すワークショップ時間枠一覧。。
        data = resp.json()
        assert len(data) == 2
        # 予約なしなので reserved_count は 0
        assert data[0]['reserved_count'] == 0

    def test_セッション取得_空の場合空リスト(self):
        """GET /api/events/:id/sessions でセッションがない場合は空リストを返す。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. セッションがない状態をDBモックに設定し、対象イベントの一覧を取得する。
        mock_admin_sb = MagicMock()
        # 変数の内容: mock_admin_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/11111111-1111-1111-1111-111111111111/sessions')

        assert resp.status_code == 200
        assert resp.json() == []

    def test_セッション保存成功(self):
        """PUT /api/events/:id/sessions でセッションが保存されて最新の一覧が返る。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. セッション情報を送信し、保存後の一覧応答を受け取る。
        mock_admin_sb = MagicMock()

        # 既存セッションなし（新規挿入になる）
        existing_sessions_mock = MagicMock()
        # 変数の内容: existing_sessions_mock.data: モックのクエリ応答に含めるデータ。
        existing_sessions_mock.data = []

        # 保存後のセッション一覧
        saved_sessions = [
            {'id': 'ses-new', 'event_id': 'evt-1', 'time_label': '11:00', 'max_participants': 8},
        ]

        call_count = {'n': 0}

        def table_side_effect(name: str):
            """テーブル名に応じて適切なモックを返す。

            Args:
                name: Supabase のテーブル名。

            Returns:
                なし。
            """
            # 変数の内容: tbl_mock: 対象テーブルのクエリモック。
            tbl_mock = MagicMock()
            if name == 'ws_sessions':
                # 既存セッション取得（select で id/time_label だけ）
                tbl_mock.select.return_value.eq.return_value.execute.return_value.data = []
                # 保存後の select * 取得
                tbl_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = saved_sessions
                # insert の戻り値
                tbl_mock.insert.return_value.execute.return_value.data = [{'id': 'ses-new'}]
            elif name == 'workshop_reservations':
                # 変数の内容: tbl_mock.select.return_value.eq.return_value.neq.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
                tbl_mock.select.return_value.eq.return_value.neq.return_value.execute.return_value.data = []
            return tbl_mock

        # 変数の内容: mock_admin_sb.table.side_effect: モック呼び出し時に返す例外または副作用。
        mock_admin_sb.table.side_effect = table_side_effect

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/11111111-1111-1111-1111-111111111111/sessions', json={
                'sessions': [{'time_label': '11:00', 'max_participants': 8}]
            })

        assert resp.status_code == 200

    def test_既存セッションを更新し不要枠を削除して一覧を返す(self):
        """入力に残る既存枠を更新し、外れた枠を削除して更新後一覧を返す。

        Returns:
            なし。
        """
        # 変数の内容: event_id: 対象UUID、kept_id/removed_id: 残す/削除する枠ID、saved_session: 読み直し行、mock_admin_sb/sessions_table: DBモック。
        event_id = '11111111-1111-1111-1111-111111111111'
        kept_id = 'session-kept'
        removed_id = 'session-removed'
        saved_session = {
            'id': kept_id,
            'event_id': event_id,
            'time_label': '10:00',
            'max_participants': 8,
            'display_order': 0,
        }
        mock_admin_sb, _, sessions_table = _make_sessions_admin_mocks([
            {'id': kept_id, 'time_label': '10:00'},
            {'id': removed_id, 'time_label': '11:00'},
        ])
        # 1. 保存後の一覧取得が返す更新済み時間枠を設定する。
        sessions_table.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [saved_session]

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: 保存後のAPI応答。
            client = TestClient(app)
            resp = client.put(f'/api/events/{event_id}/sessions', json={
                'sessions': [{'id': kept_id, 'time_label': '10:00', 'max_participants': 8}],
            })

        # 2. 既存枠の更新から不要枠の削除へ進み、更新後一覧を返したことを確認する。
        assert resp.status_code == 200
        assert resp.json() == [{**saved_session, 'reserved_count': 0}]
        # 変数の内容: sessions_table.mock_calls: セッション表へのDB呼び出し順。
        assert sessions_table.mock_calls.index(call.update().eq().execute()) < sessions_table.mock_calls.index(
            call.delete().eq().execute()
        )
        sessions_table.update.assert_called_once_with({
            'time_label': '10:00',
            'max_participants': 8,
            'display_order': 0,
        })
        sessions_table.delete.return_value.eq.assert_called_once_with('id', removed_id)
        sessions_table.insert.assert_not_called()

    def test_既存セッション更新失敗時は500で後続操作をしない(self):
        """既存セッションの UPDATE 失敗は500となり、後続の削除へ進まない。

        Returns:
            なし。
        """
        # 変数の内容: session_id: 更新対象ID、mock_admin_sb: DBクライアント、sessions_table: セッションテーブル。
        session_id = 'session-existing'
        mock_admin_sb, _, sessions_table = _make_sessions_admin_mocks([
            {'id': session_id, 'time_label': '10:00'},
            {'id': 'session-omitted', 'time_label': '11:00'},
        ])
        # 1. 最初の既存セッション更新で例外を発生させ、以降の処理を止める。
        sessions_table.update.return_value.eq.return_value.execute.side_effect = RuntimeError('session update failed')

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: 例外をHTTP 500応答として受け取るAPIクライアント、resp: PUT応答。
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.put('/api/events/11111111-1111-1111-1111-111111111111/sessions', json={
                'sessions': [{'id': session_id, 'time_label': '10:00', 'max_participants': 8}],
            })

        # 2. イベント存在確認と更新を行い、insert・deleteには進まないことを確かめる。
        assert resp.status_code == 500
        sessions_table.update.assert_called_once()
        sessions_table.update.return_value.eq.return_value.execute.assert_called_once()
        sessions_table.insert.assert_not_called()
        sessions_table.delete.assert_not_called()

    def test_新規セッションinsert失敗時は500(self):
        """新しいセッションの INSERT 失敗は500となる。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: テーブル別モックを返すDBクライアント、sessions_table: セッションテーブルモック。
        mock_admin_sb, _, sessions_table = _make_sessions_admin_mocks([])
        # 1. 新規セッションの INSERT 実行で例外を発生させる。
        sessions_table.insert.return_value.execute.side_effect = RuntimeError('session insert failed')

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: 例外をHTTP 500応答として受け取るAPIクライアント、resp: PUT応答。
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.put('/api/events/11111111-1111-1111-1111-111111111111/sessions', json={
                'sessions': [{'time_label': '10:00', 'max_participants': 8}],
            })

        # 2. 新規INSERTだけが呼ばれ、HTTP 500になることを確認する。
        assert resp.status_code == 500
        sessions_table.insert.assert_called_once()
        sessions_table.insert.return_value.execute.assert_called_once()
        sessions_table.update.assert_not_called()
        sessions_table.delete.assert_not_called()

    def test_不要セッションdelete失敗時は先行更新後に500(self):
        """不要セッションの DELETE 失敗は、先行する既存枠 UPDATE 後に500となる。

        Returns:
            なし。
        """
        # 変数の内容: kept_id: 入力に残す既存枠、removed_id: 入力に含めず削除対象にする既存枠。
        kept_id = 'session-kept'
        removed_id = 'session-removed'
        mock_admin_sb, _, sessions_table = _make_sessions_admin_mocks([
            {'id': kept_id, 'time_label': '10:00'},
            {'id': removed_id, 'time_label': '11:00'},
        ])
        # 1. 既存枠の更新を成功させたあと、不要枠の削除実行で例外を発生させる。
        sessions_table.delete.return_value.eq.return_value.execute.side_effect = RuntimeError('session delete failed')

        # 変数の内容: readback_spy: 削除失敗後にセッション一覧の読み直しへ進んだかを記録するspy。
        with patch('app.routes.events.admin_supabase', mock_admin_sb), \
             patch('app.routes.events._sessions_with_counts') as readback_spy:
            # 変数の内容: client: 例外をHTTP 500応答として受け取るAPIクライアント、resp: PUT応答。
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.put('/api/events/11111111-1111-1111-1111-111111111111/sessions', json={
                'sessions': [{'id': kept_id, 'time_label': '10:00', 'max_participants': 8}],
            })

        # 2. 更新・削除の順で実行されてから500になることを確認する。
        assert resp.status_code == 500
        assert sessions_table.mock_calls.index(call.update().eq().execute()) < sessions_table.mock_calls.index(
            call.delete().eq().execute()
        )
        sessions_table.update.assert_called_once()
        sessions_table.delete.assert_called_once()
        sessions_table.delete.return_value.eq.assert_called_once_with('id', removed_id)
        # 3. 削除実行の失敗でAPIが終了し、最新一覧を読み直さないことを確認する。
        readback_spy.assert_not_called()

    def test_セッション保存_認証なし_401でDB書き込みしない(self):
        """PUT /api/events/:id/sessions は未認証なら401となりDBへ書き込まない。

        Returns:
            なし。
        """
        # 1. 認証バイパスを解除し、DBアクセスを検出するモックを用意する。
        app.dependency_overrides.clear()
        mock_admin_sb = MagicMock()

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: 未認証で保存要求を送るAPIクライアント、resp: PUT応答。
            client = TestClient(app)
            resp = client.put('/api/events/11111111-1111-1111-1111-111111111111/sessions', json={
                'sessions': [],
            })

        # 2. 401で終了し、DB操作のためのテーブル参照自体が無いことを確認する。
        assert resp.status_code == 401
        mock_admin_sb.table.assert_not_called()
        app.dependency_overrides[require_auth] = lambda: None


# ---------------------------------------------------------------------------
# クラス: ページコンテンツ保存
# ---------------------------------------------------------------------------

class TestPageContent:
    """ページコンテンツ保存エンドポイントのテスト。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。

        Returns:
            なし。
        """
        # 1. 認証をバイパスするよう設定する。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。

        Returns:
            なし。
        """
        # 1. dependency_overrides をリセットする。
        app.dependency_overrides.clear()

    def test_ページコンテンツ保存成功(self):
        """PATCH /api/events/:id/page でページコンテンツが更新されてイベントが返る。

        Returns:
            なし。
        """
        # 変数の内容: event: 処理対象のイベント、mock_admin_sb: 管理用 Supabase クライアントのモック、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. ページコンテンツを更新要求として送り、更新後のイベント応答を受け取る。
        event = _event_data('evt-1')
        mock_admin_sb = MagicMock()
        mock_sb = _make_public_sb_mock([event])

        with patch('app.routes.events.admin_supabase', mock_admin_sb), \
             patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.patch('/api/events/evt-1/page', json={
                'page_content': {'sections': [{'type': 'text', 'body': 'こんにちは'}]}
            })

        assert resp.status_code == 200
        assert resp.json()['id'] == 'evt-1'

    def test_ページコンテンツ保存_認証なし_401(self):
        """PATCH /api/events/:id/page で Authorization ヘッダーがない場合 401 が返る。

        Returns:
            なし。
        """
        # 1. 認証バイパスを解除し、Authorization ヘッダーなしで更新要求を送る。
        app.dependency_overrides.clear()
        # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
        client = TestClient(app)
        resp = client.patch('/api/events/evt-1/page', json={
            'page_content': {}
        })
        app.dependency_overrides[require_auth] = lambda: None
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# クラス: 管理情報（admin-info）
# ---------------------------------------------------------------------------

def _make_admin_info_sb(
    info_rows: list | None = None,
    event_rows: list | None = None,
    select_exc: Exception | None = None,
    exists_exc: Exception | None = None,
    upsert_exc: Exception | None = None,
) -> tuple[MagicMock, dict]:
    """管理情報 API 用の admin_supabase モックを、テーブルごとに別のモックを返す形で作る。

    管理情報は専用テーブル event_admin_info に保存され、events テーブルは保存時の存在確認
    （select('id')）にだけ使われる。テーブルごとにモックを分けて、どのテーブルに何をしたかを確かめられるようにする。

    Args:
        info_rows: event_admin_info の select('info').eq('event_id', ...) が返す行のリスト（既定は []）
        event_rows: events の select('id').eq('id', ...) が返す行のリスト（既定は 1件あり）
        select_exc: event_admin_info の select 実行時に投げる例外（None なら投げない）
        exists_exc: events の存在確認の実行時に投げる例外（None なら投げない）
        upsert_exc: event_admin_info の upsert 実行時に投げる例外（None なら投げない）

    Returns:
        (admin_supabase のモック, {'events': events テーブルのモック, 'event_admin_info': 管理情報テーブルのモック})
    """
    # 1. テーブルごとのモックを用意する
    events_tbl = MagicMock()
    info_tbl = MagicMock()
    # 2. events: 存在確認の select('id').eq('id', ...).execute()
    exists_exec = events_tbl.select.return_value.eq.return_value.execute
    if exists_exc is not None:
        # 変数の内容: exists_exec.return_value.data: モックのクエリ応答に含めるデータ、exists_exec.side_effect: モック呼び出し時に返す例外または副作用。
        exists_exec.side_effect = exists_exc
    else:
        exists_exec.return_value.data = [{'id': 'evt-1'}] if event_rows is None else event_rows
    # 3. event_admin_info: 取得の select('info').eq('event_id', ...).execute()
    select_exec = info_tbl.select.return_value.eq.return_value.execute
    if select_exc is not None:
        # 変数の内容: select_exec.return_value.data: モックのクエリ応答に含めるデータ、select_exec.side_effect: モック呼び出し時に返す例外または副作用。
        select_exec.side_effect = select_exc
    else:
        select_exec.return_value.data = [] if info_rows is None else info_rows
    # 4. event_admin_info: 保存の upsert(...).execute()
    upsert_exec = info_tbl.upsert.return_value.execute
    if upsert_exc is not None:
        # 変数の内容: upsert_exec.return_value.data: モックのクエリ応答に含めるデータ、upsert_exec.side_effect: モック呼び出し時に返す例外または副作用。
        upsert_exec.side_effect = upsert_exc
    else:
        upsert_exec.return_value.data = [{'event_id': 'evt-1'}]
    # 5. テーブル名に応じてモックを返す（想定外のテーブル名はテスト失敗にする）
    tables = {'events': events_tbl, 'event_admin_info': info_tbl}

    def table_side_effect(name: str):
        """テーブル名に応じたモックを返す。

        Args:
            name: Supabase のテーブル名。

        Returns:
            指定されたテーブル名に対応するテスト用クエリモックを返す。
        """
        # 1. テーブル名に応じたモックを返す。
        assert name in tables, f'想定外のテーブルにアクセスした: {name}'
        return tables[name]

    # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    # 変数の内容: mock_sb.table.side_effect: モック呼び出し時に返す例外または副作用。
    mock_sb.table.side_effect = table_side_effect
    return mock_sb, tables


def _saved_info(tables: dict) -> dict:
    """event_admin_info の upsert に渡された管理情報（info）を取り出して返す。

    Args:
        tables: _make_admin_info_sb が返したテーブルごとのモック

    Returns:
        upsert の1つ目の引数の 'info' の dict
    """
    # 1. event_admin_info の upsert に渡された管理情報（info）を取り出して返す。
    return tables['event_admin_info'].upsert.call_args.args[0]['info']


class TestEventAdminInfo:
    """管理情報の取得・保存エンドポイントのテスト（保存先は専用テーブル event_admin_info）。"""

    def setup_method(self):
        """認証をバイパスするよう設定する。

        Returns:
            なし。
        """
        # 1. 認証をバイパスするよう設定する。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """dependency_overrides をリセットする。

        Returns:
            なし。
        """
        # 1. dependency_overrides をリセットする。
        app.dependency_overrides.clear()

    # ----- 取得 -----

    def test_管理情報取得_admin_infoが返る(self):
        """GET /api/events/:id/admin-info で event_admin_info の info がそのまま返る。

        Returns:
            なし。
        """
        # 1. event_admin_info に管理情報の行があるようにモックする
        admin_info = {'carry_in_time': '9:00', 'hotel_name': 'テストホテル', 'booth_fee': 30000}
        # 変数の内容: mock_admin_sb: 管理者用 Supabase クライアントを置き換えるモック。
        mock_admin_sb, tables = _make_admin_info_sb(info_rows=[{'info': admin_info}])

        # 2. エンドポイントを呼んでレスポンスを検証する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/evt-1/admin-info')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックから返すイベント管理情報レコード。。
        data = resp.json()
        assert data['carry_in_time'] == '9:00'
        assert data['hotel_name'] == 'テストホテル'
        assert data['booth_fee'] == 30000
        # 3. 専用テーブルを event_id で絞り込んで読んでいる（events テーブルは読まない）
        tables['event_admin_info'].select.assert_called_once_with('info')
        tables['event_admin_info'].select.return_value.eq.assert_called_once_with('event_id', 'evt-1')
        tables['events'].select.assert_not_called()

    def test_管理情報取得_admin_infoがnullのとき空dictを返す(self):
        """GET /api/events/:id/admin-info で行の info が null のとき {} を返す。

        Returns:
            なし。
        """
        # 1. info が None の行をモックに設定する
        mock_admin_sb, _ = _make_admin_info_sb(info_rows=[{'info': None}])

        # 2. エンドポイントを呼んで空 dict が返ることを確認する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/evt-1/admin-info')

        assert resp.status_code == 200
        assert resp.json() == {}

    def test_管理情報取得_行が無いとき空dictを返す(self):
        """GET /api/events/:id/admin-info で event_admin_info に行が無い（未登録）とき {} を返す。

        Returns:
            なし。
        """
        # 1. 行が無い（空リスト）ようにモックする
        mock_admin_sb, _ = _make_admin_info_sb(info_rows=[])

        # 2. エンドポイントを呼んで空 dict が返ることを確認する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/evt-1/admin-info')

        assert resp.status_code == 200
        assert resp.json() == {}

    def test_管理情報取得_DB例外時に500を返す(self):
        """GET /api/events/:id/admin-info で event_admin_info の取得が例外を投げると 500 が返る。

        Returns:
            なし。
        """
        # 1. select の実行で例外を投げるようにする
        mock_admin_sb, _ = _make_admin_info_sb(select_exc=Exception('DB connection error'))

        # 2. 500 が返り、例外の中身は応答に出ない
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/evt-1/admin-info')

        assert resp.status_code == 500
        assert 'DB connection error' not in resp.text

    def test_管理情報取得_認証なし_401(self):
        """GET /api/events/:id/admin-info で Authorization ヘッダーがない場合 401 が返る。

        Returns:
            なし。
        """
        # 1. 認証バイパスをクリアして実際の require_auth を使う
        app.dependency_overrides.clear()
        # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
        client = TestClient(app)
        resp = client.get('/api/events/evt-1/admin-info')
        # 2. テスト後に認証バイパスを戻す（teardown_method が呼ばれるまでの補完）
        app.dependency_overrides[require_auth] = lambda: None

        assert resp.status_code == 401

    def test_管理情報取得_出店要項が返る(self):
        """GET /api/events/:id/admin-info で保存済みの guidelines_text / guidelines_image_urls がそのまま返る。

        Returns:
            なし。
        """
        # 1. 出店要項を含む info をモックに設定する
        admin_info = {
            'notes': None,
            'guidelines_text': '要項',
            'guidelines_image_urls': ['https://ex.com/gl-1.png', 'https://ex.com/gl-2.png'],
        }
        # 変数の内容: mock_admin_sb: 管理者用 Supabase クライアントを置き換えるモック。
        mock_admin_sb, _ = _make_admin_info_sb(info_rows=[{'info': admin_info}])

        # 2. 取得して中身を確認する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.get('/api/events/evt-1/admin-info')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックから返す出店要項レコード。。
        data = resp.json()
        assert data['guidelines_text'] == '要項'
        assert data['guidelines_image_urls'] == ['https://ex.com/gl-1.png', 'https://ex.com/gl-2.png']

    # ----- 保存 -----

    def test_管理情報保存_okが返る(self):
        """PUT /api/events/:id/admin-info で管理情報を保存して {"ok": True} が返る。

        Returns:
            なし。
        """
        # 1. イベントが存在し、upsert も成功するようにモックする
        mock_admin_sb, tables = _make_admin_info_sb()

        # 2. エンドポイントを呼んで {"ok": True} が返ることを確認する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/admin-info', json={
                'carry_in_time': '9:00',
                'hotel_name': 'テストホテル',
                'booth_fee': 30000,
            })

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        tables['event_admin_info'].upsert.assert_called_once()

    def test_管理情報保存_認証なし_401(self):
        """PUT /api/events/:id/admin-info で Authorization ヘッダーがない場合 401 が返る。

        Returns:
            なし。
        """
        # 1. 認証バイパスをクリアして実際の require_auth を使う
        app.dependency_overrides.clear()
        # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
        client = TestClient(app)
        resp = client.put('/api/events/evt-1/admin-info', json={'carry_in_time': '9:00'})
        # 2. テスト後に認証バイパスを戻す
        app.dependency_overrides[require_auth] = lambda: None

        assert resp.status_code == 401

    def test_管理情報保存_upsertにevent_idとinfoとupdated_atとon_conflictが渡る(self):
        """PUT /api/events/:id/admin-info で event_admin_info に event_id・info・updated_at を on_conflict='event_id' で upsert する。

        Returns:
            なし。
        """
        from datetime import datetime
        # 1. イベントが存在するようにモックする
        mock_admin_sb, tables = _make_admin_info_sb()

        # 2. 保存する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).put('/api/events/evt-1/admin-info', json={'hotel_name': 'テストホテル'})

        assert resp.status_code == 200
        # 3. upsert の引数を確認する
        upsert = tables['event_admin_info'].upsert
        upsert.assert_called_once()
        # 変数の内容: row: 処理対象のデータ行。
        row = upsert.call_args.args[0]
        assert set(row.keys()) == {'event_id', 'info', 'updated_at'}
        assert row['event_id'] == 'evt-1'
        assert row['info']['hotel_name'] == 'テストホテル'
        # updated_at はタイムゾーン付きの ISO 形式の日時文字列
        parsed = datetime.fromisoformat(row['updated_at'])
        assert parsed.tzinfo is not None
        assert upsert.call_args.kwargs.get('on_conflict') == 'event_id'
        upsert.return_value.execute.assert_called_once()

    def test_管理情報保存_eventsテーブルは存在確認のselectだけでupdateしない(self):
        """PUT /api/events/:id/admin-info で events テーブルには select('id').eq('id', id) だけを行い、update・upsert・insert はしない。

        Returns:
            なし。
        """
        # 1. イベントが存在するようにモックする
        mock_admin_sb, tables = _make_admin_info_sb()

        # 2. 保存する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).put('/api/events/evt-1/admin-info', json={'notes': 'メモ'})

        assert resp.status_code == 200
        # 3. events への操作は存在確認の select だけ
        events_tbl = tables['events']
        events_tbl.select.assert_called_once_with('id')
        events_tbl.select.return_value.eq.assert_called_once_with('id', 'evt-1')
        events_tbl.update.assert_not_called()
        events_tbl.upsert.assert_not_called()
        events_tbl.insert.assert_not_called()
        # 4. 管理情報テーブルには upsert だけ（update・insert は使わない）
        tables['event_admin_info'].upsert.assert_called_once()
        tables['event_admin_info'].update.assert_not_called()
        tables['event_admin_info'].insert.assert_not_called()

    def test_管理情報保存_イベントが存在しないと404でupsertしない(self):
        """PUT /api/events/:id/admin-info で events に対象が無いと 404 になり、event_admin_info への upsert は呼ばれない。

        Returns:
            なし。
        """
        # 1. 存在確認が空を返すようにモックする
        mock_admin_sb, tables = _make_admin_info_sb(event_rows=[])

        # 2. 保存する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).put('/api/events/no-such-evt/admin-info', json={'notes': 'メモ'})

        # 3. 404 で、管理情報テーブルには書き込まない
        assert resp.status_code == 404
        tables['events'].select.return_value.eq.assert_called_once_with('id', 'no-such-evt')
        tables['event_admin_info'].upsert.assert_not_called()

    def test_管理情報保存_存在確認で例外が出ると500でupsertしない(self):
        """PUT /api/events/:id/admin-info で events の存在確認が例外を投げると 500 になり、upsert は呼ばれない。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、tables: テスト用テーブルデータ。
        # 1. PUT /api/events/:id/admin-info で events の存在確認が例外を投げると 500 になり、upsert は呼ばれない。
        mock_admin_sb, tables = _make_admin_info_sb(exists_exc=Exception('DB connection error'))

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).put('/api/events/evt-1/admin-info', json={'notes': 'メモ'})

        assert resp.status_code == 500
        tables['event_admin_info'].upsert.assert_not_called()

    def test_管理情報保存_出店要項の文章と画像URLがDBに保存される(self):
        """PUT /api/events/:id/admin-info で guidelines_text と guidelines_image_urls が info に入って event_admin_info に upsert される。

        Returns:
            なし。
        """
        # 1. イベントが存在するようにモックする
        mock_admin_sb, tables = _make_admin_info_sb()
        urls = ['https://ex.com/gl-1.png', 'https://ex.com/gl-2.png']

        # 2. 出店要項を含めて保存する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/admin-info', json={
                'notes': 'メモ',
                'guidelines_text': '出店要項の本文\n搬入は9時まで',
                'guidelines_image_urls': urls,
            })

        # 3. upsert に渡された info に出店要項が順番どおり入っていることを確認する
        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        # 変数の内容: saved: DB への保存が成功したかを示す値。
        saved = _saved_info(tables)
        assert saved['guidelines_text'] == '出店要項の本文\n搬入は9時まで'
        assert saved['guidelines_image_urls'] == urls
        assert saved['notes'] == 'メモ'
        assert tables['event_admin_info'].upsert.call_args.args[0]['event_id'] == 'evt-1'

    def test_管理情報保存_出店要項を省略すると既定値になる(self):
        """PUT /api/events/:id/admin-info で guidelines_* を送らないと text は None・画像は [] で保存される。

        Returns:
            なし。
        """
        # 1. イベントが存在するようにモックする
        mock_admin_sb, tables = _make_admin_info_sb()

        # 2. 出店要項を含めずに保存する（出店要項追加前のクライアントと同じ送り方）
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/admin-info', json={'carry_in_time': '2099-01-01T09:00'})

        # 3. 既定値で保存されることを確認する
        assert resp.status_code == 200
        # 変数の内容: saved: DB への保存が成功したかを示す値。
        saved = _saved_info(tables)
        assert saved['guidelines_text'] is None
        assert saved['guidelines_image_urls'] == []

    def test_管理情報保存_出店要項の画像URLを空配列で送ると空配列で保存される(self):
        """PUT /api/events/:id/admin-info で guidelines_image_urls=[] を送ると [] で保存される（全削除）。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、tables: テスト用テーブルデータ。
        # 1. PUT /api/events/:id/admin-info で guidelines_image_urls=[] を送ると [] で保存される…。
        mock_admin_sb, tables = _make_admin_info_sb()

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/admin-info', json={'guidelines_text': None, 'guidelines_image_urls': []})

        assert resp.status_code == 200
        # 変数の内容: saved: DB への保存が成功したかを示す値。
        saved = _saved_info(tables)
        assert saved['guidelines_image_urls'] == []
        assert saved['guidelines_text'] is None

    def test_管理情報保存_出店要項の画像URLが配列でないと422(self):
        """PUT /api/events/:id/admin-info で guidelines_image_urls に文字列を送ると 422 になり DB は更新されない。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、tables: テスト用テーブルデータ。
        # 1. PUT /api/events/:id/admin-info で guidelines_image_urls に文字列を送ると 422 になり …。
        mock_admin_sb, tables = _make_admin_info_sb()

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/admin-info', json={'guidelines_image_urls': 'https://ex.com/a.png'})

        assert resp.status_code == 422
        # 入力チェックで止まるので、どのテーブルにも触れない
        mock_admin_sb.table.assert_not_called()
        tables['event_admin_info'].upsert.assert_not_called()
        tables['events'].update.assert_not_called()

    def test_管理情報保存_DB更新失敗時に500を返す(self):
        """PUT /api/events/:id/admin-info で event_admin_info への upsert が例外を投げたとき 500 が返る。

        Returns:
            なし。
        """
        # 1. upsert の実行が例外を投げるよう設定する
        mock_admin_sb, tables = _make_admin_info_sb(upsert_exc=Exception('DB connection error'))

        # 2. エンドポイントを呼んで 500 が返ることを確認する
        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: client: テスト対象の API クライアント、resp: API から返されたレスポンス。
            client = TestClient(app)
            resp = client.put('/api/events/evt-1/admin-info', json={'carry_in_time': '9:00'})

        assert resp.status_code == 500
        assert 'DB connection error' not in resp.text
        tables['event_admin_info'].upsert.assert_called_once()


# ---------------------------------------------------------------------------
# クラス: 公開 API に管理情報（admin_info）が出ないこと
# ---------------------------------------------------------------------------

def _admin_info_secret() -> dict:
    """公開してはいけない管理情報（搬入・宿泊・出店料・出店要項）のサンプルを返す。

    Returns:
        dict を返す。
    """
    # 1. 公開してはいけない管理情報（搬入・宿泊・出店料・出店要項）のサンプルを返す。
    return {
        'carry_in_time': '2099-01-01T08:30',
        'hotel_name': '秘密のホテル',
        'hotel_fee': 8000,
        'booth_fee': 30000,
        'notes': '内部メモ',
        'guidelines_text': '出店要項の本文',
        'guidelines_image_urls': ['https://ex.com/gl-1.png'],
    }


def _make_list_sb_mock(events_data: list) -> MagicMock:
    """一覧 API（list_events）用の公開 supabase モックを返す。

    Args:
        events_data: イベント一覧 API が返すテスト用イベント行。

    Returns:
        MagicMock を返す。
    """
    # 1. 管理一覧で使う複数テーブルの応答をモックへ登録する。
    # 変数の内容: chain: Supabase クエリの呼び出し連鎖モック、mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    chain = mock_sb.table.return_value
    # supabase.table('events').select('*').order('start_date').execute().data
    chain.select.return_value.order.return_value.execute.return_value.data = events_data
    # supabase.table('event_images').select('*').in_(...).order(...).execute().data
    chain.select.return_value.in_.return_value.order.return_value.execute.return_value.data = [
        {'id': 'img-1', 'event_id': 'evt-1', 'url': 'https://ex.com/ev.jpg', 'display_order': 0},
    ]
    return mock_sb


class TestPublicApiHidesAdminInfo:
    """公開 API（GET /events・GET /events/{id}）の応答に admin_info が含まれないことのテスト。"""

    def teardown_method(self):
        """dependency_overrides をリセットする。

        Returns:
            なし。
        """
        # 1. dependency_overrides をリセットする。
        app.dependency_overrides.clear()

    def test_イベント一覧_今後_admin_infoが応答に含まれない(self):
        """GET /api/events で DB の行に admin_info があっても応答に admin_info キーが無い。

        Returns:
            なし。
        """
        # 1. admin_info 入りの今後のイベントを DB モックに入れる
        row = {**_event_data('evt-1'), 'admin_info': _admin_info_secret()}
        # 変数の内容: mock_sb: Supabase クライアントを置き換えるテスト用モック。
        mock_sb = _make_list_sb_mock([row])

        # 2. 一覧を取得する
        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events')

        # 3. admin_info が無く、ほかの項目（画像など）は返る
        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す今後のイベントレコード。。
        data = resp.json()
        assert len(data) == 1
        assert 'admin_info' not in data[0]
        assert data[0]['id'] == 'evt-1'
        assert data[0]['images'][0]['url'] == 'https://ex.com/ev.jpg'
        # 応答のどこにも管理情報の値が出ていない
        assert '秘密のホテル' not in resp.text
        assert '出店要項の本文' not in resp.text

    def test_イベント一覧_過去_admin_infoが応答に含まれない(self):
        """GET /api/events?past=true でも admin_info キーが無い。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、row: DB から取得した単一レコード。
        # 1. GET /api/events?past=true でも admin_info キーが無い。
        row = {**_event_data('evt-1'), 'start_date': '2000-01-01', 'admin_info': _admin_info_secret()}
        mock_sb = _make_list_sb_mock([row])

        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events?past=true')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す過去のイベントレコード。。
        data = resp.json()
        assert len(data) == 1
        assert data[0]['is_past'] is True
        assert 'admin_info' not in data[0]

    def test_イベント一覧_admin_infoがnullや無い行も問題なく返る(self):
        """GET /api/events で admin_info が None の行・キー自体が無い行が混じっても 200 で返る。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、rows: DB から取得した行の一覧。
        # 1. GET /api/events で admin_info が None の行・キー自体が無い行が混じっても 200 で返る。
        rows = [
            {**_event_data('evt-1'), 'admin_info': None},
            {**_event_data('evt-2')},
        ]
        mock_sb = _make_list_sb_mock(rows)

        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す admin_info が欠落したイベントレコード。。
        data = resp.json()
        assert [e['id'] for e in data] == ['evt-1', 'evt-2']
        assert all('admin_info' not in e for e in data)

    def test_イベント1件取得_admin_infoが応答に含まれない(self):
        """GET /api/events/{id} で DB の行に admin_info があっても応答に admin_info キーが無い。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、row: DB から取得した単一レコード。
        # 1. GET /api/events/{id} で DB の行に admin_info があっても応答に admin_info キーが無い。
        row = {**_event_data('evt-1'), 'admin_info': _admin_info_secret()}
        mock_sb = _make_public_sb_mock([row])

        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/evt-1')

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す単一イベントレコード。。
        data = resp.json()
        assert data['id'] == 'evt-1'
        assert 'admin_info' not in data
        assert '秘密のホテル' not in resp.text

    def test_イベント1件取得_slugで取得しても_admin_infoが応答に含まれない(self):
        """GET /api/events/{slug} でも admin_info キーが無い。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、row: DB から取得した単一レコード。
        # 1. GET /api/events/{slug} でも admin_info キーが無い。
        row = {**_event_data('evt-1'), 'slug': 'spring-market', 'admin_info': _admin_info_secret()}
        mock_sb = _make_public_sb_mock([row])

        with patch('app.routes.events.supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/spring-market')

        assert resp.status_code == 200
        assert 'admin_info' not in resp.json()

    def test_管理情報取得_認証付きAPIは従来どおりadmin_infoを返す(self):
        """GET /api/events/{id}/admin-info（認証付き）は出店要項を含む admin_info をそのまま返す（デグレ確認）。

        Returns:
            なし。
        """
        # 1. GET /api/events/{id}/admin-info（認証付き）は出店要項を含む admin_info をそのまま返す（デグレ確認）。
        app.dependency_overrides[require_auth] = lambda: None
        # 管理情報は専用テーブル event_admin_info の info 列から読む
        mock_admin_sb, _ = _make_admin_info_sb(info_rows=[{'info': _admin_info_secret()}])

        with patch('app.routes.events.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get('/api/events/evt-1/admin-info')

        assert resp.status_code == 200
        assert resp.json() == _admin_info_secret()
