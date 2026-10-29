"""IP アドレスごとの回数制限（インメモリ）の共通部品。

公開の書き込み API（チャット・問い合わせ・予約・キャンセル・注文）を、同じ IP から
短時間に何度も呼ばれないようにする。記録はプロセスのメモリにだけ持つ
（サーバーを再起動すると消える。複数台で動かす場合は台ごとに数える）。

IP は client_ip() で決める。本番は Cloudflare → Render の中継を通るため、request.client.host は
中継の IP になり、全員が同じ IP として数えられてしまう。そこで中継が付けるヘッダー
（CF-Connecting-IP、X-Forwarded-For の右端）を優先して使う。
偽の IP を次々に送られても記録が増え続けないよう、IP の長さと記録する IP の数に上限を設けている。
"""
import threading
import time

from fastapi import HTTPException, Request

# 記録する IP の数の上限（掃除しても超える場合は、一番古い記録から捨てる）
MAX_TRACKED_IPS = 10000
# IP として受け取る文字数の上限（IPv6 の最大は 45 文字。長い値はここで切る）
MAX_IP_LENGTH = 64

# 制限を超えたときに返す文言
RATE_LIMIT_MESSAGE = '送信回数の上限に達しました。しばらく待ってから再試行してください。'


class RateLimiter:
    """「window 秒の間に limit 回まで」を IP ごとに数える。"""

    def __init__(self, limit: int, window: float) -> None:
        """回数制限を作る。

        Args:
            limit: window 秒の間に受け付ける最大回数
            window: 数える期間（秒）

        Returns:
            なし。作成した設定をインスタンスに保存する。
        """
        # 1. 回数制限の条件と、受付履歴を保護する同期用の状態を初期化する。
        # window 秒の間に受け付ける最大回数
        self.limit = limit
        # 数える期間（秒）
        self.window = window
        # IP → 受け付けた時刻（time.time()）のリスト。テストから中身を見たり消したりできるよう公開している
        self.log: dict[str, list[float]] = {}
        # log を読み書きするときに取るロック（同期のルートはスレッドプールから同時に呼ばれる）
        self._lock = threading.Lock()
        # 最後に古いキーを掃除した時刻
        self._last_purge = 0.0

    def _purge(self, now: float) -> None:
        """window 秒より前の記録しか無い IP を消す（記録が増え続けないようにする）。

        Args:
            now: 今の時刻（time.time()）

        Returns:
            なし。
        """
        # 1. 期間外または空の IP 記録を取り除き、最後に掃除した時刻を更新する。
        # 変数の内容: stale: 期限切れとして除去する IP の一覧、ip: 対象の IP キー、times: その IP の受付時刻一覧。
        stale = [ip for ip, times in self.log.items() if not times or now - times[-1] >= self.window]
        # 変数の内容: ip: 処理対象のクライアント IP アドレス。
        for ip in stale:
            del self.log[ip]
        # 変数の内容: self._last_purge: 古い IP 記録を最後に整理した時刻。
        self._last_purge = now

    def check(self, ip: str) -> None:
        """この IP からの 1 回を数える。上限を超えていれば 429 を返す。

        Args:
            ip: クライアントの IP アドレス

        Raises:
            HTTPException(429): window 秒の間に limit 回を超えた場合（その回は数えない）

        Returns:
            なし。
        """
        # 変数の内容: now: 期限判定に使う現在時刻。
        now = time.time()
        with self._lock:
            # 1. window 秒に 1 回、古いキーをまとめて消す
            if now - self._last_purge >= self.window:
                self._purge(now)
            # 2. この IP の記録から window 秒より前のものを除く
            # 変数の内容: recent: 集計期間内にこの IP で受け付けた時刻、t: 比較する受付時刻。
            recent = [t for t in self.log.get(ip, []) if now - t < self.window]
            # 3. 上限に達していれば 429（記録は増やさない）
            if len(recent) >= self.limit:
                self.log[ip] = recent
                raise HTTPException(status_code=429, detail=RATE_LIMIT_MESSAGE)
            # 4. 受け付けて記録する
            recent.append(now)
            self.log[ip] = recent
            # 5. 記録する IP の数が上限を超えたら、古い記録を消し、まだ多ければ最後の受付が古い順に捨てる
            if len(self.log) > MAX_TRACKED_IPS:
                self._purge(now)
                # 変数の内容: overflow: 上限超過で削除する項目数。
                overflow = len(self.log) - MAX_TRACKED_IPS
                if overflow > 0:
                    # 変数の内容: oldest: 最後に受付記録が追加された時刻が古い IP アドレス。
                    oldest = sorted(self.log, key=lambda k: self.log[k][-1] if self.log[k] else 0.0)[:overflow]
                    # 変数の内容: key: 現在処理する辞書キー。
                    for key in oldest:
                        del self.log[key]

    def reset(self) -> None:
        """記録をすべて消す（テスト用）。

        Returns:
            なし。
        """
        # 1. ロックを取り、受付記録と掃除時刻を初期状態へ戻す。
        with self._lock:
            self.log.clear()
            # 変数の内容: self._last_purge: 古い IP 記録を最後に整理した時刻。
            self._last_purge = 0.0


def client_ip(request: Request) -> str:
    """リクエストの送り元（利用者）の IP アドレスを返す。

    次の順に見て、最初に取れた値を使う。
    1. CF-Connecting-IP（Cloudflare が付ける利用者の IP。Cloudflare を通ったリクエストでは利用者が書き換えられない）
    2. X-Forwarded-For の右端（Render の中継が、自分に接続してきた相手の IP として最後に付け足す値。
       先頭の値は利用者が自由に書けるので使わない）
    3. 接続してきた相手の IP（request.client.host。ローカル実行やテストのとき）

    Cloudflare を通さず Render の URL に直接送られた場合、CF-Connecting-IP は利用者が書けてしまう
    （既知の課題として設計書に記録している）。どの値も MAX_IP_LENGTH 文字までに切る。

    Args:
        request: FastAPI のリクエスト

    Returns:
        IP アドレスの文字列。取れないときは 'unknown'
    """
    # 1. Cloudflare が付ける利用者の IP
    # 変数の内容: cf_ip: Cloudflare が付けた接続元 IP。
    cf_ip = request.headers.get('cf-connecting-ip', '').strip()
    if cf_ip:
        return cf_ip[:MAX_IP_LENGTH]
    # 2. 中継が付ける送り元の一覧（「…, 中継に接続してきた相手」の形）の右端
    # 変数の内容: forwarded: X-Forwarded-For に含まれる空でない IP 候補、part: 分割した IP 表記の各項目。
    forwarded = [part.strip() for part in request.headers.get('x-forwarded-for', '').split(',') if part.strip()]
    if forwarded:
        return forwarded[-1][:MAX_IP_LENGTH]
    # 3. ヘッダーが無いときは接続してきた相手の IP
    return request.client.host if request.client else 'unknown'



# 公開の書き込み API（問い合わせ・予約・キャンセル・注文）で 1 分間に受け付ける回数（IP ごと・API ごと）
PUBLIC_WRITE_LIMIT = 5
# 公開の書き込み API の回数を数える期間（秒）
PUBLIC_WRITE_WINDOW = 60

# API ごとの回数制限（別の API の回数を食い合わないよう分けている）
contact_limiter = RateLimiter(PUBLIC_WRITE_LIMIT, PUBLIC_WRITE_WINDOW)
# 予約作成 API の IP ごとの受付回数を記録する制限器。
reserve_limiter = RateLimiter(PUBLIC_WRITE_LIMIT, PUBLIC_WRITE_WINDOW)
# 予約キャンセル API の IP ごとの受付回数を記録する制限器。
cancel_limiter = RateLimiter(PUBLIC_WRITE_LIMIT, PUBLIC_WRITE_WINDOW)
# 注文作成 API の IP ごとの受付回数を記録する制限器。
order_limiter = RateLimiter(PUBLIC_WRITE_LIMIT, PUBLIC_WRITE_WINDOW)


def reset_all() -> None:
    """公開の書き込み API の回数制限の記録をすべて消す（テストの前に呼ぶ）。

    Returns:
        なし。
    """
    # 1. 公開書き込み API ごとの回数制限記録を順に初期化する。
    # 変数の内容: limiter: 対象の回数制限インスタンス。
    for limiter in (contact_limiter, reserve_limiter, cancel_limiter, order_limiter):
        limiter.reset()
