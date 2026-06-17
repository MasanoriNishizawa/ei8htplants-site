"""
app/email.py
============
Gmail API を使った確認メール送信モジュール。

SMTP ではなく Gmail API（HTTPS）を使用するため、クラウド環境でのポートブロックを回避できる。

必要な環境変数:
  GMAIL_CLIENT_ID          : OAuth2 クライアント ID
  GMAIL_CLIENT_SECRET      : OAuth2 クライアントシークレット
  GMAIL_REFRESH_TOKEN      : habitatoides@gmail.com の OAuth2 リフレッシュトークン
  GMAIL_SENDER             : 送信元アドレス（habitatoides@gmail.com）
  CONTACT_GMAIL_REFRESH_TOKEN : ei8htplants@gmail.com の OAuth2 リフレッシュトークン
"""

import base64
from email.mime.text import MIMEText
from email.utils import formataddr

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from .config import settings

SITE_URL = "https://ei8htplants.onrender.com"
_CONTACT_SENDER = "ei8htplants@gmail.com"


def _get_gmail_service(refresh_token: str):
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=settings.gmail_client_id,
        client_secret=settings.gmail_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
    )
    creds.refresh(Request())
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _send_via_api(refresh_token: str, sender_email: str, sender_name: str,
                  to: str, subject: str, body: str) -> None:
    service = _get_gmail_service(refresh_token)
    msg = MIMEText(body, "plain", "utf-8")
    msg["To"] = to
    msg["From"] = formataddr((sender_name, sender_email))
    msg["Subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()


def send_reservation_confirmation(data: dict) -> None:
    refresh_token = settings.gmail_refresh_token
    sender = settings.gmail_sender

    if not refresh_token or not settings.gmail_client_id:
        print("[email] SKIP: GMAIL_REFRESH_TOKEN or GMAIL_CLIENT_ID not set")
        return

    recipient = data.get("メール", "")
    if not recipient:
        print("[email] SKIP: recipient address is empty")
        return

    try:
        subject = f"【ワークショップご予約確認】{data.get('イベント名', '')} — ei8ht plants"
        body = _build_reservation_body(data)
        print(f"[email] sending reservation confirmation to {recipient}")
        _send_via_api(
            refresh_token=refresh_token,
            sender_email=sender,
            sender_name=settings.gmail_sender_name,
            to=recipient,
            subject=subject,
            body=body,
        )
        print(f"[email] reservation confirmation sent to {recipient}")
    except Exception as e:
        print(f"[email] ERROR sending reservation confirmation: {e}")


def send_contact_confirmation(data: dict) -> None:
    refresh_token = settings.contact_gmail_refresh_token

    if not refresh_token or not settings.gmail_client_id:
        print("[email] SKIP: CONTACT_GMAIL_REFRESH_TOKEN or GMAIL_CLIENT_ID not set")
        return

    recipient = data.get("email", "")
    if not recipient:
        print("[email] SKIP: contact recipient address is empty")
        return

    try:
        subject = f"【お問い合わせ受付】{data.get('subject', 'お問い合わせ')} — ei8ht plants"
        lines = [
            f"{data.get('name', '')} 様",
            "",
            "この度は ei8ht plants へのお問い合わせありがとうございます。",
            "以下の内容でお問い合わせを受け付けました。",
            "内容を確認次第、ご連絡いたします。",
            "",
            "━━━━━━━━━━━━━━━━━━",
            f"件名：{data.get('subject', '')}",
            "",
            "【内容】",
            data.get("message", ""),
            "━━━━━━━━━━━━━━━━━━",
            "",
            "ei8ht plants",
            "@ei8ht.plants  |  @habitatoides",
            f"{SITE_URL}/contact",
        ]
        print(f"[email] sending contact confirmation to {recipient}")
        _send_via_api(
            refresh_token=refresh_token,
            sender_email=_CONTACT_SENDER,
            sender_name="ei8ht plants",
            to=recipient,
            subject=subject,
            body="\n".join(lines),
        )
        print(f"[email] contact confirmation sent to {recipient}")
    except Exception as e:
        print(f"[email] ERROR sending contact confirmation: {e}")


def send_contact_notification(data: dict) -> None:
    refresh_token = settings.contact_gmail_refresh_token

    if not refresh_token or not settings.gmail_client_id:
        print("[email] SKIP: CONTACT_GMAIL_REFRESH_TOKEN or GMAIL_CLIENT_ID not set")
        return

    try:
        subject = f"【お問い合わせ】{data.get('subject', '件名なし')} — {data.get('name', '')}"
        lines = [
            "新しいお問い合わせが届きました。",
            "",
            "━━━━━━━━━━━━━━━━━━",
            f"お名前：{data.get('name', '')}",
            f"メール：{data.get('email', '')}",
            f"件名　：{data.get('subject', '')}",
            "",
            "【内容】",
            data.get("message", ""),
            "━━━━━━━━━━━━━━━━━━",
            "",
            "※このメールは ei8ht plants サイトから自動送信されています。",
        ]
        print("[email] sending contact notification to ei8htplants@gmail.com")
        _send_via_api(
            refresh_token=refresh_token,
            sender_email=_CONTACT_SENDER,
            sender_name="ei8ht plants 新規問合せ",
            to=_CONTACT_SENDER,
            subject=subject,
            body="\n".join(lines),
        )
        print("[email] contact notification sent")
    except Exception as e:
        print(f"[email] ERROR sending contact notification: {e}")


def _build_reservation_body(data: dict) -> str:
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

    cancel_token = data.get("キャンセルトークン", "")
    cancel_section = (
        [
            "",
            "──────────────────",
            "▼ キャンセルはこちら",
            f"{SITE_URL}/cancel?token={cancel_token}",
            "※ キャンセルの場合は上記リンクから手続きをお願いします。",
        ]
        if cancel_token else []
    )

    lines += [
        "━━━━━━━━━━━━━━━━━━",
        "",
        "当日スタッフがご案内いたします。",
        "ご不明な点がございましたら Instagram DM にてお問い合わせください。",
    ] + cancel_section + [
        "",
        "ei8ht plants / Habitat Oides",
        "@habitatoides  |  @ei8ht.plants",
        f"{SITE_URL}/events",
    ]
    return "\n".join(lines)
