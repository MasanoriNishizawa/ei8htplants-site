"""一定時間だけ値を覚えておく、スレッドセーフな簡易キャッシュ。"""
import threading
import time
from typing import Any


class TTLCache:
    """一定時間だけ値を覚えておく、スレッドセーフな簡易キャッシュ。

    同期のルート関数はスレッドプールから同時に呼ばれるため、Lock で守る。
    「DB に無かった」ことも覚えておけるよう、値が None でも保存する。
    期限は time.monotonic() で測る（時計の変更の影響を受けないため）。
    """

    def __init__(self, ttl: float, max_entries: int) -> None:
        """キャッシュを作る。

        Args:
            ttl: 値を覚えておく秒数
            max_entries: 保存する件数の上限（超えたら期限切れ・古い順に消す）

        Returns:
            なし。キャッシュ設定と空の保存領域を初期化する。
        """
        # 値を覚えておく秒数
        # 1. キャッシュを作る。
        self._ttl = ttl
        # 保存する件数の上限
        self._max = max_entries
        # キー → (期限の時刻（time.monotonic 基準）, 値)
        self._data: dict[Any, tuple[float, Any]] = {}
        # _data を読み書きするときに取るロック
        self._lock = threading.Lock()

    def get(self, key: Any) -> tuple[bool, Any]:
        """キーの値を返す。

        Args:
            key: 探すキー（ハッシュできる値）

        Returns:
            (見つかったか, 値)。期限切れ・未登録なら (False, None)
        """
        # 1. 単調時計で現在時刻を取り、ロック内で対象値を確認する。
        now = time.monotonic()
        with self._lock:
            # 変数の内容: hit: キャッシュ検索の結果。
            hit = self._data.get(key)
            if hit is None:
                return False, None
            # 2. 期限切れの値は削除し、有効な値だけを返す。
            # 変数の内容: expires: 保存値の期限時刻、value: キャッシュに保存した値。
            expires, value = hit
            if expires < now:
                del self._data[key]
                return False, None
            return True, value

    def set(self, key: Any, value: Any) -> None:
        """キーに値を保存する。上限を超えたら期限切れを消し、それでも多ければ古い順に消す。

        Args:
            key: 保存するキー
            value: 保存する値（None でもよい）

        Returns:
            なし。
        """
        # 変数の内容: now: 期限判定に使う現在時刻。
        now = time.monotonic()
        with self._lock:
            if len(self._data) >= self._max:
                # 1. 期限切れのものを消す
                for k in [k for k, (exp, _) in self._data.items() if exp < now]:
                    del self._data[k]
                # 2. まだ多ければ、期限が早いもの（＝古いもの）から消す
                if len(self._data) >= self._max:
                    # 変数の内容: oldest: 期限が最も早いキャッシュ項目。
                    oldest = sorted(self._data.items(), key=lambda kv: kv[1][0])
                    # 変数の内容: _: 繰り返し回数だけを使うための未使用値、k: 現在処理する辞書キー。
                    for k, _ in oldest[: len(self._data) - self._max + 1]:
                        del self._data[k]
            # 3. 新しい値を期限付きで保存する
            self._data[key] = (now + self._ttl, value)

    def clear(self) -> None:
        """全件を消す（テストで DB のモックを差し替えるときに使う）。

        Returns:
            なし。
        """
        # 1. ロックを取り、キーと値を保持する内部辞書を空にする。
        with self._lock:
            self._data.clear()
