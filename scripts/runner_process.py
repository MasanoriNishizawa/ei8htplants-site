"""外部コマンドの起動、出力回収、中断時の後始末を担当する。"""
import os
import signal
import subprocess
import time
from pathlib import Path


def _signal_process(process: subprocess.Popen, signal_number: int) -> None:
    """起動したコマンドのプロセス群へ終了シグナルを送る。

    Args:
        process: 専用セッションで起動したコマンド。
        signal_number: POSIX の終了シグナル。

    Returns:
        戻り値なし。
    """
    # 1. POSIXでは専用プロセスグループ全体へ送り、他用途のプロセスには触れない。
    if os.name == "posix":
        try:
            os.killpg(process.pid, signal_number)
        except ProcessLookupError:
            # すでにグループが終了している場合は後続の wait で状態を回収する。
            pass
        return

    # 2. POSIX以外では、Popen が直接起動したプロセスだけを終了する。
    if signal_number == signal.SIGTERM:
        process.terminate()
    else:
        process.kill()


def _process_group_exists(process_group_id: int) -> bool:
    """指定したPOSIXプロセスグループが残っているかを調べる。

    Args:
        process_group_id: 専用セッションのleaderが持つプロセスグループID。

    Returns:
        グループが存在する場合はTrue、終了済みならFalse。
    """
    try:
        # 1. シグナル番号0はプロセスへ影響を与えず、存在と権限だけを確認する。
        os.killpg(process_group_id, 0)
    except ProcessLookupError:
        return False
    return True


def _stop_process(process: subprocess.Popen, grace_seconds: float = 5.0) -> None:
    """割り込み時に起動したプロセスを終了し、親プロセスを回収する。

    Args:
        process: 起動済みの外部コマンド。
        grace_seconds: SIGTERM 後に終了を待つ秒数。

    Returns:
        戻り値なし。
    """
    # 1. SIGTERM送信時点で共通の期限を決め、leaderと子孫で猶予時間を共有する。
    deadline = time.monotonic() + grace_seconds
    _signal_process(process, signal.SIGTERM)
    try:
        process.wait(timeout=max(0.0, deadline - time.monotonic()))
    except subprocess.TimeoutExpired:
        _signal_process(process, signal.SIGKILL)
        process.wait()
        return

    # 2. leaderが先に終了しても、残存グループを共通期限まで確認する。
    if os.name == "posix":
        while _process_group_exists(process.pid):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _signal_process(process, signal.SIGKILL)
                return
            time.sleep(min(0.05, remaining))


def run_process(cmd: list[str], cwd: Path) -> tuple[int, str, float]:
    """コマンドを起動し、終了コード・標準出力・経過時間を返す。

    Args:
        cmd: 実行するコマンドと引数。
        cwd: コマンドを実行する作業ディレクトリ。

    Returns:
        終了コード、標準出力と標準エラーを連結した文字列、経過秒数。
        起動できない場合は終了コード127と診断文を返す。

    Raises:
        KeyboardInterrupt: 子プロセスを終了・回収した後に呼び出し元へ再送出する。
    """
    start = time.monotonic()
    try:
        # 1. POSIXではコマンドごとにセッションを分け、中断時の終了範囲を限定する。
        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=os.name == "posix",
        )
    except OSError as error:
        # 2. 起動失敗もrunnerの結果として記録できるよう、診断文と失敗コードへ変換する。
        return 127, f"コマンドを起動できませんでした: {error}", time.monotonic() - start

    try:
        # 3. 終了まで両方の出力を読み取り、従来と同じ文字列形式で返す。
        stdout, stderr = process.communicate()
    except KeyboardInterrupt:
        # 4. 割り込みを再送出する前に、自分が起動したプロセス群だけを終了して回収する。
        _stop_process(process)
        raise

    return process.returncode, (stdout or "") + (stderr or ""), time.monotonic() - start
