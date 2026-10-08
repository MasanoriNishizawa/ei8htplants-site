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
