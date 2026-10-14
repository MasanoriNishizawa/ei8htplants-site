"""
chat エンドポイントのテスト。
対象: backend/app/routes/chat.py
テスト概要:
  - 正常なチャットリクエストで reply が返ること
  - GEMINI_API_KEY 未設定時に 503 が返ること
  - IP ベースのレート制限（10回/分超で 429）
  - messages が空のとき IndexError が HTTPException(500) になること
  - Gemini API が例外を投げたとき 500 が返ること
  - チャットログ保存が失敗してもチャット自体は成功すること
"""
import time
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.routes.chat import _request_log, RATE_LIMIT


# --- モックヘルパー ---

def _make_genai_mock(reply_text: str = 'テスト返答') -> MagicMock:
    """Gemini genai モジュールのモックを生成して返す。

    Args:
        reply_text: send_message が返すテキスト

    Returns:
        genai モジュールのモック（Client → chats.create → send_message をチェーン設定済み）
    """
    mock_genai = MagicMock()
    mock_client = MagicMock()
    mock_genai.Client.return_value = mock_client
    mock_chat_session = MagicMock()
    mock_client.chats.create.return_value = mock_chat_session
    mock_response = MagicMock()
    mock_response.text = reply_text
    mock_chat_session.send_message.return_value = mock_response
    return mock_genai


def _make_sb_mock() -> MagicMock:
    """supabase のモックを生成して返す（サイトコンテキスト取得用）。

    各テーブル（events・products・stockists）の呼び出しに対して空リストを返す。

    Returns:
        supabase モジュールのモック
    """
    mock_sb = MagicMock()
    # table(...).select(...).order(...).execute().data → 空リスト
    mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = []
    # table(...).select(...).eq(...).gt(...).order(...).execute().data → 空リスト（products 取得）
    mock_sb.table.return_value.select.return_value.eq.return_value.gt.return_value.order.return_value.execute.return_value.data = []
    return mock_sb


def _make_admin_sb_mock() -> MagicMock:
    """admin_supabase のモックを生成して返す（chat_qa 取得・chat_logs 保存用）。

    chat_qa は空リスト、chat_logs insert は正常終了するよう設定する。

    Returns:
        admin_supabase モジュールのモック
    """
    mock_admin_sb = MagicMock()
    # chat_qa: table(...).select(...).eq(...).order(...).execute().data → 空リスト
    mock_admin_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    # chat_logs insert: 正常終了
    mock_admin_sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
    return mock_admin_sb


# --- テスト用リクエストボディ ---

# 正常な会話履歴（ユーザーメッセージ1件）
VALID_PAYLOAD = {
    'messages': [
        {'role': 'user', 'content': 'アガベの育て方を教えてください'}
    ]
}


class TestChatEndpoint:
    """チャット POST /api/chat のテスト。"""

    def setup_method(self):
        """各テストの前に IP ベースのレート制限ログをリセットする。

        _request_log はプロセス内で共有されるため、テスト間で状態が
        持ち越されないよう毎回クリアする。
        """
        _request_log.clear()

    def test_正常なリクエストで200とreplyフィールドが返る(self):
        """正しいリクエストを送ると200レスポンスで reply フィールドが含まれること。"""
        mock_genai = _make_genai_mock('テスト返答')
        mock_sb = _make_sb_mock()
        mock_admin_sb = _make_admin_sb_mock()

        with patch('app.routes.chat.genai', mock_genai), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', mock_sb), \
             patch('app.routes.chat.admin_supabase', mock_admin_sb):
            resp = TestClient(app).post('/api/chat', json=VALID_PAYLOAD)

        assert resp.status_code == 200
        body = resp.json()
        assert 'reply' in body
        assert body['reply'] == 'テスト返答'

    def test_GEMINI_API_KEYが空のとき503(self):
        """GEMINI_API_KEY が空文字のとき 503 Service Unavailable が返ること。"""
        # GEMINI_API_KEY を空にすると `if not GEMINI_API_KEY:` の分岐で503
        with patch('app.routes.chat.GEMINI_API_KEY', ''):
            resp = TestClient(app).post('/api/chat', json=VALID_PAYLOAD)

        assert resp.status_code == 503

    def test_レート制限を超えると429(self):
        """同一 IP から RATE_LIMIT 回分のリクエスト履歴を埋めた後に送ると 429 が返ること。

        TestClient の request.client.host は 'testclient' になるため、
        _request_log['testclient'] に RATE_LIMIT 件の現在時刻を事前に埋めて制限を再現する。
        """
        now = time.time()
        # testclient というホスト名でレート上限に達した状態を作る
        _request_log['testclient'] = [now for _ in range(RATE_LIMIT)]

        mock_genai = _make_genai_mock()
        mock_sb = _make_sb_mock()
        mock_admin_sb = _make_admin_sb_mock()

        with patch('app.routes.chat.genai', mock_genai), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', mock_sb), \
             patch('app.routes.chat.admin_supabase', mock_admin_sb):
            resp = TestClient(app).post('/api/chat', json=VALID_PAYLOAD)

        assert resp.status_code == 429

    def test_messagesが空のとき500(self):
        """messages が空リストのとき body.messages[-1] で IndexError が発生して 500 になること。

        Pydantic は空リストを受け入れる（min_length 制約がない）ため、
        except Exception ブロックで IndexError を捕捉して HTTPException(500) を送出する。
        # TODO: known issue — messages が空でも Pydantic バリデーションは通るため 500 になる。
        #   422 にするには ChatRequest.messages に min_length=1 バリデータが必要。
        """
        payload = {'messages': []}
        mock_genai = _make_genai_mock()
        mock_sb = _make_sb_mock()
        mock_admin_sb = _make_admin_sb_mock()

        with patch('app.routes.chat.genai', mock_genai), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', mock_sb), \
             patch('app.routes.chat.admin_supabase', mock_admin_sb):
            resp = TestClient(app).post('/api/chat', json=payload)

        # IndexError は try/except Exception で捕捉され HTTPException(500) になる
        assert resp.status_code == 500

    def test_GeminiAPIが例外を投げたとき500(self):
        """Gemini API の send_message が例外を投げたとき 500 Internal Server Error が返ること。"""
        mock_genai = _make_genai_mock()
        mock_sb = _make_sb_mock()
        mock_admin_sb = _make_admin_sb_mock()

        # send_message が例外を投げるよう設定（ネットワーク障害などを想定）
        mock_genai.Client.return_value.chats.create.return_value.send_message.side_effect = \
            Exception('Gemini API error')

        with patch('app.routes.chat.genai', mock_genai), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', mock_sb), \
             patch('app.routes.chat.admin_supabase', mock_admin_sb):
            resp = TestClient(app).post('/api/chat', json=VALID_PAYLOAD)

        assert resp.status_code == 500

    def test_チャットログ保存失敗でもチャットは成功する(self):
        """chat_logs テーブルへの insert が失敗しても 200 で reply が返ること。

        ログ保存の失敗はチャット本体の返答に影響しないことを確認する。
        """
        mock_genai = _make_genai_mock('ログ保存失敗でも返答')
        mock_sb = _make_sb_mock()

        # admin_supabase の chat_qa は空リスト、chat_logs は insert 時に例外
        mock_admin_sb = MagicMock()

        # テーブル名によって異なるモックを返す side_effect を設定
        qa_mock = MagicMock()
        qa_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        logs_mock = MagicMock()
        logs_mock.insert.return_value.execute.side_effect = Exception('DB error')

        def table_side_effect(name: str):
            """テーブル名に応じて chat_qa / chat_logs のモックを返す。"""
            if name == 'chat_qa':
                return qa_mock
            elif name == 'chat_logs':
                return logs_mock
            return MagicMock()

        mock_admin_sb.table.side_effect = table_side_effect

        with patch('app.routes.chat.genai', mock_genai), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', mock_sb), \
             patch('app.routes.chat.admin_supabase', mock_admin_sb):
            resp = TestClient(app).post('/api/chat', json=VALID_PAYLOAD)

        # ログ保存失敗でもチャット自体は成功して reply が返る
        assert resp.status_code == 200
        assert resp.json()['reply'] == 'ログ保存失敗でも返答'

    def test_会話履歴が複数件のとき最後のメッセージで送信される(self):
        """複数件の会話履歴を持つリクエストで正常に処理されること。

        最後のメッセージ以外が history に変換され、最後のメッセージだけ
        send_message に渡されることを確認する。
        """
        payload = {
            'messages': [
                {'role': 'user', 'content': '最初の質問'},
                {'role': 'model', 'content': '最初の返答'},
                {'role': 'user', 'content': '2番目の質問'},
            ]
        }
        mock_genai = _make_genai_mock('2番目の返答')
        mock_sb = _make_sb_mock()
        mock_admin_sb = _make_admin_sb_mock()

        with patch('app.routes.chat.genai', mock_genai), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', mock_sb), \
             patch('app.routes.chat.admin_supabase', mock_admin_sb):
            resp = TestClient(app).post('/api/chat', json=payload)

        assert resp.status_code == 200
        # send_message が最後のメッセージ内容で呼ばれていることを確認
        call_args = mock_genai.Client.return_value.chats.create.return_value.send_message.call_args
        assert call_args[0][0] == '2番目の質問'

    def test_サイトコンテキストが構築されてsupabaseのeventsテーブルが呼ばれる(self):
        """_build_site_context が呼ばれ supabase.table('events') が呼び出されること。

        イベントデータが返される場合は Gemini のシステムプロンプトに
        イベント情報が含まれて chats.create が呼ばれることを確認する。
        """
        # 未来のイベントデータを返すよう supabase モックを設定する
        mock_sb = MagicMock()

        # events テーブル用モック（未来のイベントを1件返す）
        events_mock = MagicMock()
        future_event = {
            'name': 'テストワークショップ',
            'start_date': '2099-01-01',
            'end_date': '2099-01-02',
            'time': '14:00',
            'location': '東京',
            'has_workshop': True,
        }
        events_mock.select.return_value.order.return_value.execute.return_value.data = [future_event]

        # products テーブル用モック（空リスト）
        products_mock = MagicMock()
        products_mock.select.return_value.eq.return_value.gt.return_value.order.return_value.execute.return_value.data = []

        # stockists テーブル用モック（空リスト）
        stockists_mock = MagicMock()
        stockists_mock.select.return_value.order.return_value.execute.return_value.data = []

        def sb_table_side_effect(name: str):
            """テーブル名に応じてモックを切り替える。"""
            if name == 'events':
                return events_mock
            elif name == 'products':
                return products_mock
            elif name == 'stockists':
                return stockists_mock
            return MagicMock()

        mock_sb.table.side_effect = sb_table_side_effect

        # admin_supabase は articles と chat_qa を返すモックを設定する
        mock_admin_sb = MagicMock()

        articles_mock = MagicMock()
        articles_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        qa_mock = MagicMock()
        qa_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        logs_mock = MagicMock()
        logs_mock.insert.return_value.execute.return_value = MagicMock()

        def admin_sb_table_side_effect(name: str):
            """テーブル名に応じてモックを切り替える。"""
            if name == 'articles':
                return articles_mock
            elif name == 'chat_qa':
                return qa_mock
            elif name == 'chat_logs':
                return logs_mock
            return MagicMock()

        mock_admin_sb.table.side_effect = admin_sb_table_side_effect

        mock_genai = _make_genai_mock('サイトコンテキスト込みの返答')

        with patch('app.routes.chat.genai', mock_genai), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', mock_sb), \
             patch('app.routes.chat.admin_supabase', mock_admin_sb):
            resp = TestClient(app).post('/api/chat', json=VALID_PAYLOAD)

        assert resp.status_code == 200
        # supabase.table が 'events' で呼ばれていることを確認（サイトコンテキスト取得）
        mock_sb.table.assert_any_call('events')
        # Gemini の chats.create がイベント情報を含むシステムプロンプトで呼ばれていること
        chats_create_call = mock_genai.Client.return_value.chats.create.call_args
        config = chats_create_call[1]['config']
        assert 'テストワークショップ' in config.system_instruction

    def test_QAがchat_qaテーブルから取得されてシステムプロンプトに含まれる(self):
        """chat_qa テーブルから取得した Q&A がシステムプロンプトに追記されること。

        admin_supabase.table('chat_qa') から enabled=True のレコードが返されるとき、
        Gemini の chats.create に渡す system_instruction に Q&A テキストが含まれることを確認する。
        """
        mock_sb = _make_sb_mock()

        # admin_supabase は chat_qa に Q&A データを返すよう設定する
        mock_admin_sb = MagicMock()

        qa_data = [
            {'question': 'アガベの水やりは？', 'answer': '夏場は週1回程度です'},
        ]
        articles_mock = MagicMock()
        articles_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        qa_mock = MagicMock()
        qa_mock.select.return_value.eq.return_value.order.return_value.execute.return_value.data = qa_data

        logs_mock = MagicMock()
        logs_mock.insert.return_value.execute.return_value = MagicMock()

        def admin_sb_table_side_effect(name: str):
            """テーブル名に応じてモックを切り替える。"""
            if name == 'articles':
                return articles_mock
            elif name == 'chat_qa':
                return qa_mock
            elif name == 'chat_logs':
                return logs_mock
            return MagicMock()

        mock_admin_sb.table.side_effect = admin_sb_table_side_effect

        mock_genai = _make_genai_mock('Q&A込みの返答')

        with patch('app.routes.chat.genai', mock_genai), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', mock_sb), \
             patch('app.routes.chat.admin_supabase', mock_admin_sb):
            resp = TestClient(app).post('/api/chat', json=VALID_PAYLOAD)

        assert resp.status_code == 200
        # Gemini の chats.create がQ&Aを含むシステムプロンプトで呼ばれていること
        chats_create_call = mock_genai.Client.return_value.chats.create.call_args
        config = chats_create_call[1]['config']
        assert 'アガベの水やりは？' in config.system_instruction
        assert '夏場は週1回程度です' in config.system_instruction

    def test_build_site_contextでeventsDBエラーが起きても他テーブルは継続取得される(self):
        """_build_site_context で events テーブルのDB取得が失敗しても、
        products・stockists テーブルの取得が続行されて 200 が返ること。

        各テーブルは独立した try/except に囲まれているため、
        1つのテーブルのエラーが他に影響しないことを確認する。
        """
        mock_sb = MagicMock()

        # events テーブルは例外を投げるよう設定する
        events_mock = MagicMock()
        events_mock.select.return_value.order.return_value.execute.side_effect = Exception('events DB error')

        # stockists テーブルはデータを返す（継続取得を確認するため）
        stockists_mock = MagicMock()
        stockist_data = [{'name': '東京グリーン', 'area': '東京', 'brands': ['ei8ht plants']}]
        stockists_mock.select.return_value.order.return_value.execute.return_value.data = stockist_data

        # products テーブルは空リストを返す
        products_mock = MagicMock()
        products_mock.select.return_value.eq.return_value.gt.return_value.order.return_value.execute.return_value.data = []

        def sb_table_side_effect(name: str):
            """テーブル名に応じてモックを切り替える。"""
            if name == 'events':
                return events_mock
            elif name == 'products':
                return products_mock
            elif name == 'stockists':
                return stockists_mock
            return MagicMock()

        mock_sb.table.side_effect = sb_table_side_effect
        mock_admin_sb = _make_admin_sb_mock()
        mock_genai = _make_genai_mock('エラー継続テスト返答')

        with patch('app.routes.chat.genai', mock_genai), \
             patch('app.routes.chat.GEMINI_API_KEY', 'test-key'), \
             patch('app.routes.chat.supabase', mock_sb), \
             patch('app.routes.chat.admin_supabase', mock_admin_sb):
            resp = TestClient(app).post('/api/chat', json=VALID_PAYLOAD)

        # events でエラーが起きても全体は成功する
        assert resp.status_code == 200
        # stockists テーブルが呼ばれていること（継続取得の確認）
        mock_sb.table.assert_any_call('stockists')
