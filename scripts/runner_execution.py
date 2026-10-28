"""選択済みテストsuiteの順次実行と中断後の記録を担当する。"""
from dataclasses import dataclass
import time
from typing import Callable


@dataclass(frozen=True)
class SuiteSpec:
    """実行するsuiteの表示情報と呼び出し関数をまとめる。

    Attributes:
        name: 実行ログに表示するsuite名。
        progress: 実行開始時に標準出力へ出す進捗文。
        runner: suiteを実行して結果dictを返す引数なし関数。
    """

    name: str
    progress: str
    runner: Callable[[], dict]


@dataclass
class ExecutionResult:
    """suite実行後の結果・省略内容・中断状態をまとめる。

    Attributes:
        results: 実行完了または中断したsuiteの結果。
        skipped_suites: 初期選択で省略したsuiteと中断後に未実行のsuite。
        interrupted: suite実行中にKeyboardInterruptを受けたか。
    """

    results: list[dict]
    skipped_suites: list[tuple[str, str]]
    interrupted: bool


def _print_progress(message: str) -> None:
    """進捗文を改行後すぐ表示する。

    Args:
        message: 実行開始を知らせる文字列。

    Returns:
        戻り値なし。
    """
    print(message, flush=True)


def execute_suites(
    suites: list[SuiteSpec],
    initially_skipped: list[tuple[str, str]],
    print_progress: Callable[[str], None] = _print_progress,
) -> ExecutionResult:
    """suiteを順番に実行し、中断した位置と後続の未実行を返す。

    Args:
        suites: 実行順に並べたsuite仕様。
        initially_skipped: CLIの選択により最初から省略したsuiteと理由。
        print_progress: suite開始時に進捗文を出す関数。

    Returns:
        実行結果、省略suiteの一覧、中断の有無をまとめた値。
    """
    results: list[dict] = []  # 完了または中断したsuiteの結果を順番に保持する。
    skipped_suites = list(initially_skipped)  # CLI由来の省略記録を保ったまま追加する。
    interrupted = False  # KeyboardInterruptを受け取った実行かどうか。

    # 1. 指定された順でsuiteを実行し、失敗結果があっても次のsuiteへ進む。
    for index, suite in enumerate(suites):
        # index: 中断した場合に未実行として記録する後続suiteの開始位置。
        # suite: 現在実行するsuite名・進捗文・runner関数をまとめた仕様。
        suite_started = time.monotonic()
        try:
            print_progress(suite.progress)
        except KeyboardInterrupt:
            # 2. 進捗表示中の中断はrunner開始前なので、未開始だったことを明示して残す。
            interrupted = True
            results.append({
                "name": suite.name, "code": 130, "sec": time.monotonic() - suite_started,
                "passed": 0, "failed": 0, "skipped": 0, "xfail": 0,
                "failed_names": [], "tail": ["進捗表示中に割り込みを受け、suiteは開始されませんでした"],
                "interrupted": True, "started": False,
            })
            skipped_suites.extend(
                (pending.name, "⏹ 中断により未実行") for pending in suites[index + 1:]
            )
            break

        try:
            # 3. suite固有のrunnerを呼び出し、返された集計結果を順番に追加する。
            results.append(suite.runner())
        except KeyboardInterrupt:
            # 4. 実行開始後の中断を記録し、後続suiteは呼び出さない。
            interrupted = True
            results.append({
                "name": suite.name, "code": 130, "sec": time.monotonic() - suite_started,
                "passed": 0, "failed": 0, "skipped": 0, "xfail": 0,
                "failed_names": [], "tail": ["実行中に割り込みを受けました"],
                "interrupted": True, "started": True,
            })
            skipped_suites.extend(
                (pending.name, "⏹ 中断により未実行") for pending in suites[index + 1:]
            )
            break

    return ExecutionResult(
        results=results,
        skipped_suites=skipped_suites,
        interrupted=interrupted,
    )
