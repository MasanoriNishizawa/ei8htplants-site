"""環境変数から設定値を読み込むモジュール。

ローカルではプロジェクトルートの .env を読み、本番（Render）では Render の環境変数を使う
（load_dotenv は既にある環境変数を上書きしないため、本番は Render の値が優先される）。
秘密の値（キー・トークン）はここで読むだけにし、ログや応答には出さない。
"""
import os

from dotenv import load_dotenv

# プロジェクトルートの .env を読み込む（本番はRenderの環境変数が優先される）
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

# ---------------------------------------------------------------------------
# Supabase（必須。無いと起動時に KeyError で止まる）
# ---------------------------------------------------------------------------

# Supabase のプロジェクトの URL。フロントと共用のため Next.js 由来の環境変数名をそのまま使う
SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
# 公開用のキー（anon）。RLS で許可された読み取りとログインの確認（auth.get_user）に使う
SUPABASE_ANON_KEY = os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
# 管理用のキー（service_role）。RLS を通らずに読み書きできるので、サーバーの中だけで使う（ログに出さない）
SUPABASE_SERVICE_ROLE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']

# ---------------------------------------------------------------------------
# Resend（メール送信。未設定ならメールを送らない）
# ---------------------------------------------------------------------------

# ei8ht plants 名義のメール（問い合わせ・注文）に使う API キー
RESEND_API_KEY = os.getenv('RESEND_API_KEY', '')
# Habitat Oides 名義のメール（ワークショップ予約）に使う API キー
HABITAT_RESEND_API_KEY = os.getenv('HABITAT_RESEND_API_KEY', '')
# 問い合わせ・注文の通知を受け取る管理者のメールアドレス
CONTACT_TO_EMAIL = os.getenv('CONTACT_TO_EMAIL', '')
# ei8ht plants 名義のメールの送信元アドレス
CONTACT_FROM_EMAIL = os.getenv('CONTACT_FROM_EMAIL', 'noreply@ei8htplants.com')
# Habitat Oides 名義のメールの送信元アドレス
HABITAT_FROM_EMAIL = os.getenv('HABITAT_FROM_EMAIL', 'noreply@habitatoides.com')
# ワークショップ予約の通知を受け取る Habitat Oides の管理者のメールアドレス
HABITAT_ADMIN_EMAIL = os.getenv('HABITAT_ADMIN_EMAIL', 'info@habitatoides.com')

# ---------------------------------------------------------------------------
# Square（オンラインショップの決済）
# ---------------------------------------------------------------------------

# Square の API のアクセストークン（未設定なら注文 API は 500 を返す）
SQUARE_ACCESS_TOKEN = os.getenv('SQUARE_ACCESS_TOKEN', '')
# 決済を記録する Square の店舗（ロケーション）ID
SQUARE_LOCATION_ID = os.getenv('SQUARE_LOCATION_ID', '')
# 接続先。'sandbox'（テスト環境）か 'production'（本番）
SQUARE_ENVIRONMENT = os.getenv('SQUARE_ENVIRONMENT', 'sandbox')

# ---------------------------------------------------------------------------
# Gemini（植物相談チャット）
# ---------------------------------------------------------------------------

# Gemini API のキー（未設定ならチャット API は 503 を返す）
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')

# ---------------------------------------------------------------------------
# サイト共通の値（環境変数ではなく固定値）
# ---------------------------------------------------------------------------

# 公開サイトの URL（末尾のスラッシュなし）。メール内のリンク・SEO の絶対 URL・本番ドメインへの転送に使う
SITE_ORIGIN = 'https://ei8htplants.com'

# Resend の "from" に表示される送信者名（ei8ht plants 名義）
SENDER = f'ei8ht plants <{CONTACT_FROM_EMAIL}>'
# Resend の "from" に表示される送信者名（Habitat Oides 名義）
HABITAT_SENDER = f'Habitat Oides <{HABITAT_FROM_EMAIL}>'

# ei8ht plants 名義のテキストメールの末尾に付ける「返信不可」の注記
NO_REPLY_NOTE = (
    '\n\n─────────────────\n'
    '※ このメールは送信専用です。このメールへの返信はお受けできません。\n'
    f'  お問い合わせは {SITE_ORIGIN}/official/contact よりお願いいたします。'
)

# Habitat Oides 名義のテキストメールの末尾に付ける「返信不可」の注記
HABITAT_NO_REPLY_NOTE = (
    '\n\n─────────────────\n'
    '※ このメールは送信専用です。このメールへの返信はお受けできません。\n'
    f'  ご不明な点は公式HPお問い合わせ( {SITE_ORIGIN}/official/contact )または {HABITAT_ADMIN_EMAIL} までご連絡ください。'
)
