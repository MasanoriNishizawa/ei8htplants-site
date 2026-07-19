"""
app/templates.py
================
Jinja2 テンプレートエンジンの設定モジュール。

このモジュールを import すると templates インスタンスが生成され、
カスタムフィルターが登録される。
app/__init__.py で副作用 import しているため、全テンプレートで利用可能になる。
"""

import re
from fastapi.templating import Jinja2Templates

# Jinja2Templates インスタンス（テンプレートディレクトリを指定）
# ルートからの相対パスで解決されるため、uvicorn はプロジェクトルートで起動すること
templates = Jinja2Templates(directory="templates")


def _urlize_filter(text: str) -> str:
    """
    テキスト内の http/https URL を <a> タグに変換するカスタム Jinja2 フィルター。

    使用例 (テンプレート側):
        {{ event['備考'] | urlize | safe }}

    Jinja2 組み込みの urlize フィルターは日本語 URL や特殊なパスを正しく扱えない
    ことがあるため、シンプルな正規表現ベースの独自実装を使っている。
    """
    if not text:
        return ""
    pattern = re.compile(r"(https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s]*)?)")
    return pattern.sub(
        # rel="noopener noreferrer" は外部リンクのセキュリティ慣行
        r'<a href="\1" target="_blank" rel="noopener noreferrer" '
        r'style="color: var(--color-link); text-decoration: underline; '
        r'text-underline-offset: 3px;">\1</a>',
        str(text),
    )


# カスタムフィルターをテンプレートエンジンに登録する
templates.env.filters["urlize"] = _urlize_filter
