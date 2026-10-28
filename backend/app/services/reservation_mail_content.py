"""ワークショップ予約メールのHTML断片を組み立てる副作用のない関数。"""

from ..config import HABITAT_ADMIN_EMAIL, SITE_ORIGIN
from ..mail import esc


def _html_wrap(body_html: str) -> str:
    """本文HTMLをHabitat Oidesのメール共通レイアウトで包む。

    Args:
        body_html: メール本文として配置するHTML断片。呼び出し側で必要な値をエスケープする。

    Returns:
        共通ヘッダー・本文・問い合わせ先を含む完全なHTMLメール文字列。
    """
    # 1. 既存のスタイル、問い合わせリンク、要素の順序を保って本文を配置する。
    return f'''<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f2;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f2;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr><td style="background:#2d3a24;padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:18px;letter-spacing:3px;">Habitat Oides</p>
        </td></tr>
        <tr><td style="padding:32px;">
          {body_html}
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #eeeeee;">
          <p style="margin:0;font-size:12px;color:#999999;line-height:1.8;">
            ※ このメールは送信専用です。このメールへの返信はお受けできません。<br>
            ご不明な点は<a href="{SITE_ORIGIN}/official/contact" style="color:#4a6741;">公式HPお問い合わせ</a>または
            <a href="mailto:{esc(HABITAT_ADMIN_EMAIL)}" style="color:#4a6741;">{esc(HABITAT_ADMIN_EMAIL)}</a> までご連絡ください。
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>'''


def _row(label: str, value: object, raw_html: bool = False) -> str:
    """メールの項目テーブルに表示する1行分のHTMLを生成する。

    Args:
        label: 左カラムに表示する項目名。HTMLとしてエスケープする。
        value: 右カラムに表示する値。raw_htmlがFalseならHTMLとしてエスケープする。
        raw_html: TrueならvalueをHTML文字列としてそのまま配置する。

    Returns:
        項目名と値を含む<tr>要素のHTML文字列。
    """
    # 1. 指定に応じて値をエスケープするか、組み立て済みHTMLとして扱う。
    # 変数の内容: cell: 右カラムに配置するエスケープ済み文字列または許可済みHTML。
    cell = str(value) if raw_html else esc(value)
    # 2. 項目名は常にエスケープし、従来と同じ属性・順序で行を返す。
    return (
        f'<tr>'
        f'<td style="padding:8px 0;font-size:13px;color:#888888;width:120px;vertical-align:top;">{esc(label)}</td>'
        f'<td style="padding:8px 0;font-size:14px;color:#333333;vertical-align:top;">{cell}</td>'
        f'</tr>'
    )


def _rows_table(rows_html: str) -> str:
    """組み立て済みの項目行を既存スタイルのテーブルで包む。

    Args:
        rows_html: _rowで生成した<tr>要素を連結したHTML文字列。

    Returns:
        項目行を含む<table>要素のHTML文字列。
    """
    # 1. 既存の枠線・属性を保ち、行HTMLをそのままテーブル内へ配置する。
    return (
        '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eeeeee;">'
        f'{rows_html}</table>'
    )
