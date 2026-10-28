"""自動テストを実行し、結果をテスト実行ログ（doc/04_TEST/08_テスト実行ログ.md）に追加するスクリプト。

使い方:
    python scripts/run_tests.py --note "何を変えたか（例: イベントフォームに時間プルダウン追加）"
    python scripts/run_tests.py --note "..." --no-e2e    # 画面テストを省く（急ぐとき。ログに「省略」と残る）
    python scripts/run_tests.py --no-e2e                 # E2E 以外の全テストを実行し、部分実行として記録
    python scripts/run_tests.py --no-log                 # ログに残さず結果を見るだけ

関連するテストだけを流す（CLAUDE.md の「どのテストを流すか」の表に従って選ぶ）:
    python scripts/run_tests.py --note "..." \
        --vitest src/lib/__tests__/priceCalc.test.ts src/pages/admin/__tests__/PriceCalc.test.tsx \
        --e2e e2e/admin-unsaved-pages.spec.ts \
        --pytest tests/test_price_calc_entries.py
    - --vitest・--e2e は frontend/ から見たパス（Vitest・Playwright のファイル名の絞り込み）
    - --pytest は backend/ から見たパス、--analytics は分析ダッシュボードのテストも流す
    - --vitest・--e2e・--pytest・--analytics のどれかを指定すると「絞った実行」になり、指定しなかったテストは流さない（ログに「省略（関連なし）」と残る）
    - --no-e2e だけを指定すると、Vitest・Backend pytest・Analytics pytest（analytics/.venv がある場合）を実行し、Playwright だけを省く（部分実行として記録）
    - 型チェックと本番ビルドは、絞った実行でも必ず流す（全体の食い違いを拾うため）
    - 何も指定しなければ、これまでどおりすべてのテストを流す

実行するテスト:
    1. TypeScript チェック（型エラーがないか）  cd frontend && npx tsc --noEmit -p tsconfig.app.json
       ＋ 本番ビルドの確認                       cd frontend && npx tsc -b && npx vite build（一時フォルダに出力。frontend/dist は書き換えない）
    1-3. テストランナー回帰テスト（unittest）   python -m unittest discover -s scripts/tests
    2. フロントのロジック（Vitest）             cd frontend && npx vitest run
    3. 画面テスト（Playwright。API は MSW モック）cd frontend && npx playwright test
    4. バックエンド（pytest）                   cd backend && python -m pytest
    5. 分析ダッシュボード（pytest）             cd analytics && .venv/bin/python -m pytest tests
       （analytics/.venv が無い環境ではスキップと記録する。本番には接続しない）

ログは新しいものが上。管理画面の「設計書」→「04_TEST」→「08_テスト実行ログ」で見られる。
1 つでも失敗があれば終了コード 1 を返す（コミットしてはいけない合図）。
"""
import subprocess
import sys
import tempfile
import time
from pathlib import Path

try:
    # unittest からの読み込みではパッケージ相対、直接実行では同じディレクトリから読み込む。
    from .runner_log import HEADER, MARKER, make_entry as _make_log_entry, append_log as _append_log
    from .runner_process import run_process
    from .runner_execution import execute_suites
    from .runner_cli import parse_arguments
    from .runner_plan import SuiteRunners, build_suite_plan
    from .runner_results import (
        num as _parse_number, parse_build_result, parse_playwright_result, parse_pytest_result,
        parse_runner_tests_result, parse_tsc_result, parse_vitest_result,
    )
    from .runner_selection import select_tests
except ImportError:
    from runner_log import HEADER, MARKER, make_entry as _make_log_entry, append_log as _append_log
    from runner_process import run_process
    from runner_execution import execute_suites
    from runner_cli import parse_arguments
    from runner_plan import SuiteRunners, build_suite_plan
    from runner_results import (
        num as _parse_number, parse_build_result, parse_playwright_result, parse_pytest_result,
        parse_runner_tests_result, parse_tsc_result, parse_vitest_result,
    )
    from runner_selection import select_tests

# ROOT: scripts/ の親にあるプロジェクトルート。
ROOT = Path(__file__).resolve().parent.parent
# LOG: 自動実行結果を追加するテスト実行ログ。
LOG = ROOT / "doc/04_TEST/08_テスト実行ログ.md"


def run(cmd: list[str], cwd: Path) -> tuple[int, str, float]:
    """従来の呼び出し口を保ち、コマンド実行を専用モジュールへ委ねる。

    Args:
        cmd: 実行するコマンド
        cwd: 実行するディレクトリ

    Returns:
        (終了コード, 出力（標準出力＋標準エラー）, かかった秒数)
    """
    # 1. コマンドの実行と中断時の後始末は共通処理へ委ねる。
    return run_process(cmd, cwd)


def num(pattern: str, text: str) -> int:
    """従来の呼び出し口を保ち、数値の解析を専用モジュールへ委ねる。

    Args:
        pattern: 出力から数値を探す正規表現。
        text: 数値を探すsuite出力。

    Returns:
        出力中で最後に一致した数値。未検出時は0。
    """
    # 1. 数値の抽出規則を共通結果解析モジュールへ委ねる。
    return _parse_number(pattern, text)


def run_tsc() -> dict:
    """TypeScript の型チェックを実行して結果をまとめる。

    Args:
        なし。

    Returns:
        suite名、終了コード、件数、診断を持つ結果dict。
    """
    # 1. アプリ本体を含む tsconfig.app.json を指定して型チェックを実行する。
    # frontend/tsconfig.json は files: []（参照をまとめるだけ）なので、アプリのコードを含む tsconfig.app.json を指定する。
    # 指定しないと何も検査せずに成功してしまう
    # code / out / sec: 型チェックの終了コード・出力・経過秒数。
    code, out, sec = run(["npx", "tsc", "--noEmit", "-p", "tsconfig.app.json"], ROOT / "frontend")
    # 2. 実行結果と出力を共通のテスト結果形式に変換して返す。
    return parse_tsc_result(code, out, sec)


def run_build() -> dict:
    """本番ビルド（npm run build と同じ tsc -b ＋ vite build）が通るかを確かめる。

    tsc --noEmit では見ない範囲（ビルド時の型チェックはテストファイルも含む）でも失敗しないかを確かめるため。
    出力は一時フォルダにして、コミットする frontend/dist は書き換えない。
    あわせて、開発用のログイン省略のダミートークンが本番用の出力に残っていないことも確かめる。

    Returns:
        ほかのテストと同じ形の結果の dict

    Args:
        なし。
    """
    # frontend: frontendの作業ディレクトリ。
    frontend = ROOT / "frontend"
    # start: tscからviteまでのビルド総時間を測る開始時刻。
    start = time.monotonic()
    # 1. ビルド時の型チェック（npm run build の前半と同じ）
    code, out, _ = run(["npx", "tsc", "-b"], frontend)
    if code != 0:
        return parse_build_result(code, out, time.monotonic() - start, "tsc")
    # 2. 一時フォルダに本番ビルドする（npm run build の後半と同じ。モードは production）
    # tmp: 生成物検査用の一時出力先。実リポジトリのdistは変更しない。
    with tempfile.TemporaryDirectory() as tmp:
        code, out, _ = run(["npx", "vite", "build", "--outDir", tmp, "--emptyOutDir"], frontend)
        if code != 0:
            return parse_build_result(code, out, time.monotonic() - start, "vite")
        # 3. 本番用の出力に、開発用のダミートークンの文字列が残っていないこと（devAuth.ts の安全確認）
        # leaked: 開発用ダミートークンを含んでいたJavaScript成果物の相対パス。
        leaked = [
            str(p.relative_to(tmp)) for p in Path(tmp).rglob("*.js")
            if "dev-skip-admin-auth" in p.read_text(encoding="utf-8", errors="ignore")
        ]
    if leaked:
        return parse_build_result(1, "", time.monotonic() - start, "token_leak", leaked)
    return parse_build_result(0, "", time.monotonic() - start, "completed")


def run_vitest(targets: list[str] | None = None) -> dict:
    """フロントのロジックテスト（Vitest）を実行して結果をまとめる。

    Args:
        targets: 流すテストファイル（frontend/ から見たパス）。None ならすべて

    Returns:
        件数・終了コード・診断を含むVitest結果dict。
    """
    # 1. frontend/を作業場所にして、指定対象または全件のVitestを起動する。
    # code / out / sec: 終了コード・標準出力と標準エラー・実行秒数。
    code, out, sec = run(["npx", "vitest", "run", *(targets or [])], ROOT / "frontend")
    # 2. 実行出力をログ共通形式へ変換する。
    return parse_vitest_result(code, out, sec)


def run_playwright(targets: list[str] | None = None) -> dict:
    """画面テスト（Playwright。MSW モック）を実行して結果をまとめる。

    Args:
        targets: 流すテストファイル（frontend/ から見たパス）。None ならすべて

    Returns:
        件数・終了コード・診断を含むPlaywright結果dict。
    """
    # 1. frontend/を作業場所にして、指定対象または全件のPlaywrightを起動する。
    # code / out / sec: 終了コード・標準出力と標準エラー・実行秒数。
    code, out, sec = run(["npx", "playwright", "test", "--reporter=line", *(targets or [])], ROOT / "frontend")
    # 2. 実行出力をログ共通形式へ変換する。
    return parse_playwright_result(code, out, sec)


def run_pytest(targets: list[str] | None = None) -> dict:
    """バックエンドテスト（pytest）を実行して結果をまとめる。

    Args:
        targets: 流すテストファイル（backend/ から見たパス）。None ならすべて

    Returns:
        件数・終了コード・診断を含むpytest結果dict。
    """
    # 1. バックエンド用の作業場所と利用可能なPython実行環境を選ぶ。
    # backend: pytestを実行するバックエンドの作業ディレクトリ。
    backend = ROOT / "backend"
    if not backend.exists():
        return {
            "name": "バックエンド（pytest）", "code": 0, "sec": 0,
            "passed": 0, "failed": 0, "skipped": 0, "xfail": 0,
            "failed_names": [], "tail": ["backend/ ディレクトリがないためスキップ"],
        }
    # venv_python / python_cmd: backend専用環境があれば優先し、なければ現在のPythonを使う。
    venv_python = backend / ".venv" / "bin" / "python"
    python_cmd = str(venv_python) if venv_python.exists() else sys.executable
    # 2. pytestを起動し、標準出力と終了コードを共通の結果形式へ変換する。
    code, out, sec = run([python_cmd, "-m", "pytest", "-rfE", *(targets or [])], backend)
    return parse_pytest_result("バックエンド（pytest）", code, out, sec)


def run_analytics() -> dict:
    """分析ダッシュボード（analytics/ の Streamlit）のテスト（pytest）を実行して結果をまとめる。

    analytics は専用の仮想環境（analytics/.venv）で動かすため、その Python で実行する。
    仮想環境が無い環境（ライブラリ未導入）では実行できないので、スキップとして記録する。

    Returns:
        ほかのテストと同じ形の結果の dict

    Args:
        なし。
    """
    # name: ログと表示に使う分析suite名。
    name = "分析ダッシュボード（pytest）"
    # analytics: 分析ダッシュボードの作業ディレクトリ。
    analytics = ROOT / "analytics"
    # venv_python: 分析suiteの依存ライブラリを含む専用Python実行ファイル。
    venv_python = analytics / ".venv" / "bin" / "python"
    # 1. フォルダか仮想環境が無ければスキップ（失敗扱いにはしない）
    if not venv_python.exists():
        return {
            "name": name, "code": 0, "sec": 0,
            "passed": 0, "failed": 0, "skipped": 1, "xfail": 0,
            "failed_names": [], "tail": [],
            "skip_reason": "analytics/.venv がないため実行をスキップ",
        }
    # 2. analytics の中で tests を実行し、件数と失敗したテスト名を取り出す
    # code / out / sec: 分析suiteのpytest終了コード・出力・実行秒数。
    code, out, sec = run([str(venv_python), "-m", "pytest", "tests", "-rfE"], analytics)
    return parse_pytest_result(name, code, out, sec)


def run_runner_tests() -> dict:
    """テストランナーのCLI・結果記録の回帰テストを実行する。

    Args:
        なし。

    Returns:
        unittestの件数・終了コード・診断を含む結果dict。
    """
    # 1. テストランナー自身のunittestを置くフォルダから回帰テストを実行する。
    # tests_dir: テストランナー自身のunittestを置くフォルダ。
    tests_dir = ROOT / "scripts" / "tests"
    # code / out / sec: runner回帰テストの終了コード・出力・実行秒数。
    code, out, sec = run(
        [sys.executable, "-m", "unittest", "discover", "-s", str(tests_dir)], ROOT
    )
    # 2. 件数・終了コード・出力を共通の結果形式に変換する。
    return parse_runner_tests_result(code, out, sec)


def git_info() -> str:
    """今のコミット番号と、まだコミットしていない変更があるかを返す。

    Args:
        なし。

    Returns:
        commit短縮番号。未コミット変更があればその表示も含む。
    """
    # 1. HEADの短縮番号とテスト実行ログ以外の未コミット変更を取得する。
    # head: 作業中のリビジョン短縮番号。
    head = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    # dirty: テストログ自体を除いた未コミット変更の一覧。
    dirty = subprocess.run(
        ["git", "status", "--porcelain", "--", ".", ":!doc/04_TEST/08_テスト実行ログ.md"],
        cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    # 2. 変更状態に応じてコミット番号へ未コミット表示を付ける。
    return f"`{head}`" + ("＋未コミット" if dirty else "")


def make_entry(results: list[dict], note: str, skipped_suites: list[tuple[str, str]], targets: list[str] | None = None) -> str:
    """従来の呼び出し口を保ったまま、ログ1件の整形を専用モジュールへ委ねる。

    Args:
        results: 実行した各テスト枠の結果。
        note: 今回の変更内容。
        skipped_suites: 実行対象から省いたテスト枠と理由。
        targets: 対象を絞った実行の対象一覧。全件実行は None。

    Returns:
        ログファイルへ追加する Markdown。
    """
    # 1. 現在のGit情報を付け、ログ記録の整形を専用モジュールへ委ねる。
    return _make_log_entry(results, note, skipped_suites, git_revision=git_info(), targets=targets)


def append_log(text: str) -> None:
    """従来の呼び出し口を保ち、ログ追記を専用モジュールへ委ねる。

    Args:
        text: 先頭に追加する Markdown 記録。

    Returns:
        戻り値なし。
    """
    # 1. 共通ログファイルへ新しい記録を追加する。
    _append_log(LOG, text)


def main() -> int:
    """選択したテストsuiteを実行し、結果を表示・記録する。

    Args:
        なし。CLI引数はparse_arguments()から取得する。

    Returns:
        全suite成功なら0、失敗があれば1、中断時は130。
    """
    # args: CLI引数を検証済みのNamespaceとして保持する。
    args = parse_arguments()

    # 1. CLI引数から実行範囲と省略理由を専用関数で確定する。
    # selection: 実行対象suite・ログ対象・省略理由をまとめた選択結果。
    selection = select_tests(
        vitest_targets=args.vitest,
        e2e_targets=args.e2e,
        pytest_targets=args.pytest,
        analytics=args.analytics,
        no_e2e=args.no_e2e,
    )

    # 2. 選択結果とrunner関数から、専用関数でsuite実行計画を作る。
    # suites: 固定suiteと選択されたoptional suiteを実行順に並べた計画。
    suites = build_suite_plan(
        selection,
        vitest_targets=args.vitest,
        e2e_targets=args.e2e,
        pytest_targets=args.pytest,
        runners=SuiteRunners(
            tsc=run_tsc,
            build=run_build,
            runner_tests=run_runner_tests,
            vitest=run_vitest,
            playwright=run_playwright,
            pytest=run_pytest,
            analytics=run_analytics,
        ),
    )

    # 3. 実行順・進捗・中断後の未実行suite記録を専用モジュールへ委ねる。
    # execution: suiteの結果、省略内容、中断有無を集めた返却値。
    execution = execute_suites(suites, selection.skipped_suites)
    # results: 実行済みsuiteの結果dictを呼び出し順で保持する。
    results = execution.results
    # skipped_suites: 初期選択または中断による未実行suiteとその理由。
    skipped_suites = execution.skipped_suites

    # text: 標準出力とログファイルに使う、今回の実行記録Markdown。
    text = make_entry(results, args.note, skipped_suites, selection.targets)
    print("\n" + text)

    if not args.no_log:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        append_log(text)
        print(f"ログに追加しました: {LOG.relative_to(ROOT)}")

    if execution.interrupted:
        return 130
    return 0 if all(r["code"] == 0 and r["failed"] == 0 for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
