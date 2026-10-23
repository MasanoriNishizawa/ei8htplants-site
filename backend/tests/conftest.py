"""
テスト共通設定。Supabase 接続を要求する環境変数をダミー値でセットし、
supabase パッケージ自体をモックして本番 DB への接続を防ぐ。
"""
import os
import sys
from unittest.mock import MagicMock

os.environ.setdefault('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
os.environ.setdefault('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')

# supabase パッケージ自体をモックして create_client がネットワーク接続しないようにする
_mock_sb = MagicMock()
_supabase_module = MagicMock()
_supabase_module.create_client = MagicMock(return_value=_mock_sb)
_supabase_module.Client = MagicMock
sys.modules.setdefault('supabase', _supabase_module)


import pytest  # noqa: E402  （上で環境変数と supabase のモックを先に用意してから読み込む）


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """テストごとに回数制限の記録を消す（前のテストの送信回数で 429 にならないようにする）。

    公開の書き込み API（問い合わせ・予約・キャンセル・注文）の記録は app.rate_limit.reset_all() で、
    チャットの記録は app.routes.chat._chat_limiter.reset() で消す。
    """
    # 1. テストの前に消す
    from app import rate_limit
    rate_limit.reset_all()
    from app.routes import chat
    chat_limiter = getattr(chat, '_chat_limiter', None)
    if chat_limiter is not None and hasattr(chat_limiter, 'reset'):
        chat_limiter.reset()
    yield
    # 2. テストのあとにも消す（次のテストに残さない）
    rate_limit.reset_all()
    if chat_limiter is not None and hasattr(chat_limiter, 'reset'):
        chat_limiter.reset()
