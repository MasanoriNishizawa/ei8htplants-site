"""CLI オプションから実行するテスト枠と省略内容を決める。"""
from dataclasses import dataclass


@dataclass(frozen=True)
class TestSelection:
    """CLIから決まったテスト実行範囲をまとめる値。

    Attributes:
        narrowed: テスト枠やファイルを指定した絞り込み実行か。
        partial: 絞り込み、または `--no-e2e` による部分実行か。
        targets: ログに記録する対象一覧。通常の全件実行は None。
        run_vitest: Vitestを実行するか。
        run_playwright: Playwrightを実行するか。
        run_pytest: バックエンドpytestを実行するか。
        run_analytics: Analytics pytestを実行するか。
        skipped_suites: 実行しないテスト枠と理由。
    """

    narrowed: bool
    partial: bool
    targets: list[str] | None
    run_vitest: bool
    run_playwright: bool
    run_pytest: bool
    run_analytics: bool
    skipped_suites: list[tuple[str, str]]


def select_tests(
    vitest_targets: list[str] | None,
    e2e_targets: list[str] | None,
    pytest_targets: list[str] | None,
    analytics: bool,
    no_e2e: bool,
) -> TestSelection:
    """CLI引数に応じてテスト枠・対象・省略理由を決める。

    Args:
        vitest_targets: Vitestの対象ファイル。Noneなら未指定。
        e2e_targets: Playwrightの対象ファイル。Noneなら未指定。
        pytest_targets: Backend pytestの対象ファイル。Noneなら未指定。
        analytics: Analyticsの全テストを追加する指定。
        no_e2e: Playwrightを明示的に省略する指定。

    Returns:
        実行対象、ログに残す対象名、省略理由をまとめた値。
    """
    # 1. いずれかのselectorがあれば指定枠だけに絞り、no-e2e単独は他枠を全件実行する。
    # narrowed / partial: テスト対象の絞り込み有無と、全件でない実行かを示す状態。
    narrowed = any(
        targets is not None for targets in (vitest_targets, e2e_targets, pytest_targets)
    ) or analytics
    partial = narrowed or no_e2e
    # run_*: CLI指定に基づき、それぞれのテストsuiteを実際に起動するか。
    run_vitest = not narrowed or vitest_targets is not None
    run_playwright = not no_e2e and (not narrowed or e2e_targets is not None)
    run_pytest = not narrowed or pytest_targets is not None
    run_analytics = not narrowed or analytics

    # 2. 実行しないテスト枠ごとに、ログへ出す理由を決める。
    # skipped_suites: suite名と省略理由を実行ログへ残す一覧。
    skipped_suites: list[tuple[str, str]] = []
    if not run_vitest:
        skipped_suites.append(("フロントのロジック（Vitest）", "省略（関連なし）"))
    if not run_playwright:
        reason = "省略（--no-e2e）" if no_e2e else "省略（関連なし）"
        skipped_suites.append(("画面テスト（Playwright）", reason))
    if not run_pytest:
        skipped_suites.append(("バックエンド（pytest）", "省略（関連なし）"))
    if not run_analytics:
        skipped_suites.append(("分析ダッシュボード（pytest）", "省略（関連なし）"))

    # 3. 絞り込み実行とno-e2e単独実行のログ対象を、現行ラベルと順序で作る。
    # targets: 実行ログに記録するsuite・ファイルの表示名。全件実行時はNone。
    targets: list[str] | None = None
    if partial:
        targets = (
            [f"Vitest: {target}" for target in vitest_targets or []]
            + ([f"Playwright: {target}" for target in e2e_targets or []] if not no_e2e else [])
            + [f"pytest: {target}" for target in pytest_targets or []]
            + (["分析ダッシュボード: tests"] if analytics else [])
        )
        if not narrowed and no_e2e:
            targets = [
                "Vitest: 全件",
                "バックエンド pytest: 全件",
                "分析ダッシュボード pytest: tests 全件（.venv がある場合。無い場合はスキップ）",
            ]

    return TestSelection(
        narrowed=narrowed,
        partial=partial,
        targets=targets,
        run_vitest=run_vitest,
        run_playwright=run_playwright,
        run_pytest=run_pytest,
        run_analytics=run_analytics,
        skipped_suites=skipped_suites,
    )
