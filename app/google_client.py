"""
app/google_client.py
====================
Google API クライアント（gspread / Drive）のシングルトン管理モジュール。

クライアントのインスタンスをモジュールレベルのグローバル変数でキャッシュすることで、
リクエストのたびに認証・接続を張り直すコストを避ける。

Render の無料プランはシングルプロセスなので競合は起きないが、
マルチスレッド環境では接続の競合に注意が必要。
"""

from __future__ import annotations
import gspread
from googleapiclient.discovery import build
from .config import settings

# モジュールレベルで保持するクライアントキャッシュ
# None = まだ初期化されていない
_gc: gspread.Client | None = None
_drive = None


def get_gc() -> gspread.Client:
    """
    gspread クライアントを返す（初回呼び出し時に生成・以降は再利用）。

    gspread.authorize() は内部でトークンの有効期限を管理しており、
    期限切れ時は自動でリフレッシュするため、長期間の再利用も安全。
    """
    global _gc
    if _gc is None:
        _gc = gspread.authorize(settings.google_credentials)
    return _gc


def get_drive():
    """
    Google Drive API クライアントを返す（初回呼び出し時に生成・以降は再利用）。

    build() は内部で Discovery ドキュメントを取得するため初回は少し時間がかかる。
    シングルトンにすることでその cost を 1 回に抑える。
    """
    global _drive
    if _drive is None:
        _drive = build("drive", "v3", credentials=settings.google_credentials)
    return _drive


