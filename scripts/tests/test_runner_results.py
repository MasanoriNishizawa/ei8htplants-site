"""テスト実行結果の純粋な解析関数を確認する回帰テスト。"""
import unittest

from scripts import runner_results


class TestRunnerResultParsers(unittest.TestCase):
    """各テストツールの出力を既存の結果dict形式へ変換できることを確認する。"""

    def test_tsc成功出力を成功件数と末尾行にまとめる(self):
        """エラーのない型チェック出力は成功1件として記録する。

        Returns:
            なし。"""
        # 1. エラーのない型チェック出力は成功1件として記録する。
        result = runner_results.parse_tsc_result(0, "Found 0 errors.\n", 1.25)

        self.assertEqual(result["name"], "TypeScript チェック（tsc）")
        self.assertEqual(result["code"], 0)
        self.assertEqual(result["passed"], 1)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["failed_names"], [])
        self.assertEqual(result["tail"], ["Found 0 errors."])

    def test_tsc失敗出力から型エラー名を抽出する(self):
        """終了コードとTSエラー行を失敗結果に反映する。

        Returns:
            なし。"""
        # 1. 終了コードとTSエラー行を失敗結果に反映する。
        output = "src/a.ts(2,3): error TS2322: 型が一致しません\n"
        result = runner_results.parse_tsc_result(2, output, 0.5)

        self.assertEqual(result["code"], 2)
        self.assertEqual(result["passed"], 0)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["failed_names"], ["error TS2322: 型が一致しません"])

    def test_buildのtsc失敗を失敗名付きで記録する(self):
        """ビルド前半の型検査エラーを個別の失敗名として保持する。

        Returns:
            なし。"""
        # 1. ビルド前半の型検査エラーを個別の失敗名として保持する。
        output = "frontend/a.ts: error TS2345: 引数の型が違います\n"
        result = runner_results.parse_build_result(2, output, 3.0, "tsc")

        self.assertEqual(result["name"], "本番ビルド（tsc -b ＋ vite build）")
        self.assertEqual(result["code"], 2)
        self.assertEqual(result["passed"], 0)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["failed_names"], ["error TS2345: 引数の型が違います"])

    def test_buildのvite失敗は固定の診断名と出力末尾を記録する(self):
        """Vite失敗時に終了コード・診断名・末尾の出力を保持する。

        Returns:
            なし。"""
        # 1. Vite失敗時に終了コード・診断名・末尾の出力を保持する。
        output = "変換を開始\nモジュールを解決できません\n"
        result = runner_results.parse_build_result(1, output, 4.0, "vite")

        self.assertEqual(result["code"], 1)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["failed_names"], ["vite build が失敗しました"])
        self.assertEqual(result["tail"], ["変換を開始", "モジュールを解決できません"])

    def test_buildのcompleted成功とtoken_leak失敗を区別する(self):
        """正常完了と本番出力への開発用トークン混入を別の結果にする。

        Returns:
            なし。"""
        # 1. 正常完了と本番出力への開発用トークン混入を別の結果にする。
        success = runner_results.parse_build_result(0, "", 5.0, "completed")
        # 変数の内容: leaked: トークン混入を検出したテスト結果。
        leaked = runner_results.parse_build_result(
            1, "", 5.5, "token_leak", leaked_files=["assets/index.js"]
        )

        self.assertEqual((success["code"], success["passed"], success["failed"]), (0, 1, 0))
        self.assertEqual(success["failed_names"], [])
        self.assertEqual(leaked["code"], 1)
        self.assertEqual(leaked["failed"], 1)
        self.assertIn("assets/index.js", leaked["failed_names"][0])
        self.assertNotIn("dev-skip-admin-auth", str(leaked))

    def test_vitestのsummaryから件数と失敗ファイル名を読む(self):
        """VitestのTests行とFAIL行を既存フィールドへ分けて格納する。

        Returns:
            なし。"""
        # 1. VitestのTests行とFAIL行を既存フィールドへ分けて格納する。
        output = " FAIL  src/example.test.ts > 失敗する\n Tests  3 passed | 1 failed | 2 skipped (6)\n"
        result = runner_results.parse_vitest_result(1, output, 2.0)

        self.assertEqual(result["passed"], 3)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["skipped"], 2)
        self.assertEqual(result["failed_names"], ["src/example.test.ts > 失敗する"])
        self.assertEqual(result["tail"], ["Tests  3 passed | 1 failed | 2 skipped (6)"])

    def test_vitestのsummary無し出力も例外にせず空の集計として返す(self):
        """起動エラーなどでTests行が無い出力も結果dictに変換する。

        Returns:
            なし。"""
        # 1. 起動エラーなどでTests行が無い出力も結果dictに変換する。
        result = runner_results.parse_vitest_result(
            1, "[WebServer] Error: listen EPERM: operation not permitted 127.0.0.1:4174\n", 0.2
        )

        self.assertEqual(result["code"], 1)
        self.assertEqual(result["passed"], 0)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(
            result["tail"],
            ["[WebServer] Error: listen EPERM: operation not permitted 127.0.0.1:4174"],
        )

    def test_playwrightのsummaryから件数と失敗テスト名を読む(self):
        """Playwrightの標準summaryと失敗位置を解析する。

        Returns:
            なし。"""
        # 1. Playwrightの標準summaryと失敗位置を解析する。
        output = "  1) [chromium] › e2e/home.spec.ts:8:3 › 表示される ─\n  2 passed\n  1 failed\n"
        result = runner_results.parse_playwright_result(1, output, 3.0)

        self.assertEqual(result["passed"], 2)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["failed_names"], ["[chromium] e2e/home.spec.ts:8:3 › 表示される"])
        self.assertEqual(result["tail"], ["1 failed"])

    def test_playwrightのsummary無し失敗は診断出力をtailに残す(self):
        """テスト開始前の失敗でも終了コードと原因の末尾を残す。

        Returns:
            なし。"""
        # 1. テスト開始前の失敗でも終了コードと原因の末尾を残す。
        output = "Error: browser executable missing\nCall log:\n  launch chromium\n"
        result = runner_results.parse_playwright_result(1, output, 0.1)

        self.assertEqual(result["code"], 1)
        self.assertEqual(result["passed"], 0)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["tail"], [
            "Error: browser executable missing", "Call log:", "  launch chromium"
        ])

    def test_pytestの失敗summaryからsuite名と失敗nodeidを記録する(self):
        """pytestの渡されたsuite名とFAILED行を結果へ反映する。

        Returns:
            なし。"""
        # 1. pytestの渡されたsuite名とFAILED行を結果へ反映する。
        output = "2 passed, 1 failed, 1 skipped, 1 xfailed in 0.42s\nFAILED tests/test_sample.py::test_bad - AssertionError\n"
        result = runner_results.parse_pytest_result("Backend pytest", 1, output, 0.42)

        self.assertEqual(result["name"], "Backend pytest")
        self.assertEqual(result["passed"], 2)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["xfail"], 1)
        self.assertEqual(result["failed_names"], ["tests/test_sample.py::test_bad"])

    def test_pytestのsummary無し出力でも失敗終了コードを保持する(self):
        """収集時などにsummaryが出ない異常終了を件数0の結果として保持する。

        Returns:
            なし。"""
        # 1. 収集時などにsummaryが出ない異常終了を件数0の結果として保持する。
        result = runner_results.parse_pytest_result(
            "Analytics pytest", 2, "ImportError: dependency unavailable\n", 0.3
        )

        self.assertEqual(result["name"], "Analytics pytest")
        self.assertEqual(result["code"], 2)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["tail"], ["ImportError: dependency unavailable"])

    def test_runner_testsの正常summaryからpassed件数を算出する(self):
        """unittestのRan件数からskipped・xfailを除いてpassedを求める。

        Returns:
            なし。"""
        # 1. unittestのRan件数からskipped・xfailを除いてpassedを求める。
        output = "Ran 8 tests in 0.12s\n\nOK (skipped=2, expected failures=1)\n"
        result = runner_results.parse_runner_tests_result(0, output, 0.12)

        self.assertEqual(result["name"], "テストランナー（unittest）")
        self.assertEqual(result["passed"], 5)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["skipped"], 2)
        self.assertEqual(result["xfail"], 1)

    def test_runner_testsの失敗summaryから失敗数を得る(self):
        """unittestのfailureとerrorを合わせて失敗数にする。

        Returns:
            なし。"""
        # 1. unittestのfailureとerrorを合わせて失敗数にする。
        output = "Ran 4 tests in 0.1s\n\nFAILED (failures=1, errors=2)\n"
        result = runner_results.parse_runner_tests_result(1, output, 0.1)

        self.assertEqual(result["code"], 1)
        self.assertEqual(result["passed"], 1)
        self.assertEqual(result["failed"], 3)
        self.assertEqual(result["tail"], [
            "Ran 4 tests in 0.1s", "", "FAILED (failures=1, errors=2)"
        ])

    def test_runner_testsのsummary無し出力は終了コードから失敗を示す(self):
        """Ran/FAILED行が無い予期しない出力も失敗1件として扱う。

        Returns:
            なし。"""
        # 1. Ran/FAILED行が無い予期しない出力も失敗1件として扱う。
        result = runner_results.parse_runner_tests_result(2, "runner crashed\n", 0.1)

        self.assertEqual(result["code"], 2)
        self.assertEqual(result["passed"], 0)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["tail"], ["runner crashed"])


if __name__ == "__main__":
    unittest.main()
