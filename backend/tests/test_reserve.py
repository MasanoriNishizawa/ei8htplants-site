"""
reserve エンドポイントのテスト。
対象: backend/app/routes/reserve.py
テスト概要:
  - ワークショップ予約作成（正常・バリデーションエラー・メール失敗でも成功）
  - キャンセルトークンによる予約取り消し（成功・無効トークン404）
  - 予約一覧取得（管理者のみ）
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth


# --- 認証オーバーライド ---

def _auth_override():
    """テスト時に require_auth を無効化するオーバーライド関数。

    Returns:
        認証依存関係を差し替える関数を返す。
    """
    # 1. テスト時に require_auth を無効化するオーバーライド関数。
    return None


# --- テスト用サンプルデータ ---

# 将来のイベント（予約受付期間内）
FUTURE_EVENT = {
    'id': 'event-1',
    'name': 'テストワークショップ',
    'start_date': '2099-12-31',
    'end_date': None,
    'location': 'テスト会場',
}

# 作成された予約サンプル
SAMPLE_RESERVATION = {
    'id': 'reservation-1',
    'event_id': 'event-1',
    'name': 'テスト花子',
    'email': 'hanako@example.com',
    'participants': 1,
    'status': 'pending',
    'cancel_token': '12345678',
    'session_id': None,
}

# 予約作成用リクエストボディ（session_id なし・メールなし）
RESERVE_REQUEST = {
    'event_id': 'event-1',
    'name': 'テスト花子',
    'email': 'hanako@example.com',
    'phone': '090-1111-2222',
    'participants': 1,
    'note': None,
    'session_id': None,
    'bring_plant': False,
    'bring_pot': False,
    'preferred_date': None,
    'preferred_time': None,
    'lang': None,
}


# --- モックヘルパー ---

def _make_supabase_mock() -> MagicMock:
    """supabase のモックを生成して返す（公開イベント情報取得用）。

    create_reservation や _send_confirmation などで呼ばれる
    supabase.table('events').select(...).eq(...).single().execute().data
    に対して FUTURE_EVENT を返すよう設定する。

    Returns:
        supabase モジュールのモック
    """
    # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    # table('events').select(...).eq(...).single().execute().data → FUTURE_EVENT
    mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = FUTURE_EVENT
    return mock_sb


def _make_admin_sb_for_create() -> MagicMock:
    """予約作成用の admin_supabase モックを生成して返す。

    workshop_reservations への insert が成功し、
    予約レコードが返るよう設定する。

    Returns:
        admin_supabase モジュールのモック
    """
    # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
    mock_sb = MagicMock()
    # table('workshop_reservations').insert(...).execute().data[0]
    mock_sb.table.return_value.insert.return_value.execute.return_value.data = [SAMPLE_RESERVATION]
    return mock_sb


class TestCreateReservation:
    """予約作成 POST /api/reserve のテスト。"""

    def test_正常な予約作成で予約レコードが返る(self):
        """必須フィールドをすべて含むリクエストで予約が作成されること。

        メール送信は HABITAT_RESEND_API_KEY が空のためスキップされる。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 必須フィールドをすべて含むリクエストで予約が作成されること。
        mock_sb = _make_supabase_mock()
        mock_admin_sb = _make_admin_sb_for_create()

        with patch('app.routes.reserve.supabase', mock_sb), \
             patch('app.routes.reserve.admin_supabase', mock_admin_sb), \
             patch('app.routes.reserve.HABITAT_RESEND_API_KEY', ''):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve', json=RESERVE_REQUEST)

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す作成済み予約レコード。。
        data = resp.json()
        # 予約レコードが返ること
        assert data['id'] == 'reservation-1'
        assert data['event_id'] == 'event-1'
        assert data['name'] == 'テスト花子'

    def test_必須フィールドが欠けると422(self):
        """event_id・name・email が欠けたリクエストで 422 が返ること。

        Returns:
            なし。
        """
        # 必須フィールドをすべて省略した不正なボディ
        # 1. event_id・name・email が欠けたリクエストで 422 が返ること。
        resp = TestClient(app).post('/api/reserve', json={})
        assert resp.status_code == 422

    def test_emailが不正な形式のとき422(self):
        """email フィールドが Email 形式でないとき 422 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: req: テスト対象の HTTP リクエスト、resp: API から返されたレスポンス。
        # 1. email フィールドが Email 形式でないとき 422 が返ること。
        req = {**RESERVE_REQUEST, 'email': 'not-an-email'}
        resp = TestClient(app).post('/api/reserve', json=req)
        assert resp.status_code == 422

    def test_過去のイベントへの予約は400(self):
        """終了済みイベント（end_date が過去）への予約で 400 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、mock_sb: 公開用 Supabase クライアントのモック、past_event: 過去イベントのテストデータ。
        # 1. 終了済みイベント（end_date が過去）への予約で 400 が返ること。
        past_event = {**FUTURE_EVENT, 'start_date': '2020-01-01', 'end_date': '2020-01-02'}
        mock_sb = MagicMock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = past_event
        mock_admin_sb = _make_admin_sb_for_create()

        with patch('app.routes.reserve.supabase', mock_sb), \
             patch('app.routes.reserve.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve', json=RESERVE_REQUEST)

        assert resp.status_code == 400
        assert '受付は終了' in resp.json()['detail']

    def test_存在しないイベントへの予約は404(self):
        """存在しないイベントIDへの予約で 404 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 存在しないイベントIDへの予約で 404 が返ること。
        mock_sb = MagicMock()
        # イベントが見つからない場合（data=None）
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        mock_admin_sb = _make_admin_sb_for_create()

        with patch('app.routes.reserve.supabase', mock_sb), \
             patch('app.routes.reserve.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve', json=RESERVE_REQUEST)

        assert resp.status_code == 404

    def test_メール送信失敗でも予約は成功する(self):
        """_send_confirmation が例外を投げても予約レコードが返ること。

        メール送信失敗は予約成立を妨げない。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック、mock_resend: Resend メール送信のモック、mock_sb: 公開用 Supabase クライアントのモック。
        # 1. _send_confirmation が例外を投げても予約レコードが返ること。
        mock_sb = _make_supabase_mock()
        mock_admin_sb = _make_admin_sb_for_create()
        mock_resend = MagicMock()
        # resend.Emails.send が例外を投げるよう設定
        mock_resend.Emails.send.side_effect = Exception('メール送信エラー')

        with patch('app.routes.reserve.supabase', mock_sb), \
             patch('app.routes.reserve.admin_supabase', mock_admin_sb), \
             patch('app.mail.resend', mock_resend), \
             patch('app.routes.reserve.HABITAT_RESEND_API_KEY', 'test-key'):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve', json=RESERVE_REQUEST)

        # メール送信失敗でも予約自体は成功
        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す作成済み予約レコード。。
        data = resp.json()
        assert data['id'] == 'reservation-1'


class TestCancelReservation:
    """キャンセル POST /api/reserve/cancel のテスト。"""

    def test_有効なトークンでキャンセル成功(self):
        """有効なキャンセルトークン（古い 8 桁の形式）で予約が取り消され、応答は {"ok": true} だけになること。

        Returns:
            なし。
        """
        # キャンセル前の予約（status = 'pending'）
        pending_row = {
            'id': 'reservation-1',
            'status': 'pending',
            'session_id': None,
            'event_id': 'event-1',
            'name': 'テスト花子',
            'email': 'hanako@example.com',
            'created_at': '2099-01-01T00:00:00+00:00',
        }
        # キャンセル後の予約（status = 'cancelled'）
        cancelled_row = {**pending_row, 'status': 'cancelled'}

        # 変数の内容: mock_admin_sb: 管理者用 Supabase クライアントを置き換えるモック。
        mock_admin_sb = MagicMock()
        # 1. トークン検索: table('workshop_reservations').select(...).eq(...).order(...).execute().data
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [pending_row]
        # 2. ステータス更新: table('workshop_reservations').update(...).eq(...).execute().data[0]
        mock_admin_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [cancelled_row]

        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_supabase_mock()

        with patch('app.routes.reserve.admin_supabase', mock_admin_sb), \
             patch('app.routes.reserve.supabase', mock_sb), \
             patch('app.routes.reserve.HABITAT_RESEND_API_KEY', ''):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve/cancel', json={'token': '12345678'})

        assert resp.status_code == 200
        # 応答には予約者の情報を含めない
        assert resp.json() == {'ok': True}
        # ステータスを cancelled に更新している
        mock_admin_sb.table.return_value.update.assert_called_with({'status': 'cancelled'})

    def test_無効なトークンで404(self):
        """存在しないキャンセルトークンで 404 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 存在しないキャンセルトークンで 404 が返ること。
        mock_admin_sb = MagicMock()
        # トークンが存在しない（空リスト）
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        with patch('app.routes.reserve.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve/cancel', json={'token': 'invalid-token'})

        assert resp.status_code == 404
        assert 'キャンセルID' in resp.json()['detail']

    def test_すでにキャンセル済みのトークンで400(self):
        """すでにキャンセル済みの予約トークンを使うと 400 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: cancelled_row: キャンセル済み予約のテスト行、mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. すでにキャンセル済みの予約トークンを使うと 400 が返ること。
        cancelled_row = {
            'id': 'reservation-1',
            'status': 'cancelled',
            'session_id': None,
            'event_id': 'event-1',
            'name': 'テスト花子',
            'email': 'hanako@example.com',
            'created_at': '2099-01-01T00:00:00+00:00',
        }
        mock_admin_sb = MagicMock()
        # キャンセル済みの行のみが返る（全行が cancelled）
        mock_admin_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [cancelled_row]

        with patch('app.routes.reserve.admin_supabase', mock_admin_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/reserve/cancel', json={'token': '12345678'})

        assert resp.status_code == 400
        assert 'キャンセル済み' in resp.json()['detail']


class TestListReservations:
    """予約一覧 GET /api/reserves のテスト（要認証）。"""

    def test_予約一覧を200で取得できる(self):
        """認証済みリクエストで全予約リストが 200 で返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. 認証済みリクエストで全予約リストが 200 で返ること。
        mock_admin_sb = MagicMock()
        # table('workshop_reservations').select('*').order(...).execute().data
        mock_admin_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = [SAMPLE_RESERVATION]

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.reserve.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).get('/api/reserves')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す予約レコード一覧。。
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]['id'] == 'reservation-1'

    def test_event_idで絞り込める(self):
        """?event_id=xxx を指定すると eq 条件つきでクエリが実行されること。

        Returns:
            なし。
        """
        # 変数の内容: mock_admin_sb: 管理用 Supabase クライアントのモック。
        # 1. ?event_id=xxx を指定すると eq 条件つきでクエリが実行されること。
        mock_admin_sb = MagicMock()
        # event_id 絞り込み: .order(...).eq('event_id', ...).execute().data
        mock_admin_sb.table.return_value.select.return_value.order.return_value.eq.return_value.execute.return_value.data = [SAMPLE_RESERVATION]

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.reserve.admin_supabase', mock_admin_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).get('/api/reserves?event_id=event-1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す対象イベントの予約レコード一覧。。
        data = resp.json()
        assert len(data) == 1

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで 401 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        # 1. Authorization ヘッダーなしで 401 が返ること。
        resp = TestClient(app).get('/api/reserves')
        assert resp.status_code == 401
