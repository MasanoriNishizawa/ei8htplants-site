"""
app/email.py
============
Gmail SMTP を使った確認メール送信モジュール。

個人 Gmail アカウントから smtplib + アプリパスワードで送信する。
GMAIL_SENDER または GMAIL_APP_PASSWORD が未設定の場合はスキップする（例外なし）。

必要な環境変数:
  GMAIL_SENDER       : 送信元 Gmail アドレス（例: yourname@gmail.com）
  GMAIL_APP_PASSWORD : Google アカウントのアプリパスワード（16 桁・スペースなし）

アプリパスワードの取得手順:
  1. myaccount.google.com → セキュリティ → 2 段階認証を有効にする
  2. 同ページ内「アプリパスワード」→ アプリ名を入力して「生成」
  3. 表示された 16 桁の文字列を GMAIL_APP_PASSWORD に設定する
"""

import logging
import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr

from .config import settings

logger = logging.getLogger(__name__)

SITE_URL = "https://ei8htplants.onrender.com"

_SMTP_HOST = "smtp.gmail.com"
_SMTP_PORT = 587


def send_reservation_confirmation(data: dict) -> None:
    """
    ワークショップ予約完了の確認メールを申し込み者に送信する。

    GMAIL_SENDER / GMAIL_APP_PASSWORD が未設定の場合は何もせずに返る。
    送信エラーはログに記録して握りつぶす（メール失敗で予約処理全体を止めない）。

    Args:
        data: create_ws_reservation() に渡した予約データ辞書
              必要キー: イベント名, お名前, メール, 希望日, 希望時間帯, 参加人数, お持ち込み, 備考
    """
    sender = settings.gmail_sender
    app_password = settings.gmail_app_password

    if not sender or not app_password:
        logger.warning("GMAIL_SENDER または GMAIL_APP_PASSWORD が未設定のため確認メールをスキップします")
        return

    recipient = data.get("メール", "")
    if not recipient:
        logger.warning("送信先メールアドレスが空のため確認メールをスキップします")
        return

    try:
        subject = f"【ワークショップご予約確認】{data.get('イベント名', '')} — ei8ht plants"
        body = _build_body(data)
        _send(sender=sender, app_password=app_password, to=recipient, subject=subject, body=body)
        logger.info("確認メール送信完了: %s", recipient)
    except Exception as e:
        logger.error("確認メール送信エラー: %s", e)


def _build_body(data: dict) -> str:
    """メール本文を組み立てて返す。"""
    date_text = data.get("希望日", "").replace("-", "/")
    bring = data.get("お持ち込み", "") or "なし"
    note = data.get("備考", "")

    lines = [
        "この度は Habitat Style Workshop へのお申し込みありがとうございます。",
        "以下の内容でご予約を承りました。",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "【ご予約内容】",
        f"イベント　：{data.get('イベント名', '')}",
        f"お名前　　：{data.get('お名前', '')} 様",
        f"ご希望日　：{date_text}",
        f"時間帯　　：{data.get('希望時間帯', '')}",
        f"参加人数　：{data.get('参加人数', '')} 名",
        f"お持ち込み：{bring}",
    ]
    if note:
        lines.append(f"備考　　　：{note}")

    lines += [
        "━━━━━━━━━━━━━━━━━━",
        "",
        "当日スタッフがご案内いたします。",
        "ご不明な点がございましたら Instagram DM にてお問い合わせください。",
        "",
        "ei8ht plants / Habitat Oides",
        "@habitatoides  |  @ei8ht.plants",
        f"{SITE_URL}/events",
    ]
    return "\n".join(lines)


def _send(sender: str, app_password: str, to: str, subject: str, body: str) -> None:
    """Gmail SMTP（TLS / ポート 587）でメールを 1 通送信する。"""
    sender_name = settings.gmail_sender_name

    msg = MIMEText(body, "plain", "utf-8")
    msg["To"] = to
    msg["From"] = formataddr((sender_name, sender))  # 例: Habitat Oides <habitatoides@gmail.com>
    msg["Reply-To"] = formataddr((sender_name, sender))
    msg["Subject"] = subject

    with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(sender, app_password)
        smtp.send_message(msg)
