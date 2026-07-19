"""
Gmail OAuth2 リフレッシュトークン取得スクリプト
================================================
ローカルで一度だけ実行してリフレッシュトークンを取得する。
取得したトークンを Render の環境変数に設定すること。

使い方:
  python get_gmail_token.py

必要なもの:
  - Google Cloud Console で作成した OAuth2 クライアント（デスクトップアプリ）の
    クライアント ID とクライアントシークレット
"""

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

client_id     = input("GMAIL_CLIENT_ID を入力: ").strip()
client_secret = input("GMAIL_CLIENT_SECRET を入力: ").strip()
account       = input("対象アカウント（例: habitatoides@gmail.com）: ").strip()

client_config = {
    "installed": {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
    }
}

flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
creds = flow.run_local_server(port=0)

print("\n" + "=" * 50)
print(f"アカウント: {account}")
print(f"GMAIL_CLIENT_ID     = {client_id}")
print(f"GMAIL_CLIENT_SECRET = {client_secret}")
print(f"リフレッシュトークン = {creds.refresh_token}")
print("=" * 50)
print("\nこの値を Render の環境変数に設定してください。")
print("habitatoides@gmail.com → GMAIL_REFRESH_TOKEN")
print("ei8htplants@gmail.com  → CONTACT_GMAIL_REFRESH_TOKEN")
