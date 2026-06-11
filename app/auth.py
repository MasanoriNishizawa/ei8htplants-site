"""
app/auth.py
===========
管理画面のセッション認証を管理するモジュール。

認証フロー:
  1. /admin/login で POST されたユーザー名・パスワードを検証
  2. 成功時: セッションに admin_authenticated = True を書き込む
  3. 以降のリクエスト: is_authenticated() でセッションを確認
  4. /admin/logout でセッションをクリア

セッションデータは SessionMiddleware が署名付き Cookie として保存する。
SECRET_KEY を知らない第三者はセッションを偽造できない。
"""

from fastapi import Request
from .config import settings


def is_authenticated(request: Request) -> bool:
    """
    現在のリクエストが認証済みかどうかを返す。

    セッションに admin_authenticated = True が存在する場合のみ True。
    セッション自体が存在しない場合や、値が True でない場合は False を返す。
    """
    return request.session.get("admin_authenticated") is True


def login(request: Request, username: str, password: str) -> bool:
    """
    ユーザー名とパスワードを検証してセッションに認証情報を書き込む。

    パスワードの空文字チェック（`and password`）を入れている理由:
      ADMIN_PASS が設定されていない場合 settings.admin_pass は空文字 "" になるため、
      空パスワードで何でもログインできてしまうのを防ぐ。
      本番デプロイ前に必ず ADMIN_PASS 環境変数を設定すること。

    Returns:
        True: 認証成功（セッションを更新した）
        False: 認証失敗
    """
    if username == settings.admin_user and password == settings.admin_pass and password:
        request.session["admin_authenticated"] = True
        return True
    return False


def logout(request: Request) -> None:
    """
    セッションを完全にクリアしてログアウトする。
    session.clear() を使うことで admin_authenticated 以外の値（flash など）も含め
    全セッションデータを削除する。
    """
    request.session.clear()
