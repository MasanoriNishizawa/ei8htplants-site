"""選択結果とrunner関数から、順序付きsuite実行計画を作る。"""
from dataclasses import dataclass
from typing import Callable

try:
    from .runner_execution import SuiteSpec
    from .runner_selection import TestSelection
except ImportError:
    from runner_execution import SuiteSpec
    from runner_selection import TestSelection


@dataclass(frozen=True)
class SuiteRunners:
    """suite計画へ渡す実行関数をまとめる。

    Attributes:
        tsc: TypeScript型チェックを実行する関数。
        build: 本番ビルドを実行する関数。
        runner_tests: テストランナー自身の回帰テストを実行する関数。
        vitest: Vitestを対象ファイル指定付きで実行する関数。
        playwright: Playwrightを対象ファイル指定付きで実行する関数。
        pytest: Backend pytestを対象ファイル指定付きで実行する関数。
        analytics: Analytics pytestを実行する関数。
    """

    tsc: Callable[[], dict]
    build: Callable[[], dict]
    runner_tests: Callable[[], dict]
    vitest: Callable[[list[str] | None], dict]
    playwright: Callable[[list[str] | None], dict]
    pytest: Callable[[list[str] | None], dict]
    analytics: Callable[[], dict]


def build_suite_plan(
    selection: TestSelection,
    *,
    vitest_targets: list[str] | None,
    e2e_targets: list[str] | None,
    pytest_targets: list[str] | None,
    runners: SuiteRunners,
) -> list[SuiteSpec]:
    """従来のsuite順序を保ち、選択された実行関数と対象を束ねる。

    Args:
        selection: CLI選択モジュールが返したsuite実行可否。
        vitest_targets: Vitestに渡す対象ファイル。
        e2e_targets: Playwrightに渡す対象ファイル。
        pytest_targets: Backend pytestに渡す対象ファイル。
        runners: 各suiteの実処理を行う関数群。

    Returns:
        実行順に並べたsuite仕様の一覧。
    """
    # 1. 型チェック・本番build・runner回帰テストは、部分実行でも先頭で必ず実行する。
    suites = [
        SuiteSpec("TypeScript チェック（tsc）", "TypeScript チェック中…", runners.tsc),
        SuiteSpec("本番ビルド（tsc -b ＋ vite build）", "本番ビルドを確認中…", runners.build),
        SuiteSpec("テストランナー（unittest）", "テストランナーの回帰テスト中…", runners.runner_tests),
    ]

    # 2. 選択されたsuiteだけを既存順序で追加し、対象引数は実行関数へ固定する。
    if selection.run_vitest:
        suites.append(SuiteSpec(
            "フロントのロジック（Vitest）", "Vitest（フロントロジック）を実行中…",
            lambda: runners.vitest(vitest_targets),
        ))
    if selection.run_playwright:
        suites.append(SuiteSpec(
            "画面テスト（Playwright）", "Playwright（画面テスト）を実行中…",
            lambda: runners.playwright(e2e_targets),
        ))
    if selection.run_pytest:
        suites.append(SuiteSpec(
            "バックエンド（pytest）", "pytest（バックエンド）を実行中…",
            lambda: runners.pytest(pytest_targets),
        ))
    if selection.run_analytics:
        suites.append(SuiteSpec(
            "分析ダッシュボード（pytest）", "pytest（分析ダッシュボード）を実行中…",
            runners.analytics,
        ))

    return suites
