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
import argparse
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

try:
    # unittest からの読み込みではパッケージ相対、直接実行では同じディレクトリから読み込む。
    from .runner_log import HEADER, MARKER, make_entry as _make_log_entry, append_log as _append_log
    from .runner_process import run_process
    from .runner_selection import select_tests
except ImportError:
    from runner_log import HEADER, MARKER, make_entry as _make_log_entry, append_log as _append_log
    from runner_process import run_process
    from runner_selection import select_tests

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "doc/04_TEST/08_テスト実行ログ.md"


def run(cmd: list[str], cwd: Path) -> tuple[int, str, float]:
    """従来の呼び出し口を保ち、コマンド実行を専用モジュールへ委ねる。

    Args:
        cmd: 実行するコマンド
        cwd: 実行するディレクトリ

    Returns:
        (終了コード, 出力（標準出力＋標準エラー）, かかった秒数)
    """
    return run_process(cmd, cwd)


def num(pattern: str, text: str) -> int:
    """出力から「〇〇 passed」などの数を取り出す（見つからなければ 0）。"""
    m = re.findall(pattern, text)
    return int(m[-1]) if m else 0


def run_tsc() -> dict:
    """TypeScript の型チェックを実行して結果をまとめる。"""
    # frontend/tsconfig.json は files: []（参照をまとめるだけ）なので、アプリのコードを含む tsconfig.app.json を指定する。
    # 指定しないと何も検査せずに成功してしまう
    code, out, sec = run(["npx", "tsc", "--noEmit", "-p", "tsconfig.app.json"], ROOT / "frontend")
    errors = re.findall(r"error TS\d+: .+", out)
    return {
        "name": "TypeScript チェック（tsc）", "code": code, "sec": sec,
        "passed": 0 if code != 0 else 1, "failed": len(errors),
        "skipped": 0, "xfail": 0,
        "failed_names": errors[:10],
        "tail": out.strip().splitlines()[-2:] if out.strip() else [],
    }


def run_build() -> dict:
    """本番ビルド（npm run build と同じ tsc -b ＋ vite build）が通るかを確かめる。

    tsc --noEmit では見ない範囲（ビルド時の型チェックはテストファイルも含む）でも失敗しないかを確かめるため。
    出力は一時フォルダにして、コミットする frontend/dist は書き換えない。
    あわせて、開発用のログイン省略のダミートークンが本番用の出力に残っていないことも確かめる。

    Returns:
        ほかのテストと同じ形の結果の dict
    """
    name = "本番ビルド（tsc -b ＋ vite build）"
    frontend = ROOT / "frontend"
    start = time.monotonic()
    # 1. ビルド時の型チェック（npm run build の前半と同じ）
    code, out, _ = run(["npx", "tsc", "-b"], frontend)
    errors = re.findall(r"error TS\d+: .+", out)
    if code != 0:
        return {
            "name": name, "code": code, "sec": time.monotonic() - start,
            "passed": 0, "failed": max(len(errors), 1), "skipped": 0, "xfail": 0,
            "failed_names": errors[:10] or ["tsc -b が失敗しました"],
            "tail": out.strip().splitlines()[-2:] if out.strip() else [],
        }
    # 2. 一時フォルダに本番ビルドする（npm run build の後半と同じ。モードは production）
    with tempfile.TemporaryDirectory() as tmp:
        code, out, _ = run(["npx", "vite", "build", "--outDir", tmp, "--emptyOutDir"], frontend)
        if code != 0:
            return {
                "name": name, "code": code, "sec": time.monotonic() - start,
                "passed": 0, "failed": 1, "skipped": 0, "xfail": 0,
                "failed_names": ["vite build が失敗しました"],
                "tail": out.strip().splitlines()[-3:] if out.strip() else [],
            }
        # 3. 本番用の出力に、開発用のダミートークンの文字列が残っていないこと（devAuth.ts の安全確認）
        leaked = [
            str(p.relative_to(tmp)) for p in Path(tmp).rglob("*.js")
            if "dev-skip-admin-auth" in p.read_text(encoding="utf-8", errors="ignore")
        ]
    if leaked:
        return {
            "name": name, "code": 1, "sec": time.monotonic() - start,
            "passed": 0, "failed": 1, "skipped": 0, "xfail": 0,
            "failed_names": [f"開発用のダミートークンが本番用の出力に残っています: {', '.join(leaked)}"],
            "tail": [],
        }
    return {
        "name": name, "code": 0, "sec": time.monotonic() - start,
        "passed": 1, "failed": 0, "skipped": 0, "xfail": 0,
        "failed_names": [], "tail": [],
    }


def run_vitest(targets: list[str] | None = None) -> dict:
    """フロントのロジックテスト（Vitest）を実行して結果をまとめる。

    Args:
        targets: 流すテストファイル（frontend/ から見たパス）。None ならすべて
    """
    code, out, sec = run(["npx", "vitest", "run", *(targets or [])], ROOT / "frontend")
    tests_line = next((l for l in out.splitlines() if l.strip().startswith("Tests")), "")
    failed_names = re.findall(r"^\s*FAIL\s+(.+)$", out, flags=re.M)
    return {
        "name": "フロントのロジック（Vitest）", "code": code, "sec": sec,
        "passed": num(r"(\d+) passed", tests_line), "failed": num(r"(\d+) failed", tests_line),
        "skipped": num(r"(\d+) skipped", tests_line), "xfail": 0,
        "failed_names": failed_names[:10],
        "tail": [tests_line.strip()],
    }


def run_playwright(targets: list[str] | None = None) -> dict:
    """画面テスト（Playwright。MSW モック）を実行して結果をまとめる。

    Args:
        targets: 流すテストファイル（frontend/ から見たパス）。None ならすべて
    """
    code, out, sec = run(["npx", "playwright", "test", "--reporter=line", *(targets or [])], ROOT / "frontend")
    failed_names = [
        f"[{p}] {n.strip()}"
        for p, n in re.findall(r"^\s*\d+\) \[(\w+)\] › (.+?) ─*$", out, flags=re.M)
    ]
    # 起動前エラーなどで通常の passed/failed 集計行が無い場合も、原因を実行ログに残す。
    summary_lines = [l.strip() for l in out.splitlines() if re.search(r"\d+ (passed|failed)", l)]
    tail = summary_lines[-1:] if summary_lines else []
    if code != 0 and not tail:
        tail = out.strip().splitlines()[-5:] if out.strip() else [f"出力なし（終了コード {code}）"]
    return {
        "name": "画面テスト（Playwright）", "code": code, "sec": sec,
        "passed": num(r"(\d+) passed", out), "failed": num(r"(\d+) failed", out),
        "skipped": num(r"(\d+) skipped", out), "xfail": 0,
        "failed_names": failed_names[:10],
        "tail": tail,
    }


def run_pytest(targets: list[str] | None = None) -> dict:
    """バックエンドテスト（pytest）を実行して結果をまとめる。

    Args:
        targets: 流すテストファイル（backend/ から見たパス）。None ならすべて
    """
    backend = ROOT / "backend"
    if not backend.exists():
        return {
            "name": "バックエンド（pytest）", "code": 0, "sec": 0,
            "passed": 0, "failed": 0, "skipped": 0, "xfail": 0,
            "failed_names": [], "tail": ["backend/ ディレクトリがないためスキップ"],
        }
    venv_python = backend / ".venv" / "bin" / "python"
    python_cmd = str(venv_python) if venv_python.exists() else sys.executable
    code, out, sec = run([python_cmd, "-m", "pytest", "-rfE", *(targets or [])], backend)
    failed_names = re.findall(r"^(?:FAILED|ERROR) (\S+)", out, flags=re.M)
    return {
        "name": "バックエンド（pytest）", "code": code, "sec": sec,
        "passed": num(r"(\d+) passed", out), "failed": num(r"(\d+) failed", out) + num(r"(\d+) errors?\b", out),
        "skipped": num(r"(\d+) skipped", out), "xfail": num(r"(\d+) xfailed", out),
        "failed_names": failed_names[:10],
        "tail": out.strip().splitlines()[-1:] if out.strip() else [],
    }


def run_analytics() -> dict:
    """分析ダッシュボード（analytics/ の Streamlit）のテスト（pytest）を実行して結果をまとめる。

    analytics は専用の仮想環境（analytics/.venv）で動かすため、その Python で実行する。
    仮想環境が無い環境（ライブラリ未導入）では実行できないので、スキップとして記録する。

    Returns:
        ほかのテストと同じ形の結果の dict
    """
    name = "分析ダッシュボード（pytest）"
    analytics = ROOT / "analytics"
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
    code, out, sec = run([str(venv_python), "-m", "pytest", "tests", "-rfE"], analytics)
    failed_names = re.findall(r"^(?:FAILED|ERROR) (\S+)", out, flags=re.M)
    return {
        "name": name, "code": code, "sec": sec,
        "passed": num(r"(\d+) passed", out), "failed": num(r"(\d+) failed", out) + num(r"(\d+) errors?\b", out),
        "skipped": num(r"(\d+) skipped", out), "xfail": num(r"(\d+) xfailed", out),
        "failed_names": failed_names[:10],
        "tail": out.strip().splitlines()[-1:] if out.strip() else [],
    }


def run_runner_tests() -> dict:
    """テストランナーのCLI・結果記録の回帰テストを実行する。"""
    tests_dir = ROOT / "scripts" / "tests"
    code, out, sec = run(
        [sys.executable, "-m", "unittest", "discover", "-s", str(tests_dir)], ROOT
    )
    passed_match = re.search(r"Ran (\d+) tests?", out)
    total = int(passed_match.group(1)) if passed_match else 0
    skipped = num(r"skipped=(\d+)", out)
    xfail = num(r"expected failures=(\d+)", out)
    failed_match = re.search(r"FAILED \(([^)]*)\)", out)
    failure_counts = (
        [int(value) for value in re.findall(r"(?:failures|errors)=(\d+)", failed_match.group(1))]
        if failed_match else []
    )
    failed = 0 if code == 0 else max(1, sum(failure_counts))
    passed = max(0, total - skipped - xfail - failed)
    return {
        "name": "テストランナー（unittest）", "code": code, "sec": sec,
        "passed": passed, "failed": failed, "skipped": skipped, "xfail": xfail,
        "failed_names": [], "tail": out.strip().splitlines()[-3:] if out.strip() else [],
    }


def git_info() -> str:
    """今のコミット番号と、まだコミットしていない変更があるかを返す。"""
    head = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    dirty = subprocess.run(
        ["git", "status", "--porcelain", "--", ".", ":!doc/04_TEST/08_テスト実行ログ.md"],
        cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
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
    return _make_log_entry(results, note, skipped_suites, git_revision=git_info(), targets=targets)


def append_log(text: str) -> None:
    """従来の呼び出し口を保ち、ログ追記を専用モジュールへ委ねる。

    Args:
        text: 先頭に追加する Markdown 記録。

    Returns:
        戻り値なし。
    """
    _append_log(LOG, text)


def main() -> int:
    """テストを実行してログに残す。"""
    ap = argparse.ArgumentParser(description="自動テストを実行し、テスト実行ログに追加する（何も絞らなければすべて）")
    ap.add_argument("--note", default="", help="何を変えたか（ログに残す）")
    ap.add_argument("--no-e2e", action="store_true", help="Playwright の画面テストを省く")
    ap.add_argument("--no-log", action="store_true", help="ログに残さない")
    ap.add_argument("--vitest", nargs="+", default=None, metavar="PATH", help="流す Vitest のファイル（frontend/ から見たパス）")
    ap.add_argument("--e2e", nargs="+", default=None, metavar="PATH", help="流す Playwright のファイル（frontend/ から見たパス）")
    ap.add_argument("--pytest", nargs="+", default=None, metavar="PATH", help="流す pytest のファイル（backend/ から見たパス）")
    ap.add_argument("--analytics", action="store_true", help="絞った実行で、分析ダッシュボードのテストも流す")
    args = ap.parse_args()

    # 1. E2E の実行対象を指定しながら E2E 全体を省略する矛盾した指定は、黙って無視せず拒否する
    if args.no_e2e and args.e2e is not None:
        ap.error("--no-e2e と --e2e は同時に指定できません")

    results: list[dict] = []
    # 1. CLI引数から実行範囲と省略理由を専用関数で確定する。
    selection = select_tests(
        vitest_targets=args.vitest,
        e2e_targets=args.e2e,
        pytest_targets=args.pytest,
        analytics=args.analytics,
        no_e2e=args.no_e2e,
    )

    # 2. 選択されたsuiteを順番に実行し、途中中断でも現在位置を記録できるようにする。
    suites = [
        ("TypeScript チェック（tsc）", "TypeScript チェック中…", run_tsc, ()),
        ("本番ビルド（tsc -b ＋ vite build）", "本番ビルドを確認中…", run_build, ()),
        ("テストランナー（unittest）", "テストランナーの回帰テスト中…", run_runner_tests, ()),
    ]
    if selection.run_vitest:
        suites.append(("フロントのロジック（Vitest）", "Vitest（フロントロジック）を実行中…", run_vitest, (args.vitest,)))
    if selection.run_playwright:
        suites.append(("画面テスト（Playwright）", "Playwright（画面テスト）を実行中…", run_playwright, (args.e2e,)))
    if selection.run_pytest:
        suites.append(("バックエンド（pytest）", "pytest（バックエンド）を実行中…", run_pytest, (args.pytest,)))
    if selection.run_analytics:
        suites.append(("分析ダッシュボード（pytest）", "pytest（分析ダッシュボード）を実行中…", run_analytics, ()))

    interrupted = False
    interrupted_index: int | None = None
    for index, (suite_name, progress, suite_runner, suite_args) in enumerate(suites):
        suite_started = time.monotonic()
        try:
            print(progress, flush=True)
            results.append(suite_runner(*suite_args))
        except KeyboardInterrupt:
            # 3. 実行中だったsuiteを中断として残し、開始していないsuiteと区別する。
            interrupted = True
            interrupted_index = index
            results.append({
                "name": suite_name, "code": 130, "sec": time.monotonic() - suite_started,
                "passed": 0, "failed": 0, "skipped": 0, "xfail": 0,
                "failed_names": [], "tail": ["実行中に割り込みを受けました"], "interrupted": True,
            })
            break

    # 4. CLIで省略したsuiteに加え、中断後に開始できなかったsuiteもログへ明示する。
    skipped_suites = list(selection.skipped_suites)
    if interrupted_index is not None:
        skipped_suites.extend(
            (name, "⏹ 中断により未実行")
            for name, _, _, _ in suites[interrupted_index + 1:]
        )

    text = make_entry(results, args.note, skipped_suites, selection.targets)
    print("\n" + text)

    if not args.no_log:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        append_log(text)
        print(f"ログに追加しました: {LOG.relative_to(ROOT)}")

    if interrupted:
        return 130
    return 0 if all(r["code"] == 0 and r["failed"] == 0 for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
