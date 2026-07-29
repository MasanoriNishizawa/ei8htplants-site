import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_ANON_KEY = os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
SUPABASE_SERVICE_ROLE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
RESEND_API_KEY = os.getenv('RESEND_API_KEY', '')
CONTACT_TO_EMAIL = os.getenv('CONTACT_TO_EMAIL', '')
CONTACT_FROM_EMAIL = os.getenv('CONTACT_FROM_EMAIL', 'noreply@ei8htplants.com')

SQUARE_ACCESS_TOKEN = os.getenv('SQUARE_ACCESS_TOKEN', '')
SQUARE_LOCATION_ID = os.getenv('SQUARE_LOCATION_ID', '')
# 'sandbox' or 'production'
SQUARE_ENVIRONMENT = os.getenv('SQUARE_ENVIRONMENT', 'sandbox')

# Resend の "from" フィールドに表示される送信者名
SENDER = f'ei8ht plants <{CONTACT_FROM_EMAIL}>'

# 全メール共通フッター。返信不可を明示する
NO_REPLY_NOTE = (
    '\n\n─────────────────\n'
    '※ このメールは送信専用です。このメールへの返信はお受けできません。\n'
    '  お問い合わせは https://ei8htplants.com/contact よりお願いいたします。'
)
