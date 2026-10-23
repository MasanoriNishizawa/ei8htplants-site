"""メールや画面に出す値の書式の共通部品。"""


def fmt_yen(amount: int) -> str:
    """金額を「¥1,234」の形にする。

    Args:
        amount: 金額（円）

    Returns:
        先頭に ¥、3 桁ごとにカンマを入れた文字列
    """
    return f'¥{amount:,}'
