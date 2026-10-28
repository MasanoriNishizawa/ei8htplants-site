"""テストランナーのCLI解析とsuite計画を確認する回帰テスト。"""
import contextlib
import io
import unittest
from unittest.mock import Mock

from scripts import runner_cli, runner_plan, runner_selection


class TestRunnerCliArguments(unittest.TestCase):
    """CLIの既定値・全オプション・矛盾する指定の拒否を確認する。"""

    def test引数なしでは全suite実行用の既定値を返す(self):
        """未指定の対象はNone、フラグはFalse、noteは空文字である。"""
        # 1. 引数を空にして標準の既定値を解析する。
        # args: 全CLIオプションを省略したときの解析結果。
        args = runner_cli.parse_arguments([])

        self.assertEqual(args.note, "")
        self.assertFalse(args.no_e2e)
        self.assertFalse(args.no_log)
        self.assertIsNone(args.vitest)
        self.assertIsNone(args.e2e)
        self.assertIsNone(args.pytest)
        self.assertFalse(args.analytics)

    def test全CLIオプションと複数の対象パスを個別に解析する(self):
        """note・各省略/追加フラグ・3種類の対象パスを混同せず保持する。"""
        # 1. 全オプションと複数の対象ファイルを渡して解析する。
        # args: オプション指定を反映したCLI解析結果。
        args = runner_cli.parse_arguments([
            "--note", "runner整理",
            "--no-log",
            "--vitest", "src/a.test.ts", "src/b.test.ts",
            "--e2e", "e2e/home.spec.ts", "e2e/admin.spec.ts",
            "--pytest", "tests/test_a.py", "tests/test_b.py",
            "--analytics",
        ])

        self.assertEqual(args.note, "runner整理")
        self.assertFalse(args.no_e2e)
        self.assertTrue(args.no_log)
        self.assertEqual(args.vitest, ["src/a.test.ts", "src/b.test.ts"])
        self.assertEqual(args.e2e, ["e2e/home.spec.ts", "e2e/admin.spec.ts"])
        self.assertEqual(args.pytest, ["tests/test_a.py", "tests/test_b.py"])
        self.assertTrue(args.analytics)

    def testno_e2e単独指定を省略フラグとして解析する(self):
        """E2E省略だけを指定した場合はe2e対象なしでno_e2eを有効にする。"""
        # 1. E2E対象ファイルを伴わない省略フラグを解析する。
        # args: E2E省略フラグだけを反映した解析結果。
        args = runner_cli.parse_arguments(["--no-e2e"])

        self.assertTrue(args.no_e2e)
        self.assertIsNone(args.e2e)

    def testno_e2eとe2e同時指定は終了コード2と説明付きstderrになる(self):
        """矛盾する指定を拒否し、既存CLIの日本語エラー文言をstderrへ出す。"""
        # 1. argparseの標準エラー出力を捕捉して矛盾指定を解析する。
        # stderr: エラー説明を検査するための標準エラー用バッファ。
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr):
            with self.assertRaises(SystemExit) as raised:
                runner_cli.parse_arguments(["--no-e2e", "--e2e", "e2e/home.spec.ts"])

        # raised: parser.errorが終了コード2で停止した結果。
        self.assertEqual(raised.exception.code, 2)
        self.assertIn("--no-e2e と --e2e は同時に指定できません", stderr.getvalue())


class TestRunnerSuitePlan(unittest.TestCase):
    """固定suiteと選択済みoptional suiteの順序・runner引数を確認する。"""

    def _selection(self, **overrides):
        """指定のないoptional suiteを除外する絞り込み選択を作る。"""
        # values: Vitestだけを選択するための初期CLI指定。
        values = {
            "vitest_targets": ["src/logic.test.ts"],
            "e2e_targets": None,
            "pytest_targets": None,
            "analytics": False,
            "no_e2e": False,
        }
        values.update(overrides)
        return runner_selection.select_tests(**values)

    def _runners(self):
        """7 suite分の呼び出し記録用runnerを返す。"""
        # 1. 各runnerの呼び出しと引数を記録するMockをまとめて返す。
        return runner_plan.SuiteRunners(
            tsc=Mock(name="tsc"),
            build=Mock(name="build"),
            runner_tests=Mock(name="runner_tests"),
            vitest=Mock(name="vitest"),
            playwright=Mock(name="playwright"),
            pytest=Mock(name="pytest"),
            analytics=Mock(name="analytics"),
        )

    def test固定三suiteの後に選択optionalを所定の順で追加する(self):
        """optional全対象をVitest・Playwright・Backend・Analytics順に並べる。"""
        # selection: optional 4 suiteをすべて有効にした選択結果。
        selection = self._selection(
            e2e_targets=["e2e/home.spec.ts"],
            pytest_targets=["tests/test_api.py"],
            analytics=True,
        )
        # runners: suiteごとの計画に登録する呼び出し検証用Mock。
        runners = self._runners()

        # plan: 固定3suiteと選択されたoptional suiteを含む実行計画。
        plan = runner_plan.build_suite_plan(
            selection,
            vitest_targets=["src/logic.test.ts"],
            e2e_targets=["e2e/home.spec.ts"],
            pytest_targets=["tests/test_api.py"],
            runners=runners,
        )

        self.assertEqual(
            [suite.name for suite in plan],
            [
                "TypeScript チェック（tsc）",
                "本番ビルド（tsc -b ＋ vite build）",
                "テストランナー（unittest）",
                "フロントのロジック（Vitest）",
                "画面テスト（Playwright）",
                "バックエンド（pytest）",
                "分析ダッシュボード（pytest）",
            ],
        )

    def test各suiteのrunnerへ指定targetsを束縛する(self):
        """optional suiteを実行すると、構築時に渡した対象リストで呼び出す。"""
        # selection: 3種類の対象suiteとAnalyticsを実行する選択結果。
        selection = self._selection(
            e2e_targets=["e2e/plant.spec.ts"],
            pytest_targets=["tests/test_plants.py"],
            analytics=True,
        )
        # runners: 呼び出し後の引数を検査するrunner Mock一式。
        runners = self._runners()

        # plan: 対象ファイルを各runnerへ束縛した実行計画。
        plan = runner_plan.build_suite_plan(
            selection,
            vitest_targets=["src/plant.test.ts"],
            e2e_targets=["e2e/plant.spec.ts"],
            pytest_targets=["tests/test_plants.py"],
            runners=runners,
        )
        for suite in plan[3:]:
            suite.runner()

        runners.vitest.assert_called_once_with(["src/plant.test.ts"])
        runners.playwright.assert_called_once_with(["e2e/plant.spec.ts"])
        runners.pytest.assert_called_once_with(["tests/test_plants.py"])
        runners.analytics.assert_called_once_with()

    def test未選択optional_suiteを追加しない(self):
        """Vitestだけ選んだ場合、残りoptional suiteは計画にも呼び出しにも現れない。"""
        # selection: Vitestのみを選び、他optional suiteを省略する結果。
        selection = self._selection()
        # runners: 固定・optional suiteの実行有無を追跡するMock一式。
        runners = self._runners()

        # plan: 選択されたsuiteだけを含む順序付き計画。
        plan = runner_plan.build_suite_plan(
            selection,
            vitest_targets=["src/logic.test.ts"],
            e2e_targets=["e2e/not-selected.spec.ts"],
            pytest_targets=["tests/not_selected.py"],
            runners=runners,
        )

        self.assertEqual(
            [suite.name for suite in plan],
            [
                "TypeScript チェック（tsc）",
                "本番ビルド（tsc -b ＋ vite build）",
                "テストランナー（unittest）",
                "フロントのロジック（Vitest）",
            ],
        )
        self.assertIs(plan[0].runner, runners.tsc)
        self.assertIs(plan[1].runner, runners.build)
        self.assertIs(plan[2].runner, runners.runner_tests)
        plan[3].runner()
        runners.vitest.assert_called_once_with(["src/logic.test.ts"])
        runners.playwright.assert_not_called()
        runners.pytest.assert_not_called()
        runners.analytics.assert_not_called()


if __name__ == "__main__":
    unittest.main()
