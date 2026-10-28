"""テストsuiteの順次実行と中断記録を確認する回帰テスト。"""
import unittest
from unittest.mock import Mock

from scripts.runner_execution import SuiteSpec, execute_suites


class TestSuiteExecution(unittest.TestCase):
    """suiteの順序・結果・割り込み後の未実行記録を確認する。"""

    def _result(self, name: str, code: int = 0) -> dict:
        """実行関数が返す既存形式の最小結果dictを作る。

        Args:
            name: suiteの表示名。
            code: suiteの終了コード。

        Returns:
            suite名と終了コードを持つ結果dict。
        """
        # 1. suite実行制御で必要な最小フィールドだけを持つ値を返す。
        return {"name": name, "code": code}

    def test_suiteを定義順に実行して結果と進捗を同じ順で集める(self):
        """正常終了したsuiteの順序と各結果を保ち、進捗を通知する。

        Returns:
            なし。"""
        # 変数の内容: calls: テスト中に呼ばれた処理の順序。
        calls: list[str] = []
        # 変数の内容: progress: suite の進捗通知一覧。
        progress: list[str] = []
        # 変数の内容: first_result: 先頭 suite の実行結果。
        first_result = self._result("先頭")
        # 変数の内容: second_result: 後続 suite の実行結果。
        second_result = self._result("次")

        # 1. suiteごとのrunnerが呼び出し順を記録し、それぞれの結果を返す。
        suites = [
            SuiteSpec("先頭", "先頭を実行中…", lambda: (calls.append("先頭"), first_result)[1]),
            SuiteSpec("次", "次を実行中…", lambda: (calls.append("次"), second_result)[1]),
        ]

        # 2. 実行関数へ進捗通知を渡し、返却結果と呼び出し順を確認する。
        execution = execute_suites(suites, [], print_progress=progress.append)

        self.assertEqual(calls, ["先頭", "次"])
        self.assertEqual(progress, ["先頭を実行中…", "次を実行中…"])
        self.assertEqual(execution.results, [first_result, second_result])
        self.assertEqual(execution.skipped_suites, [])
        self.assertFalse(execution.interrupted)

    def test_suite中断時は中断結果と後続suiteの未実行理由を記録する(self):
        """中断suiteをcode 130で残し、後続runnerを呼ばず未実行として記録する。

        Returns:
            なし。"""
        # 変数の内容: calls: テスト中に呼ばれた処理の順序。
        calls: list[str] = []
        # 変数の内容: first_result: 先頭 suite の実行結果。
        first_result = self._result("先行")
        # 変数の内容: later_runner: 後続 suite の呼び出しを記録するモック。
        later_runner = Mock(side_effect=lambda: calls.append("後続"))

        # 1. 2番目のrunnerだけが割り込み、3番目は呼び出し検証用の偽物にする。
        def interrupt_runner() -> dict:
            """現在のsuiteとしてKeyboardInterruptを発生させる。

            Returns:
                なし。"""
            # 1. 呼び出しを記録してsuite runner内の中断を発生させる。
            calls.append("中断")
            raise KeyboardInterrupt

        # 変数の内容: suites: 順序を検証する suite 定義一覧。
        suites = [
            SuiteSpec("先行", "先行を実行中…", lambda: (calls.append("先行"), first_result)[1]),
            SuiteSpec("中断", "中断対象を実行中…", interrupt_runner),
            SuiteSpec("後続", "後続を実行中…", later_runner),
        ]

        # 2. 実行後、完了結果・中断結果・後続suiteの省略を個別に確かめる。
        execution = execute_suites(suites, [])

        self.assertEqual(calls, ["先行", "中断"])
        later_runner.assert_not_called()
        self.assertEqual(execution.results[0], first_result)
        self.assertEqual(execution.results[1]["name"], "中断")
        self.assertEqual(execution.results[1]["code"], 130)
        self.assertTrue(execution.results[1]["interrupted"])
        self.assertEqual(execution.skipped_suites, [("後続", "⏹ 中断により未実行")])
        self.assertTrue(execution.interrupted)

    def test進捗表示中の中断はsuite未開始として区別する(self):
        """進捗通知が中断されたときrunner未実行を結果に明示する。

        Returns:
            なし。"""
        runner = Mock(return_value=self._result("対象"))

        # 1. 進捗通知だけが割り込み、runnerは呼ばれない条件を作る。
        def interrupt_progress(_: str) -> None:
            """進捗表示の中断経路を作る。

            Args:
                _: 進捗関数へ渡される suite 名。

            Returns:
                なし。
                Args:
                                _: 進捗関数へ渡される suite 名。"""
            # 1. runner開始前の進捗通知で中断する。
            raise KeyboardInterrupt

        execution = execute_suites(
            [SuiteSpec("対象", "対象を実行中…", runner)], [],
            print_progress=interrupt_progress,
        )

        # 2. 中断記録がsuite未開始を示し、runnerの実行がないことを確認する。
        runner.assert_not_called()
        self.assertTrue(execution.interrupted)
        self.assertEqual(execution.results[0]["code"], 130)
        self.assertFalse(execution.results[0]["started"])
        self.assertIn("suiteは開始されませんでした", execution.results[0]["tail"][0])

    def testsuite失敗後も後続suiteを実行する(self):
        """suiteの失敗結果を収集しても後続runnerを止めない。

        Returns:
            なし。"""
        calls: list[str] = []
        failed = self._result("失敗", code=1)
        succeeded = self._result("後続")
        suites = [
            SuiteSpec("失敗", "失敗suiteを実行中…", lambda: (calls.append("失敗"), failed)[1]),
            SuiteSpec("後続", "後続suiteを実行中…", lambda: (calls.append("後続"), succeeded)[1]),
        ]

        # 1. 失敗を含むsuite一覧を実行し、呼び出しと結果の順を確かめる。
        execution = execute_suites(suites, [])

        self.assertEqual(calls, ["失敗", "後続"])
        self.assertEqual(execution.results, [failed, succeeded])
        self.assertFalse(execution.interrupted)

    def test事前に省略されたsuiteを実行中も同じ順序と理由で維持する(self):
        """初期省略情報を実行制御による省略情報で置き換えない。

        Returns:
            なし。"""
        initially_skipped = [
            ("画面テスト", "省略（--no-e2e）"),
            ("分析", "省略（関連なし）"),
        ]
        suite = SuiteSpec("実行対象", "実行中…", lambda: self._result("実行対象"))

        # 1. 通常実行でも事前に選択された省略理由が保持されることを確認する。
        execution = execute_suites([suite], initially_skipped)

        self.assertEqual(execution.skipped_suites, initially_skipped)
        self.assertFalse(execution.interrupted)

    def test中断時も事前省略情報の後ろに未実行suiteを追加する(self):
        """初期省略の内容・順番を保ち、中断後のsuiteだけ末尾へ足す。

        Returns:
            なし。"""
        initially_skipped = [("先に省略", "省略（関連なし）")]

        # 1. 最初のsuiteを中断し、後続suiteは未実行として記録する。
        def interrupt_runner() -> dict:
            """suite実行の中断経路を作る。

            Returns:
                なし。"""
            # 1. suite実行の中断経路を作る。
            raise KeyboardInterrupt

        execution = execute_suites(
            [
                SuiteSpec("中断対象", "中断対象を実行中…", interrupt_runner),
                SuiteSpec("未実行対象", "未実行対象を実行中…", Mock()),
            ],
            initially_skipped,
        )

        # 2. 初期省略tupleをそのまま先頭に残し、後続suite分だけ追加する。
        self.assertEqual(
            execution.skipped_suites,
            initially_skipped + [("未実行対象", "⏹ 中断により未実行")],
        )


if __name__ == "__main__":
    unittest.main()
