"""
main.py
=======
アプリケーションのエントリーポイント。

create_app() を呼び出してアプリインスタンスを生成するだけの薄いファイル。
ルート定義・ミドルウェア設定・サービス初期化などのロジックは app/ パッケージに集約している。

Render や他の ASGI サーバーからは `main:app` で参照する。
ローカル開発では `python main.py` または `uvicorn main:app --reload` で起動。
"""

from app import create_app
import uvicorn

# Render, uvicorn, gunicorn などが参照するモジュールレベルの app インスタンス
app = create_app()

if __name__ == "__main__":
    # python main.py で直接起動するときに使用（開発用）
    # Render 本番環境では uvicorn が直接 `main:app` を参照するため、このブロックは使わない
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
