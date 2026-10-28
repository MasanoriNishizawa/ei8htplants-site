"""予約メールのHTML組み立て関数を確認するテスト。

対象: backend/app/services/reservation_mail_content.py
"""

from app.services.reservation_mail_content import _html_wrap, _row, _rows_table


class TestReservationMailContent:
    """予約メールのHTML断片生成を確認する。"""

    def test_メール本文を共通レイアウトで包む(self):
        """本文が共通レイアウトに配置され必要な外枠が含まれること。

        Returns:
            なし。
        """
        # 1. メール本文をレイアウトへ渡し、ブランド・本文・問い合わせ先の出力を確認する。
        # 変数の内容: body_html: 共通レイアウトに配置するメール本文。
        body_html = '<p>予約内容</p>'
        # 変数の内容: wrapped_html: 共通レイアウトで包んだHTMLメール。
        wrapped_html = _html_wrap(body_html)

        assert wrapped_html.startswith('<!DOCTYPE html>')
        assert '<html lang="ja">' in wrapped_html
        assert 'Habitat Oides' in wrapped_html
        assert body_html in wrapped_html
        assert '/official/contact' in wrapped_html

    def test_項目名と値をHTMLエスケープする(self):
        """項目名と通常値がHTMLとして解釈されないこと。

        Returns:
            なし。
        """
        # 1. HTML文字列を含む項目を生成し、タグと記号がエスケープされたことを確認する。
        # 変数の内容: row_html: 悪意あるHTML文字列を含む値から生成した行。
        row_html = _row('<b>項目</b>', '<script>alert("x")</script> &')

        assert '&lt;b&gt;項目&lt;/b&gt;' in row_html
        assert '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;' in row_html
        assert '<script>' not in row_html
        assert '<b>項目</b>' not in row_html

    def test_raw_html_trueではメールリンクをそのまま通す(self):
        """許可した組み立て済みメールリンクが値側で保持されること。

        Returns:
            なし。
        """
        # 1. 組み立て済みメールリンクをraw HTMLで渡し、値として保持されることを確認する。
        # 変数の内容: mail_link: メール送信用の組み立て済みリンク。
        mail_link = '<a href="mailto:shop@example.com">shop@example.com</a>'
        # 変数の内容: row_html: メールリンクをraw HTMLとして含む項目行。
        row_html = _row('連絡先', mail_link, raw_html=True)

        assert mail_link in row_html
        assert '&lt;a ' not in row_html

    def test_rows_tableは複数の項目行を順番に連結する(self):
        """渡した複数行を順番どおり同じテーブル内に配置すること。

        Returns:
            なし。
        """
        # 1. 2件の項目行をテーブル化し、行数と表示順を確認する。
        # 変数の内容: first_row: テーブルの先頭に配置する項目行。
        first_row = _row('お名前', '花子')
        # 変数の内容: second_row: テーブルの2行目に配置する項目行。
        second_row = _row('メール', 'hanako@example.com')
        # 変数の内容: table_html: 2つの項目行を包んだテーブル。
        table_html = _rows_table(first_row + second_row)

        assert table_html.startswith('<table width="100%"')
        assert table_html.count('<tr>') == 2
        assert table_html.index(first_row) < table_html.index(second_row)
        assert table_html.endswith('</table>')
