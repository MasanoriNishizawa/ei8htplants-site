"""各テストsuiteの出力を共通の実行結果へ変換する純関数。"""
import re


def num(pattern: str, text: str) -> int:
    """出力文字列から最後に見つかった数値を取り出す。

    Args:
        pattern: 数値を1つ以上のキャプチャグループで含む正規表現。
        text: 数値を探すテストsuiteの出力。

    Returns:
        最後に一致した数値。見つからない場合は0。
    """
    # 1. 出力文字列から最後に見つかった数値を取り出す。
    # matches: 正規表現に一致した数値文字列。複数の集計行があれば最後を採用する。
    matches = re.findall(pattern, text)
    return int(matches[-1]) if matches else 0


def parse_tsc_result(code: int, output: str, elapsed: float) -> dict:
    """TypeScriptチェック出力を共通結果dictへ変換する。

    Args:
        code: tscの終了コード。
        output: tscの標準出力と標準エラー。
        elapsed: チェックにかかった秒数。

    Returns:
        suite名、件数、失敗名、診断行を含む結果dict。
    """
    # 1. 型エラー行を抽出して失敗件数・診断欄を作る。
    # errors: tsc出力から抽出した型エラー行。
    errors = re.findall(r"error TS\d+: .+", output)
    return {
        "name": "TypeScript チェック（tsc）", "code": code, "sec": elapsed,
        "passed": 0 if code != 0 else 1, "failed": len(errors),
        "skipped": 0, "xfail": 0,
        "failed_names": errors[:10],
        "tail": output.strip().splitlines()[-2:] if output.strip() else [],
    }


def parse_build_result(
    code: int,
    output: str,
    elapsed: float,
    phase: str,
    leaked_files: list[str] | None = None,
) -> dict:
    """ビルド各段階の出力と安全検査を共通結果dictへ変換する。

    Args:
        code: 対象段階の終了コード。
        output: tsc または Vite の出力。
        elapsed: ビルド全体の経過秒数。
        phase: 失敗段階。`tsc`、`vite`、`token_leak`、`completed` のいずれか。
        leaked_files: 開発用トークンが見つかったビルド成果物の相対パス。

    Returns:
        ビルドsuite用の結果dict。

    Raises:
        ValueError: 未知の段階が指定された場合。
    """
    # 1. 各段階の終了状態を判定し、ログ上で共通のsuite名へ整える。
    # name: ログ上で各ビルド段階を同じsuiteとして表示する名称。
    name = "本番ビルド（tsc -b ＋ vite build）"
    if phase == "tsc" and code != 0:
        # errors: tsc段階で発生した型エラー行。
        errors = re.findall(r"error TS\d+: .+", output)
        return {
            "name": name, "code": code, "sec": elapsed,
            "passed": 0, "failed": max(len(errors), 1), "skipped": 0, "xfail": 0,
            "failed_names": errors[:10] or ["tsc -b が失敗しました"],
            "tail": output.strip().splitlines()[-2:] if output.strip() else [],
        }
    if phase == "vite" and code != 0:
        return {
            "name": name, "code": code, "sec": elapsed,
            "passed": 0, "failed": 1, "skipped": 0, "xfail": 0,
            "failed_names": ["vite build が失敗しました"],
            "tail": output.strip().splitlines()[-3:] if output.strip() else [],
        }
    if phase == "token_leak":
        # files: 本番成果物に開発用トークンが含まれていたファイル一覧。
        files = leaked_files or []
        return {
            "name": name, "code": 1, "sec": elapsed,
            "passed": 0, "failed": 1, "skipped": 0, "xfail": 0,
            "failed_names": [f"開発用のダミートークンが本番用の出力に残っています: {', '.join(files)}"],
            "tail": [],
        }
    if phase in {"tsc", "vite", "completed"} and code == 0:
        return {
            "name": name, "code": 0, "sec": elapsed,
            "passed": 1, "failed": 0, "skipped": 0, "xfail": 0,
            "failed_names": [], "tail": [],
        }
    raise ValueError(f"ビルド結果の段階または終了コードが不正です: {phase} / {code}")


def parse_vitest_result(code: int, output: str, elapsed: float) -> dict:
    """Vitestの集計行と失敗名を共通結果dictへ変換する。

    Args:
        code: Vitestの終了コード。
        output: Vitestの標準出力と標準エラー。
        elapsed: 実行にかかった秒数。

    Returns:
        suite名、件数、失敗名、診断行を含む結果dict。
    """
    # 1. 集計行・失敗ファイル名を出力から抽出する。
    # tests_line: Vitestが出力する件数の集計行。
    tests_line = next((line for line in output.splitlines() if line.strip().startswith("Tests")), "")
    # failed_names: 出力から抽出した失敗ファイル名。
    failed_names = re.findall(r"^\s*FAIL\s+(.+)$", output, flags=re.M)
    # tail: ログに表示する短い診断。集計行が無い失敗では末尾を残す。
    tail = [tests_line.strip()]
    if code != 0 and not tests_line.strip():
        tail = output.strip().splitlines()[-5:] if output.strip() else [f"出力なし（終了コード {code}）"]
    return {
        "name": "フロントのロジック（Vitest）", "code": code, "sec": elapsed,
        "passed": num(r"(\d+) passed", tests_line), "failed": num(r"(\d+) failed", tests_line),
        "skipped": num(r"(\d+) skipped", tests_line), "xfail": 0,
        "failed_names": failed_names[:10],
        "tail": tail,
    }


def parse_playwright_result(code: int, output: str, elapsed: float) -> dict:
    """Playwrightの集計行・失敗名・起動前エラーを共通結果dictへ変換する。

    Args:
        code: Playwrightの終了コード。
        output: Playwrightの標準出力と標準エラー。
        elapsed: 実行にかかった秒数。

    Returns:
        suite名、件数、失敗名、診断行を含む結果dict。
    """
    # 1. Playwrightの失敗番号・browser project・テスト名を抽出する。
    # failed_names: Playwrightの失敗番号・browser project・テスト名を組にした一覧。
    failed_names = [
        f"[{project}] {name.strip()}"
        for project, name in re.findall(r"^\s*\d+\) \[(\w+)\] › (.+?) ─*$", output, flags=re.M)
    ]
    # 2. 起動前エラーなどで集計行が無い場合は、原因を出力末尾へ残す。
    # summary_lines / tail: 集計行があればその行、無ければ失敗時の末尾診断。
    summary_lines = [line.strip() for line in output.splitlines() if re.search(r"\d+ (passed|failed)", line)]
    tail = summary_lines[-1:] if summary_lines else []
    if code != 0 and not tail:
        tail = output.strip().splitlines()[-5:] if output.strip() else [f"出力なし（終了コード {code}）"]
    return {
        "name": "画面テスト（Playwright）", "code": code, "sec": elapsed,
        "passed": num(r"(\d+) passed", output), "failed": num(r"(\d+) failed", output),
        "skipped": num(r"(\d+) skipped", output), "xfail": 0,
        "failed_names": failed_names[:10], "tail": tail,
    }


def parse_pytest_result(name: str, code: int, output: str, elapsed: float) -> dict:
    """pytestの集計と失敗名をsuite共通結果dictへ変換する。

    Args:
        name: 呼び出し元が指定するsuite名。
        code: pytest終了コード。
        output: pytestの標準出力と標準エラー。
        elapsed: pytest実行にかかった秒数。

    Returns:
        pytest結果dict。
    """
    # 1. pytest出力からFAILED / ERROR行を抽出して、診断一覧を作る。
    # failed_names: pytestのFAILED / ERROR行から抽出したテスト識別子。
    failed_names = re.findall(r"^(?:FAILED|ERROR) (\S+)", output, flags=re.M)
    return {
        "name": name, "code": code, "sec": elapsed,
        "passed": num(r"(\d+) passed", output),
        "failed": num(r"(\d+) failed", output) + num(r"(\d+) errors?\b", output),
        "skipped": num(r"(\d+) skipped", output), "xfail": num(r"(\d+) xfailed", output),
        "failed_names": failed_names[:10],
        "tail": output.strip().splitlines()[-1:] if output.strip() else [],
    }


def parse_runner_tests_result(code: int, output: str, elapsed: float) -> dict:
    """unittestの実行件数・省略・失敗を共通結果dictへ変換する。

    Args:
        code: unittestの終了コード。
        output: unittestの標準出力と標準エラー。
        elapsed: 実行にかかった秒数。

    Returns:
        suite名、件数、終了コード、診断行を含む結果dict。
    """
    # 1. unittestの集計表示を解析し、総数・省略・想定内失敗を取り出す。
    # total_match / total: unittestが実行した総件数。出力が不完全なら0とする。
    total_match = re.search(r"Ran (\d+) tests?", output)
    total = int(total_match.group(1)) if total_match else 0
    # skipped / xfail: unittest出力に含まれる省略件数と想定内失敗件数。
    skipped = num(r"skipped=(\d+)", output)
    xfail = num(r"expected failures=(\d+)", output)
    # failed_match / failure_counts: FAILED行の内訳にある失敗数とエラー数。
    failed_match = re.search(r"FAILED \(([^)]*)\)", output)
    failure_counts = (
        [int(value) for value in re.findall(r"(?:failures|errors)=(\d+)", failed_match.group(1))]
        if failed_match else []
    )
    failed = 0 if code == 0 else max(1, sum(failure_counts))
    # passed: 総数から省略・想定内失敗・実失敗を差し引いた成功数。
    passed = max(0, total - skipped - xfail - failed)
    return {
        "name": "テストランナー（unittest）", "code": code, "sec": elapsed,
        "passed": passed, "failed": failed, "skipped": skipped, "xfail": xfail,
        "failed_names": [], "tail": output.strip().splitlines()[-3:] if output.strip() else [],
    }
