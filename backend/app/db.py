from supabase import create_client, Client
from .config import SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 公開用（読み取り）
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# 管理用（書き込み）
admin_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
