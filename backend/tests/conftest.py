"""
テスト共通設定。Supabase 接続を要求する環境変数をダミー値でセットし、
DB クライアントをモックオブジェクトに差し替えてテストを実行できるようにする。
"""
import os
import sys
from unittest.mock import MagicMock
import pytest

# .env の Supabase 必須キーをテスト用ダミー値でセット（実際の接続は行わない）
os.environ.setdefault('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
os.environ.setdefault('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')

# supabase クライアントの生成前にモジュールをモックする
mock_supabase_client = MagicMock()
mock_create_client = MagicMock(return_value=mock_supabase_client)

# supabase パッケージ自体をモックしてネットワーク接続を防ぐ
supabase_mock_module = MagicMock()
supabase_mock_module.create_client = mock_create_client
supabase_mock_module.Client = MagicMock
sys.modules.setdefault('supabase', supabase_mock_module)
