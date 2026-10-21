"""すべての自動テストを実行し、結果をテスト実行ログ（doc/04_TEST/08_テスト実行ログ.md）に追加するスクリプト。

使い方:
    python scripts/run_tests.py --note "何を変えたか（例: イベントフォームに時間プルダウン追加）"
    python scripts/run_tests.py --note "..." --no-e2e    # 画面テストを省く（急ぐとき。ログに「省略」と残る）
    python scripts/run_tests.py --no-log                 # ログに残さず結果を見るだけ

実行するテスト:
    1. TypeScript チェック（型エラーがないか）  cd frontend && npx tsc --noEmit -p tsconfig.app.json
       ＋ 本番ビルドの確認                       cd frontend && npx tsc -b && npx vite build（一時フォルダに出力。frontend/dist は書き換えない）
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
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "doc/04_TEST/08_テスト実行ログ.md"
JST = timezone(timedelta(hours=9))
MARKER = "<!-- 実行結果はこの下に新しい順で追加される（scripts/run_tests.py が書き込む。手で書き換えない） -->"

HEADER = f"""# テスト実行ログ

**プロジェクト：** ei8htplants-site

自動テストを実行した結果の記録。`python scripts/run_tests.py --note "何を変えたか"` を実行するたびに、一番上に 1 件追加される（手で書き換えない）。
テストの方針は [01_マスターテスト計画書](01_マスターテスト計画書.md)、ケース一覧は [07_テストケース一覧](07_テストケース一覧.md) を参照。

## 見方

- **判定**：✅ 全部成功 ／ ❌ 失敗あり（失敗したらコミットしない）
- **コミット**：テストしたときのソースの版（`git` のコミット番号）。「＋未コミット」は、まだコミットしていない変更を含めてテストしたもの
- **省略**：急ぐときなどに、そのテストを実行しなかったもの

{MARKER}
"""


def run(cmd: list[str], cwd: Path) -> tuple[int, str, float]:
    """コマンドを実行して結果を返す。

    Args:
        cmd: 実行するコマンド
        cwd: 実行するディレクトリ

    Returns:
        (終了コード, 出力（標準出力＋標準エラー）, かかった秒数)
    """
    start = time.time()
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr, time.time() - start


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
    start = time.time()
    # 1. ビルド時の型チェック（npm run build の前半と同じ）
    code, out, _ = run(["npx", "tsc", "-b"], frontend)
    errors = re.findall(r"error TS\d+: .+", out)
    if code != 0:
        return {
            "name": name, "code": code, "sec": time.time() - start,
            "passed": 0, "failed": max(len(errors), 1), "skipped": 0, "xfail": 0,
            "failed_names": errors[:10] or ["tsc -b が失敗しました"],
            "tail": out.strip().splitlines()[-2:] if out.strip() else [],
        }
    # 2. 一時フォルダに本番ビルドする（npm run build の後半と同じ。モードは production）
    with tempfile.TemporaryDirectory() as tmp:
        code, out, _ = run(["npx", "vite", "build", "--outDir", tmp, "--emptyOutDir"], frontend)
        if code != 0:
            return {
                "name": name, "code": code, "sec": time.time() - start,
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
            "name": name, "code": 1, "sec": time.time() - start,
            "passed": 0, "failed": 1, "skipped": 0, "xfail": 0,
            "failed_names": [f"開発用のダミートークンが本番用の出力に残っています: {', '.join(leaked)}"],
            "tail": [],
        }
    return {
        "name": name, "code": 0, "sec": time.time() - start,
        "passed": 1, "failed": 0, "skipped": 0, "xfail": 0,
        "failed_names": [], "tail": [],
    }


def run_vitest() -> dict:
    """フロントのロジックテスト（Vitest）を実行して結果をまとめる。"""
    code, out, sec = run(["npx", "vitest", "run"], ROOT / "frontend")
    tests_line = next((l for l in out.splitlines() if l.strip().startswith("Tests")), "")
    failed_names = re.findall(r"^\s*FAIL\s+(.+)$", out, flags=re.M)
    return {
        "name": "フロントのロジック（Vitest）", "code": code, "sec": sec,
        "passed": num(r"(\d+) passed", tests_line), "failed": num(r"(\d+) failed", tests_line),
        "skipped": num(r"(\d+) skipped", tests_line), "xfail": 0,
        "failed_names": failed_names[:10],
        "tail": [tests_line.strip()],
    }


def _free_port(port: int) -> None:
    """指定ポートを使用しているプロセスを停止する（macOS/Linux）。

    playwright.config.ts の reuseExistingServer が false のとき、
    前回の実行でサーバーが残っているとエラーになるため実行前に解放する。
    """
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"], capture_output=True, text=True
        )
        for pid in result.stdout.strip().split():
            if pid.isdigit():
                subprocess.run(["kill", "-9", pid], capture_output=True)
    except Exception:
        pass


def run_playwright() -> dict:
    """画面テスト（Playwright。MSW モック）を実行して結果をまとめる。"""
    # 前回の実行でサーバーが残っているとポート競合エラーになるため解放する
    _free_port(5173)
    code, out, sec = run(["npx", "playwright", "test", "--reporter=line"], ROOT / "frontend")
    failed_names = [
        f"[{p}] {n.strip()}"
        for p, n in re.findall(r"^\s*\d+\) \[(\w+)\] › (.+?) ─*$", out, flags=re.M)
    ]
    return {
        "name": "画面テスト（Playwright）", "code": code, "sec": sec,
        "passed": num(r"(\d+) passed", out), "failed": num(r"(\d+) failed", out),
        "skipped": num(r"(\d+) skipped", out), "xfail": 0,
        "failed_names": failed_names[:10],
        "tail": [l.strip() for l in out.splitlines() if re.search(r"\d+ (passed|failed)", l)][-1:],
    }


def run_pytest() -> dict:
    """バックエンドテスト（pytest）を実行して結果をまとめる。"""
    backend = ROOT / "backend"
    if not backend.exists():
        return {
            "name": "バックエンド（pytest）", "code": 0, "sec": 0,
            "passed": 0, "failed": 0, "skipped": 0, "xfail": 0,
            "failed_names": [], "tail": ["backend/ ディレクトリがないためスキップ"],
        }
    venv_python = backend / ".venv" / "bin" / "python"
    python_cmd = str(venv_python) if venv_python.exists() else sys.executable
    code, out, sec = run([python_cmd, "-m", "pytest", "-rfE"], backend)
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
            "passed": 0, "failed": 0, "skipped": 0, "xfail": 0,
            "failed_names": [], "tail": ["analytics/.venv がないためスキップ"],
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


def make_entry(results: list[dict], note: str, skipped_suites: list[str]) -> str:
    """ログ 1 件分の Markdown を作る。"""
    ok = all(r["code"] == 0 and r["failed"] == 0 for r in results)
    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M")
    total = sum(r["sec"] for r in results)
    lines = [
        f"### {now}　{'✅ 全部成功' if ok else '❌ 失敗あり'}",
        "",
        f"- **変更内容**：{note or '（記載なし）'}",
        f"- **コミット**：{git_info()}",
        f"- **かかった時間**：{total:.0f} 秒",
        "",
        "| テスト | 判定 | 成功 | 失敗 | スキップ | 既知の問題 | 時間 |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in results:
        good = r["code"] == 0 and r["failed"] == 0
        lines.append(
            f"| {r['name']} | {'✅' if good else '❌'} | {r['passed']} | {r['failed']} | {r['skipped']} | {r['xfail']} | {r['sec']:.0f} 秒 |"
        )
    for name in skipped_suites:
        lines.append(f"| {name} | 省略 | - | - | - | - | - |")
    failed = [(r["name"], n) for r in results for n in r["failed_names"]]
    if failed:
        lines += ["", "**失敗したテスト**", ""] + [f"- {suite}：`{n}`" for suite, n in failed]
    for r in results:
        if r["code"] != 0 and not r["failed_names"]:
            lines += ["", f"**{r['name']} の最後の出力**：`{' '.join(r['tail']) or '（なし）'}`"]
    lines += ["", "---", ""]
    return "\n".join(lines)


def append_log(text: str) -> None:
    """ログファイルの目印の行のすぐ下（一番上）に追加する。ファイルがなければ作る。"""
    current = LOG.read_text(encoding="utf-8") if LOG.exists() else HEADER
    if MARKER not in current:
        current = HEADER + current
    head, rest = current.split(MARKER, 1)
    LOG.write_text(head + MARKER + "\n\n" + text + rest.lstrip("\n"), encoding="utf-8")


def main() -> int:
    """テストを実行してログに残す。"""
    ap = argparse.ArgumentParser(description="すべての自動テストを実行し、テスト実行ログに追加する")
    ap.add_argument("--note", default="", help="何を変えたか（ログに残す）")
    ap.add_argument("--no-e2e", action="store_true", help="Playwright の画面テストを省く")
    ap.add_argument("--no-log", action="store_true", help="ログに残さない")
    args = ap.parse_args()

    results: list[dict] = []
    skipped: list[str] = []

    # 1. TypeScript チェック
    print("TypeScript チェック中…", flush=True)
    results.append(run_tsc())

    # 1-2. 本番ビルドの確認（frontend/dist は書き換えない）
    print("本番ビルドを確認中…", flush=True)
    results.append(run_build())

    # 2. Vitest（フロントロジック）
    print("Vitest（フロントロジック）を実行中…", flush=True)
    results.append(run_vitest())

    # 3. Playwright（画面テスト）
    if args.no_e2e:
        skipped.append("画面テスト（Playwright）")
    else:
        print("Playwright（画面テスト）を実行中…", flush=True)
        results.append(run_playwright())

    # 4. pytest（バックエンド）
    print("pytest（バックエンド）を実行中…", flush=True)
    results.append(run_pytest())

    # 5. pytest（分析ダッシュボード）
    print("pytest（分析ダッシュボード）を実行中…", flush=True)
    results.append(run_analytics())

    text = make_entry(results, args.note, skipped)
    print("\n" + text)

    if not args.no_log:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        append_log(text)
        print(f"ログに追加しました: {LOG.relative_to(ROOT)}")

    return 0 if all(r["code"] == 0 and r["failed"] == 0 for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
