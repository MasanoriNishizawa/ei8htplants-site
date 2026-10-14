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
