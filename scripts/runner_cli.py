"""テスト実行スクリプトのCLI引数と矛盾指定を扱う。"""
import argparse


def parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    """コマンドライン引数を解析し、実行前に矛盾した指定を拒否する。

    Args:
        argv: 解析する引数。Noneの場合は通常のコマンドライン引数を使う。

    Returns:
        テスト実行範囲とログ設定を持つargparse.Namespace。

    Raises:
        SystemExit: 引数が不正、または`--no-e2e`と`--e2e`が併記された場合。
    """
    # 1. 現行のCLIオプションと説明をparserへ定義する。
    # parser: 各CLI引数の既定値・型・ヘルプを集約する解析器。
    parser = argparse.ArgumentParser(
        description="自動テストを実行してテスト実行ログに追加する（何も絞らなければすべて）"
    )
    parser.add_argument("--note", default="", help="何を変えたか（ログに残す）")
    parser.add_argument("--no-e2e", action="store_true", help="Playwright の画面テストを省く")
    parser.add_argument("--no-log", action="store_true", help="ログに残さない")
    parser.add_argument(
        "--vitest", nargs="+", default=None, metavar="PATH",
        help="流す Vitest のファイル（frontend/ から見たパス）",
    )
    parser.add_argument(
        "--e2e", nargs="+", default=None, metavar="PATH",
        help="流す Playwright のファイル（frontend/ から見たパス）",
    )
    parser.add_argument(
        "--pytest", nargs="+", default=None, metavar="PATH",
        help="流す pytest のファイル（backend/ から見たパス）",
    )
    parser.add_argument(
        "--analytics", action="store_true",
        help="絞った実行で、分析ダッシュボードのテストも流す",
    )
    # args: CLIから受け取った実行範囲・ログ設定を保持する解析結果。
    args = parser.parse_args(argv)

    # 2. E2E対象を指定しながらE2E全体を省略する矛盾は、suite開始前に拒否する。
    if args.no_e2e and args.e2e is not None:
        parser.error("--no-e2e と --e2e は同時に指定できません")

    return args
