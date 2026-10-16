"""Streamlit の Secrets（secrets.toml）を環境変数に反映させるモジュール。

Streamlit Community Cloud では、秘密の値はアプリ設定の Secrets 欄に TOML で入れる。
lib/data.py・lib/auth.py・lib/ga.py は os.getenv で値を読むため、Secrets のトップレベルの値が
os.environ に入っている必要がある。

Streamlit 1.66 の実装（streamlit/runtime/secrets.py の Secrets._parse）では、
secrets.toml を初めて読み込んだときに、トップレベルの文字列・整数・小数の値を os.environ に入れる
（入れ子のテーブルや真偽値は入れない。同じ名前の環境変数があれば Secrets の値で上書きする）。
`streamlit run` は起動時（web/bootstrap.py の prepare_streamlit_environment）に一度読み込むので通常はこれで足りるが、
起動の仕方や今後の版で読み込みが遅れても値が欠けないよう、アプリの最初で明示的に読み込む。
"""

from __future__ import annotations

import logging

import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError

logger = logging.getLogger(__name__)


def load_secrets_into_env() -> bool:
    """st.secrets を一度読み込み、トップレベルの値を環境変数に反映させる。

    secrets.toml が無い環境（ローカルで .env を使う場合など）では何もしない。
    値そのものは画面にもログにも出さない。

    Returns:
        secrets.toml を読み込めたら True、無い・読めないときは False
    """
    try:
        # 1. 件数を数えるだけで Streamlit が secrets.toml を読み込み、os.environ にも反映する
        len(st.secrets)
        return True
    except StreamlitSecretNotFoundError:
        # 2. secrets.toml が見つからない（ローカルで .env を使う通常の場合）、
        #    または TOML の書き方が誤っていて読めない場合に Streamlit が出す例外。
        #    前者は正常なので何もしない。後者は Streamlit 自身が起動時にログへ理由を出している
        return False
    except OSError as e:
        # 3. secrets.toml はあるが読み取れない（権限が無いなど）。値は出さず、例外の種類だけ記録する
        logger.error("Secrets を読み込めませんでした: %s", type(e).__name__)
        return False
