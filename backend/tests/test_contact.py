"""
contact エンドポイントのテスト。
対象: backend/app/routes/contact.py
テスト概要: お問い合わせ送信（POST /api/contact）の正常ケースと必須フィールド欠如の異常ケースを確認する。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app


def _make_sb_mock():
    """admin_supabase の MagicMock を返す。"""
    mock_sb = MagicMock()
    # insert チェーン（戻り値は使わないが呼び出しを受け付けるために設定）
    mock_sb.table.return_value.insert.return_value.execute.return_value.data = []
    return mock_sb


# 正常なお問い合わせリクエストボディ
VALID_PAYLOAD = {
    'name': 'テスト太郎',
    'email': 'test@example.com',
    'message': 'テスト本文',
}


class TestSendContact:
    """お問い合わせ送信 POST /api/contact のテスト。"""

    def test_正常なリクエストで200とokが返る(self):
        """全必須フィールドが揃ったリクエストで 200 と {"ok": True} が返ること。
        メール送信（resend.Emails.send）は RESEND_API_KEY が空文字のためスキップされる。
        """
        mock_sb = _make_sb_mock()

        # resend モジュールをモックしてメール送信を抑制する
        mock_resend = MagicMock()

        with patch('app.routes.contact.admin_supabase', mock_sb), \
             patch('app.routes.contact.resend', mock_resend), \
             patch('app.routes.contact.RESEND_API_KEY', ''):
            resp = TestClient(app).post('/api/contact', json=VALID_PAYLOAD)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    def test_DBへの保存が呼ばれる(self):
        """送信時に admin_supabase.table('contacts').insert が呼ばれること。"""
        mock_sb = _make_sb_mock()
        mock_resend = MagicMock()

        with patch('app.routes.contact.admin_supabase', mock_sb), \
             patch('app.routes.contact.resend', mock_resend), \
             patch('app.routes.contact.RESEND_API_KEY', ''):
            resp = TestClient(app).post('/api/contact', json=VALID_PAYLOAD)

        # DB への insert が1回呼ばれたか確認
        mock_sb.table.assert_called_with('contacts')
        assert resp.status_code == 200

    def test_RESEND_API_KEYがある場合にメール送信が呼ばれる(self):
        """RESEND_API_KEY が設定されているときは resend.Emails.send が呼ばれること。"""
        mock_sb = _make_sb_mock()
        mock_resend = MagicMock()

        with patch('app.routes.contact.admin_supabase', mock_sb), \
             patch('app.routes.contact.resend', mock_resend), \
             patch('app.routes.contact.RESEND_API_KEY', 'dummy-key'), \
             patch('app.routes.contact.CONTACT_TO_EMAIL', 'admin@example.com'):
            resp = TestClient(app).post('/api/contact', json=VALID_PAYLOAD)

        assert resp.status_code == 200
        # Emails.send が呼ばれていること（管理者通知と自動返信の2回）
        assert mock_resend.Emails.send.call_count >= 1

    def test_nameが欠けると422(self):
        """name フィールドが欠けると 422 バリデーションエラーが返ること。"""
        mock_sb = _make_sb_mock()

        with patch('app.routes.contact.admin_supabase', mock_sb):
            resp = TestClient(app).post('/api/contact', json={
                'email': 'test@example.com',
                'message': 'テスト',
            })

        assert resp.status_code == 422

    def test_emailが欠けると422(self):
        """email フィールドが欠けると 422 バリデーションエラーが返ること。"""
        mock_sb = _make_sb_mock()

        with patch('app.routes.contact.admin_supabase', mock_sb):
            resp = TestClient(app).post('/api/contact', json={
                'name': 'テスト太郎',
                'message': 'テスト',
            })

        assert resp.status_code == 422

    def test_messageが欠けると422(self):
        """message フィールドが欠けると 422 バリデーションエラーが返ること。"""
        mock_sb = _make_sb_mock()

        with patch('app.routes.contact.admin_supabase', mock_sb):
            resp = TestClient(app).post('/api/contact', json={
                'name': 'テスト太郎',
                'email': 'test@example.com',
            })

        assert resp.status_code == 422

    def test_不正なメールアドレス形式で422(self):
        """email が正しい形式でない場合 422 バリデーションエラーが返ること。"""
        mock_sb = _make_sb_mock()

        with patch('app.routes.contact.admin_supabase', mock_sb):
            resp = TestClient(app).post('/api/contact', json={
                'name': 'テスト太郎',
                'email': 'not-an-email',
                'message': 'テスト',
            })

        assert resp.status_code == 422

    def test_管理者通知メール送信失敗でも200が返る(self):
        """RESEND_API_KEY と CONTACT_TO_EMAIL が設定されているとき、
        管理者通知メールの送信が失敗しても 200 で {"ok": True} が返ること。

        メール送信は try/except で囲まれているため失敗してもレスポンスに影響しない。
        """
        mock_sb = _make_sb_mock()
        mock_resend = MagicMock()
        # 管理者通知メール送信時に例外を投げる（1回目の Emails.send が失敗）
        mock_resend.Emails.send.side_effect = Exception('SMTP error')

        with patch('app.routes.contact.admin_supabase', mock_sb), \
             patch('app.routes.contact.resend', mock_resend), \
             patch('app.routes.contact.RESEND_API_KEY', 'dummy-key'), \
             patch('app.routes.contact.CONTACT_TO_EMAIL', 'admin@example.com'):
            resp = TestClient(app).post('/api/contact', json=VALID_PAYLOAD)

        # メール送信失敗でもDB保存は成功し200が返ること
        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    def test_自動返信メール送信失敗でも200が返る(self):
        """自動返信メールの送信が失敗しても 200 で {"ok": True} が返ること。

        CONTACT_TO_EMAIL が未設定のため管理者通知はスキップされ、
        自動返信のみ試みるがそれが失敗する場合のテスト。
        """
        mock_sb = _make_sb_mock()
        mock_resend = MagicMock()
        # 自動返信メール送信時に例外を投げる
        mock_resend.Emails.send.side_effect = Exception('auto-reply error')

        # CONTACT_TO_EMAIL を空にして管理者通知はスキップ、自動返信だけ試みる
        with patch('app.routes.contact.admin_supabase', mock_sb), \
             patch('app.routes.contact.resend', mock_resend), \
             patch('app.routes.contact.RESEND_API_KEY', 'dummy-key'), \
             patch('app.routes.contact.CONTACT_TO_EMAIL', ''):
            resp = TestClient(app).post('/api/contact', json=VALID_PAYLOAD)

        # 自動返信失敗でもDB保存は成功し200が返ること
        assert resp.status_code == 200
        assert resp.json() == {'ok': True}


class TestListContacts:
    """お問い合わせ一覧 GET /api/contacts のテスト（管理者のみ）。"""

    def test_お問い合わせ一覧が新着順で取得できる(self):
        """管理者認証を通過したとき一覧が返ること。"""
        from app.auth import require_auth

        mock_sb = MagicMock()
        contacts_data = [
            {'id': 'c1', 'name': 'テスト太郎', 'email': 'a@example.com', 'message': 'テスト1', 'is_read': False},
            {'id': 'c2', 'name': 'テスト花子', 'email': 'b@example.com', 'message': 'テスト2', 'is_read': True},
        ]
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = contacts_data

        # require_auth をバイパスする
        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.contact.admin_supabase', mock_sb):
                resp = TestClient(app).get('/api/contacts')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]['name'] == 'テスト太郎'

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで 401 が返ること。"""
        resp = TestClient(app).get('/api/contacts')
        assert resp.status_code == 401


class TestUpdateContact:
    """お問い合わせ既読更新 PATCH /api/contacts/{id} のテスト（管理者のみ）。"""

    def test_既読状態を更新すると更新後のレコードが返る(self):
        """is_read を True に更新したとき、更新後のレコードが返ること。"""
        from app.auth import require_auth

        mock_sb = MagicMock()
        updated_record = {'id': 'c1', 'name': 'テスト太郎', 'is_read': True}
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [updated_record]

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.contact.admin_supabase', mock_sb):
                resp = TestClient(app).patch(
                    '/api/contacts/c1',
                    json={'is_read': True},
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['is_read'] is True

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで 401 が返ること。"""
        resp = TestClient(app).patch('/api/contacts/c1', json={'is_read': True})
        assert resp.status_code == 401


class TestReplyContact:
    """お問い合わせ返信 POST /api/contacts/{id}/reply のテスト（管理者のみ）。"""

    def test_RESEND_API_KEY未設定のとき500(self):
        """RESEND_API_KEY が未設定のとき 500 が返ること。"""
        from app.auth import require_auth

        mock_sb = MagicMock()

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.contact.admin_supabase', mock_sb), \
                 patch('app.routes.contact.RESEND_API_KEY', ''):
                resp = TestClient(app).post(
                    '/api/contacts/c1/reply',
                    json={'subject': '件名', 'body': '返信内容'},
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 500

    def test_お問い合わせが存在しない場合404(self):
        """指定 ID のお問い合わせが存在しないとき 404 が返ること。"""
        from app.auth import require_auth

        mock_sb = MagicMock()
        # select → single チェーンが None を返すよう設定
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.contact.admin_supabase', mock_sb), \
                 patch('app.routes.contact.RESEND_API_KEY', 'dummy-key'):
                resp = TestClient(app).post(
                    '/api/contacts/not-exist/reply',
                    json={'subject': '件名', 'body': '返信内容'},
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 404

    def test_返信メール送信成功で200とokが返る(self):
        """返信メール送信に成功したとき 200 で {"ok": True} が返ること。

        既読フラグも立てることを確認する。
        """
        from app.auth import require_auth

        mock_sb = MagicMock()
        # select → single チェーンで連絡先を返す
        contact_row = {'email': 'user@example.com', 'name': 'テスト太郎'}
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = contact_row

        mock_resend = MagicMock()

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.contact.admin_supabase', mock_sb), \
                 patch('app.routes.contact.resend', mock_resend), \
                 patch('app.routes.contact.RESEND_API_KEY', 'dummy-key'):
                resp = TestClient(app).post(
                    '/api/contacts/c1/reply',
                    json={'subject': '返信件名', 'body': '返信本文'},
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        # resend.Emails.send が呼ばれたこと
        mock_resend.Emails.send.assert_called_once()

    def test_返信メール送信失敗で500(self):
        """resend.Emails.send が例外を投げたとき 500 が返ること。"""
        from app.auth import require_auth

        mock_sb = MagicMock()
        contact_row = {'email': 'user@example.com', 'name': 'テスト太郎'}
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = contact_row

        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception('mail send failed')

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.contact.admin_supabase', mock_sb), \
                 patch('app.routes.contact.resend', mock_resend), \
                 patch('app.routes.contact.RESEND_API_KEY', 'dummy-key'):
                resp = TestClient(app).post(
                    '/api/contacts/c1/reply',
                    json={'subject': '返信件名', 'body': '返信本文'},
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 500

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで 401 が返ること。"""
        resp = TestClient(app).post(
            '/api/contacts/c1/reply',
            json={'subject': '件名', 'body': '内容'},
        )
        assert resp.status_code == 401
