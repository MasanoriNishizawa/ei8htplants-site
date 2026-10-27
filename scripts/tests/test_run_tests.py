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

        self.assertIn("| 分析ダッシュボード（pytest） | ✅ | 0 | 0 | 1 |", entry)
        self.assertIn("analytics/.venv がないため実行をスキップ", entry)

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
