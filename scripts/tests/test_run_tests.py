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
    def test_missing_analytics_venv_is_recorded_as_skip(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(run_tests, "ROOT", Path(temp_dir)):
                result = run_tests.run_analytics()

        self.assertEqual(result["code"], 0)
        self.assertEqual(result["passed"], 0)
        self.assertEqual(result["skipped"], 1)
        self.assertIn("analytics/.venv", result["skip_reason"])

    def test_log_shows_analytics_skip_reason(self):
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

    def test_runはmonotonic時計で経過時間を測る(self):
        process = Mock(returncode=0)
        process.communicate.return_value = ("stdout", "stderr")
        with patch.object(run_tests.time, "monotonic", side_effect=[10.0, 12.5]) as monotonic:
            with patch.object(run_tests.time, "time", side_effect=AssertionError("壁時計を使わないこと")):
                with patch.object(run_tests.subprocess, "Popen", return_value=process):
                    code, output, elapsed = run_tests.run(["example"], Path("."))

        self.assertEqual((code, output, elapsed), (0, "stdoutstderr", 2.5))
        self.assertEqual(monotonic.call_count, 2)

    def test_runは新しいセッションで起動して正常終了結果を返す(self):
        """正常終了時の戻り値を保ち、POSIXでは専用セッションで起動する。"""
        class FakeProcess:
            """Popen の最小限の正常系応答を返す偽物。"""
            pid = 4321
            returncode = 0

            def communicate(self):
                return "標準出力", "標準エラー"

            def poll(self):
                return self.returncode

            def wait(self, timeout=None):
                return self.returncode

        process = FakeProcess()
        with patch.object(run_tests.subprocess, "Popen", return_value=process) as popen:
            with patch.object(run_tests.time, "monotonic", side_effect=[10.0, 12.5]):
                code, output, elapsed = run_tests.run(["example"], Path("."))

        self.assertEqual((code, output, elapsed), (0, "標準出力標準エラー", 2.5))
        if os.name == "posix":
            self.assertTrue(popen.call_args.kwargs.get("start_new_session"))

    def test_runは起動時のOSErrorを127と診断文に変換する(self):
        """実行ファイルを起動できない場合も呼び出し元へ例外を漏らさない。"""
        with patch.object(run_tests.subprocess, "Popen", side_effect=FileNotFoundError("実行ファイルなし")):
            with patch.object(run_tests.time, "monotonic", side_effect=[20.0, 20.25]):
                code, output, elapsed = run_tests.run(["missing"], Path("."))

        self.assertEqual(code, 127)
        self.assertIn("実行ファイルなし", output)
        self.assertEqual(elapsed, 0.25)

    @unittest.skipUnless(os.name == "posix", "POSIX のプロセスグループ終了を検証する")
    def test_runは割り込み時にグループへTERM後KILLを送りleaderを回収して再送出する(self):
        """TERM猶予中に終了しない子をKILLし、wait/reap 後に割り込みを伝える。"""
        events = []

        class FakeProcess:
            """割り込みと wait timeout を再現する Popen の偽物。"""
            pid = 9876
            returncode = None

            def communicate(self):
                events.append("communicate")
                raise KeyboardInterrupt

            def wait(self, timeout=None):
                events.append(("wait", timeout))
                if sum(1 for event in events if isinstance(event, tuple) and event[0] == "wait") == 1:
                    raise subprocess.TimeoutExpired(["example"], timeout)
                self.returncode = -signal.SIGKILL
                return self.returncode

            def poll(self):
                return self.returncode

        process = FakeProcess()

        def record_killpg(pid, signum):
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
        """leader の wait 成功で後始末を終えず、残存する子孫を期限後に終了する。"""
        events = []
        clock = {"now": 0.0}

        class FakeProcess:
            """leader は終了するが、子孫はプロセスグループに残る状態を表す。"""
            pid = 2468
            returncode = 0

            def communicate(self):
                events.append("communicate")
                raise KeyboardInterrupt

            def wait(self, timeout=None):
                events.append(("leader_wait", timeout))
                return self.returncode

        process = FakeProcess()

        def record_group_signal(pid, signum):
            events.append(("killpg", pid, signum))
            # signal 0 はグループ内の子孫が猶予期間中ずっと残っていると示す。
            return None

        def advance_clock():
            current = clock["now"]
            clock["now"] += 1.0
            return current

        with patch.object(run_tests.subprocess, "Popen", return_value=process):
            with patch.object(os, "killpg", side_effect=record_group_signal):
                with patch.object(runner_process.time, "monotonic", side_effect=advance_clock):
                    with patch.object(runner_process.time, "sleep", return_value=None):
                        with self.assertRaises(KeyboardInterrupt):
                            run_tests.run(["example"], Path("."))

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
        kill_index = events.index(("killpg", process.pid, signal.SIGKILL))
        self.assertGreater(kill_index, group_probe_indices[-1])

    @unittest.skipUnless(os.name == "posix", "POSIX のプロセスグループ終了を検証する")
    def test_SIGTERMからleader待ちと残存group待ちの合計猶予は5秒以内(self):
        """leader待ちに4.9秒かかった後のgroup待ちは残り約0.1秒だけ使う。"""
        events = []
        clock = {"now": 0.0, "wait_calls": 0}

        class FakeProcess:
            """leaderは4.9秒で終了し、子孫だけが5秒時点まで残る偽物。"""
            pid = 7531
            returncode = 0

            def communicate(self):
                events.append(("communicate", clock["now"]))
                raise KeyboardInterrupt

            def wait(self, timeout=None):
                events.append(("leader_wait", timeout, clock["now"]))
                if clock["wait_calls"] == 0:
                    clock["now"] += 4.9
                clock["wait_calls"] += 1
                return self.returncode

        process = FakeProcess()

        def record_group_signal(pid, signum):
            events.append(("killpg", pid, signum, clock["now"]))

        def advance_clock(seconds):
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


class TestRunnerSelection(unittest.TestCase):
    """CLI のテスト枠選択を独立関数の契約として確認する。"""

    def assert_selection(self, args, expected):
        """選択結果の全フィールドを期待値と照合する。"""
        from scripts.runner_selection import select_tests

        selection = select_tests(**args)
        for field, value in expected.items():
            self.assertEqual(getattr(selection, field), value, field)

    def test_オプションなしは全件実行(self):
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": None, "pytest_targets": None, "analytics": False, "no_e2e": False},
            {"narrowed": False, "partial": False, "targets": None,
             "run_vitest": True, "run_playwright": True, "run_pytest": True, "run_analytics": True,
             "skipped_suites": []},
        )

    def test_no_e2eのみはPlaywright以外を全件実行(self):
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": None, "pytest_targets": None, "analytics": False, "no_e2e": True},
            {"narrowed": False, "partial": True,
             "targets": ["Vitest: 全件", "バックエンド pytest: 全件", "分析ダッシュボード pytest: tests 全件（.venv がある場合。無い場合はスキップ）"],
             "run_vitest": True, "run_playwright": False, "run_pytest": True, "run_analytics": True,
             "skipped_suites": [("画面テスト（Playwright）", "省略（--no-e2e）")]},
        )

    def test_vitest単独指定(self):
        self.assert_selection(
            {"vitest_targets": ["src/example.test.ts"], "e2e_targets": None, "pytest_targets": None, "analytics": False, "no_e2e": False},
            {"narrowed": True, "partial": True, "targets": ["Vitest: src/example.test.ts"],
             "run_vitest": True, "run_playwright": False, "run_pytest": False, "run_analytics": False,
             "skipped_suites": [("画面テスト（Playwright）", "省略（関連なし）"), ("バックエンド（pytest）", "省略（関連なし）"), ("分析ダッシュボード（pytest）", "省略（関連なし）")]},
        )

    def test_e2e単独指定(self):
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": ["e2e/example.spec.ts"], "pytest_targets": None, "analytics": False, "no_e2e": False},
            {"narrowed": True, "partial": True, "targets": ["Playwright: e2e/example.spec.ts"],
             "run_vitest": False, "run_playwright": True, "run_pytest": False, "run_analytics": False,
             "skipped_suites": [("フロントのロジック（Vitest）", "省略（関連なし）"), ("バックエンド（pytest）", "省略（関連なし）"), ("分析ダッシュボード（pytest）", "省略（関連なし）")]},
        )

    def test_pytest単独指定(self):
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": None, "pytest_targets": ["tests/test_example.py"], "analytics": False, "no_e2e": False},
            {"narrowed": True, "partial": True, "targets": ["pytest: tests/test_example.py"],
             "run_vitest": False, "run_playwright": False, "run_pytest": True, "run_analytics": False,
             "skipped_suites": [("フロントのロジック（Vitest）", "省略（関連なし）"), ("画面テスト（Playwright）", "省略（関連なし）"), ("分析ダッシュボード（pytest）", "省略（関連なし）")]},
        )

    def test_analytics単独指定(self):
        self.assert_selection(
            {"vitest_targets": None, "e2e_targets": None, "pytest_targets": None, "analytics": True, "no_e2e": False},
            {"narrowed": True, "partial": True, "targets": ["分析ダッシュボード: tests"],
             "run_vitest": False, "run_playwright": False, "run_pytest": False, "run_analytics": True,
             "skipped_suites": [("フロントのロジック（Vitest）", "省略（関連なし）"), ("画面テスト（Playwright）", "省略（関連なし）"), ("バックエンド（pytest）", "省略（関連なし）")]},
        )

    def test_複数selector併用(self):
        self.assert_selection(
            {"vitest_targets": ["src/example.test.ts"], "e2e_targets": ["e2e/example.spec.ts"], "pytest_targets": ["tests/test_example.py"], "analytics": True, "no_e2e": False},
            {"narrowed": True, "partial": True,
             "targets": ["Vitest: src/example.test.ts", "Playwright: e2e/example.spec.ts", "pytest: tests/test_example.py", "分析ダッシュボード: tests"],
             "run_vitest": True, "run_playwright": True, "run_pytest": True, "run_analytics": True,
             "skipped_suites": []},
        )

    def test_selectorとno_e2e併用(self):
        self.assert_selection(
            {"vitest_targets": ["src/example.test.ts"], "e2e_targets": None, "pytest_targets": ["tests/test_example.py"], "analytics": False, "no_e2e": True},
            {"narrowed": True, "partial": True, "targets": ["Vitest: src/example.test.ts", "pytest: tests/test_example.py"],
             "run_vitest": True, "run_playwright": False, "run_pytest": True, "run_analytics": False,
             "skipped_suites": [("画面テスト（Playwright）", "省略（--no-e2e）"), ("分析ダッシュボード（pytest）", "省略（関連なし）")]},
        )


if __name__ == "__main__":
    unittest.main()
