"""
chat-qa エンドポイントのテスト。
対象: backend/app/routes/chat_qa.py
テスト概要: Q&A 一覧取得（GET）・追加（POST）・更新（PATCH）・削除（DELETE）の
正常ケースと認証・エラーケースを確認する。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app


# テスト用 Q&A データ
QA_DATA = [
    {'id': 'q1', 'question': 'ご注文方法は？', 'answer': 'オンラインショップからどうぞ。', 'sort_order': 1, 'enabled': True},
    {'id': 'q2', 'question': '送料について教えてください', 'answer': '全国一律 600 円です。', 'sort_order': 2, 'enabled': True},
]

# POST/PATCH 用の有効なリクエストボディ
VALID_QA_PAYLOAD = {
    'question': '新しい質問',
    'answer': '新しい回答',
    'sort_order': 10,
    'enabled': True,
}


class TestListChatQA:
    """Q&A 一覧 GET /api/chat-qa のテスト。"""

    def test_QA一覧を取得すると表示順で返る(self):
        """admin_supabase から Q&A を sort_order 順に返すこと。"""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = QA_DATA

        with patch('app.routes.chat_qa.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/chat-qa')

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]['question'] == 'ご注文方法は？'

    def test_QA一覧が空のとき空リストが返る(self):
        """レコードが 0 件のとき空リストが返ること。"""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = []

        with patch('app.routes.chat_qa.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/chat-qa')

        assert resp.status_code == 200
        assert resp.json() == []

    def test_DB例外発生時に500が返る(self):
        """admin_supabase が例外を投げたとき 500 が返ること。"""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.order.return_value.execute.side_effect = Exception('DB error')

        with patch('app.routes.chat_qa.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/chat-qa')

        assert resp.status_code == 500
        assert 'DB error' in resp.json()['detail']

    def test_認証なしでも一覧が取得できる(self):
        """GET /api/chat-qa は認証不要のため Authorization ヘッダーなしでも 200 が返ること。"""
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = QA_DATA

        with patch('app.routes.chat_qa.admin_supabase', mock_sb):
            resp = TestClient(app).get('/api/chat-qa')

        assert resp.status_code == 200


class TestAddChatQA:
    """Q&A 追加 POST /api/chat-qa のテスト（管理者のみ）。"""

    def test_QAを追加すると作成されたレコードが返る(self):
        """POST /api/chat-qa で Q&A を追加したとき、作成後のレコードが返ること。"""
        from app.auth import require_auth

        new_qa = {**VALID_QA_PAYLOAD, 'id': 'q3'}
        mock_sb = MagicMock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [new_qa]

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.chat_qa.admin_supabase', mock_sb):
                resp = TestClient(app).post('/api/chat-qa', json=VALID_QA_PAYLOAD)
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['question'] == '新しい質問'
        assert resp.json()['id'] == 'q3'

    def test_questionが欠けると422(self):
        """question フィールドが欠けると 422 バリデーションエラーが返ること。"""
        from app.auth import require_auth

        app.dependency_overrides[require_auth] = lambda: None
        try:
            resp = TestClient(app).post('/api/chat-qa', json={'answer': '回答だけ'})
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 422

    def test_answerが欠けると422(self):
        """answer フィールドが欠けると 422 バリデーションエラーが返ること。"""
        from app.auth import require_auth

        app.dependency_overrides[require_auth] = lambda: None
        try:
            resp = TestClient(app).post('/api/chat-qa', json={'question': '質問だけ'})
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 422

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで POST すると 401 が返ること。"""
        resp = TestClient(app).post('/api/chat-qa', json=VALID_QA_PAYLOAD)
        assert resp.status_code == 401


class TestUpdateChatQA:
    """Q&A 更新 PATCH /api/chat-qa/{id} のテスト（管理者のみ）。"""

    def test_QAを更新すると更新後のレコードが返る(self):
        """PATCH /api/chat-qa/{id} で Q&A を更新したとき、更新後のレコードが返ること。"""
        from app.auth import require_auth

        updated_qa = {**VALID_QA_PAYLOAD, 'id': 'q1', 'question': '更新された質問'}
        mock_sb = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [updated_qa]

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.chat_qa.admin_supabase', mock_sb):
                resp = TestClient(app).patch(
                    '/api/chat-qa/q1',
                    json={**VALID_QA_PAYLOAD, 'question': '更新された質問'},
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['question'] == '更新された質問'

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで PATCH すると 401 が返ること。"""
        resp = TestClient(app).patch('/api/chat-qa/q1', json=VALID_QA_PAYLOAD)
        assert resp.status_code == 401


class TestDeleteChatQA:
    """Q&A 削除 DELETE /api/chat-qa/{id} のテスト（管理者のみ）。"""

    def test_QAを削除するとokが返る(self):
        """DELETE /api/chat-qa/{id} で削除したとき {"ok": True} が返ること。"""
        from app.auth import require_auth

        mock_sb = MagicMock()
        mock_sb.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()

        app.dependency_overrides[require_auth] = lambda: None
        try:
            with patch('app.routes.chat_qa.admin_supabase', mock_sb):
                resp = TestClient(app).delete('/api/chat-qa/q1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}

    def test_認証なしで401(self):
        """Authorization ヘッダーなしで DELETE すると 401 が返ること。"""
        resp = TestClient(app).delete('/api/chat-qa/q1')
        assert resp.status_code == 401
