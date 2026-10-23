"""Supabase のクライアント（公開用と管理用の 2 つ）を作るモジュール。"""
from supabase import Client, create_client

from .config import SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

# 公開用（anon キー）。RLS で公開を許した行の読み取りと、ログインの確認（auth.get_user）に使う
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# 管理用（service_role キー）。RLS を通らずに読み書きできる。書き込みと、非公開の行の読み取りに使う
admin_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
