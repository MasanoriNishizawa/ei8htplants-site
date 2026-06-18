"""
app/cache.py
============
シンプルなインメモリ TTL キャッシュ。

Google Sheets / Drive API は無料枠でのレートリミットがあるため、
同じデータを毎リクエストで取得しないようにキャッシュを挟む。
デフォルト TTL は 5 分（イベントデータ用）。ギャラリー画像は 10 分。

サーバーがシングルプロセスで動作する Render の無料プランに最適。
複数プロセス / 複数サーバーに水平スケールする場合は Redis 等に移行が必要。
"""

import time
from typing import Any, Optional


class TTLCache:
    """
    キー → (値, 有効期限タイムスタンプ) の辞書をラップしたキャッシュ。

    time.monotonic() を使う理由:
      time.time() はシステムクロックの変更（NTP 同期など）に影響されるが、
      monotonic() は単調増加が保証されているため、TTL の計算に適している。
    """

    def __init__(self, ttl: int = 300):
        """
        Args:
            ttl: デフォルトの有効期間（秒）。
        """
        self._store: dict[str, tuple[Any, float]] = {}
        self._ttl = ttl

    def get(self, key: str) -> Optional[Any]:
        """
        キャッシュから値を取得する。
        有効期限切れのエントリは削除してから None を返す（遅延クリーンアップ）。
        """
        entry = self._store.get(key)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
        # 期限切れのエントリはメモリ節約のため削除
        self._store.pop(key, None)
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """
        値をキャッシュに保存する。

        Args:
            key:  キャッシュキー
            value: 保存する値
            ttl:  有効期間（秒）。省略時はデフォルト TTL を使用。
        """
        self._store[key] = (value, time.monotonic() + (ttl or self._ttl))

    def get_stale(self, key: str) -> Optional[Any]:
        """TTL 切れでも値を返す。API エラー時のフォールバック用。"""
        entry = self._store.get(key)
        return entry[0] if entry else None

    def delete(self, key: str) -> None:
        """指定キーのキャッシュを即時削除する。"""
        self._store.pop(key, None)

    def clear_prefix(self, prefix: str) -> None:
        """
        プレフィックスに一致する全キーを削除する。
        イベントデータを書き換えた後に `clear_prefix("events:")` を呼ぶことで、
        "events:current" と "events:past" を一括で無効化できる。
        """
        for k in [k for k in self._store if k.startswith(prefix)]:
            del self._store[k]


# アプリ全体で共有するキャッシュインスタンス（デフォルト TTL 5 分）
cache = TTLCache(ttl=300)
