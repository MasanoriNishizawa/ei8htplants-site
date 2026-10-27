"""テストランナーの省略判定とログの回帰テスト。"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import run_tests


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
        completed = subprocess.CompletedProcess(["example"], 0, "stdout", "stderr")
        with patch.object(run_tests.time, "monotonic", side_effect=[10.0, 12.5]) as monotonic:
            with patch.object(run_tests.time, "time", side_effect=AssertionError("壁時計を使わないこと")):
                with patch.object(run_tests.subprocess, "run", return_value=completed):
                    code, output, elapsed = run_tests.run(["example"], Path("."))

        self.assertEqual((code, output, elapsed), (0, "stdoutstderr", 2.5))
        self.assertEqual(monotonic.call_count, 2)

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


if __name__ == "__main__":
    unittest.main()
