import os
from dotenv import load_dotenv

# プロジェクトルートの .env を読み込む（本番はRenderの環境変数が優先される）
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

# Supabase: フロント共用のキーはNext.js由来の環境変数名をそのまま流用
SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_ANON_KEY = os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
SUPABASE_SERVICE_ROLE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
# Resend: ei8ht plants 用と Habitat Oides 用でキーを使い分ける
RESEND_API_KEY = os.getenv('RESEND_API_KEY', '')
HABITAT_RESEND_API_KEY = os.getenv('HABITAT_RESEND_API_KEY', '')
CONTACT_TO_EMAIL = os.getenv('CONTACT_TO_EMAIL', '')
CONTACT_FROM_EMAIL = os.getenv('CONTACT_FROM_EMAIL', 'noreply@ei8htplants.com')
HABITAT_FROM_EMAIL = os.getenv('HABITAT_FROM_EMAIL', 'noreply@habitatoides.com')

SQUARE_ACCESS_TOKEN = os.getenv('SQUARE_ACCESS_TOKEN', '')
SQUARE_LOCATION_ID = os.getenv('SQUARE_LOCATION_ID', '')
# 'sandbox' or 'production'
SQUARE_ENVIRONMENT = os.getenv('SQUARE_ENVIRONMENT', 'sandbox')

# Resend の "from" フィールドに表示される送信者名
SENDER = f'ei8ht plants <{CONTACT_FROM_EMAIL}>'
HABITAT_SENDER = f'Habitat Oides <{HABITAT_FROM_EMAIL}>'

# 返信不可フッター
NO_REPLY_NOTE = (
    '\n\n─────────────────\n'
    '※ このメールは送信専用です。このメールへの返信はお受けできません。\n'
    '  お問い合わせは https://ei8htplants.com/contact よりお願いいたします。'
)

HABITAT_NO_REPLY_NOTE = (
    '\n\n─────────────────\n'
    '※ このメールは送信専用です。このメールへの返信はお受けできません。\n'
    '  ご不明な点は公式HPお問い合わせ( https://ei8htplants.com/contact )または info@habitatoides.com までご連絡ください。'
)
