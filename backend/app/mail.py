"""メール送信（Resend）の共通部品。

Resend の SDK は API キーをモジュール全体の変数（resend.api_key）で持つ。
ei8ht plants 用と Habitat Oides 用でキーを使い分けているため、同時に 2 つのリクエストが
メールを送ると、キーを設定してから送るまでの間に別のキーに入れ替わることがある。
そこで、キーの設定と送信を 1 つのロックの中で行う。
"""
import html
import logging
import threading
from typing import Any

import resend

logger = logging.getLogger(__name__)

# resend.api_key の設定と送信をひとまとまりにするロック（キーの入れ替わりを防ぐ）
_send_lock = threading.Lock()


def send_mail(api_key: str, payload: dict[str, Any]) -> str | None:
    """Resend でメールを 1 通送り、Resend のメール ID を返す。

    Args:
        api_key: 使う Resend の API キー（RESEND_API_KEY か HABITAT_RESEND_API_KEY）
        payload: resend.Emails.send に渡す内容（from・to・subject・text・html など）

    Returns:
        Resend が発行したメール ID。取り出せないときは None

    Raises:
        Exception: Resend の送信に失敗した場合（呼び出し元で扱う）
    """
    # 1. キーの設定と送信を同じロックの中で行う
    with _send_lock:
        resend.api_key = api_key
        result = resend.Emails.send(payload)
    # 2. 戻り値は版によって dict かオブジェクトなので、どちらからも ID を取り出す
    if isinstance(result, dict):
        return result.get('id')
    return getattr(result, 'id', None)


def esc(value: Any) -> str:
    """HTML メールに入れる値をエスケープする（< > & " ' を実体参照にする）。

    利用者が入力した名前・備考などをそのまま HTML に入れると、タグやリンクを
    埋め込まれる（なりすましのリンクなど）ため、HTML に入れる値はすべてこれを通す。

    Args:
        value: 入れる値（None は空文字にする。数値は文字列にする）

    Returns:
        エスケープ済みの文字列
    """
    if value is None:
        return ''
    return html.escape(str(value), quote=True)
