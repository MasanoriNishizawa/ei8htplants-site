"""テストランナーの省略判定とログの回帰テスト。"""
import os
import signal
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from scripts import run_tests
from scripts import runner_process


class TestRunnerSkipLogging(unittest.TestCase):
    """省略・失敗・CLI・プロセス終了の表示を記録する契約を確認する。"""

    def test_missing_analytics_venv_is_recorded_as_skip(self):
        """専用仮想環境がないAnalytics suiteをskip結果にする。

        Returns:
            なし。"""
        # 1. 専用仮想環境がないAnalytics suiteをskip結果にする。
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(run_tests, "ROOT", Path(temp_dir)):
                result = run_tests.run_analytics()

        self.assertEqual(result["code"], 0)
        self.assertEqual(result["passed"], 0)
        self.assertEqual(result["skipped"], 1)
        self.assertIn("analytics/.venv", result["skip_reason"])

    def test_log_shows_analytics_skip_reason(self):
        """Analyticsのskip理由を絞り込み実行のログへ表示する。

        Returns:
            なし。"""
        # 1. Analyticsのskip理由を絞り込み実行のログへ表示する。
        result = {
            "name": "分析ダッシュボード（pytest）", "code": 0, "sec": 0,
            "passed": 0, "failed": 0, "skipped": 1, "xfail": 0,
            "failed_names": [], "tail": [],
            "skip_reason": "analytics/.venv がないため実行をスキップ",
        }
        with patch.object(run_tests, "git_info", return_value="`test`"):
            entry = run_tests.make_entry([result], "runner test", [], targets=["Analytics"])

        self.assertIn("| 分析ダッシュボード（pytest） | ⚠️ 省略あり | 0 | 0 | 1 |", entry)
        self.assertIn("analytics/.venv がないため実行をスキップ", entry)

    def test_全suite実行でanalyticsが省略なら全部成功と表示せず省略を示す(self):
        """全suite指定でもAnalytics省略を全件成功として表示しない。

        Returns:
            なし。"""
        # 1. 全suite指定でもAnalytics省略を全件成功として表示しない。
        result = {
            "name": "分析ダッシュボード（pytest）", "code": 0, "sec": 0,
            "passed": 0, "failed": 0, "skipped": 1, "xfail": 0,
            "failed_names": [], "tail": [],
            "skip_reason": "analytics/.venv がないため実行をスキップ",
        }
        with patch.object(run_tests, "git_info", return_value="`test`"):
            entry = run_tests.make_entry([result], "runner test", [])

        self.assertNotIn("✅ 全部成功", entry)
        self.assertIn("| 分析ダッシュボード（pytest） | ⚠️ 省略あり | 0 | 0 | 1 |", entry)
        self.assertIn("省略", entry)
        self.assertIn("analytics/.venv がないため実行をスキップ", entry)

    def test_失敗したテストは失敗判定と失敗名をログに出す(self):
        """失敗件数があるsuiteの判定と失敗名をログへ表示する。

        Returns:
            なし。"""
        # 1. 失敗件数があるsuiteの判定と失敗名をログへ表示する。
        failed_name = "tests/test_example.py::test_失敗するケース"
        result = {
            "name": "バックエンド（pytest）", "code": 1, "sec": 1,
            "passed": 2, "failed": 1, "skipped": 0, "xfail": 0,
            "failed_names": [failed_name], "tail": [],
        }
        with patch.object(run_tests, "git_info", return_value="`test`"):
            entry = run_tests.make_entry([result], "runner test", [])

        self.assertIn("❌ 失敗あり", entry)
        self.assertIn("❌ | 2 | 1 |", entry)
        self.assertIn(f"`{failed_name}`", entry)

    def test_先行suiteの失敗後に中断した場合は両方を全体判定に出す(self):
        """中断が先行suiteの失敗を見えなくしない。

        Returns:
            なし。"""
        # 1. 中断が先行suiteの失敗を見えなくしない。
        failed = {
            "name": "フロントのロジック（Vitest）", "code": 1, "sec": 1,
            "passed": 2, "failed": 1, "skipped": 0, "xfail": 0,
            "failed_names": ["example.test.ts"], "tail": [],
        }
        # 変数の内容: interrupted: 割り込み後に返す実行結果。
        interrupted = {
            "name": "画面テスト（Playwright）", "code": 130, "sec": 1,
            "passed": 0, "failed": 0, "skipped": 0, "xfail": 0,
            "failed_names": [], "tail": ["実行中に割り込みを受けました"], "interrupted": True,
        }
        with patch.object(run_tests, "git_info", return_value="`test`"):
            entry = run_tests.make_entry([failed, interrupted], "runner test", [])

        self.assertIn("⏹ 中断・失敗あり", entry)
        self.assertIn("| フロントのロジック（Vitest） | ❌ |", entry)
        self.assertIn("| 画面テスト（Playwright） | ⏹ 中断 |", entry)

    def test_runner開始前の割り込みをログで区別する(self):
        """進捗表示中の割り込みを実行開始後の割り込みと混同しない。

        Returns:
            なし。"""
        # 変数の内容: interrupted_before_start: suite 開始前に割り込まれた結果。
        interrupted_before_start = {
            "name": "TypeScript チェック（tsc）", "code": 130, "sec": 0,
            "passed": 0, "failed": 0, "skipped": 0, "xfail": 0,
            "failed_names": [], "tail": ["進捗表示中に割り込みを受け、suiteは開始されませんでした"],
            "interrupted": True, "started": False,
        }

        # 1. suite未開始を示す結果をログへ整形し、状態欄の文言を確認する。
        with patch.object(run_tests, "git_info", return_value="`test`"):
            entry = run_tests.make_entry([interrupted_before_start], "runner test", [])

        self.assertIn("進捗表示中に割り込みを受け、suiteは開始されませんでした", entry)
        self.assertNotIn("状態**：実行中に割り込みを受けました", entry)

    def test_runはmonotonic時計で経過時間を測る(self):
        """外部コマンド時間を壁時計でなく単調時計で測る。

        Returns:
            なし。"""
        # 1. 外部コマンド時間を壁時計でなく単調時計で測る。
        process = Mock(returncode=0)
        process.communicate.return_value = ("stdout", "stderr")
        with patch.object(run_tests.time, "monotonic", side_effect=[10.0, 12.5]) as monotonic:
            with patch.object(run_tests.time, "time", side_effect=AssertionError("壁時計を使わないこと")):
                with patch.object(run_tests.subprocess, "Popen", return_value=process):
                    # 変数の内容: code: suite の終了コード、output: テスト対象コマンドの標準出力、elapsed: 測定した経過時間。
                    code, output, elapsed = run_tests.run(["example"], Path("."))

        self.assertEqual((code, output, elapsed), (0, "stdoutstderr", 2.5))
        self.assertEqual(monotonic.call_count, 2)

    def test_runは新しいセッションで起動して正常終了結果を返す(self):
        """正常終了時の戻り値を保ち、POSIXでは専用セッションで起動する。

        Returns:
            なし。"""
        # 1. 正常終了時の戻り値を保ち、POSIXでは専用セッションで起動する。
        class FakeProcess:
            """Popen の最小限の正常系応答を返す偽物。"""
            pid = 4321
            returncode = 0

            def communicate(self):
                """標準出力と標準エラーの固定値を返す。

                Returns:
                    tuple[str, str]: 固定の標準出力と標準エラー。"""
                # 1. 標準出力と標準エラーの固定値を返す。
                return "標準出力", "標準エラー"

            def poll(self):
                """プロセスが正常終了したコードを返す。

                Returns:
                    int | None: プロセスの終了コード。実行中は None。"""
                # 1. プロセスが正常終了したコードを返す。
                return self.returncode

            def wait(self, timeout=None):
                """呼び出し側の待機処理へ終了コードを返す。

                Args:
                    timeout: プロセス終了を待つ時間。

                Returns:
                    int: プロセスの終了コード。"""
                # 1. 呼び出し側の待機処理へ終了コードを返す。
                return self.returncode

        # 変数の内容: process: 起動した子プロセスのモック。
        process = FakeProcess()
        with patch.object(run_tests.subprocess, "Popen", return_value=process) as popen:
            with patch.object(run_tests.time, "monotonic", side_effect=[10.0, 12.5]):
                # 変数の内容: code: suite の終了コード、output: テスト対象コマンドの標準出力、elapsed: 測定した経過時間。
                code, output, elapsed = run_tests.run(["example"], Path("."))

        self.assertEqual((code, output, elapsed), (0, "標準出力標準エラー", 2.5))
        if os.name == "posix":
            self.assertTrue(popen.call_args.kwargs.get("start_new_session"))

    def test_runは起動時のOSErrorを127と診断文に変換する(self):
        """実行ファイルを起動できない場合も呼び出し元へ例外を漏らさない。

        Returns:
            なし。"""
        # 1. Popenの起動失敗を作り、互換runnerの戻り値へ変換する。
        with patch.object(run_tests.subprocess, "Popen", side_effect=FileNotFoundError("実行ファイルなし")):
            with patch.object(run_tests.time, "monotonic", side_effect=[20.0, 20.25]):
                # 変数の内容: code: suite の終了コード、output: テスト対象コマンドの標準出力、elapsed: 測定した経過時間。
                code, output, elapsed = run_tests.run(["missing"], Path("."))

        self.assertEqual(code, 127)
        self.assertIn("実行ファイルなし", output)
        self.assertEqual(elapsed, 0.25)

    @unittest.skipUnless(os.name == "posix", "POSIX のプロセスグループ終了を検証する")
    def test_runは割り込み時にグループへTERM後KILLを送りleaderを回収して再送出する(self):
        """TERM猶予中に終了しない子をKILLし、wait/reap 後に割り込みを伝える。

        Returns:
            なし。"""
        # 1. TERM猶予中に終了しない子をKILLし、wait/reap 後に割り込みを伝える。
        events = []

        class FakeProcess:
            """割り込みと wait timeout を再現する Popen の偽物。"""
            pid = 9876
            returncode = None

            def communicate(self):
                """外部コマンドが割り込みを受けた状態を再現する。

                Returns:
                    なし。"""
                # 1. 外部コマンドが割り込みを受けた状態を再現する。
                events.append("communicate")
                raise KeyboardInterrupt

            def wait(self, timeout=None):
                """一度目はtimeout、次はSIGKILL後の終了コードを返す。

                Args:
                    timeout: プロセス終了を待つ時間。

                Returns:
                    int: プロセスの終了コード。"""
                # 1. 一度目はtimeout、次はSIGKILL後の終了コードを返す。
                events.append(("wait", timeout))
                if sum(1 for event in events if isinstance(event, tuple) and event[0] == "wait") == 1:
                    raise subprocess.TimeoutExpired(["example"], timeout)
                self.returncode = -signal.SIGKILL
                return self.returncode

            def poll(self):
                """現在の終了コードを返し、未終了ならNoneを返す。

                Returns:
                    int | None: プロセスの終了コード。実行中は None。"""
                # 1. 現在の終了コードを返し、未終了ならNoneを返す。
                return self.returncode

        # 変数の内容: process: 起動した子プロセスのモック。
        process = FakeProcess()

        def record_killpg(pid, signum):
            """killpg呼び出しの対象とsignalを順序付きで記録する。

            Args:
                pid: プロセスグループの識別子。
                signum: 送信するシグナル番号。

            Returns:
                None: 呼び出し内容を記録し、値は返さない。"""
            # 1. killpg呼び出しの対象とsignalを順序付きで記録する。
            events.append(("killpg", pid, signum))

        with patch.object(run_tests.subprocess, "Popen", return_value=process) as popen:
            with patch.object(os, "killpg", side_effect=record_killpg):
                with self.assertRaises(KeyboardInterrupt):
                    run_tests.run(["example"], Path("."))

        self.assertTrue(popen.call_args.kwargs.get("start_new_session"))
        self.assertEqual(events[0], "communicate")
        self.assertEqual(events[1], ("killpg", process.pid, signal.SIGTERM))
        self.assertEqual(events[2][0], "wait")
        self.assertGreater(events[2][1], 0)
        self.assertEqual(events[3], ("killpg", process.pid, signal.SIGKILL))
        self.assertEqual(events[4][0], "wait")

    @unittest.skipUnless(os.name == "posix", "POSIX のプロセスグループ終了を検証する")
    def test_leader回収後も残るプロセスグループを期限後にKILLする(self):
        """leader の wait 成功で後始末を終えず、残存する子孫を期限後に終了する。

        Returns:
            なし。"""
        # 1. leader の wait 成功で後始末を終えず、残存する子孫を期限後に終了する。
        events = []
        # 変数の内容: clock: 経過時間計測用の固定時計。
        clock = {"now": 0.0}

        class FakeProcess:
            """leader は終了するが、子孫はプロセスグループに残る状態を表す。"""
            pid = 2468
            returncode = 0

            def communicate(self):
                """実行中のプロセスが割り込まれたことを示す。

                Returns:
                    なし。"""
                # 1. 実行中のプロセスが割り込まれたことを示す。
                events.append("communicate")
                raise KeyboardInterrupt

            def wait(self, timeout=None):
                """leader終了時の待ち時間と結果を記録する。

                Args:
                    timeout: プロセス終了を待つ時間。

                Returns:
                    int: プロセスの終了コード。"""
                # 1. leader終了時の待ち時間と結果を記録する。
                events.append(("leader_wait", timeout))
                return self.returncode

        # 変数の内容: process: 起動した子プロセスのモック。
        process = FakeProcess()

        def record_group_signal(pid, signum):
            """グループsignalを記録し、子孫が残る状態を表す。

            Args:
                pid: プロセスグループの識別子。
                signum: 送信するシグナル番号。

            Returns:
                None: 呼び出し内容を記録し、値は返さない。"""
            events.append(("killpg", pid, signum))
            # signal 0 はグループ内の子孫が猶予期間中ずっと残っていると示す。
            return None

        def advance_clock():
            """現在時刻を返した後、仮想時計を一秒進める。

            Returns:
                float: 進める前の仮想時刻。"""
            # 1. 現在時刻を返した後、仮想時計を一秒進める。
            current = clock["now"]
            clock["now"] += 1.0
            return current

        with patch.object(run_tests.subprocess, "Popen", return_value=process):
            with patch.object(os, "killpg", side_effect=record_group_signal):
                with patch.object(runner_process.time, "monotonic", side_effect=advance_clock):
                    with patch.object(runner_process.time, "sleep", return_value=None):
                        with self.assertRaises(KeyboardInterrupt):
                            run_tests.run(["example"], Path("."))

        # 変数の内容: term_index: TERM 送信時点の記録位置。
        term_index = events.index(("killpg", process.pid, signal.SIGTERM))
        leader_wait_index = next(
            index for index, event in enumerate(events) if isinstance(event, tuple) and event[0] == "leader_wait"
        )
        group_probe_indices = [
            index for index, event in enumerate(events)
            if event == ("killpg", process.pid, 0)
        ]

        self.assertLess(term_index, leader_wait_index)
        self.assertTrue(group_probe_indices, "leader終了後もkillpg(pid, 0)でグループ残存を確認する")
        self.assertGreater(group_probe_indices[0], leader_wait_index)
        self.assertIn(("killpg", process.pid, signal.SIGKILL), events)
        # 変数の内容: kill_index: KILL 送信時点の記録位置。
        kill_index = events.index(("killpg", process.pid, signal.SIGKILL))
        self.assertGreater(kill_index, group_probe_indices[-1])

    @unittest.skipUnless(os.name == "posix", "POSIX のプロセスグループ終了を検証する")
    def test_SIGTERMからleader待ちと残存group待ちの合計猶予は5秒以内(self):
        """leader待ちに4.9秒かかった後のgroup待ちは残り約0.1秒だけ使う。

        Returns:
            なし。"""
        # 1. leader待ちに4.9秒かかった後のgroup待ちは残り約0.1秒だけ使う。
        events = []
        # 変数の内容: clock: 経過時間計測用の固定時計。
        clock = {"now": 0.0, "wait_calls": 0}

        class FakeProcess:
            """leaderは4.9秒で終了し、子孫だけが5秒時点まで残る偽物。"""
            pid = 7531
            returncode = 0

            def communicate(self):
                """run_processへ割り込み処理を開始させる。

                Returns:
                    なし。"""
                # 1. run_processへ割り込み処理を開始させる。
                events.append(("communicate", clock["now"]))
                raise KeyboardInterrupt

            def wait(self, timeout=None):
                """最初のleader待ちで4.9秒を使い終了する。

                Args:
                    timeout: プロセス終了を待つ時間。

                Returns:
                    int: プロセスの終了コード。"""
                # 1. 最初のleader待ちで4.9秒を使い終了する。
                events.append(("leader_wait", timeout, clock["now"]))
                if clock["wait_calls"] == 0:
                    clock["now"] += 4.9
                clock["wait_calls"] += 1
                return self.returncode

        # 変数の内容: process: 起動した子プロセスのモック。
        process = FakeProcess()

        def record_group_signal(pid, signum):
            """プロセスグループへのsignalと送信時刻を記録する。

            Args:
                pid: プロセスグループの識別子。
                signum: 送信するシグナル番号。

            Returns:
                None: 呼び出し内容を記録し、値は返さない。"""
            # 1. プロセスグループへのsignalと送信時刻を記録する。
            events.append(("killpg", pid, signum, clock["now"]))

        def advance_clock(seconds):
            """sleep時間だけ仮想時計を進め、呼び出し内容を記録する。

            Args:
                seconds: 固定時計を進める秒数。

            Returns:
                None: 仮想時計を進め、値は返さない。"""
            # 1. sleep時間だけ仮想時計を進め、呼び出し内容を記録する。
            events.append(("sleep", seconds, clock["now"]))
            clock["now"] += seconds

        with patch.object(run_tests.subprocess, "Popen", return_value=process):
            with patch.object(os, "killpg", side_effect=record_group_signal):
                with patch.object(runner_process.time, "monotonic", side_effect=lambda: clock["now"]):
                    with patch.object(runner_process.time, "sleep", side_effect=advance_clock):
                        with self.assertRaises(KeyboardInterrupt):
                            run_tests.run(["example"], Path("."))

        term_time = next(event[3] for event in events if len(event) == 4 and event[:3] == ("killpg", process.pid, signal.SIGTERM))
        kill_time = next(event[3] for event in events if len(event) == 4 and event[:3] == ("killpg", process.pid, signal.SIGKILL))

        self.assertAlmostEqual(term_time, 0.0)
        self.assertGreaterEqual(kill_time - term_time, 4.9)
        self.assertLessEqual(kill_time - term_time, 5.05)

    def test_append_logはmarker直下へ新しい記録を先頭追記して既存記録を保つ(self):
        """新しいログをmarker直下へ先頭追加し、過去の記録を保持する。

        Returns:
            なし。"""
        # 1. 新しいログをmarker直下へ先頭追加し、過去の記録を保持する。
        marker = run_tests.MARKER
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "test-log.md"
            log_path.write_text(f"# テスト実行ログ\n\n旧形式の判定説明\n\n{marker}\n\n古い記録\n", encoding="utf-8")
            with patch.object(run_tests, "LOG", log_path):
                run_tests.append_log("一つ前の新しい記録\n")
                run_tests.append_log("いちばん新しい記録\n")

            actual = log_path.read_text(encoding="utf-8")

        self.assertTrue(actual.startswith(run_tests.HEADER))
        self.assertIn("スキップのあるテスト枠は、実行できたテストが成功していても ⚠️ と表示する", actual)
        self.assertNotIn("旧形式の判定説明", actual)
        marker_position = actual.index(marker)
        newest_position = actual.index("いちばん新しい記録")
        previous_position = actual.index("一つ前の新しい記録")
        old_position = actual.index("古い記録")
        self.assertEqual(actual[marker_position + len(marker):].lstrip("\n").splitlines()[0], "いちばん新しい記録")
        self.assertLess(newest_position, previous_position)
        self.assertLess(previous_position, old_position)

    def test_no_e2e_conflicts_with_e2e_target_before_running(self):
        """矛盾したE2E指定をsuite開始前に終了コード2で拒否する。

        Returns:
            なし。"""
        # 1. 矛盾したE2E指定をsuite開始前に終了コード2で拒否する。
        repo_root = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            [
                sys.executable,
                str(repo_root / "scripts" / "run_tests.py"),
                "--no-log",
                "--no-e2e",
                "--e2e",
                "e2e/admin-pages.spec.ts",
            ],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("--no-e2e と --e2e は同時に指定できません", result.stderr)
        self.assertNotIn("TypeScript チェック中", result.stdout)


class TestRunnerInterruptLogging(unittest.TestCase):
    """suite 実行中の割り込みを終了結果とログへ残す契約を確認する。"""

    def _successful_result(self, name):
        """main が先行suiteの成功結果として扱える最小の値を返す。

        Args:
            name: 結果に記録する suite 名。

        Returns:
            dict: suite 名と成功時の集計値を含む実行結果。"""
        # 1. main が先行suiteの成功結果として扱える最小の値を返す。
        return {
            "name": name, "code": 0, "sec": 0.1,
            "passed": 1, "failed": 0, "skipped": 0, "xfail": 0,
            "failed_names": [], "tail": [],
        }

    def test_suite中断時はログ保存後に130を返し残りを未実行として記録する(self):
        """Vitest 中断・後続3 suiteの未実行・中断判定をログで区別する。

        Returns:
            なし。"""
        # 1. Vitest 中断・後続3 suiteの未実行・中断判定をログで区別する。
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "test-log.md"
            with patch.object(run_tests, "LOG", log_path), \
                    patch.object(run_tests, "ROOT", Path(temp_dir)), \
                    patch.object(run_tests, "git_info", return_value="`test`"), \
                    patch.object(sys, "argv", ["run_tests.py", "--note", "割り込みログ確認"]), \
                    patch.object(run_tests, "run_tsc", return_value=self._successful_result("tsc")), \
                    patch.object(run_tests, "run_build", return_value=self._successful_result("build")), \
                    patch.object(run_tests, "run_runner_tests", return_value=self._successful_result("runner")), \
                    patch.object(run_tests, "run_vitest", side_effect=KeyboardInterrupt), \
                    patch.object(run_tests, "run_playwright") as run_playwright, \
                    patch.object(run_tests, "run_pytest") as run_pytest, \
                    patch.object(run_tests, "run_analytics") as run_analytics:
                exit_code = run_tests.main()

            self.assertEqual(exit_code, 130)
            self.assertTrue(log_path.exists(), "割り込み後も実行ログを保存する")
            entry = log_path.read_text(encoding="utf-8")

        self.assertTrue(
            any("Vitest" in line and "中断" in line for line in entry.splitlines()),
            "実行中だったsuiteの途中中断をsuite名とともに記録する",
        )
        for suite_name in ("画面テスト（Playwright）", "バックエンド（pytest）", "分析ダッシュボード（pytest）"):
            self.assertTrue(
                any(suite_name in line and "中断により未実行" in line for line in entry.splitlines()),
                f"未開始suiteを中断による未実行として記録する: {suite_name}",
            )
        self.assertIn("中断", entry, "通常の成功・失敗とは区別できる中断判定を表示する")
        self.assertNotIn("✅ 全部成功", entry)
        run_playwright.assert_not_called()
        run_pytest.assert_not_called()
        run_analytics.assert_not_called()


class TestRunnerSelection(unittest.TestCase):
    """CLI のテスト枠選択を独立関数の契約として確認する。"""

    def assert_selection(self, args, expected):
        """選択結果の全フィールドを期待値と照合する。

        Args:
            args: 検証する CLI 引数または期待する引数一覧。
            expected: 照合する suite 選択結果。

        Returns:
            None: 選択結果の各フィールドを検証する。"""
        # 1. 選択結果の全フィールドを期待値と照合する。
        from scripts.runner_selection import select_tests

        selection = select_tests(**args)
        for field, value in expected.items():
            self.assertEqual(getattr(selection, field), value, field)

    def test_オプションなしは全件実行(self):
        """selector指定なしでは全optional suiteを実行対象にする。

        Returns:
            なし。"""
        # 1. selector指定なしでは全optional suiteを実行対象にする。
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": None, "pytest_targets": None, "analytics": False, "no_e2e": False},
            {"narrowed": False, "partial": False, "targets": None,
             "run_vitest": True, "run_playwright": True, "run_pytest": True, "run_analytics": True,
             "skipped_suites": []},
        )

    def test_no_e2eのみはPlaywright以外を全件実行(self):
        """no-e2eだけならVitest・Backend・Analyticsを実行する。

        Returns:
            なし。"""
        # 1. no-e2eだけならVitest・Backend・Analyticsを実行する。
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": None, "pytest_targets": None, "analytics": False, "no_e2e": True},
            {"narrowed": False, "partial": True,
             "targets": ["Vitest: 全件", "バックエンド pytest: 全件", "分析ダッシュボード pytest: tests 全件（.venv がある場合。無い場合はスキップ）"],
             "run_vitest": True, "run_playwright": False, "run_pytest": True, "run_analytics": True,
             "skipped_suites": [("画面テスト（Playwright）", "省略（--no-e2e）")]},
        )

    def test_vitest単独指定(self):
        """Vitestの対象ファイル指定でVitestだけを絞って実行する。

        Returns:
            なし。"""
        # 1. Vitestの対象ファイル指定でVitestだけを絞って実行する。
        self.assert_selection(
            {"vitest_targets": ["src/example.test.ts"], "e2e_targets": None, "pytest_targets": None, "analytics": False, "no_e2e": False},
            {"narrowed": True, "partial": True, "targets": ["Vitest: src/example.test.ts"],
             "run_vitest": True, "run_playwright": False, "run_pytest": False, "run_analytics": False,
             "skipped_suites": [("画面テスト（Playwright）", "省略（関連なし）"), ("バックエンド（pytest）", "省略（関連なし）"), ("分析ダッシュボード（pytest）", "省略（関連なし）")]},
        )

    def test_e2e単独指定(self):
        """Playwrightの対象ファイル指定でE2Eだけを絞って実行する。

        Returns:
            なし。"""
        # 1. Playwrightの対象ファイル指定でE2Eだけを絞って実行する。
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": ["e2e/example.spec.ts"], "pytest_targets": None, "analytics": False, "no_e2e": False},
            {"narrowed": True, "partial": True, "targets": ["Playwright: e2e/example.spec.ts"],
             "run_vitest": False, "run_playwright": True, "run_pytest": False, "run_analytics": False,
             "skipped_suites": [("フロントのロジック（Vitest）", "省略（関連なし）"), ("バックエンド（pytest）", "省略（関連なし）"), ("分析ダッシュボード（pytest）", "省略（関連なし）")]},
        )

    def test_pytest単独指定(self):
        """Backend pytestの対象指定でBackendだけを絞って実行する。

        Returns:
            なし。"""
        # 1. Backend pytestの対象指定でBackendだけを絞って実行する。
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": None, "pytest_targets": ["tests/test_example.py"], "analytics": False, "no_e2e": False},
            {"narrowed": True, "partial": True, "targets": ["pytest: tests/test_example.py"],
             "run_vitest": False, "run_playwright": False, "run_pytest": True, "run_analytics": False,
             "skipped_suites": [("フロントのロジック（Vitest）", "省略（関連なし）"), ("画面テスト（Playwright）", "省略（関連なし）"), ("分析ダッシュボード（pytest）", "省略（関連なし）")]},
        )

    def test_analytics単独指定(self):
        """Analytics追加指定で分析suiteだけを実行する。

        Returns:
            なし。"""
        # 1. Analytics追加指定で分析suiteだけを実行する。
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": None, "pytest_targets": None, "analytics": True, "no_e2e": False},
            {"narrowed": True, "partial": True, "targets": ["分析ダッシュボード: tests"],
             "run_vitest": False, "run_playwright": False, "run_pytest": False, "run_analytics": True,
             "skipped_suites": [("フロントのロジック（Vitest）", "省略（関連なし）"), ("画面テスト（Playwright）", "省略（関連なし）"), ("バックエンド（pytest）", "省略（関連なし）")]},
        )

    def test_複数selector併用(self):
        """複数selectorとAnalytics指定を併用して4 suiteを実行する。

        Returns:
            なし。"""
        # 1. 複数selectorとAnalytics指定を併用して4 suiteを実行する。
        self.assert_selection(
            {"vitest_targets": ["src/example.test.ts"], "e2e_targets": ["e2e/example.spec.ts"], "pytest_targets": ["tests/test_example.py"], "analytics": True, "no_e2e": False},
            {"narrowed": True, "partial": True,
             "targets": ["Vitest: src/example.test.ts", "Playwright: e2e/example.spec.ts", "pytest: tests/test_example.py", "分析ダッシュボード: tests"],
             "run_vitest": True, "run_playwright": True, "run_pytest": True, "run_analytics": True,
             "skipped_suites": []},
        )

    def test_selectorとno_e2e併用(self):
        """selectorとno-e2e併用時に指定suiteを保ちE2Eを省略する。

        Returns:
            なし。"""
        # 1. selectorとno-e2e併用時に指定suiteを保ちE2Eを省略する。
        self.assert_selection(
            {"vitest_targets": ["src/example.test.ts"], "e2e_targets": None, "pytest_targets": ["tests/test_example.py"], "analytics": False, "no_e2e": True},
            {"narrowed": True, "partial": True, "targets": ["Vitest: src/example.test.ts", "pytest: tests/test_example.py"],
             "run_vitest": True, "run_playwright": False, "run_pytest": True, "run_analytics": False,
             "skipped_suites": [("画面テスト（Playwright）", "省略（--no-e2e）"), ("分析ダッシュボード（pytest）", "省略（関連なし）")]},
        )


if __name__ == "__main__":
    unittest.main()
